import { Prisma } from "./prisma-client-bundle.js";
import { prisma } from "./prisma.js";
import { refundSkipcashPayment } from "./skipcash.js";

/** Interactive transactions that take row locks may wait behind other checkouts. */
export const LOCK_TX = { maxWait: 20000, timeout: 30000 };

const PARENTS = {
  sale: { table: '"Sale"', field: "saleId", model: "sale" },
  appointment: { table: '"Appointment"', field: "appointmentId", model: "appointment" },
  relocation: { table: '"RelocationRequest"', field: "relocationRequestId", model: "relocationRequest" },
};

export function statusError(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export function cents(n) {
  return Math.round(Number(n) * 100);
}

export function dec(n) {
  return new Prisma.Decimal(Number(n).toFixed(2));
}

function isUniqueViolation(e) {
  return e?.code === "P2002" || /unique constraint/i.test(String(e?.message || ""));
}

/** Locks the parent row (order, booking or relocation request) for the rest of the transaction. */
export async function lockParent(tx, parentKind, id) {
  const { table } = PARENTS[parentKind];
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, id);
  return rows.length > 0;
}

/** Signals that a gateway payment cannot confirm its parent automatically. */
export function needsReview(reason) {
  return statusError("Payment needs staff review", 200, { reviewReason: reason });
}

/**
 * Records a signed gateway "paid" notification against exactly one parent and either
 * confirms the parent (confirm callback, inside the same transaction) or, when the amount,
 * currency or timing is wrong, records the payment as REVIEW and flags the parent so staff
 * resolve it (FR-76, FR-79). A replay of the same PaymentId is recognised and ignored.
 *
 * confirm(tx) must use guarded conditional updates and throw needsReview(reason) (or an
 * error with code HOLD_RELEASED / STOCK_CHANGED) when it cannot confirm.
 */
export async function settleGatewayPayment({ parentKind, parentId, organizationId, body, expected, confirm }) {
  const { field, model } = PARENTS[parentKind];
  const paid = Number(body.Amount);
  const currency = String(body.Currency || body.currency || "QAR").trim().toUpperCase();
  const amountOk = Number.isFinite(paid) && cents(paid) === cents(expected) && currency === "QAR";
  const gatewayPaymentId = String(body.PaymentId || "").trim() || null;
  const base = {
    organizationId,
    [field]: parentId,
    kind: "PAYMENT",
    method: "ONLINE",
    amount: dec(Number.isFinite(paid) && paid > 0 ? paid : 0.01),
    currency,
    gatewayPaymentId,
    reference: String(body.TransactionId || body.PaymentId || "").slice(0, 120) || null,
    note: Number.isFinite(paid) && paid > 0 ? null : `Gateway amount was ${String(body.Amount)}`,
  };
  if (gatewayPaymentId) {
    const seen = await prisma.payment.findFirst({ where: { gatewayPaymentId, kind: "PAYMENT" }, select: { id: true } });
    if (seen) return { outcome: "replay" };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { ...base, status: "CAPTURED" } });
      if (!amountOk) throw needsReview("AMOUNT_MISMATCH");
      await confirm(tx, paid);
    }, LOCK_TX);
    return { outcome: "confirmed" };
  } catch (e) {
    if (isUniqueViolation(e)) return { outcome: "replay" };
    const reason =
      e.reviewReason ||
      (e.code === "HOLD_RELEASED" ? "LATE_PAYMENT" : e.code === "STOCK_CHANGED" ? "STOCK_CHANGED" : null);
    if (!reason) throw e;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({ data: { ...base, status: "REVIEW", reviewReason: reason } });
        await tx[model].update({
          where: { id: parentId },
          data: { paymentReview: true, paymentReviewReason: reason },
        });
      });
    } catch (e2) {
      if (isUniqueViolation(e2)) return { outcome: "replay" };
      throw e2;
    }
    return { outcome: "review", reason };
  }
}

/** Sums of a parent's payments. Captured = confirmed money in; refunded counts refunds in flight. */
export async function paymentTotals(db, parentKind, parentId) {
  const { field } = PARENTS[parentKind];
  const rows = await db.payment.findMany({ where: { [field]: parentId }, orderBy: { createdAt: "asc" } });
  let captured = 0;
  let refunded = 0;
  for (const row of rows) {
    // A rejected review payment came in and went back out through its own refund row.
    if (row.kind === "PAYMENT" && ["CAPTURED", "REJECTING", "REJECTED"].includes(row.status)) captured += cents(row.amount);
    if (row.kind === "REFUND" && ["CAPTURED", "PENDING"].includes(row.status)) refunded += cents(row.amount);
  }
  return { rows, captured: captured / 100, refunded: refunded / 100, remaining: (captured - refunded) / 100 };
}

/**
 * Refunds money on a booking or relocation request (FR-77, FR-55). The parent row is locked
 * while the remaining amount is checked and the refund row is written, so parallel refunds
 * can never exceed what was captured. An online payment is refunded through the gateway;
 * otherwise staff record a cash or bank refund.
 */
