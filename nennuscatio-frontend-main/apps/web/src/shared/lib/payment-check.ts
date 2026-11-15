import { type CustomerPayment, OPEN_PAYMENT_STATUSES, type PaymentStatus } from "@nennus-catio/contracts";

/**
 * Following a payment on the order page (8b), the booking page (9e) and the relocation request page
 * (15c): back from the payment page (`?payment=`), the page asks again until our side knows the result.
 */
export const OPEN_PAYMENT: readonly PaymentStatus[] = OPEN_PAYMENT_STATUSES;
export const DID_NOT_GO_THROUGH: readonly PaymentStatus[] = ["failed", "cancelled", "abandoned"];
/** While a payment is being checked: ask every 2 seconds, then every 10 after the first minute. */
export const CHECK_FAST_MS = 2_000;
export const CHECK_SLOW_MS = 10_000;
export const CHECK_PATIENCE_MS = 60_000;

export function minutesLeft(holdExpiresAt: string | null, now: number): number {
  return holdExpiresAt ? Math.ceil((Date.parse(holdExpiresAt) - now) / 60_000) : 0;
}

/**
 * The payment the customer came back from (or is waiting on) is still open on our side. `waiting` is the
 * status that takes payment: an order's or booking's "awaiting_payment", a relocation quote's "quote_requested".
 */
export function checkingPayment(item: { status: string; payment: CustomerPayment }, watching: string | null, waiting = "awaiting_payment"): boolean {
  const latest = item.payment.latest;
  return item.status === waiting && watching !== null && latest?.reference === watching && OPEN_PAYMENT.includes(latest.status);
}
