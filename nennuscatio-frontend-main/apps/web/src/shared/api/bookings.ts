"use client";

import {
  type BookingQuote,
  type BookingQuoteRequest,
  bookingQuoteSchema,
  type BookingRequest,
  type BookingResponse,
  bookingListResponseSchema,
  bookingResponseSchema,
  type BookingStatus,
  type CustomerBooking,
  customerBookingSchema,
  type GroomingLocation,
  groomingAreasResponseSchema,
  groomingAvailabilityResponseSchema,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { promoCodeText } from "@/shared/lib/offers";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { orderErrorMessage } from "./orders";
import { BOOKING_KEY_HEADER } from "./payments";

/**
 * Grooming bookings for customers (9e) over the 9b-9d API: the home visit areas, the free times, the
 * booking itself, the booking page and My bookings. Prices, fees and times are read with
 * `cache: "no-store"`, so a change is seen at once.
 */
export const groomingAreasKey = ["grooming", "areas"] as const;
export const groomingAvailabilityKey = ["grooming", "availability"] as const;
export const myBookingsKey = ["bookings", "mine"] as const;
export const bookingQuoteKey = (request: BookingQuoteRequest) => ["bookings", "quote", JSON.stringify(request)] as const;
export const bookingKey = (reference: string, guestKey: string | null) => ["bookings", reference, guestKey ? "guest" : "customer"] as const;

const KEY_STORE_PREFIX = "nc-booking-key:";

export function bookingHref(reference: string, guestKey: string | null): string {
  return guestKey ? `/bookings/${reference}#k=${guestKey}` : `/bookings/${reference}`;
}

/** Keeps the guest key for this tab: the way back from the payment page has no `#k=`. */
export function rememberBookingKey(reference: string, key: string): void {
  try {
    window.sessionStorage.setItem(KEY_STORE_PREFIX + reference, key);
  } catch {
    // The link in the booking email still works.
  }
}

/** The key from the address (`#k=…`) or from this tab's memory; null for account bookings. */
export function readBookingKey(reference: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("k");
  if (fromHash) {
    rememberBookingKey(reference, fromHash);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(KEY_STORE_PREFIX + reference);
  } catch {
    return null;
  }
}

const keyHeaders = (guestKey: string | null) => (guestKey ? { [BOOKING_KEY_HEADER]: guestKey } : undefined);

/** The areas offered for home visits, under their city headings, each with its visit fee. */
export function useHomeVisitAreas() {
  const { api, source } = useRepositories();
  return useQuery({
    queryKey: groomingAreasKey,
    queryFn: async ({ signal }) => (await api.get("/grooming/areas", groomingAreasResponseSchema, { signal, cache: "no-store" })).areas,
    enabled: source === "api",
    staleTime: 0,
  });
}

export interface AvailabilityChoice {
  packageId: string;
  location: GroomingLocation;
  /** Home visits only. */
  areaId: string | null;
}

/** The start times where the whole package fits (shop) or a bus is free (home), with the price. Null asks nothing. */
export function useGroomingAvailability(choice: AvailabilityChoice | null) {
  const { api } = useRepositories();
  const query = choice
    ? new URLSearchParams({
        package: choice.packageId,
        location: choice.location,
        ...(choice.location === "home" && choice.areaId ? { area: choice.areaId } : {}),
      }).toString()
    : "";
  return useQuery({
    queryKey: [...groomingAvailabilityKey, query],
    queryFn: ({ signal }) => api.get(`/grooming/availability?${query}`, groomingAvailabilityResponseSchema, { signal, cache: "no-store" }),
    enabled: choice !== null,
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

/**
 * The server's price for a booking with a promo code (11e). Without a code the free times already carry
 * the price with the automatic offers, so this is asked only while a code is applied. The last answer
 * stays on screen meanwhile (`isPlaceholderData`). Null asks nothing.
 */
export function useBookingQuote(request: BookingQuoteRequest | null) {
  const { api, source } = useRepositories();
  return useQuery({
    queryKey: request ? bookingQuoteKey(request) : (["bookings", "quote", null] as const),
    queryFn: ({ signal }) => api.post("/bookings/quote", request, bookingQuoteSchema, { signal, cache: "no-store" }),
    enabled: request !== null && source === "api",
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** The booking's promo code box Apply (11e), as checkout's: one quote, kept for that request. */
export function useTryBookingCode() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BookingQuoteRequest): Promise<BookingQuote> => api.post("/bookings/quote", request, bookingQuoteSchema),
    onSuccess: (quote, request) => queryClient.setQueryData(bookingQuoteKey(request), quote),
  });
}

export function usePlaceBooking() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BookingRequest) => api.post("/bookings", request, bookingResponseSchema),
    onSuccess: (result: BookingResponse) => {
      queryClient.setQueryData(bookingKey(result.booking.reference, result.guestKey), result.booking);
      void queryClient.invalidateQueries({ queryKey: groomingAvailabilityKey });
      void queryClient.invalidateQueries({ queryKey: myBookingsKey });
    },
  });
}

export function useMyBookings(enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: myBookingsKey,
    queryFn: async ({ signal }) => (await api.get("/bookings", bookingListResponseSchema, { signal, cache: "no-store" })).bookings,
    enabled,
    staleTime: 0,
  });
}

