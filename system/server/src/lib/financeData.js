import { prisma } from "./prisma.js";
import { d, lineAmount, money, shareOf, sum } from "./money.js";

/** Shop sales channels (Sale rows). */
export const SALE_CHANNELS = ["IN_STORE", "VAN", "WEBSITE"];
/** Service income that is paid through Payment rows (lib/payments.js), not Sale rows. */
export const SERVICE_CHANNELS = ["GROOMING", "RELOCATION"];
export const CHANNELS = [...SALE_CHANNELS, ...SERVICE_CHANNELS];
const TENDERS = ["cash", "card", "bank", "fawran"];

/** Amounts here are whole dirhams (NFR-03); money() turns them into riyals for the response. */
function emptyTenders() {
  return { cash: 0, card: 0, bank: 0, fawran: 0 };
}

function tenderSum(t) {
  return t.cash + t.card + t.bank + t.fawran;
}

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

/** How a tender is grouped for money in / out: cash, card / gateway, bank (and links), Fawran. */
function tenderGroup(method) {
  const m = String(method || "").toUpperCase();
  if (m === "CASH" || m === "ON_DELIVERY") return "cash";
  if (m === "CARD" || m === "ONLINE") return "card";
  if (m === "FAWRAN") return "fawran";
  if (m === "PAYMENT_LINK" || m === "BANK") return "bank";
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
  const out = emptyTenders();
  if (sale.paymentMethod === "SPLIT") {
    for (const row of parseSplits(sale.paymentSplits) || []) {
      const group = tenderGroup(row?.method);
      if (group) out[group] += d(row.amount);
    }
    return out;
  }
  const group = tenderGroup(sale.paymentMethod);
  if (group) out[group] += d(sale.amountPaid);
  return out;
}

