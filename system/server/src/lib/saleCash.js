/**
 * جزء النقد من فاتورة (لحساب المتوقع في جلسة الصندوق).
 * @param {{ paymentMethod: string; total: unknown; amountPaid?: unknown; paymentSplits?: unknown }} sale
 */
export function cashPortionFromSale(sale) {
  const method = String(sale.paymentMethod || "");
  let splits = sale.paymentSplits;
  if (splits != null && typeof splits === "string") {
    try {
      splits = JSON.parse(splits);
    } catch {
      splits = null;
    }
  }
  if (method === "SPLIT" && Array.isArray(splits)) {
    let sum = 0;
    for (const row of splits) {
      if (String(row?.method || "").toUpperCase() === "CASH") {
        sum += Number(row.amount);
      }
    }
    return Number.isFinite(sum) ? sum : 0;
  }
  if (method === "CASH") {
    const paid = sale.amountPaid;
    if (paid != null) {
      const p =
        typeof paid === "object" && paid !== null && "toString" in paid
          ? Number(paid.toString())
          : Number(paid);
      if (Number.isFinite(p) && p >= 0) return p;
    }
    const t = sale.total;
    const n =
      t != null && typeof t === "object" && "toString" in t ? Number(t.toString()) : Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Does this tender put physical cash in the drawer?
 * @param {string} paymentMethod
 * @param {unknown} paymentSplits
 * @param {number} amountPaidNum
 */
export function saleRequiresOpenCashSession(paymentMethod, paymentSplits, amountPaidNum) {
  const pm = String(paymentMethod || "").toUpperCase();
  const paid = Number(amountPaidNum) || 0;
  if (pm === "CASH" && paid > 0.005) return true;
  let splits = paymentSplits;
  if (splits != null && typeof splits === "string") {
    try {
      splits = JSON.parse(splits);
    } catch {
      splits = null;
    }
  }
  if (pm === "SPLIT" && Array.isArray(splits)) {
    return splits.some(
      (row) =>
        String(row?.method || "").toUpperCase() === "CASH" &&
        Number(row?.amount) > 0.005,
    );
  }
  return false;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Cash leaving the drawer for a refund against a session sale.
 * Proportional to the original sale's cash share.
 */
export function cashPortionFromRefund(refundTotal, sale) {
  const rt = Number(
    refundTotal != null && typeof refundTotal === "object" && "toString" in refundTotal
      ? refundTotal.toString()
      : refundTotal,
  );
  if (!Number.isFinite(rt) || rt <= 0) return 0;
  const saleTotal = Number(
    sale?.total != null && typeof sale.total === "object" && "toString" in sale.total
      ? sale.total.toString()
      : sale?.total,
  );
  const cash = cashPortionFromSale(sale || {});
  if (!Number.isFinite(saleTotal) || saleTotal <= 0.005) {
    return cash > 0.005 ? round2(rt) : 0;
  }
  if (cash <= 0.005) return 0;
  const share = Math.min(1, cash / saleTotal);
  return round2(rt * share);
}

/** Card part of a sale (card tender or the card rows of a split). */
export function cardPortionFromSale(sale) {
  const method = String(sale.paymentMethod || "");
  let splits = sale.paymentSplits;
  if (splits != null && typeof splits === "string") {
    try {
      splits = JSON.parse(splits);
    } catch {
      splits = null;
    }
  }
  if (method === "SPLIT" && Array.isArray(splits)) {
    let sum = 0;
    for (const row of splits) {
      if (String(row?.method || "").toUpperCase() === "CARD") sum += Number(row.amount);
    }
    return Number.isFinite(sum) ? sum : 0;
  }
  if (method === "CARD") {
    const p = Number(sale.amountPaid != null ? sale.amountPaid.toString() : sale.total?.toString());
    return Number.isFinite(p) && p >= 0 ? p : 0;
  }
  return 0;
}

const num = (v) => {
  const n = Number(v != null && typeof v === "object" && "toString" in v ? v.toString() : v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cash-up figures for a till session (FR-102, FR-109):
 * expected cash = opening float + cash sales + cash account collections − cash refunds paid from this session,
 * whichever session the refunded sale was in. Card total = card taken − card refunds in this session.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ id: string; branchId: string; openingFloat: unknown; openedAt: Date }} session
 * @param {Date} [closedAt]
 */
export async function computeSessionCashUp(db, session, closedAt = new Date()) {
  const opening = num(session.openingFloat);

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

  let cashSalesNum = 0;
  let cardSalesNum = 0;
  for (const s of sessionSales) {
    cashSalesNum += cashPortionFromSale(s);
    cardSalesNum += cardPortionFromSale(s);
  }

  // Refunds recorded against this session (any sale, any earlier session).
  let cashRefundsNum = 0;
  let cardRefundsNum = 0;
  const sessionRefunds = await db.refund.findMany({
    where: { cashSessionId: session.id },
    select: { total: true, method: true },
  });
  for (const r of sessionRefunds) {
    if (r.method === "CASH") cashRefundsNum += num(r.total);
    else if (r.method === "CARD") cardRefundsNum += num(r.total);
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
      if (sale) cashRefundsNum += cashPortionFromRefund(r.total, sale);
    }
  }

  // Cash receivable collections during the open session (same branch).
  let cashCollectionsNum = 0;
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
      const a = num(row.amount);
      // Payments are stored as negative ledger amounts.
      if (a < 0) cashCollectionsNum += Math.abs(a);
    }
  } catch {
    cashCollectionsNum = 0;
  }

  return {
    openingFloat: round2(opening),
    cashSales: round2(cashSalesNum),
    cashCollections: round2(cashCollectionsNum),
    cashRefunds: round2(cashRefundsNum),
    expectedCash: round2(opening + cashSalesNum + cashCollectionsNum - cashRefundsNum),
    cardSales: round2(cardSalesNum),
    cardRefunds: round2(cardRefundsNum),
    cardTotal: round2(cardSalesNum - cardRefundsNum),
  };
}

/** Expected drawer cash at close. */
export async function computeSessionExpectedCash(db, session, closedAt = new Date()) {
  return (await computeSessionCashUp(db, session, closedAt)).expectedCash;
}
