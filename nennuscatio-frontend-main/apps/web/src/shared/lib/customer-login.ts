import { bookingReferenceSchema, orderReferenceSchema, relocationReferenceSchema } from "@nennus-catio/contracts";

/**
 * Where a customer goes back to after logging in (review M8). Only the shop's own My account,
 * My orders, My bookings, My relocation requests, saved addresses and pets, checkout, grooming, the
 * relocation form (15c), order, booking and relocation request pages are accepted, as plain paths
 * without the locale (the locale-aware router adds it); anything else, including another site, goes
 * to My account.
 */
export function safeCustomerNext(value: string | null): string {
  const pages = [
    "/account",
    "/account/orders",
    "/account/bookings",
    "/account/relocation",
    "/account/addresses",
    "/account/pets",
    "/checkout",
    "/grooming",
    "/relocation/request",
  ];
  if (value !== null && pages.includes(value)) {
    return value;
  }
  if (value?.startsWith("/orders/") && orderReferenceSchema.safeParse(value.slice("/orders/".length)).success) return value;
  if (value?.startsWith("/bookings/") && bookingReferenceSchema.safeParse(value.slice("/bookings/".length)).success) return value;
  if (value?.startsWith("/relocation/requests/") && relocationReferenceSchema.safeParse(value.slice("/relocation/requests/".length)).success) return value;
  return "/account";
}

/** The login page, remembering the page to come back to. */
export function customerLoginHref(next: string): string {
  return `/account/login?next=${encodeURIComponent(next)}`;
}
