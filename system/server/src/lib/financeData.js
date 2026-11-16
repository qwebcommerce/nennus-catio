import { Prisma } from "./prisma-client-bundle.js";
import { prisma } from "./prisma.js";
import { dec, money, sumDec } from "./money.js";

export const CHANNELS = ["IN_STORE", "VAN", "WEBSITE"];

/** A sale counts in finance once it is a real sale: not cancelled, not waiting for payment. */
export const COUNTED_SALE = {
  invoiceStatus: { not: "CANCELLED" },
  OR: [{ webStatus: null }, { webStatus: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }],
};

export function isCountedSale(sale) {
  if (!sale) return true;
  if (sale.invoiceStatus === "CANCELLED") return false;
  return !(sale.webStatus === "CANCELLED" || sale.webStatus === "PENDING_PAYMENT");
}

/** Parses ?channel=&branchId=&type= shared by the finance list, summary and exports. */
export function financeFilters(query) {
  const channel = CHANNELS.includes(String(query?.channel || "").toUpperCase()) ? String(query.channel).toUpperCase() : "";
  const branchId = query?.branchId ? String(query.branchId) : "";
  const rawType = String(query?.type || "").toLowerCase();
  const type = rawType === "sale" || rawType === "refund" ? rawType : "";
  return { channel, branchId, type };
}

function refundChannel(refund) {
  if (refund.sale?.orderChannel) return refund.sale.orderChannel;
  return refund.branch?.kind === "VAN" ? "VAN" : "IN_STORE";
}

/** How a tender is grouped for money in / out. */
function tenderGroup(method) {
  const m = String(method || "").toUpperCase();
  if (m === "CASH" || m === "ON_DELIVERY") return "cash";
  if (m === "CARD" || m === "ONLINE") return "card";
  if (m === "FAWRAN" || m === "PAYMENT_LINK" || m === "BANK") return "bank";
  return null;
}

function parseSplits(splits) {
  if (typeof splits === "string") {
    try {
      return JSON.parse(splits);
    } catch {
      return null;
    }
  }
  return Array.isArray(splits) ? splits : null;
}

/** Money actually taken for a sale, split by tender group. On-account amounts are not money in. */
export function takenByTender(sale) {
  const out = { cash: dec(0), card: dec(0), bank: dec(0) };
  if (sale.paymentMethod === "SPLIT") {
    for (const row of parseSplits(sale.paymentSplits) || []) {
      const group = tenderGroup(row?.method);
      if (group) out[group] = out[group].plus(dec(row.amount));
    }
    return out;
  }
  const group = tenderGroup(sale.paymentMethod);
  if (group) out[group] = out[group].plus(dec(sale.amountPaid));
  return out;
}

/** Splits a refund over the tenders of its sale, in proportion. */
function refundByTender(refund) {
  const out = { cash: dec(0), card: dec(0), bank: dec(0) };
  const total = dec(refund.total);
  const sale = refund.sale;
  if (!sale) {
    out.cash = total;
    return out;
  }
  const taken = takenByTender(sale);
  const takenTotal = taken.cash.plus(taken.card).plus(taken.bank);
  if (takenTotal.lte(0)) {
    out.card = total;
    return out;
  }
  out.cash = total.mul(taken.cash).div(takenTotal).toDecimalPlaces(2);
  out.bank = total.mul(taken.bank).div(takenTotal).toDecimalPlaces(2);
  out.card = total.minus(out.cash).minus(out.bank);
  return out;
}

const SALE_SELECT = {
  id: true,
  invoiceNumber: true,
  createdAt: true,
  orderChannel: true,
  branchId: true,
  total: true,
  amountPaid: true,
  paymentMethod: true,
  paymentSplits: true,
  invoiceStatus: true,
  webStatus: true,
  branch: { select: { id: true, name: true, nameEn: true, kind: true } },
  customer: { select: { name: true } },
};

