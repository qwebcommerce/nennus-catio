import { d, shareOf } from "./money.js";

/** All amounts here are whole dirhams (NFR-03). */

function parseSplits(splits) {
  if (splits != null && typeof splits === "string") {
    try {
      return JSON.parse(splits);
    } catch {
      return null;
    }
  }
  return splits;
}

function splitSum(splits, method) {
  let sum = 0;
  for (const row of splits) {
    if (String(row?.method || "").toUpperCase() === method) sum += d(row.amount);
  }
  return sum;
}

/**
 * جزء النقد من فاتورة (لحساب المتوقع في جلسة الصندوق).
 * @param {{ paymentMethod: string; total: unknown; amountPaid?: unknown; paymentSplits?: unknown }} sale
 */
export function cashPortionFromSale(sale) {
  const method = String(sale.paymentMethod || "");
  const splits = parseSplits(sale.paymentSplits);
  if (method === "SPLIT" && Array.isArray(splits)) return splitSum(splits, "CASH");
  if (method === "CASH") {
    if (sale.amountPaid != null && d(sale.amountPaid) >= 0) return d(sale.amountPaid);
    return d(sale.total);
  }
  return 0;
}

/**
 * Does this tender put physical cash in the drawer?
 * @param {string} paymentMethod
 * @param {unknown} paymentSplits rows { method, amount } with amount in dirhams
 * @param {number} amountPaid dirhams
 */
export function saleRequiresOpenCashSession(paymentMethod, paymentSplits, amountPaid) {
  const pm = String(paymentMethod || "").toUpperCase();
  if (pm === "CASH" && d(amountPaid) > 0) return true;
  const splits = parseSplits(paymentSplits);
  if (pm === "SPLIT" && Array.isArray(splits)) {
    return splits.some((row) => String(row?.method || "").toUpperCase() === "CASH" && d(row?.amount) > 0);
  }
  return false;
}

/**
 * Cash leaving the drawer for a refund against a session sale.
 * Proportional to the original sale's cash share (rounded half away from zero).
 */
export function cashPortionFromRefund(refundTotal, sale) {
  const rt = d(refundTotal);
  if (rt <= 0) return 0;
  const saleTotal = d(sale?.total);
  const cash = cashPortionFromSale(sale || {});
  if (saleTotal <= 0) return cash > 0 ? rt : 0;
  if (cash <= 0) return 0;
  return shareOf(rt, Math.min(cash, saleTotal), saleTotal);
}

/** Card part of a sale (card tender or the card rows of a split). */
export function cardPortionFromSale(sale) {
  const method = String(sale.paymentMethod || "");
  const splits = parseSplits(sale.paymentSplits);
  if (method === "SPLIT" && Array.isArray(splits)) return splitSum(splits, "CARD");
  if (method === "CARD") {
    const p = sale.amountPaid != null ? d(sale.amountPaid) : d(sale.total);
    return p >= 0 ? p : 0;
  }
  return 0;
}

/**
 * Cash-up figures for a till session (FR-102, FR-109), in whole dirhams:
 * expected cash = opening float + cash sales + cash account collections − cash refunds paid from this session,
 * whichever session the refunded sale was in. Card total = card taken − card refunds in this session.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ id: string; branchId: string; openingFloat: unknown; openedAt: Date }} session
 * @param {Date} [closedAt]
 */
export async function computeSessionCashUp(db, session, closedAt = new Date()) {
  const opening = d(session.openingFloat);

  const sessionSales = await db.sale.findMany({
    where: { cashSessionId: session.id },
    select: {
      id: true,
      total: true,
      amountPaid: true,
      paymentMethod: true,
      paymentSplits: true,
    },
  });

  let cashSales = 0;
  let cardSales = 0;
  for (const s of sessionSales) {
    cashSales += cashPortionFromSale(s);
    cardSales += cardPortionFromSale(s);
  }

  // Refunds recorded against this session (any sale, any earlier session).
  let cashRefunds = 0;
  let cardRefunds = 0;
  const sessionRefunds = await db.refund.findMany({
    where: { cashSessionId: session.id },
    select: { total: true, method: true },
  });
  for (const r of sessionRefunds) {
    if (r.method === "CASH") cashRefunds += d(r.total);
    else if (r.method === "CARD") cardRefunds += d(r.total);
  }

  // Older refunds written before refunds carried a method and session.
  const saleIds = sessionSales.map((s) => s.id);
  if (saleIds.length) {
    const legacy = await db.refund.findMany({
      where: {
        saleId: { in: saleIds },
        cashSessionId: null,
        method: null,
        branchId: session.branchId,
        createdAt: { gte: session.openedAt, lte: closedAt },
      },
      select: { total: true, saleId: true },
    });
    const saleById = new Map(sessionSales.map((s) => [s.id, s]));
    for (const r of legacy) {
      const sale = r.saleId ? saleById.get(r.saleId) : null;
      if (sale) cashRefunds += cashPortionFromRefund(r.total, sale);
    }
  }

  // Cash receivable collections during the open session (same branch).
  let cashCollections = 0;
  try {
    const collections = await db.customerAccountLedger.findMany({
      where: {
        branchId: session.branchId,
        entryType: "PAYMENT",
        paymentMethod: "CASH",
        createdAt: { gte: session.openedAt, lte: closedAt },
      },
      select: { amount: true },
    });
    for (const row of collections) {
      const a = d(row.amount);
      // Payments are stored as negative ledger amounts.
      if (a < 0) cashCollections += -a;
    }
  } catch {
    cashCollections = 0;
  }

  // Sales-order installments paid in cash at this location while the session was open.
  // Bank transfers (and every non-cash method) never count as drawer cash.
  let salesOrderCash = 0;
  const soCash = await db.salesOrderPayment.aggregate({
    where: { branchId: session.branchId, method: "CASH", createdAt: { gte: session.openedAt, lte: closedAt } },
    _sum: { amount: true },
  });
  salesOrderCash = d(soCash._sum.amount);
  // Shown on the cash-up for reference only (not in the drawer).
  const bankTransferSales = sessionSales.filter((s) => s.paymentMethod === "BANK_TRANSFER").reduce((acc, s) => acc + d(s.amountPaid), 0);

  return {
    openingFloat: opening,
    cashSales,
    cashCollections,
    salesOrderCash,
    cashRefunds,
    expectedCash: opening + cashSales + cashCollections + salesOrderCash - cashRefunds,
    cardSales,
    cardRefunds,
    cardTotal: cardSales - cardRefunds,
    bankTransferSales,
  };
}

/** Expected drawer cash at close (whole dirhams). */
export async function computeSessionExpectedCash(db, session, closedAt = new Date()) {
  return (await computeSessionCashUp(db, session, closedAt)).expectedCash;
}
