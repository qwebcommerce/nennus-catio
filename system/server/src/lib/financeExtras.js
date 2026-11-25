/**
 * Finance figures added with sales orders, complimentary goods, bank transfer, supplier
 * prepayments and freight (used by financeSummary / financeTransactions in financeData.js).
 *
 * - SALES_ORDER channel: revenue and cost at delivery (SalesOrderDelivery, dated deliveredAt);
 *   money in when an installment is paid (SalesOrderPayment, dated paidAt), by method.
 * - Complimentary: cost of goods given free (till lines with isFree, sales-order free lines at
 *   delivery). Revenue 0; the cost is its own P&L line, not in cost of goods.
 * - Supplier prepayments are money out on their own date (they are never SupplierPayment rows, so
 *   nothing is counted twice when they are applied to a bill at receipt).
 * - Freight on goods already sold: the share of a freight bill added after receipt that could not
 *   go into stock still on hand (P&L cost line, dated when the freight bill was entered).
 * Location filter: a sales order belongs to its selling location. Prepayments and freight are
 * business-wide (shown only without a channel filter, like supplier payments and expenses).
 * All amounts whole dirhams.
 */
import { prisma } from "./prisma.js";
import { d } from "./money.js";

export const SALES_ORDER_CHANNEL = "SALES_ORDER";

export async function financeExtras(orgId, dates, filters = {}, { countedSale, saleChannels }) {
  const range = { gte: dates.from, lt: dates.to };
  const channel = filters.channel || "";
  const branchId = filters.branchId || "";
  const withSo = !channel || channel === SALES_ORDER_CHANNEL;
  const withTill = !channel || saleChannels.includes(channel);
  const businessWide = !channel;

  const [deliveries, soPayments, freeItems, transferSales, transferCollections, prepayRows, freightRows] = await Promise.all([
    withSo
      ? prisma.salesOrderDelivery.findMany({
          where: { deliveredAt: range, order: { organizationId: orgId }, ...(branchId ? { branchId } : {}) },
          select: { revenue: true, cost: true, complimentaryCost: true },
        })
      : [],
    withSo
      ? prisma.salesOrderPayment.findMany({
          where: { paidAt: range, order: { organizationId: orgId }, ...(branchId ? { branchId } : {}) },
          select: { amount: true, method: true },
        })
      : [],
    withTill
      ? prisma.saleItem.findMany({
          where: {
            isFree: true,
            sale: {
              branch: { organizationId: orgId },
              createdAt: range,
              ...countedSale,
              ...(channel ? { orderChannel: channel } : {}),
              ...(branchId ? { branchId } : {}),
            },
          },
          select: { costAmount: true, sale: { select: { orderChannel: true } } },
        })
      : [],
    withTill
      ? prisma.sale.aggregate({
          where: {
            branch: { organizationId: orgId },
            createdAt: range,
            paymentMethod: "BANK_TRANSFER",
            ...countedSale,
            ...(channel ? { orderChannel: channel } : {}),
            ...(branchId ? { branchId } : {}),
          },
          _sum: { amountPaid: true },
        })
      : { _sum: { amountPaid: 0 } },
    businessWide
      ? prisma.customerAccountLedger.aggregate({
          where: { organizationId: orgId, entryType: "PAYMENT", paymentMethod: "BANK_TRANSFER", createdAt: range, ...(branchId ? { branchId } : {}) },
          _sum: { amount: true },
        })
      : { _sum: { amount: 0 } },
    businessWide
      ? prisma.supplierPrepayment.groupBy({ by: ["method"], where: { organizationId: orgId, paidAt: range }, _sum: { amount: true } })
      : [],
    businessWide
      ? prisma.supplierBill.aggregate({ where: { organizationId: orgId, kind: "FREIGHT", createdAt: range }, _sum: { freightExpensed: true } })
      : { _sum: { freightExpensed: 0 } },
  ]);

  const so = { revenue: 0, cogs: 0, complimentary: 0, deliveries: deliveries.length };
  for (const row of deliveries) {
    so.revenue += d(row.revenue);
    so.cogs += d(row.cost);
    so.complimentary += d(row.complimentaryCost);
  }
  const soIn = { cash: 0, card: 0, bank: 0, fawran: 0 };
  let soTransfer = 0;
  for (const p of soPayments) {
    const m = String(p.method);
    const group = m === "CASH" ? "cash" : m === "CARD" || m === "ONLINE" ? "card" : m === "FAWRAN" ? "fawran" : "bank";
    soIn[group] += d(p.amount);
    if (m === "BANK_TRANSFER") soTransfer += d(p.amount);
  }
  const tillComplimentary = {};
  for (const item of freeItems) {
    const ch = item.sale?.orderChannel || "IN_STORE";
    tillComplimentary[ch] = (tillComplimentary[ch] || 0) + d(item.costAmount);
  }
  const prepay = { CASH: 0, BANK: 0 };
  for (const row of prepayRows) prepay[row.method === "CASH" ? "CASH" : "BANK"] += d(row._sum.amount);

  return {
    so,
    soIn,
    soPaymentsTotal: soIn.cash + soIn.card + soIn.bank + soIn.fawran,
    tillComplimentary,
    bankTransfer: {
      till: d(transferSales._sum.amountPaid),
      collections: Math.abs(d(transferCollections._sum.amount)),
      salesOrders: soTransfer,
    },
    prepay,
    freightOnSold: d(freightRows._sum.freightExpensed),
  };
}

/** Sales-order deliveries as finance transaction rows (type SALE, channel SALES_ORDER). */
export async function salesOrderTransactions(orgId, dates, filters = {}) {
  if (filters.channel && filters.channel !== SALES_ORDER_CHANNEL) return [];
  if (filters.type === "refund") return [];
  const rows = await prisma.salesOrderDelivery.findMany({
    where: { deliveredAt: { gte: dates.from, lt: dates.to }, order: { organizationId: orgId }, ...(filters.branchId ? { branchId: filters.branchId } : {}) },
    select: {
      id: true,
      deliveredAt: true,
      revenue: true,
      branchId: true,
      branch: { select: { name: true, nameEn: true } },
      order: { select: { id: true, reference: true, status: true, customer: { select: { name: true, companyName: true } } } },
    },
    orderBy: { deliveredAt: "desc" },
  });
  return rows.map((row) => ({
    type: "SALE",
    id: row.id,
    salesOrderId: row.order.id,
    reference: row.order.reference,
    date: row.deliveredAt,
    channel: SALES_ORDER_CHANNEL,
    branchId: row.branchId,
    location: row.branch?.name || "",
    locationEn: row.branch?.nameEn || row.branch?.name || "",
    customer: row.order.customer?.companyName || row.order.customer?.name || "",
    paymentMethod: "",
    status: "DELIVERED",
    amount: d(row.revenue),
  }));
}
