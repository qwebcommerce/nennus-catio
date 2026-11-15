import { z } from "zod";
import { type BookingStatus, bookingReferenceSchema, bookingStatusSchema, petDetailsSchema, petLabelSchema } from "./bookings.js";
import { clockTimeSchema, localDateSchema } from "./delivery.js";
import { groomingLocationSchema } from "./grooming.js";
import { orderContactSchema, qatarAddressSchema } from "./orders.js";
import { type PaymentAttention, paymentAttentionSchema } from "./payments.js";
import { adminOrderPromotionSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Staff bookings (9f; plan BRANCH_9 sections 4 and 5). The step rules live here so the API and the
 * admin screen always agree on what is allowed next. Bookings are never deleted.
 */

/** Bookings that are still running: staff may cancel these. */
export const OPEN_BOOKING_STATUSES: readonly BookingStatus[] = ["awaiting_payment", "confirmed", "in_progress"];

/** The next step forward, or null. An unpaid booking never moves forward: payment confirms it. */
export function nextBookingStatus(status: BookingStatus): BookingStatus | null {
  if (status === "confirmed") return "in_progress";
  if (status === "in_progress") return "completed";
  return null;
}

/** One step back after a wrong click (as D132). */
export function previousBookingStatus(status: BookingStatus): BookingStatus | null {
  if (status === "in_progress" || status === "no_show") return "confirmed";
  if (status === "completed") return "in_progress";
  return null;
}

export function bookingCanBeNoShow(status: BookingStatus): boolean {
  return status === "confirmed";
}

export function staffCanCancelBooking(status: BookingStatus): boolean {
  return OPEN_BOOKING_STATUSES.includes(status);
}

/**
 * A confirmed booking can move to another free time. So can one paid after its time was given away
 * (D136 for bookings): moving it confirms it.
 */
export function staffCanMoveBooking(status: BookingStatus, attention: PaymentAttention | null): boolean {
  return status === "confirmed" || (status === "expired" && attention === "paid_after_expiry");
}

// --- List ---------------------------------------------------------------------------------------

export const ADMIN_BOOKING_PAGE_SIZES = [10, 25, 50] as const;
export const adminBookingSortSchema = z.enum(["appointment", "newest", "oldest", "total"]);

/** Query-string filters (all optional). `status` is a comma-separated list. */
export const adminBookingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      const parsed = z.array(bookingStatusSchema).max(7).safeParse(value.split(",").filter(Boolean));
      if (!parsed.success) {
        context.addIssue({ code: "custom", message: "Unknown booking status." });
        return z.NEVER;
      }
      return parsed.data;
    }),
  location: groomingLocationSchema.optional(),
  package: z.uuid().optional(),
  /** "1": only bookings with "Refund needed" or a payment that needs attention. */
  needsAction: z.literal("1").optional(),
  /** Which date the range applies to: the appointment, or when the booking was placed. */
  dateField: z.enum(["appointment", "placed"]).default("appointment"),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  sort: adminBookingSortSchema.default("appointment"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_BOOKING_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 10, 25 or 50.")
    .default(25),
});

const appointmentSchema = z.object({
  date: localDateSchema,
  start: clockTimeSchema,
  /** When the grooming ends at the shop; null for a home visit (the time is the arrival). */
  end: clockTimeSchema.nullable(),
  startsAt: z.string(),
});

export const adminBookingSummarySchema = z.object({
  reference: bookingReferenceSchema,
  status: bookingStatusSchema,
  location: groomingLocationSchema,
  placedAt: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  /** The pet group and package as booked (the booking's own copy, D160). */
  package: z.object({ group: localisedTextSchema, name: localisedTextSchema }),
  /** The pet as "group · breed" (D246): the pet's name is no longer asked. */
  pet: petLabelSchema,
  appointment: appointmentSchema,
  /** Home visits only. */
  area: localisedTextSchema.nullable(),
  total: z.number().int().nonnegative(),
  refundNeeded: z.boolean(),
  /** A payment staff must handle (as orders, D136, D146); the payment panel says what to do. */
  attention: paymentAttentionSchema.nullable(),
});

export const adminBookingListResponseSchema = z.object({
  bookings: z.array(adminBookingSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** Bookings per status for the summary cards, with every filter except status applied. */
  counts: z.record(bookingStatusSchema, z.number().int().nonnegative()),
});

// --- Detail -------------------------------------------------------------------------------------

export const adminBookingHistoryEntrySchema = z.object({
  from: bookingStatusSchema.nullable(),
  to: bookingStatusSchema,
  actor: z.enum(["customer", "guest", "staff", "system"]),
  staffName: z.string().nullable(),
  reason: z.string().nullable(),
  at: z.string(),
});

export const adminBookingSchema = adminBookingSummarySchema.extend({
  locale: z.enum(["en", "ar"]),
  contact: orderContactSchema,
  hasAccount: z.boolean(),
  petDetails: petDetailsSchema,
  included: z.object({ en: z.array(z.string()), ar: z.array(z.string()) }),
  durationMinutes: z.number().int().positive(),
  address: qatarAddressSchema.nullable(),
  price: z.number().int().nonnegative(),
  visitFee: z.number().int().nonnegative(),
  /** What the promotions took off the package (11c): the package's price after it is what was paid for it. */
  discount: z.number().int().nonnegative(),
  /** The booking's own copy of its promotions, and whether each use counts (held or used) or was given back. */
  promotions: z.array(adminOrderPromotionSchema),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.enum(["customer", "guest", "staff", "system"]).nullable(),
  cancelReason: z.string().nullable(),
  expiredAt: z.string().nullable(),
  history: z.array(adminBookingHistoryEntrySchema),
  /** Echo this back with every change; a change made by someone else in between is refused. */
  version: z.number().int().positive(),
  /** What staff may do now (from the step rules above). */
  actions: z.object({
    next: bookingStatusSchema.nullable(),
    back: bookingStatusSchema.nullable(),
    noShow: z.boolean(),
    cancel: z.boolean(),
    move: z.boolean(),
  }),
});

/** The free times this booking could move to, counting its own seats as free (staff: from now on). */
export const adminBookingMoveTimesResponseSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  days: z.array(
    z.object({
      date: localDateSchema,
      times: z.array(z.object({ start: clockTimeSchema, end: clockTimeSchema.nullable(), startsAt: z.string() })),
    }),
  ),
});

// --- Changes ------------------------------------------------------------------------------------

export const bookingStepRequestSchema = z.object({ version: z.number().int().positive() });

export const staffCancelBookingRequestSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(300),
});

export const moveBookingRequestSchema = z.object({
  version: z.number().int().positive(),
  date: localDateSchema,
  start: clockTimeSchema,
});

export type AdminBookingQuery = z.infer<typeof adminBookingQuerySchema>;
export type AdminBookingSort = z.infer<typeof adminBookingSortSchema>;
export type AdminBookingSummary = z.infer<typeof adminBookingSummarySchema>;
export type AdminBookingListResponse = z.infer<typeof adminBookingListResponseSchema>;
export type AdminBookingHistoryEntry = z.infer<typeof adminBookingHistoryEntrySchema>;
export type AdminBooking = z.infer<typeof adminBookingSchema>;
export type AdminBookingMoveTimesResponse = z.infer<typeof adminBookingMoveTimesResponseSchema>;
export type BookingStepRequest = z.infer<typeof bookingStepRequestSchema>;
export type StaffCancelBookingRequest = z.infer<typeof staffCancelBookingRequestSchema>;
export type MoveBookingRequest = z.infer<typeof moveBookingRequestSchema>;