/** Sales in [from, to) that count, with optional channel / location. */
export function loadSales(orgId, { from, to }, { channel, branchId } = {}, extra = {}) {
  return prisma.sale.findMany({
    where: {
      branch: { organizationId: orgId },
      createdAt: { gte: from, lt: to },
      ...COUNTED_SALE,
      ...(channel ? { orderChannel: channel } : {}),
      ...(branchId ? { branchId } : {}),
    },
    select: { ...SALE_SELECT, ...extra },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Refunds dated in [from, to) — the refund date, not the sale date — whose sale counts.
 * A refund with no sale is put on the location's channel.
 */
export async function loadRefunds(orgId, { from, to }, { channel, branchId } = {}, extra = {}) {
  const rows = await prisma.refund.findMany({
    where: {
      branch: { organizationId: orgId },
      createdAt: { gte: from, lt: to },
      ...(branchId ? { branchId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      total: true,
      note: true,
      branchId: true,
      saleId: true,
      gatewayRefundId: true,
      branch: { select: { id: true, name: true, nameEn: true, kind: true } },
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          orderChannel: true,
          total: true,
          amountPaid: true,
          paymentMethod: true,
          paymentSplits: true,
          invoiceStatus: true,
          webStatus: true,
          customer: { select: { name: true } },
        },
      },
      ...extra,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .filter((refund) => isCountedSale(refund.sale))
    .map((refund) => ({ ...refund, channel: refundChannel(refund) }))
    .filter((refund) => !channel || refund.channel === channel);
}

/** Profit and loss plus money in / out for the range. All sums are exact decimals. */
export async function financeSummary(orgId, dates, filters = {}) {
  const [sales, refunds] = await Promise.all([
    loadSales(orgId, dates, filters, { items: { select: { costAmount: true } } }),
    loadRefunds(orgId, dates, filters, { items: { select: { costAmount: true } } }),
  ]);
  const byChannel = Object.fromEntries(CHANNELS.map((key) => [key, { revenue: dec(0), refunds: dec(0), cogs: dec(0), orders: 0, refundCount: 0 }]));
  const taken = { cash: dec(0), card: dec(0), bank: dec(0) };
  for (const sale of sales) {
    const row = byChannel[sale.orderChannel] || byChannel.IN_STORE;
    row.revenue = row.revenue.plus(dec(sale.total));
    row.cogs = row.cogs.plus(sumDec(sale.items, (item) => item.costAmount));
    row.orders += 1;
    const t = takenByTender(sale);
    taken.cash = taken.cash.plus(t.cash);
    taken.card = taken.card.plus(t.card);
    taken.bank = taken.bank.plus(t.bank);
  }
  const refundOut = { cash: dec(0), card: dec(0), bank: dec(0) };
  for (const refund of refunds) {
    const row = byChannel[refund.channel] || byChannel.IN_STORE;
    row.refunds = row.refunds.plus(dec(refund.total));
    // Cost comes back only when the goods came back (costAmount set on the refund line).
    row.cogs = row.cogs.minus(sumDec(refund.items, (item) => item.costAmount));
    row.refundCount += 1;
    const t = refundByTender(refund);
    refundOut.cash = refundOut.cash.plus(t.cash);
    refundOut.card = refundOut.card.plus(t.card);
    refundOut.bank = refundOut.bank.plus(t.bank);
  }

  const range = { gte: dates.from, lt: dates.to };
  // Expenses, supplier payments, collections and relocation are business-wide (no channel).
  const [expenseRows, supplierRows, collections, relocation] = await Promise.all([
    prisma.expense.groupBy({
      by: ["paidFrom"],
      where: { organizationId: orgId, expenseDate: range },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["method"],
      where: { bill: { organizationId: orgId }, paidAt: range },
      _sum: { amount: true },
    }),
    prisma.customerAccountLedger.groupBy({
      by: ["paymentMethod"],
      where: {
        organizationId: orgId,
        entryType: "PAYMENT",
        createdAt: range,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.relocationRequest.groupBy({
      by: ["paymentMethod"],
      where: { organizationId: orgId, paidAt: range, status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] } },
      _sum: { quoteAmount: true },
    }),
  ]);
  const expenses = { CASH: dec(0), BANK: dec(0) };
  for (const row of expenseRows) expenses[row.paidFrom === "CASH" ? "CASH" : "BANK"] = expenses[row.paidFrom === "CASH" ? "CASH" : "BANK"].plus(dec(row._sum.amount));
  const supplier = { CASH: dec(0), BANK: dec(0) };
  for (const row of supplierRows) supplier[row.method === "CASH" ? "CASH" : "BANK"] = supplier[row.method === "CASH" ? "CASH" : "BANK"].plus(dec(row._sum.amount));
  const collected = { cash: dec(0), card: dec(0), bank: dec(0) };
  for (const row of collections) {
    const group = tenderGroup(row.paymentMethod) || "cash";
    // Payments are stored as negative ledger amounts.
    collected[group] = collected[group].plus(dec(row._sum.amount).abs());
  }
  const relocationIn = { cash: dec(0), card: dec(0), bank: dec(0) };
  for (const row of relocation) {
    const group = tenderGroup(row.paymentMethod) || "card";
    relocationIn[group] = relocationIn[group].plus(dec(row._sum.quoteAmount));
  }
  // Channel-filtered views show only sales money; business-wide figures need no channel filter.
  const businessWide = !filters.channel;

  const channels = Object.fromEntries(Object.entries(byChannel).map(([key, row]) => [key, {
    revenue: money(row.revenue),
    refunds: money(row.refunds),
    cogs: money(row.cogs),
    grossProfit: money(row.revenue.minus(row.refunds).minus(row.cogs)),
    orders: row.orders,
    refundCount: row.refundCount,
  }]));
  const revenue = sumDec(Object.values(byChannel), (row) => row.revenue);
  const refundTotal = sumDec(Object.values(byChannel), (row) => row.refunds);
  const cogs = sumDec(Object.values(byChannel), (row) => row.cogs);
  const expenseTotal = businessWide ? expenses.CASH.plus(expenses.BANK) : dec(0);
  const supplierTotal = businessWide ? supplier.CASH.plus(supplier.BANK) : dec(0);

  const inCash = taken.cash.plus(businessWide ? collected.cash.plus(relocationIn.cash) : 0);
  const inCard = taken.card.plus(businessWide ? collected.card.plus(relocationIn.card) : 0);
  const inBank = taken.bank.plus(businessWide ? collected.bank.plus(relocationIn.bank) : 0);
  const outCash = refundOut.cash.plus(businessWide ? expenses.CASH.plus(supplier.CASH) : 0);
  const outBank = refundOut.card.plus(refundOut.bank).plus(businessWide ? expenses.BANK.plus(supplier.BANK) : 0);
  const moneyIn = inCash.plus(inCard).plus(inBank);
  const moneyOut = outCash.plus(outBank);

  return {
    from: dates.from,
    to: dates.to,
    channels,
    revenue: money(revenue),
    refunds: money(refundTotal),
    cogs: money(cogs),
    grossProfit: money(revenue.minus(refundTotal).minus(cogs)),
    expenses: money(expenseTotal),
    expensesBySource: { CASH: money(businessWide ? expenses.CASH : 0), BANK: money(businessWide ? expenses.BANK : 0) },
    supplierPayments: money(supplierTotal),
    supplierPaymentsBySource: { CASH: money(businessWide ? supplier.CASH : 0), BANK: money(businessWide ? supplier.BANK : 0) },
    relocationPaid: money(businessWide ? relocationIn.cash.plus(relocationIn.card).plus(relocationIn.bank) : 0),
    netProfit: money(revenue.minus(refundTotal).minus(cogs).minus(expenseTotal)),
    moneyIn: money(moneyIn),
    moneyOut: money(moneyOut),
    moneyInDetail: {
      cashSales: money(taken.cash),
      cardSales: money(taken.card),
      bankSales: money(taken.bank),
      accountCollections: money(businessWide ? collected.cash.plus(collected.card).plus(collected.bank) : 0),
      relocation: money(businessWide ? relocationIn.cash.plus(relocationIn.card).plus(relocationIn.bank) : 0),
      cash: money(inCash),
      card: money(inCard),
      bank: money(inBank),
    },
    moneyOutDetail: {
      refundsCash: money(refundOut.cash),
      refundsCardOrBank: money(refundOut.card.plus(refundOut.bank)),
      supplierPaymentsCash: money(businessWide ? supplier.CASH : 0),
      supplierPaymentsBank: money(businessWide ? supplier.BANK : 0),
      expensesCash: money(businessWide ? expenses.CASH : 0),
      expensesBank: money(businessWide ? expenses.BANK : 0),
      cash: money(outCash),
      bank: money(outBank),
    },
    net: money(moneyIn.minus(moneyOut)),
  };
}

/** Stock value (quantity × location unit cost) per location and product. */
export async function stockValueRows(orgId, branchId = "") {
  const where = { branch: { organizationId: orgId }, ...(branchId ? { branchId } : {}) };
  const [inventory, variants] = await Promise.all([
    prisma.inventory.findMany({
      where,
      select: {
        quantity: true,
        unitCost: true,
        branch: { select: { id: true, name: true, nameEn: true } },
        product: { select: { name: true, nameEn: true, sku: true, sellBy: true, cost: true } },
      },
    }),
    prisma.variantStock.findMany({
      where,
      select: {
        quantity: true,
        unitCost: true,
        branch: { select: { id: true, name: true, nameEn: true } },
        variant: { select: { label: true, labelEn: true, sku: true, product: { select: { name: true, nameEn: true, sellBy: true } } } },
      },
    }),
  ]);
  const rows = [];
  const push = (branch, name, nameEn, sku, sellBy, quantity, unitCost) => {
    // Weight stock is held in grams; cost is per kilogram.
    const qty = sellBy === "WEIGHT" ? dec(quantity).div(1000) : dec(quantity);
    const cost = dec(unitCost);
    rows.push({
      branchId: branch?.id || "",
      location: branch?.name || "",
      locationEn: branch?.nameEn || branch?.name || "",
      product: name,
      productEn: nameEn || name,
      sku: sku || "",
      unit: sellBy === "WEIGHT" ? "kg" : "pc",
      quantity: Number(qty.toDecimalPlaces(3).toString()),
      unitCost: money(cost),
      value: cost.mul(qty),
      costMissing: unitCost == null,
    });
  };
  for (const row of inventory) push(row.branch, row.product?.name || "", row.product?.nameEn, row.product?.sku, row.product?.sellBy, row.quantity, row.unitCost);
  for (const row of variants) {
    const label = row.variant?.label ? ` (${row.variant.label})` : "";
    const labelEn = row.variant?.labelEn || row.variant?.label ? ` (${row.variant.labelEn || row.variant.label})` : "";
    push(row.branch, `${row.variant?.product?.name || ""}${label}`, `${row.variant?.product?.nameEn || row.variant?.product?.name || ""}${labelEn}`, row.variant?.sku, row.variant?.product?.sellBy, row.quantity, row.unitCost);
  }
  rows.sort((a, b) => a.location.localeCompare(b.location) || a.product.localeCompare(b.product));
  const total = sumDec(rows, (row) => row.value);
  const byLocation = {};
  for (const row of rows) {
    byLocation[row.branchId] = byLocation[row.branchId] || { branchId: row.branchId, location: row.location, locationEn: row.locationEn, value: new Prisma.Decimal(0) };
    byLocation[row.branchId].value = byLocation[row.branchId].value.plus(row.value);
  }
  return {
    rows: rows.map((row) => ({ ...row, value: money(row.value) })),
    total: money(total),
    byLocation: Object.values(byLocation).map((row) => ({ ...row, value: money(row.value) })),
  };
}

/** Sales and refunds as one list for finance (FR-103), newest first. */
export async function financeTransactions(orgId, dates, filters = {}) {
  const [sales, refunds] = await Promise.all([
    filters.type === "refund" ? [] : loadSales(orgId, dates, filters),
    filters.type === "sale" ? [] : loadRefunds(orgId, dates, filters),
  ]);
  const rows = [
    ...sales.map((sale) => ({
      type: "SALE",
      id: sale.id,
      reference: sale.invoiceNumber || sale.id.slice(-8).toUpperCase(),
      date: sale.createdAt,
      channel: sale.orderChannel,
      branchId: sale.branchId,
      location: sale.branch?.name || "",
      locationEn: sale.branch?.nameEn || sale.branch?.name || "",
      customer: sale.customer?.name || "",
      paymentMethod: sale.paymentMethod,
      status: sale.webStatus || sale.invoiceStatus,
      amount: dec(sale.total),
    })),
    ...refunds.map((refund) => ({
      type: "REFUND",
      id: refund.id,
      reference: refund.sale?.invoiceNumber || (refund.saleId ? refund.saleId.slice(-8).toUpperCase() : refund.id.slice(-8).toUpperCase()),
      saleId: refund.saleId,
      date: refund.createdAt,
      channel: refund.channel,
      branchId: refund.branchId,
      location: refund.branch?.name || "",
      locationEn: refund.branch?.nameEn || refund.branch?.name || "",
      customer: refund.sale?.customer?.name || "",
      paymentMethod: refund.sale?.paymentMethod || "",
      status: "REFUNDED",
      amount: dec(refund.total).negated(),
    })),
  ].sort((a, b) => b.date - a.date);
  const salesTotal = sumDec(rows.filter((row) => row.type === "SALE"), (row) => row.amount);
  const refundsTotal = sumDec(rows.filter((row) => row.type === "REFUND"), (row) => row.amount).negated();
  return {
    rows: rows.map((row) => ({ ...row, amount: money(row.amount) })),
    totals: {
      sales: money(salesTotal),
      refunds: money(refundsTotal),
      net: money(salesTotal.minus(refundsTotal)),
      saleCount: sales.length,
      refundCount: refunds.length,
    },
  };
}
