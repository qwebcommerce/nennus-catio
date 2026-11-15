"use client";

import { fakeGatewayPaymentSchema, type PayNowResponse, payNowResponseSchema } from "@nennus-catio/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ApiClient, ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { GUEST_KEY_HEADER } from "./orders";

/**
 * Paying for an order (8b) or a grooming booking (9e) over Pay now, and the fake payment company's
 * page (development only). The customer leaves for the provider's page and comes back to the order or
 * booking page with `?payment=`.
 */

/** The guest booking key travels in this header (9c); an order's key never opens a booking. */
export const BOOKING_KEY_HEADER = "X-Booking-Key";

/** Leaving this site for the payment page. An object so tests can watch it (jsdom cannot navigate). */
export const paymentNavigation = {
  go(url: string): void {
    window.location.assign(url);
  },
};

/**
 * The provider's https page, or a path on this site (the fake gateway). Anything else is refused, so
 * a wrong answer can never send the customer somewhere unexpected.
 */
export function isSafePaymentUrl(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Asks for the payment page and checks its address before anyone is sent there. */
async function startPayment(api: ApiClient, path: string, headers: Record<string, string> | undefined): Promise<PayNowResponse> {
  const answer = await api.post(path, {}, payNowResponseSchema, headers ? { headers } : undefined);
  if (!isSafePaymentUrl(answer.payment.checkoutUrl)) {
    throw new ApiError("INVALID_RESPONSE", "The payment page address was not valid.");
  }
  return answer;
}

/** Pay now, Continue to payment or Pay again: the server reuses an open attempt (D138, D147). */
export function usePayNow(reference: string, guestKey: string | null) {
  const { api } = useRepositories();
  return useMutation({
    mutationFn: () =>
      startPayment(api, `/${guestKey ? "guest-orders" : "orders"}/${reference}/pay`, guestKey ? { [GUEST_KEY_HEADER]: guestKey } : undefined),
    onSuccess: (answer) => paymentNavigation.go(answer.payment.checkoutUrl),
  });
}

/**
 * Pay now for a grooming booking (9e): the same rules as orders. The booking is named when paying, so
 * "Book and pay" can start the payment for the booking it has just made.
 */
export function useBookingPayNow() {
  const { api } = useRepositories();
  return useMutation({
    mutationFn: ({ reference, guestKey }: { reference: string; guestKey: string | null }) =>
      startPayment(
        api,
        `/${guestKey ? "guest-bookings" : "bookings"}/${reference}/pay`,
        guestKey ? { [BOOKING_KEY_HEADER]: guestKey } : undefined,
      ),
    onSuccess: (answer) => paymentNavigation.go(answer.payment.checkoutUrl),
  });
}

/** Pay now for a relocation quote (15b): the customer's own request only; there is no guest link (D279 answer 1). */
export function useRelocationPayNow(reference: string) {
  const { api } = useRepositories();
  return useMutation({
    mutationFn: () => startPayment(api, `/relocation/requests/${reference}/pay`, undefined),
    onSuccess: (answer) => paymentNavigation.go(answer.payment.checkoutUrl),
  });
}

// --- The fake payment company (development and tests only) ---------------------------------------

export type FakePaymentAction = "pay" | "fail" | "cancel" | "pay-without-webhook";

export function useFakePayment(id: string) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: ["dev", "fake-gateway", id],
    queryFn: ({ signal }) => api.get(`/dev/fake-gateway/${encodeURIComponent(id)}`, fakeGatewayPaymentSchema, { signal, cache: "no-store" }),
    retry: false,
    staleTime: 0,
  });
}

export function usePressFakePayment(id: string) {
  const { api } = useRepositories();
  return useMutation({
    mutationFn: (action: FakePaymentAction) =>
      api.post(`/dev/fake-gateway/${encodeURIComponent(id)}/${action}`, {}, fakeGatewayPaymentSchema),
  });
}

/**
 * The way back on this site, from the address the payment was started with: only its path and query
 * are used, so the customer stays on this site (and in this tab, which keeps a guest's order key).
 */
export function returnPath(returnUrl: string): string | null {
  try {
    const url = new URL(returnUrl, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