/** Splits a refund over the tenders of its sale, in proportion. */
function refundByTender(refund) {
  const out = emptyTenders();
  const total = d(refund.total);
  const sale = refund.sale;
  if (!sale) {
    out.cash = total;
    return out;
  }
  const taken = takenByTender(sale);
  const takenTotal = tenderSum(taken);
  if (takenTotal <= 0) {
    out.card = total;
    return out;
  }
  out.cash = shareOf(total, taken.cash, takenTotal);
  out.bank = shareOf(total, taken.bank, takenTotal);
  out.fawran = shareOf(total, taken.fawran, takenTotal);
  out.card = total - out.cash - out.bank - out.fawran;
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
export async function loadSales(orgId, { from, to }, { channel, branchId } = {}, extra = {}) {
  if (channel && !SALE_CHANNELS.includes(channel)) return [];
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
  if (channel && !SALE_CHANNELS.includes(channel)) return [];
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

/** Payment statuses that count as money in: CAPTURED, or REJECTED (it came in and went back out through its refund row). */
const COUNTED_SERVICE_PAYMENT = ["CAPTURED", "REJECTED"];

/**
 * Grooming booking and relocation quote money (Payment rows from lib/payments.js: gateway
 * payments and staff-recorded cash / bank payments) dated in [from, to). A payment under
 * REVIEW (or being rejected) is left out until staff resolve it. Refunds count once captured,
 * on the refund's own date. Relocation has no location, so a location filter leaves it out.
 */
export async function loadServicePayments(orgId, { from, to }, { channel, branchId } = {}) {
  if (channel && !SERVICE_CHANNELS.includes(channel)) return [];
  const parents = [];
  if (!channel || channel === "GROOMING") parents.push({ appointmentId: { not: null }, ...(branchId ? { appointment: { branchId } } : {}) });
  if ((!channel || channel === "RELOCATION") && !branchId) parents.push({ relocationRequestId: { not: null } });
  if (!parents.length) return [];
  const rows = await prisma.payment.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: from, lt: to },
      OR: [
        { kind: "PAYMENT", status: { in: COUNTED_SERVICE_PAYMENT } },
        { kind: "REFUND", status: "CAPTURED" },
      ],
      AND: [{ OR: parents }],
    },
    select: {
      id: true,
      kind: true,
      method: true,
      status: true,
      amount: true,
      reference: true,
      createdAt: true,
      appointmentId: true,
      relocationRequestId: true,
      appointment: {
        select: {
          reference: true,
          branchId: true,
          branch: { select: { id: true, name: true, nameEn: true } },
          customer: { select: { name: true } },
        },
      },
      relocationRequest: { select: { reference: true, customer: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({ ...row, channel: row.appointmentId ? "GROOMING" : "RELOCATION" }));
}

/** Profit and loss plus money in / out for the range. All sums are exact whole dirhams. */
export async function financeSummary(orgId, dates, filters = {}) {
  const [sales, refunds, servicePayments] = await Promise.all([
    loadSales(orgId, dates, filters, { items: { select: { costAmount: true } } }),
    loadRefunds(orgId, dates, filters, { items: { select: { costAmount: true } } }),
    loadServicePayments(orgId, dates, filters),
  ]);
  const byChannel = Object.fromEntries(CHANNELS.map((key) => [key, { revenue: 0, refunds: 0, cogs: 0, orders: 0, refundCount: 0 }]));
  const taken = emptyTenders();
  for (const sale of sales) {
    const row = byChannel[sale.orderChannel] || byChannel.IN_STORE;
    row.revenue += d(sale.total);
    row.cogs += sum(sale.items, (item) => item.costAmount);
    row.orders += 1;
    const t = takenByTender(sale);
    for (const key of TENDERS) taken[key] += t[key];
  }
  const refundOut = emptyTenders();
  for (const refund of refunds) {
    const row = byChannel[refund.channel] || byChannel.IN_STORE;
    row.refunds += d(refund.total);
    // Cost comes back only when the goods came back (costAmount set on the refund line).
    row.cogs -= sum(refund.items, (item) => item.costAmount);
    row.refundCount += 1;
    const t = refundByTender(refund);
    for (const key of TENDERS) refundOut[key] += t[key];
  }
  // Grooming and relocation: each captured payment is income, each captured refund goes out.
  const serviceIn = { GROOMING: emptyTenders(), RELOCATION: emptyTenders() };
  const serviceOut = { GROOMING: emptyTenders(), RELOCATION: emptyTenders() };
  for (const payment of servicePayments) {
    const row = byChannel[payment.channel];
    const group = tenderGroup(payment.method) || "card";
    const amount = d(payment.amount);
    if (payment.kind === "REFUND") {
      row.refunds += amount;
      row.refundCount += 1;
      serviceOut[payment.channel][group] += amount;
      refundOut[group] += amount;
    } else {
      row.revenue += amount;
      row.orders += 1;
      serviceIn[payment.channel][group] += amount;
    }
  }

  const range = { gte: dates.from, lt: dates.to };
  // Expenses, supplier payments and collections are business-wide (no channel).
  const [expenseRows, supplierRows, collections] = await Promise.all([
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
  ]);
  const expenses = { CASH: 0, BANK: 0 };
  for (const row of expenseRows) expenses[row.paidFrom === "CASH" ? "CASH" : "BANK"] += d(row._sum.amount);
  const supplier = { CASH: 0, BANK: 0 };
  for (const row of supplierRows) supplier[row.method === "CASH" ? "CASH" : "BANK"] += d(row._sum.amount);
  const collected = emptyTenders();
  for (const row of collections) {
    const group = tenderGroup(row.paymentMethod) || "cash";
    // Payments are stored as negative ledger amounts.
    collected[group] += Math.abs(d(row._sum.amount));
  }
  // Channel-filtered views show only that channel's money; business-wide figures need no channel filter.
  const businessWide = !filters.channel;
  const wide = (value) => (businessWide ? value : 0);

  const channels = Object.fromEntries(Object.entries(byChannel).map(([key, row]) => [key, {
    revenue: money(row.revenue),
    refunds: money(row.refunds),
    cogs: money(row.cogs),
    grossProfit: money(row.revenue - row.refunds - row.cogs),
    orders: row.orders,
    refundCount: row.refundCount,
  }]));
  const revenue = sum(Object.values(byChannel), (row) => row.revenue);
  const refundTotal = sum(Object.values(byChannel), (row) => row.refunds);
  const cogs = sum(Object.values(byChannel), (row) => row.cogs);
  const expenseTotal = wide(expenses.CASH + expenses.BANK);
  const supplierTotal = wide(supplier.CASH + supplier.BANK);

  const moneyInBy = {};
  for (const key of TENDERS) {
    moneyInBy[key] = taken[key] + serviceIn.GROOMING[key] + serviceIn.RELOCATION[key] + wide(collected[key]);
  }
  const moneyOutBy = { ...refundOut };
  moneyOutBy.cash += wide(expenses.CASH + supplier.CASH);
  moneyOutBy.bank += wide(expenses.BANK + supplier.BANK);
  const moneyIn = tenderSum(moneyInBy);
  const moneyOut = tenderSum(moneyOutBy);
  const groomingIn = tenderSum(serviceIn.GROOMING);
  const relocationIn = tenderSum(serviceIn.RELOCATION);
  const refundsNonCash = refundOut.card + refundOut.bank + refundOut.fawran;

  return {
    from: dates.from,
    to: dates.to,
    channels,
    revenue: money(revenue),
    refunds: money(refundTotal),
    cogs: money(cogs),
    grossProfit: money(revenue - refundTotal - cogs),
    expenses: money(expenseTotal),
    expensesBySource: { CASH: money(wide(expenses.CASH)), BANK: money(wide(expenses.BANK)) },
    supplierPayments: money(supplierTotal),
    supplierPaymentsBySource: { CASH: money(wide(supplier.CASH)), BANK: money(wide(supplier.BANK)) },
    relocationPaid: money(relocationIn),
    groomingPaid: money(groomingIn),
    netProfit: money(revenue - refundTotal - cogs - expenseTotal),
    moneyIn: money(moneyIn),
    moneyOut: money(moneyOut),
    moneyInDetail: {
      cashSales: money(taken.cash),
      cardSales: money(taken.card),
      bankSales: money(taken.bank),
      fawranSales: money(taken.fawran),
      accountCollections: money(wide(tenderSum(collected))),
      grooming: money(groomingIn),
      relocation: money(relocationIn),
      cash: money(moneyInBy.cash),
      card: money(moneyInBy.card),
      bank: money(moneyInBy.bank),
      fawran: money(moneyInBy.fawran),
    },
    moneyOutDetail: {
      refundsCash: money(refundOut.cash),
      refundsCard: money(refundOut.card),
      refundsBank: money(refundOut.bank),
      refundsFawran: money(refundOut.fawran),
      refundsCardOrBank: money(refundsNonCash),
      refundsGrooming: money(tenderSum(serviceOut.GROOMING)),
      refundsRelocation: money(tenderSum(serviceOut.RELOCATION)),
      supplierPaymentsCash: money(wide(supplier.CASH)),
      supplierPaymentsBank: money(wide(supplier.BANK)),
      expensesCash: money(wide(expenses.CASH)),
      expensesBank: money(wide(expenses.BANK)),
      cash: money(moneyOutBy.cash),
      card: money(moneyOutBy.card),
      bank: money(moneyOutBy.bank),
      fawran: money(moneyOutBy.fawran),
    },
    net: money(moneyIn - moneyOut),
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
    // Weight stock is held in grams; cost is per kilogram. Value is rounded to a whole dirham per row.
    const qty = sellBy === "WEIGHT" ? Number(quantity) / 1000 : Number(quantity);
    const cost = d(unitCost);
    rows.push({
      branchId: branch?.id || "",
      location: branch?.name || "",
      locationEn: branch?.nameEn || branch?.name || "",
      product: name,
      productEn: nameEn || name,
      sku: sku || "",
      unit: sellBy === "WEIGHT" ? "kg" : "pc",
      quantity: Math.round(qty * 1000) / 1000,
      unitCost: money(cost),
      value: lineAmount(cost, quantity, sellBy),
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
  const total = sum(rows, (row) => row.value);
  const byLocation = {};
  for (const row of rows) {
    byLocation[row.branchId] = byLocation[row.branchId] || { branchId: row.branchId, location: row.location, locationEn: row.locationEn, value: 0 };
    byLocation[row.branchId].value += row.value;
  }
  return {
    rows: rows.map((row) => ({ ...row, value: money(row.value) })),
    total: money(total),
    byLocation: Object.values(byLocation).map((row) => ({ ...row, value: money(row.value) })),
  };
}

/**
 * Sales and refunds as one list for finance (FR-103), newest first, with grooming booking
 * and relocation payments (type PAYMENT) and their refunds on the GROOMING / RELOCATION channels.
 */
export async function financeTransactions(orgId, dates, filters = {}) {
  const [sales, refunds, servicePayments] = await Promise.all([
    filters.type === "refund" ? [] : loadSales(orgId, dates, filters),
    filters.type === "sale" ? [] : loadRefunds(orgId, dates, filters),
    loadServicePayments(orgId, dates, filters),
  ]);
  const services = servicePayments.filter((row) => (filters.type === "sale" ? row.kind === "PAYMENT" : filters.type === "refund" ? row.kind === "REFUND" : true));
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
      amount: d(sale.total),
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
      amount: -d(refund.total),
    })),
    ...services.map((payment) => {
      const parent = payment.appointment || payment.relocationRequest;
      const parentId = payment.appointmentId || payment.relocationRequestId;
      return {
        type: payment.kind === "REFUND" ? "REFUND" : "PAYMENT",
        id: payment.id,
        reference: parent?.reference || parentId.slice(-8).toUpperCase(),
        ...(payment.appointmentId ? { appointmentId: payment.appointmentId } : { relocationRequestId: payment.relocationRequestId }),
        date: payment.createdAt,
        channel: payment.channel,
        branchId: payment.appointment?.branchId || "",
        location: payment.appointment?.branch?.name || "",
        locationEn: payment.appointment?.branch?.nameEn || payment.appointment?.branch?.name || "",
        customer: parent?.customer?.name || "",
        paymentMethod: payment.method,
        status: payment.kind === "REFUND" ? "REFUNDED" : payment.status === "REJECTED" ? "REJECTED" : "PAID",
        amount: payment.kind === "REFUND" ? -d(payment.amount) : d(payment.amount),
      };
    }),
  ].sort((a, b) => b.date - a.date);
  const income = rows.filter((row) => row.type !== "REFUND");
  const outgoing = rows.filter((row) => row.type === "REFUND");
  const salesTotal = sum(income, (row) => row.amount);
  const refundsTotal = -sum(outgoing, (row) => row.amount);
  return {
    rows: rows.map((row) => ({ ...row, amount: money(row.amount) })),
    totals: {
      sales: money(salesTotal),
      refunds: money(refundsTotal),
      net: money(salesTotal - refundsTotal),
      saleCount: income.length,
      refundCount: outgoing.length,
    },
  };
}
