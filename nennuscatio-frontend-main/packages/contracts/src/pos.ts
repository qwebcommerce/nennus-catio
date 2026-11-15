import { z } from "zod";
import { localeSchema } from "./auth.js";
import { bookingReferenceSchema, bookingStatusSchema } from "./bookings.js";
import { clockTimeSchema, localDateSchema } from "./delivery.js";
import { addressPinSchema, fulfilmentSchema, orderReferenceSchema, orderStatusSchema } from "./orders.js";
import { paymentProviderSchema, refundMethodSchema, refundStatusSchema } from "./payments.js";
import { relocationReferenceSchema, relocationStatusSchema } from "./relocation.js";

/**
 * The POS API (#16 part 1; the POS plan's sections 2.3–2.5; D275–D277): what an outside system
 * such as the POS collects from `/api/pos/v1`. Every shape here is also the OpenAPI document the POS reads,
 * so a change here changes the document (and the committed copy must be regenerated, `pnpm pos:openapi`).
 * Part 2a (the part 2 plan's section 2; D285) only adds to it: customers, relocation payments,
 * whether a cancelled order's stock went back, and grooming package codes.
 *
 * Conventions for the other side (a Laravel/PHP system, plan section 2.8): money as integers in minor
 * units with the currency named (12550 = QAR 125.50; never decimals), instants as ISO 8601 with Qatar's
 * offset, names in both languages, and no field that is only for staff.
 */

/**
 * The kinds of event: part 1's eleven (plan section 2.3, option 1A), then part 2a's three (D285). The
 * database checks the same list. New kinds are only ever added; the POS skips the ones it does not know.
 */
export const POS_EVENT_TYPES = [
  "order.paid",
  "order.cancelled",
  "order.delivery_changed",
  "order.delivered",
  "order.collected",
  "booking.confirmed",
  "booking.moved",
  "booking.cancelled",
  "booking.completed",
  "booking.no_show",
  "refund.completed",
  "customer.registered",
  "customer.updated",
  "relocation.paid",
] as const;
export const posEventTypeSchema = z.enum(POS_EVENT_TYPES);
export type PosEventType = z.infer<typeof posEventTypeSchema>;

export const POS_CURRENCY = "QAR";
export const POS_EVENTS_PAGE_DEFAULT = 100;
export const POS_EVENTS_PAGE_MAX = 200;

/**
 * What a key may do (part 2b; the part 2 plan's section 5): read orders and bookings (every
 * part 1 route), and send items (the stock door). The database checks the same list.
 */
export const POS_SCOPES = ["orders:read", "items:write"] as const;
export const posScopeSchema = z.enum(POS_SCOPES);
export type PosScope = z.infer<typeof posScopeSchema>;

/** Items per message (plan section 1.1): the same as an events page. */
export const POS_ITEMS_MAX = 200;
export const POS_ITEM_CODE_MAX = 60;
export const POS_ITEM_NAME_MAX = 200;
/** A count's `countedAt` may run this far ahead of our clock (a clock set a little wrong), no further. */
export const POS_COUNTED_AT_AHEAD_MS = 15 * 60_000;

/** Text in both languages. */
export const posTextSchema = z.object({ en: z.string(), ar: z.string() });
/** An instant as ISO 8601 with Qatar's offset, for example 2026-10-27T14:05:12+03:00. */
export const posInstantSchema = z.iso.datetime({ offset: true });
/** An amount in minor units (dirhams), never negative. */
export const posMinorSchema = z.number().int().nonnegative();

export const posCustomerSchema = z.object({
  /**
   * Our customer record's id (part 2a): one per email address, the same on every order, booking and
   * relocation request with that email and in the customer events. Null only if the website holds no
   * record for the email, which it always should: then match by email.
   */
  id: z.uuid().nullable(),
  name: z.string(),
  /** International form where it can be read (+974…), otherwise as the customer typed it. */
  phone: z.string(),
  email: z.string(),
  /** True when placed without an account (D192). */
  guest: z.boolean(),
  /** The language the customer used. */
  locale: localeSchema,
});

/** Qatar's address plate (D122) plus the optional details. */
export const posAddressSchema = z.object({
  zone: z.string(),
  street: z.string(),
  building: z.string(),
  floor: z.string(),
  flat: z.string(),
  landmark: z.string(),
});

export const posDeliverySchema = z.object({
  /** The chosen delivery day and time slot (Qatar time). */
  date: localDateSchema,
  from: clockTimeSchema,
  to: clockTimeSchema,
  startsAt: posInstantSchema,
  /** The delivery area, as named when the order was placed. */
  area: posTextSchema.nullable(),
  address: posAddressSchema,
  /** The point the customer shared, if any (D263). */
  pin: addressPinSchema.nullable(),
  driverNote: z.string(),
});

