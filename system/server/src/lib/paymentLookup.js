import { prisma } from "./prisma.js";
import { lookupSkipcashPayment, skipcashConfigured } from "./skipcash.js";
import { applyGatewayResult, gatewayCustom } from "./gatewayNotify.js";
import { statusError } from "./payments.js";

const PARENT = {
  sale: {
    load: (id) => prisma.sale.findUnique({ where: { id }, select: { id: true, webStatus: true, gatewayPaymentId: true, paymentReview: true, orderChannel: true } }),
    pending: (row) => row.webStatus === "PENDING_PAYMENT",
  },
  appointment: {
    load: (id) => prisma.appointment.findUnique({ where: { id }, select: { id: true, status: true, gatewayPaymentId: true, paymentReview: true } }),
    pending: (row) => row.status === "PENDING_PAYMENT",
  },
  relocation: {
    load: (id) => prisma.relocationRequest.findUnique({ where: { id }, select: { id: true, status: true, gatewayPaymentId: true, paymentReview: true } }),
    pending: (row) => row.status === "QUOTE_SENT",
  },
};

const STATUS_NAMES = { 0: "NEW", 1: "PENDING", 2: "PAID", 3: "CANCELLED", 4: "FAILED", 5: "REJECTED", 6: "REFUNDED", 7: "PENDING_REFUND", 8: "REFUND_FAILED" };

async function logLookup(data) {
  try {
    return await prisma.gatewayLookup.create({ data });
  } catch {
    return null;
  }
}

/**
 * FR-76: confirms a payment from a lookup the server makes. Asks SkipCash for the parent's own
 * stored payment id (a payment id from the browser is only a trigger and must match it) and
 * applies the answer through applyGatewayResult — the same guarded path as the signed webhook,
 * so amount / currency / lateness checks and REVIEW rules are identical and a payment already
 * recorded by the webhook (or a parallel lookup) is a replay.
 *
 * options.requirePending: only look up while the parent waits for payment (customer return).
 * options.allowReview: also look up a parent whose payment is under review (staff action).
 */
