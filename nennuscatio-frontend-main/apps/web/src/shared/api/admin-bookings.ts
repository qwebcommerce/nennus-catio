"use client";

import {
  type AdminBooking,
  type AdminBookingSort,
  adminBookingListResponseSchema,
  adminBookingMoveTimesResponseSchema,
  adminBookingSchema,
  type BookingStatus,
  type GroomingLocation,
  OPEN_BOOKING_STATUSES,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff bookings (9f) over `/api/admin/bookings`. API mode only; mock mode keeps the demo Bookings
 * page. Every change sends the booking's `version`; the API refuses a change made on an out-of-date
 * copy, and the page then reloads the booking.
 */
export const adminBookingsKey = ["admin", "bookings"] as const;
const listKey = [...adminBookingsKey, "list"] as const;
export const adminBookingDetailKey = (reference: string) => [...adminBookingsKey, "detail", reference] as const;
const moveTimesKey = (reference: string) => [...adminBookingsKey, "move-times", reference] as const;

/** The filters on the page. `status` is "" (all), "open" (still running) or one status. */
export interface AdminBookingFilters {
  q: string;
  status: string;
  location: "" | GroomingLocation;
  needsAction: boolean;
  dateField: "appointment" | "placed";
  from: string;
  to: string;
  sort: AdminBookingSort;
  page: number;
  pageSize: number;
}

export function emptyAdminBookingFilters(q = ""): AdminBookingFilters {
  return { q, status: "", location: "", needsAction: false, dateField: "appointment", from: "", to: "", sort: "appointment", page: 1, pageSize: 25 };
}

/** Bookings that hold their time on the day (9f): all but cancelled and expired, so each count matches the calendar's `booked`. */
export const BOOKING_DAY_STATUSES: readonly BookingStatus[] = ["awaiting_payment", "confirmed", "in_progress", "completed", "no_show"];
/** A day asks for its first 50; a note sends staff to the list for the rest. */
export const BOOKING_DAY_LIMIT = 50;

/** One day's bookings (the Bookings Day view and the Grooming calendar's Day overview, D255), in appointment order. */
export function bookingDayFilters(day: string, location: "" | GroomingLocation): AdminBookingFilters {
  return {
    ...emptyAdminBookingFilters(),
    status: BOOKING_DAY_STATUSES.join(","),
    location,
    from: day,
    to: day,
    sort: "appointment",
    pageSize: BOOKING_DAY_LIMIT,
  };
}

/** The query string for the list and the CSV export (the export ignores pages). */
export function adminBookingSearch(filters: AdminBookingFilters, { paged = true } = {}): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.status) params.set("status", filters.status === "open" ? OPEN_BOOKING_STATUSES.join(",") : filters.status);
  if (filters.location) params.set("location", filters.location);
  if (filters.needsAction) params.set("needsAction", "1");
  if (filters.from || filters.to) params.set("dateField", filters.dateField);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  if (paged) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }
  return params.toString();
}

export function useAdminBookings(search: string, options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...listKey, search],
    queryFn: ({ signal }) => api.get(`/admin/bookings?${search}`, adminBookingListResponseSchema, { signal }),
    // Keep the old page on screen while the next one loads, so the table does not jump.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useAdminBooking(reference: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: adminBookingDetailKey(reference ?? ""),
    queryFn: ({ signal }) => api.get(`/admin/bookings/${encodeURIComponent(reference ?? "")}`, adminBookingSchema, { signal }),
    enabled: reference !== null,
  });
}

/** The free times a booking could move to (its own seats count as free). */
export function useBookingMoveTimes(reference: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: moveTimesKey(reference ?? ""),
    queryFn: ({ signal }) =>
      api.get(`/admin/bookings/${encodeURIComponent(reference ?? "")}/move-times`, adminBookingMoveTimesResponseSchema, { signal }),
    enabled: reference !== null,
    staleTime: 0,
  });
}

/** One booking change answering with the booking: it replaces the detail; the lists and times are read again. */
function useBookingChange<Input extends { booking: AdminBooking }>(send: (input: Input) => { path: string; body: unknown }) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => {
      const { path, body } = send(input);
      return api.post(`/admin/bookings/${encodeURIComponent(input.booking.reference)}/${path}`, body, adminBookingSchema);
    },
    onSuccess: (booking) => queryClient.setQueryData(adminBookingDetailKey(booking.reference), booking),
    onError: (_error, { booking }) => queryClient.invalidateQueries({ queryKey: adminBookingDetailKey(booking.reference) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

/** Start, Completed, one step back (as D132), or No-show. */
export function useBookingStep() {
  return useBookingChange(({ booking, step }: { booking: AdminBooking; step: "next" | "back" | "no_show" }) => ({
    path: step === "next" ? "advance" : step === "back" ? "move-back" : "no-show",
    body: { version: booking.version },
  }));
}

export function useStaffCancelBooking() {
  return useBookingChange(({ booking, reason }: { booking: AdminBooking; reason: string }) => ({
    path: "cancel",
    body: { version: booking.version, reason },
  }));
}

export function useMoveBooking() {
  return useBookingChange(({ booking, date, start }: { booking: AdminBooking; date: string; start: string }) => ({
    path: "move",
    body: { version: booking.version, date, start },
  }));
}

/** One readable line for a failed booking action. */
export function describeAdminBookingError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "CONFLICT":
      return text(
        "Someone else changed this booking a moment ago. It has been reloaded: please check it and try again.",
        "غيّر شخص آخر هذا الحجز للتو. تمت إعادة تحميله: راجعه ثم حاول مرة أخرى.",
      );
    case "SLOT_UNAVAILABLE":
      return text("That time is no longer free. Please choose another time.", "لم يعد هذا الموعد متاحاً. اختر موعداً آخر.");
    case "FORBIDDEN":
      return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This booking could not be found.", "تعذّر العثور على هذا الحجز.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
