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

/**
 * Expected drawer cash at close:
 * openingFloat + cash sales (+ cash AR collections in window) − cash refunds on session sales.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ id: string; branchId: string; openingFloat: unknown; openedAt: Date }} session
 * @param {Date} [closedAt]
 */
export async function computeSessionExpectedCash(db, session, closedAt = new Date()) {
  const opening = Number(
    session.openingFloat != null &&
      typeof session.openingFloat === "object" &&
      "toString" in session.openingFloat
      ? session.openingFloat.toString()
      : session.openingFloat,
  );

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
  for (const s of sessionSales) {
    cashSalesNum += cashPortionFromSale(s);
  }

  const saleIds = sessionSales.map((s) => s.id);
  let cashRefundsNum = 0;
  if (saleIds.length) {
    const refunds = await db.refund.findMany({
      where: {
        saleId: { in: saleIds },
        branchId: session.branchId,
        createdAt: { gte: session.openedAt, lte: closedAt },
      },
      select: {
        total: true,
        saleId: true,
      },
    });
    const saleById = new Map(sessionSales.map((s) => [s.id, s]));
    for (const r of refunds) {
      const sale = r.saleId ? saleById.get(r.saleId) : null;
      if (!sale) continue;
      cashRefundsNum += cashPortionFromRefund(r.total, sale);
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
      const a = Number(
        row.amount != null && typeof row.amount === "object" && "toString" in row.amount
          ? row.amount.toString()
          : row.amount,
      );
      // Payments are stored as negative ledger amounts.
      if (Number.isFinite(a) && a < 0) cashCollectionsNum += Math.abs(a);
    }
  } catch {
    cashCollectionsNum = 0;
  }

  return round2(
    (Number.isFinite(opening) ? opening : 0) +
      cashSalesNum +
      cashCollectionsNum -
      cashRefundsNum,
  );
}