/** A pickup order has no chosen time (D118): the times it became ready and was collected. */
export const posPickupSchema = z.object({
  readyAt: posInstantSchema.nullable(),
  collectedAt: posInstantSchema.nullable(),
});

/** A Pet House line's own copy (#14, D268). */
export const posHouseSchema = z.object({
  leadMinDays: z.number().int().nonnegative(),
  leadMaxDays: z.number().int().nonnegative(),
  /** This house's own delivery charge, per house. */
  deliveryFee: posMinorSchema,
  /** False for a made-to-order house: nothing was taken from stock for it. */
  takesStock: z.boolean(),
});

export const posOrderLineSchema = z.object({
  /** The product code: matched to the POS item code (plan section 2.1; D274). */
  sku: z.string(),
  product: z.string(),
  variant: z.string(),
  name: posTextSchema,
  label: posTextSchema,
  weightGrams: z.number().int().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: posMinorSchema,
  /** This line's share of the promotions' discounts. */
  discount: posMinorSchema,
  /** unitPrice × quantity − discount: what was paid for the line. */
  lineTotal: posMinorSchema,
  house: posHouseSchema.nullable(),
});

export const posPromotionSchema = z.object({
  name: posTextSchema,
  type: z.string(),
  offer: z.string(),
  /** The coupon code, when the promotion had one. */
  code: z.string().nullable(),
  discount: posMinorSchema,
});

/** A successful payment. */
export const posPaymentSchema = z.object({
  reference: z.string(),
  provider: paymentProviderSchema,
  providerPaymentId: z.string().nullable(),
  amount: posMinorSchema,
  currency: z.string(),
  paidAt: posInstantSchema,
  /** How much of it has been refunded so far. */
  refunded: posMinorSchema,
});

export const posRefundSchema = z.object({
  id: z.uuid(),
  paymentReference: z.string(),
  amount: posMinorSchema,
  currency: z.string(),
  method: refundMethodSchema,
  status: refundStatusSchema,
  requestedAt: posInstantSchema,
  /** Set once the money is on its way back; the `refund.completed` event is written then. */
  completedAt: posInstantSchema.nullable(),
});

export const posCancellationSchema = z.object({
  at: posInstantSchema,
  by: z.enum(["customer", "guest", "staff", "system"]),
  reason: z.string().nullable(),
});

/** An order's cancellation also says whether its items went back in stock (part 2a). */
export const posOrderCancellationSchema = posCancellationSchema.extend({
  /**
   * True: the items went back in stock. False: from Preparing on, staff kept them out (packed or
   * damaged, D131). A made-to-order house line never took stock either way (`house.takesStock`).
   */
  stockReturned: z.boolean(),
});

export const posOrderTotalsSchema = z.object({
  /** The list total of the lines, before discounts. */
  subtotal: posMinorSchema,
  /** Everything charged for delivery: the area's fee plus the houses' charges. */
  deliveryFee: posMinorSchema,
  /** The houses' part of the delivery fee. */
  houseDeliveryFee: posMinorSchema,
  discount: posMinorSchema,
  /** subtotal + deliveryFee − discount. */
  total: posMinorSchema,
  currency: z.string(),
});

export const posOrderSchema = z.object({
  reference: orderReferenceSchema,
  status: orderStatusSchema,
  source: z.string(),
  customer: posCustomerSchema,
  placedAt: posInstantSchema,
  /** The first successful payment's time. */
  paidAt: posInstantSchema.nullable(),
  confirmedAt: posInstantSchema.nullable(),
  updatedAt: posInstantSchema,
  fulfilment: fulfilmentSchema,
  delivery: posDeliverySchema.nullable(),
  pickup: posPickupSchema.nullable(),
  lines: z.array(posOrderLineSchema),
  promotions: z.array(posPromotionSchema),
  totals: posOrderTotalsSchema,
  payments: z.array(posPaymentSchema),
  refunds: z.array(posRefundSchema),
  cancellation: posOrderCancellationSchema.nullable(),
});

export const posBookingTotalsSchema = z.object({
  price: posMinorSchema,
  /** The home visit fee; 0 at the shop. */
  visitFee: posMinorSchema,
  discount: posMinorSchema,
  /** price + visitFee − discount. */
  total: posMinorSchema,
  currency: z.string(),
});

