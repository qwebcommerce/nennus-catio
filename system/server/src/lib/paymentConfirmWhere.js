/**
 * fix-rd — query filters for payment confirmation (no imports, safe to use anywhere).
 * See lib/paymentConfirm.js and docs/testing/payment-confirmation.md.
 */

/** Money counts in finance (money in, balances, exports) only once the accountant confirmed it. */
export const CONFIRMED = Object.freeze({ confirmStatus: "CONFIRMED" });

/**
 * Cash-up rows: drawer cash is a drawer fact, so it counts while it awaits confirmation. A
 * rejection made before `closedAt` (the session is still open, or closed later) takes it out; a
 * rejection after the cash-up closed leaves that closed cash-up exactly as it was counted.
 */
export function inDrawerWhere(closedAt) {
  return { OR: [{ confirmStatus: { not: "REJECTED" } }, { rejectedAt: { gt: closedAt } }] };
}