export async function refundParent({ parentKind, parentId, organizationId, amount, userId, method, note }) {
  const { field, model } = PARENTS[parentKind];
  const wanted = Number(amount);
  if (!Number.isFinite(wanted) || wanted <= 0) throw statusError("Refund amount is not valid", 400);
  const chosen = String(method || "").toUpperCase();
  const { refund, gatewayPaymentId, remainingAfter } = await prisma.$transaction(async (tx) => {
    const found = await tx[model].findFirst({ where: { id: parentId, organizationId }, select: { id: true } });
    if (!found) throw statusError("Not found", 404);
    await lockParent(tx, parentKind, parentId);
    const totals = await paymentTotals(tx, parentKind, parentId);
    if (totals.remaining <= 0) throw statusError("There is no captured payment left to refund", 400);
    if (cents(wanted) > cents(totals.remaining)) {
      throw statusError(`Refund amount is more than the ${totals.remaining.toFixed(2)} QAR left to refund`, 400);
    }
    const online = [...totals.rows].reverse().find(
      (row) => row.kind === "PAYMENT" && row.status === "CAPTURED" && row.method === "ONLINE" && row.gatewayPaymentId,
    );
    let refundMethod = chosen;
    if (!["CASH", "BANK"].includes(refundMethod)) {
      if (!online) throw statusError("Choose cash or bank for this refund", 400);
      refundMethod = "ONLINE";
    }
    const row = await tx.payment.create({
      data: {
        organizationId,
        [field]: parentId,
        kind: "REFUND",
        method: refundMethod,
        status: refundMethod === "ONLINE" ? "PENDING" : "CAPTURED",
        amount: dec(wanted),
        userId: userId || null,
        note: note ? String(note).slice(0, 500) : null,
      },
    });
    return {
      refund: row,
      gatewayPaymentId: refundMethod === "ONLINE" ? online.gatewayPaymentId : null,
      remainingAfter: (cents(totals.remaining) - cents(wanted)) / 100,
    };
  }, LOCK_TX);
  let finished = refund;
  if (gatewayPaymentId) {
    try {
      const gateway = await refundSkipcashPayment({ id: gatewayPaymentId, amount: wanted });
      finished = await prisma.payment.update({
        where: { id: refund.id },
        data: { status: "CAPTURED", gatewayRefundId: gateway.id },
      });
    } catch (e) {
      await prisma.payment.update({ where: { id: refund.id }, data: { status: "FAILED", note: String(e.message || "").slice(0, 500) } });
      throw statusError(e.message || "The gateway did not refund the payment", e.status || 502);
    }
  }
  if (remainingAfter <= 0) {
    await prisma[model].updateMany({
      where: { id: parentId, paymentReviewReason: "REFUND_DUE" },
      data: { paymentReview: false, paymentReviewReason: null },
    });
  }
  return finished;
}

/**
 * Staff reject payments under review: each is refunded in full through the gateway.
 * The REVIEW -> REJECTING claim is a guarded update so two staff clicks refund once.
 */
export async function rejectReviewPayments({ parentKind, parentId, userId }) {
  const { field } = PARENTS[parentKind];
  const claimed = await prisma.$transaction(async (tx) => {
    await lockParent(tx, parentKind, parentId);
    const rows = await tx.payment.findMany({ where: { [field]: parentId, kind: "PAYMENT", status: "REVIEW" } });
    const out = [];
    for (const row of rows) {
      const got = await tx.payment.updateMany({ where: { id: row.id, status: "REVIEW" }, data: { status: "REJECTING" } });
      if (!got.count) continue;
      const refund = await tx.payment.create({
        data: {
          organizationId: row.organizationId,
          [field]: parentId,
          kind: "REFUND",
          method: row.method,
          status: row.gatewayPaymentId ? "PENDING" : "CAPTURED",
          amount: row.amount,
          userId: userId || null,
          note: `Refund of ${row.reviewReason || "reviewed"} payment`,
        },
      });
      out.push({ payment: row, refund });
    }
    return out;
  }, LOCK_TX);
  let refunded = 0;
  for (const { payment, refund } of claimed) {
    if (payment.gatewayPaymentId) {
      try {
        const gateway = await refundSkipcashPayment({ id: payment.gatewayPaymentId, amount: Number(payment.amount) });
        await prisma.payment.update({ where: { id: refund.id }, data: { status: "CAPTURED", gatewayRefundId: gateway.id } });
      } catch (e) {
        await prisma.payment.update({ where: { id: refund.id }, data: { status: "FAILED" } });
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "REVIEW" } });
        throw statusError(e.message || "The gateway did not refund the payment", e.status || 502);
      }
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REJECTED" } });
    refunded += Number(payment.amount);
  }
  return { refunded, count: claimed.length };
}

/** Staff accept payments under review (inside the caller's transaction). Returns the amount accepted. */
export async function acceptReviewPayments(tx, parentKind, parentId) {
  const { field } = PARENTS[parentKind];
  const rows = await tx.payment.findMany({ where: { [field]: parentId, kind: "PAYMENT", status: "REVIEW" } });
  let total = 0;
  for (const row of rows) {
    const got = await tx.payment.updateMany({ where: { id: row.id, status: "REVIEW" }, data: { status: "CAPTURED" } });
    if (got.count) total += Number(row.amount);
  }
  return total;
}

/** Staff-recorded cash or bank payment (FR-64): one Payment row with amount, method, reference and user. */
export async function recordStaffPayment(tx, { parentKind, parentId, organizationId, amount, method, reference, userId, note }) {
  const { field } = PARENTS[parentKind];
  return tx.payment.create({
    data: {
      organizationId,
      [field]: parentId,
      kind: "PAYMENT",
      method,
      status: "CAPTURED",
      amount: dec(amount),
      reference: reference ? String(reference).slice(0, 120) : null,
      userId: userId || null,
      note: note ? String(note).slice(0, 500) : null,
    },
  });
}