export const posBookingSchema = z.object({
  reference: bookingReferenceSchema,
  status: bookingStatusSchema,
  customer: posCustomerSchema,
  placedAt: posInstantSchema,
  paidAt: posInstantSchema.nullable(),
  confirmedAt: posInstantSchema.nullable(),
  updatedAt: posInstantSchema,
  location: z.enum(["shop", "home"]),
  appointment: z.object({
    date: localDateSchema,
    start: clockTimeSchema,
    startsAt: posInstantSchema,
    durationMinutes: z.number().int().positive(),
  }),
  package: z.object({
    name: posTextSchema,
    group: posTextSchema,
    included: z.object({ en: z.array(z.string()), ar: z.array(z.string()) }),
    /** The service's item code in the POS, as the package had it when booked (part 2a); null when it had none. */
    code: z.string().nullable(),
  }),
  /** The pet as booked (D246): its age and breed, never a name or health notes. */
  pet: z.object({ ageMonths: z.number().int().nonnegative(), breed: z.string() }),
  homeVisit: z
    .object({
      area: posTextSchema.nullable(),
      address: posAddressSchema,
      pin: addressPinSchema.nullable(),
      note: z.string(),
    })
    .nullable(),
  totals: posBookingTotalsSchema,
  promotions: z.array(posPromotionSchema),
  payments: z.array(posPaymentSchema),
  refunds: z.array(posRefundSchema),
  cancellation: posCancellationSchema.nullable(),
});

/**
 * A customer record (part 2a), carried by the customer events: one per email address, with the latest
 * known name and phone (the account's profile first, otherwise the latest order's or booking's). Never
 * the saved addresses, saved pets, staff notes or tags.
 */
export const posCustomerRecordSchema = z.object({
  /** The same id as `customer.id` on this person's orders, bookings and relocation requests. */
  id: z.uuid(),
  name: z.string().nullable(),
  /** International form where it can be read (+974…), otherwise as typed. */
  phone: z.string().nullable(),
  email: z.string(),
  /** The account's language; null when the email has no account. */
  locale: localeSchema.nullable(),
  /** When the account's email was confirmed; null when the email has no confirmed account (guest orders only). */
  registeredAt: posInstantSchema.nullable(),
  /** When the website first saw this email: a sign-up, an order or a booking. */
  firstSeenAt: posInstantSchema,
});

/**
 * A pet relocation request (part 2a): only what a sale needs. Never its documents, pets, notes, history
 * or the staff's note on the quote. A relocation paid outside the website never appears.
 */
export const posRelocationSchema = z.object({
  reference: relocationReferenceSchema,
  status: relocationStatusSchema,
  customer: posCustomerSchema,
  /** Where the pet is going, as chosen (or typed under "Other", then the same in both languages). */
  destination: posTextSchema,
  /** The quote; null after staff withdrew it. */
  quote: z.object({ amount: posMinorSchema, currency: z.string() }).nullable(),
  placedAt: posInstantSchema,
  /** When the online payment of the quote made the request Paid. */
  paidAt: posInstantSchema.nullable(),
  updatedAt: posInstantSchema,
  payments: z.array(posPaymentSchema),
  refunds: z.array(posRefundSchema),
});

/**
 * One line of the numbered list. `type` says what happened; `order`, `booking`, `customer` or
 * `relocation` is that record's current state when the list is read (so an old `order.paid` event
 * re-read after a cancel shows status "cancelled"); `refund` is set for `refund.completed`, with the
 * order, booking or relocation request it belongs to.
 */
export const posEventSchema = z.object({
  id: z.number().int().positive(),
  type: posEventTypeSchema,
  occurredAt: posInstantSchema,
  order: posOrderSchema.nullable(),
  booking: posBookingSchema.nullable(),
  refund: posRefundSchema.nullable(),
  /** For `customer.registered` and `customer.updated` (part 2a). */
  customer: posCustomerRecordSchema.nullable(),
  /** For `relocation.paid`, and `refund.completed` of a relocation request (part 2a). */
  relocation: posRelocationSchema.nullable(),
});

/** `GET /events?after=<id>&limit=<n>`: events numbered above `after`, oldest first. */
export const posEventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(POS_EVENTS_PAGE_MAX).default(POS_EVENTS_PAGE_DEFAULT),
});

export const posEventsResponseSchema = z.object({
  events: z.array(posEventSchema),
  /** The bookmark for the next call: the last event's number, or the number the key starts from when the page is empty. */
  next: z.number().int().nonnegative(),
});

/** `GET /health`: the key works. */
export const posHealthSchema = z.object({
  ok: z.literal(true),
  version: z.literal("v1"),
  key: z.object({
    name: z.string(),
    createdAt: posInstantSchema,
    fromEventId: z.number().int().nonnegative(),
    /** What this key may do (part 2b). */
    scopes: z.array(posScopeSchema),
  }),
  serverTime: posInstantSchema,
});

