import { z } from "zod";
import { localeSchema } from "./auth.js";
import { clockTimeSchema, localDateSchema } from "./delivery.js";
import { GROOMING_LIMITS, groomingLocationSchema } from "./grooming.js";
import { customerPaymentSchema, orderContactSchema, qatarAddressSchema } from "./orders.js";
import { adminOrderPaymentsSchema } from "./payments.js";
import { orderPromotionSchema, promoCodeEntrySchema, promoCodeStatusSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Grooming bookings (#9c, plan BRANCH_9_GROOMING_BOOKINGS sections 3-4, D158-D160). One pet per
 * booking. Money is integer minor units (QAR); ages are months and weights grams; dates and times are
 * Qatar local. A booking keeps its own copy of the package, price, length and what is included.
 */

/**
 * awaiting_payment → confirmed (paid, 9d) → in_progress → completed; a confirmed booking can also be
 * a no_show; any open booking can be cancelled; an unpaid one expires when its hold runs out.
 */
export const bookingStatusSchema = z.enum(["awaiting_payment", "confirmed", "in_progress", "completed", "no_show", "cancelled", "expired"]);

/** For people: `GB-` + Qatar date (YYMMDD) + 6 characters without look-alikes; separate from orders' `NC-`. */
export const bookingReferenceSchema = z.string().regex(/^GB-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/);

/** At most this many unpaid bookings per person at once (plan section 4). */
export const BOOKING_LIMITS = Object.freeze({ maxUnpaidPerPerson: 3 });

/**
 * The pet being groomed: its age, breed and health or handling notes (the owner's choice, D246). The
 * pet's name and weight are no longer asked; the age alone is checked against the group (D159 as
 * amended by D246). Only staff with Bookings permission see it.
 */
export const petDetailsSchema = z.object({
  ageMonths: z.number().int().min(0).max(GROOMING_LIMITS.maxAgeMonths),
  breed: z.string().trim().max(60).default(""),
  /** Health or handling notes. */
  notes: z.string().trim().max(500).default(""),
});

/**
 * How a booked pet is named in lists (D246): its group as booked (the booking's own copy) and its
 * breed, shown as "Small pet · Persian", or the group alone when no breed was given.
 */
export const petLabelSchema = z.object({ group: localisedTextSchema, breed: z.string() });

export const bookingRequestSchema = z
  .object({
    /** One per booking attempt in the browser; a repeat returns the same booking. */
    idempotencyKey: z.uuid(),
    locale: localeSchema,
    /** Logged-in customers: the account email is used instead of `contact.email`. */
    contact: orderContactSchema,
    packageId: z.uuid(),
    location: groomingLocationSchema,
    date: localDateSchema,
    start: clockTimeSchema,
    /** Home visits only: the area (its visit fee) and the Qatar address (D122). */
    home: z.object({ areaId: z.uuid(), address: qatarAddressSchema }).nullable(),
    pet: petDetailsSchema,
    /**
     * Logged-in customers: the saved pet this booking is for (10b), so its bookings show with it. The
     * booking still keeps its own copy of the pet's details (D160); another customer's pet is refused.
     */
    savedPetId: z.uuid().nullable().default(null),
    /** The promo code box (11c): one code per booking. A code that gives nothing stops the booking (PROMO_CODE_INVALID). */
    code: promoCodeEntrySchema.nullish(),
    /**
     * The total the customer saw (package + visit fee − discount: the free times' total, or the quote's with
     * a code); a different server total stops the booking (PRICE_CHANGED, with `bookingQuote`).
     */
    expectedTotal: z.number().int().positive(),
  })
  .superRefine(checkPlace);

/** A home visit has its area (and, when booking, its address); a shop booking has none. */
function checkPlace(value: { location: z.infer<typeof groomingLocationSchema>; home: unknown }, context: z.RefinementCtx): void {
  if (value.location === "home" && !value.home) {
    context.addIssue({ code: "custom", path: ["home"], message: "Choose your area and enter your address." });
  }
  if (value.location === "shop" && value.home) {
    context.addIssue({ code: "custom", path: ["home"], message: "Shop bookings have no home address." });
  }
}

/**
 * `POST /api/bookings/quote` (11c): the price of a booking from the server, with its discounts and the
 * code's answer. Nothing is saved or held. Only the area matters for the visit fee.
 */
export const bookingQuoteRequestSchema = z
  .object({
    packageId: z.uuid(),
    location: groomingLocationSchema,
    home: z.object({ areaId: z.uuid() }).nullable(),
    code: promoCodeEntrySchema.nullish(),
  })
  .superRefine(checkPlace);

export const bookingQuoteSchema = z.object({
  /** The package at its list price. */
  price: z.number().int().positive(),
  /** The home visit fee; 0 at the shop. Never discounted. */
  visitFee: z.number().int().nonnegative(),
  /** What the promotions take off the package. */
  discount: z.number().int().nonnegative(),
  /** Price + visit fee − discount: send it back as the booking's `expectedTotal`. */
  total: z.number().int().positive(),
  /** The promotions that take something off, largest first. */
  promotions: z.array(orderPromotionSchema),
  /**
   * The code's answer; null when none was entered. For a guest, offers for new customers and
   * per-customer limits are checked with the email when booking.
   */
  code: z.object({ status: promoCodeStatusSchema, message: z.string() }).nullable(),
});

export const cancelBookingRequestSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const customerBookingSchema = z.object({
  reference: bookingReferenceSchema,
  status: bookingStatusSchema,
  location: groomingLocationSchema,
  placedAt: z.string(),
  /** While awaiting payment: when the held time is released. */
  holdExpiresAt: z.string().nullable(),
  contact: orderContactSchema,
  pet: z.object({ ageMonths: z.number().int(), breed: z.string(), notes: z.string() }),
  package: z.object({
    group: localisedTextSchema,
    name: localisedTextSchema,
    included: z.object({ en: z.array(z.string()), ar: z.array(z.string()) }),
    durationMinutes: z.number().int().positive(),
  }),
  appointment: z.object({
    date: localDateSchema,
    start: clockTimeSchema,
    /** When the grooming ends at the shop; null for a home visit (the visit time is the arrival). */
    end: clockTimeSchema.nullable(),
    startsAt: z.string(),
  }),
  home: z.object({ area: localisedTextSchema, address: qatarAddressSchema }).nullable(),
  price: z.number().int().positive(),
  visitFee: z.number().int().nonnegative(),
  /** What the promotions took off the package (11c). */
  discount: z.number().int().nonnegative(),
  /** Price + visit fee − discount: what is paid. */
  total: z.number().int().positive(),
  /** The booking's own copy of its promotions (D203). */
  promotions: z.array(orderPromotionSchema),
  canCancel: z.boolean(),
  /** After this a paid booking can no longer be cancelled online; the customer contacts the shop. */
  cancelDeadline: z.string(),
  /** A paid booking that was cancelled and is not refunded in full yet; staff refund it (D139). */
  refundNeeded: z.boolean(),
  cancelledAt: z.string().nullable(),
  /** Paying (9d): the same rules as orders (D138, D147), with the same "needs attention" reasons (D136, D146). */
  payment: customerPaymentSchema,
});

/** A booking's payments for the staff panel (9d, 9f): the order panel's shape with the booking's reference. */
export const adminBookingPaymentsSchema = adminOrderPaymentsSchema.omit({ orderReference: true }).extend({ bookingReference: bookingReferenceSchema });

export const bookingResponseSchema = z.object({
  booking: customerBookingSchema,
  /** Guest bookings only: the private link key (`/bookings/<reference>#k=<key>`). Never logged. */
  guestKey: z.string().nullable(),
});

export const bookingSummarySchema = customerBookingSchema.pick({
  reference: true,
  status: true,
  location: true,
  placedAt: true,
  appointment: true,
  discount: true,
  total: true,
}).extend({
  package: localisedTextSchema,
  pet: petLabelSchema,
  /** The saved pet it was booked for (10b); null for a pet typed in, or once that saved pet is deleted. */
  savedPetId: z.uuid().nullable(),
});

export const bookingListResponseSchema = z.object({ bookings: z.array(bookingSummarySchema) });

export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type PetDetails = z.infer<typeof petDetailsSchema>;
export type PetLabel = z.infer<typeof petLabelSchema>;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export type BookingQuoteRequest = z.infer<typeof bookingQuoteRequestSchema>;
export type BookingQuote = z.infer<typeof bookingQuoteSchema>;
export type CancelBookingRequest = z.infer<typeof cancelBookingRequestSchema>;
export type CustomerBooking = z.infer<typeof customerBookingSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
export type BookingSummary = z.infer<typeof bookingSummarySchema>;
export type AdminBookingPayments = z.infer<typeof adminBookingPaymentsSchema>;