export async function checkGatewayPayment({ parentKind, parentId, source, req = null, browserPaymentId = null, requirePending = false, allowReview = false }) {
  const spec = PARENT[parentKind];
  const row = await spec.load(parentId);
  if (!row) throw statusError("Not found", 404);
  const pending = spec.pending(row);
  if (!row.gatewayPaymentId) return { checked: false, reason: "NO_GATEWAY_PAYMENT", pending };
  if (browserPaymentId != null && String(browserPaymentId).trim() !== row.gatewayPaymentId) {
    return { checked: false, reason: "UNKNOWN_PAYMENT", pending };
  }
  if (!pending && !(allowReview && row.paymentReview)) {
    if (requirePending || !allowReview) return { checked: false, reason: "NOT_PENDING", pending };
    throw statusError("This payment is not pending or under review", 400);
  }
  if (!skipcashConfigured()) throw statusError("Payment lookups need the SkipCash key and secret", 503);
  let gateway;
  try {
    gateway = await lookupSkipcashPayment(row.gatewayPaymentId);
  } catch (e) {
    await logLookup({ parentKind, parentId, gatewayPaymentId: row.gatewayPaymentId, source, outcome: "ERROR", error: String(e.message || e).slice(0, 300) });
    throw e;
  }
  const custom = gatewayCustom(parentKind, row.id);
  if (gateway.custom1 && gateway.custom1 !== custom) {
    await logLookup({ parentKind, parentId, gatewayPaymentId: row.gatewayPaymentId, source, statusId: gateway.statusId, outcome: "MISMATCH" });
    throw statusError("The gateway payment belongs to a different order", 409);
  }
  const body = {
    PaymentId: gateway.id,
    Amount: gateway.amount,
    Currency: gateway.currency,
    StatusId: gateway.statusId,
    TransactionId: gateway.transactionId,
    Custom1: custom,
  };
  const result = await applyGatewayResult(body, { req, confirmAt: gateway.paidAt });
  await logLookup({ parentKind, parentId, gatewayPaymentId: row.gatewayPaymentId, source, statusId: gateway.statusId, outcome: result.outcome });
  return {
    checked: true,
    gatewayStatusId: gateway.statusId,
    gatewayStatus: STATUS_NAMES[gateway.statusId] || "UNKNOWN",
    outcome: result.outcome,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

const CLAIM_STALE_MS = 60_000;
/** Holds that lapsed longer ago than this are released without a lookup (old backlog). */
const LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Before the expiry sweep releases a hold, each expired order or booking that has a gateway
 * payment is looked up once (FR-76), so a customer who paid but whose notification was lost is
 * confirmed instead of released. The "once" is a claim row (unique per payment for the sweep)
 * so parallel sweeps on several instances do not look it up twice. Returns the parents that
 * must not be released yet (lookup still to do or in flight on another instance).
 */
export async function lookupExpiredPayments({ limit = 5, timeoutMs = 4000 } = {}) {
  const deferred = { saleIds: [], appointmentIds: [] };
  if (!skipcashConfigured()) return deferred;
  const now = new Date();
  const [sales, bookings] = await Promise.all([
    prisma.sale.findMany({
      where: { webStatus: "PENDING_PAYMENT", holdExpiresAt: { lt: now, gt: new Date(now.getTime() - LOOKUP_WINDOW_MS) }, gatewayPaymentId: { not: null } },
      select: { id: true, gatewayPaymentId: true, holdExpiresAt: true },
      take: 100,
    }),
    prisma.appointment.findMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now, gt: new Date(now.getTime() - LOOKUP_WINDOW_MS) }, gatewayPaymentId: { not: null } },
      select: { id: true, gatewayPaymentId: true, holdExpiresAt: true },
      take: 100,
    }),
  ]);
  const candidates = [
    ...sales.map((row) => ({ parentKind: "sale", parentId: row.id, gatewayPaymentId: row.gatewayPaymentId, holdExpiresAt: row.holdExpiresAt })),
    ...bookings.map((row) => ({ parentKind: "appointment", parentId: row.id, gatewayPaymentId: row.gatewayPaymentId, holdExpiresAt: row.holdExpiresAt })),
  ];
  if (!candidates.length) return deferred;
  const claims = await prisma.gatewayLookup.findMany({
    where: { source: "sweep", gatewayPaymentId: { in: candidates.map((c) => c.gatewayPaymentId) } },
    select: { gatewayPaymentId: true, outcome: true, createdAt: true },
  });
  const claimBy = new Map(claims.map((row) => [row.gatewayPaymentId, row]));
  const todo = [];
  const defer = (c) => (c.parentKind === "sale" ? deferred.saleIds : deferred.appointmentIds).push(c.parentId);
  for (const c of candidates) {
    const claim = claimBy.get(c.gatewayPaymentId);
    if (claim) {
      // Looked up already (or the claiming instance died long ago): release as usual.
      if (claim.outcome == null && now - claim.createdAt < CLAIM_STALE_MS) defer(c);
      continue;
    }
    if (todo.length < limit) todo.push(c);
    else defer(c);
  }
  await Promise.all(todo.map(async (c) => {
    // Claim: the partial unique index lets exactly one sweep look this payment up.
    const claimed = await prisma.$queryRaw`
      INSERT INTO "GatewayLookup" ("id", "parentKind", "parentId", "gatewayPaymentId", "source", "createdAt")
      VALUES (${`gl_${c.gatewayPaymentId}`.slice(0, 190)}, ${c.parentKind}, ${c.parentId}, ${c.gatewayPaymentId}, 'sweep', now())
      ON CONFLICT DO NOTHING
      RETURNING "id"`;
    if (!claimed.length) {
      defer(c);
      return;
    }
    const id = claimed[0].id;
    let outcome = "ERROR";
    let statusId = null;
    let error = null;
    try {
      const gateway = await lookupSkipcashPayment(c.gatewayPaymentId, { timeoutMs });
      statusId = gateway.statusId;
      const custom = gatewayCustom(c.parentKind, c.parentId);
      if (gateway.custom1 && gateway.custom1 !== custom) {
        outcome = "MISMATCH";
      } else if (gateway.statusId === 2) {
        const result = await applyGatewayResult(
          { PaymentId: gateway.id, Amount: gateway.amount, Currency: gateway.currency, StatusId: 2, TransactionId: gateway.transactionId, Custom1: custom },
          // The gateway's payment time decides lateness. Without one, the payment was made while
          // the hold was still in place here (not yet released), so it is judged at hold expiry;
          // stock and the grooming slot are still re-checked inside the confirm.
          { confirmAt: gateway.paidAt || new Date(c.holdExpiresAt.getTime() - 1) },
        );
        outcome = result.outcome;
      } else {
        outcome = STATUS_NAMES[gateway.statusId] || "UNKNOWN";
      }
    } catch (e) {
      error = String(e.message || e).slice(0, 300);
    }
    await prisma.gatewayLookup.update({ where: { id }, data: { outcome, statusId, error } }).catch(() => {});
  }));
  return deferred;
}

/**
 * FR-76: the customer is back from the payment page with a payment id. While the order still
 * waits for payment the server looks the payment up itself (the browser's id must match the
 * stored one and is never trusted for the result) and confirms through the webhook's path.
 */
export async function lookupOnReturn(req, parentKind, row, pending) {
  const browserPaymentId = String(req.query.paymentId || "").trim();
  if (!browserPaymentId || !pending || !row.gatewayPaymentId || browserPaymentId !== row.gatewayPaymentId) return false;
  try {
    const result = await checkGatewayPayment({ parentKind, parentId: row.id, source: "return", req, browserPaymentId, requirePending: true });
    return result.checked;
  } catch (e) {
    console.error("[payment lookup]", parentKind, row.id, e?.message || e);
    return false;
  }
}