// --- Items in: the stock door (part 2b; the part 2 plan's section 1; D285) ------------------

/** The POS's item code as it sends it: printable text, 1 to 60 characters. It links to a pack whose SKU equals it, ignoring case. */
export const posItemCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(POS_ITEM_CODE_MAX)
  .regex(/^[^\p{Cc}]+$/u, "A code is printable text.");

export const posItemInputSchema = z.object({
  code: posItemCodeSchema,
  /** The POS's name for the item, in any language; shown to staff only. */
  name: z.string().trim().max(POS_ITEM_NAME_MAX),
  /** The count in the warehouse the website sells from. */
  stock: z.number().int().min(0).max(1_000_000),
  /** Minor units (8500 = QAR 85.00); 0 is refused for the pack but the item is still recorded. */
  price: z.number().int().min(0).max(100_000_000),
  /** Whether the POS sells it. */
  active: z.boolean(),
});

/**
 * `POST /items`: the POS's counts, with the bookmark that makes them exact (plan section 1.3): the last
 * event number whose stock effect the counts already include. Read together with the counts, in one
 * database transaction on the POS's side.
 */
export const posItemsRequestSchema = z
  .object({
    /** When the POS took the counts. An item counted before the last count applied for its code is stale. */
    countedAt: posInstantSchema,
    includesEventId: z.number().int().nonnegative(),
    items: z.array(posItemInputSchema).max(POS_ITEMS_MAX),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const code = item.code.toUpperCase();
      if (seen.has(code)) context.addIssue({ code: "custom", path: ["items", index, "code"], message: "The same code twice in one message." });
      seen.add(code);
    });
  });

/**
 * What happened to one item: `applied` (a linked pack took the count, the price and on/off);
 * `price_held` (the count and on/off applied; the price is a drop to less than half, waiting for
 * staff); `price_refused` (the count and on/off applied; the price is 0, or one staff refused earlier);
 * `new` (no pack has this code: kept for staff to bring online); `stale` (counted before the last count
 * applied for this code: nothing changed).
 */
export const posItemResultSchema = z.enum(["applied", "price_held", "price_refused", "new", "stale"]);
export type PosItemResult = z.infer<typeof posItemResultSchema>;

export const posItemOutcomeSchema = z.object({
  code: z.string(),
  result: posItemResultSchema,
  /** Why, in plain words, when the result needs one. */
  reason: z.string().nullable(),
  /** Units the website was short of: the store sold what online customers are paying for. 0 otherwise. */
  short: z.number().int().nonnegative(),
});

export const posItemsResponseSchema = z.object({
  receivedAt: posInstantSchema,
  /** The bookmark used: the one sent, or the key's starting number when that is higher. */
  includesEventId: z.number().int().nonnegative(),
  results: z.array(posItemOutcomeSchema),
  summary: z.object({
    applied: z.number().int().nonnegative(),
    priceHeld: z.number().int().nonnegative(),
    priceRefused: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
    /** Items the website was short of. */
    short: z.number().int().nonnegative(),
  }),
});

export type PosItemInput = z.infer<typeof posItemInputSchema>;
export type PosItemsRequest = z.infer<typeof posItemsRequestSchema>;
export type PosItemOutcome = z.infer<typeof posItemOutcomeSchema>;
export type PosItemsResponse = z.infer<typeof posItemsResponseSchema>;

export type PosText = z.infer<typeof posTextSchema>;
export type PosCustomer = z.infer<typeof posCustomerSchema>;
export type PosAddress = z.infer<typeof posAddressSchema>;
export type PosOrderLine = z.infer<typeof posOrderLineSchema>;
export type PosPromotion = z.infer<typeof posPromotionSchema>;
export type PosPayment = z.infer<typeof posPaymentSchema>;
export type PosRefund = z.infer<typeof posRefundSchema>;
export type PosOrderCancellation = z.infer<typeof posOrderCancellationSchema>;
export type PosOrder = z.infer<typeof posOrderSchema>;
export type PosBooking = z.infer<typeof posBookingSchema>;
export type PosCustomerRecord = z.infer<typeof posCustomerRecordSchema>;
export type PosRelocation = z.infer<typeof posRelocationSchema>;
export type PosEvent = z.infer<typeof posEventSchema>;
export type PosEventsQuery = z.infer<typeof posEventsQuerySchema>;
export type PosEventsResponse = z.infer<typeof posEventsResponseSchema>;
export type PosHealth = z.infer<typeof posHealthSchema>;