/**
 * A guest key means the guest endpoint, even when someone is logged in; otherwise the account's.
 * `poll` says how often to ask again (while a payment is being checked).
 */
export function useBooking(
  reference: string,
  guestKey: string | null,
  enabled: boolean,
  poll?: (booking: CustomerBooking | undefined) => number | false,
) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: bookingKey(reference, guestKey),
    queryFn: ({ signal }) =>
      api.get(`/${guestKey ? "guest-bookings" : "bookings"}/${reference}`, customerBookingSchema, {
        signal,
        cache: "no-store",
        headers: keyHeaders(guestKey),
      }),
    enabled,
    staleTime: 0,
    retry: false,
    refetchInterval: poll ? (query) => poll(query.state.data) : undefined,
  });
}

/** Cancel the booking. The answer replaces the cached booking. */
export function useCancelBooking(reference: string, guestKey: string | null) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<CustomerBooking> =>
      api.post(
        `/${guestKey ? "guest-bookings" : "bookings"}/${reference}/cancel`,
        {},
        customerBookingSchema,
        guestKey ? { headers: { [BOOKING_KEY_HEADER]: guestKey } } : undefined,
      ),
    onSuccess: (booking) => {
      queryClient.setQueryData(bookingKey(reference, guestKey), booking);
      void queryClient.invalidateQueries({ queryKey: myBookingsKey });
      void queryClient.invalidateQueries({ queryKey: groomingAvailabilityKey });
    },
  });
}

export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, { en: string; ar: string }>> = {
  awaiting_payment: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  completed: { en: "Completed", ar: "مكتمل" },
  no_show: { en: "Missed appointment", ar: "لم يتم الحضور" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  expired: { en: "Expired (not paid in time)", ar: "منتهي (لم يُدفع في الوقت)" },
};

/** Booking failures in words the customer can act on; anything shared with orders reads as it does there. */
export function bookingErrorMessage(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return orderErrorMessage(error, text);
  switch (error.code) {
    case "SLOT_UNAVAILABLE":
      return text("That time has just been taken. Please choose another time.", "حُجز هذا الموعد للتو. اختر موعداً آخر.");
    case "ITEM_UNAVAILABLE":
      return text("This grooming package is no longer available. Please choose another.", "لم تعد هذه الباقة متاحة. اختر باقة أخرى.");
    case "PRICE_CHANGED":
      // With `bookingQuote`, the summary shows the total for this booking; booking again confirms it.
      return error.bookingQuote
        ? text(
            "The total for your booking has changed (the price, the home visit fee or an offer). Please check the new total and book again.",
            "تغيّر إجمالي حجزك (السعر أو رسوم الزيارة المنزلية أو عرض). راجع الإجمالي الجديد ثم احجز مرة أخرى.",
          )
        : text("The price or the home visit fee has changed. Please check the new total and book again.", "تغيّر السعر أو رسوم الزيارة المنزلية. راجع المجموع الجديد ثم احجز مرة أخرى.");
    case "PROMO_CODE_INVALID":
      return error.codeStatus
        ? promoCodeText({ status: error.codeStatus, message: error.message }, text, "booking")
        : text("This promo code cannot be used. Please remove it to continue.", "لا يمكن استخدام هذا الرمز. أزله للمتابعة.");
    case "HOLD_EXPIRED":
      return text("The time to pay for this booking has run out. Please book again.", "انتهى وقت الدفع لهذا الحجز. يرجى الحجز مرة أخرى.");
    case "NOT_CANCELLABLE":
      return text("This booking can no longer be cancelled online. Please contact us.", "لم يعد بالإمكان إلغاء هذا الحجز عبر الموقع. يرجى التواصل معنا.");
    case "CONFLICT":
      return text("This booking form was already used. Please reload the page and try again.", "تم استخدام نموذج الحجز هذا بالفعل. أعد تحميل الصفحة وحاول مرة أخرى.");
    case "RATE_LIMITED":
      return error.retryAfterSeconds === null
        ? text("You already have 3 unpaid bookings. Pay for or cancel one of them, or wait a few minutes.", "لديك ٣ حجوزات غير مدفوعة. ادفع أو ألغِ أحدها، أو انتظر بضع دقائق.")
        : orderErrorMessage(error, text);
    case "NOT_FOUND":
      return text("We could not find this booking.", "لم نعثر على هذا الحجز.");
    case "PAYMENTS_UNAVAILABLE":
      return text("Online payment is not available at the moment, so grooming cannot be booked online. Please contact us.", "الدفع الإلكتروني غير متاح حالياً، لذا لا يمكن حجز العناية عبر الموقع. يرجى التواصل معنا.");
    case "PAYMENT_ATTEMPTS_EXCEEDED":
      return text("This booking has reached the limit of 3 payment attempts. Please book again.", "وصل هذا الحجز إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى الحجز مرة أخرى.");
    case "PAYMENT_IN_PROGRESS":
      return text("We have received your payment and are confirming your booking. This page updates by itself.", "استلمنا دفعتك ونقوم بتأكيد حجزك. تتحدث هذه الصفحة تلقائياً.");
    case "ORDER_NOT_PAYABLE":
      return text("This booking cannot be paid: it is already paid or was cancelled.", "لا يمكن دفع هذا الحجز: إنه مدفوع بالفعل أو أُلغي.");
    default:
      return orderErrorMessage(error, text);
  }
}
