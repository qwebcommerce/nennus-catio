import { z } from "zod";
import { emailSchema, localeSchema } from "./auth.js";
import { slugSchema } from "./catalog.js";
import { clockTimeSchema, HOUSE_MAX_LEAD_DAYS, localDateSchema } from "./delivery.js";
import { paymentAttentionSchema, paymentStatusSchema } from "./payments.js";
import { orderPromotionSchema, promoCodeEntrySchema, promoCodeStatusSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Checkout and orders (branch 7b, D116-D125). Money is integer minor units (QAR dirhams); items are
 * named by product slug + pack code (D107), never by database id; dates/times are Qatar local.
 */

export const ORDER_LIMITS = Object.freeze({ maxLines: 30, maxQuantity: 99 });

export const orderStatusSchema = z.enum([
  "awaiting_payment",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "collected",
  "cancelled",
  "expired",
]);

/** Statuses in which the customer may still cancel online (D119: until staff start preparing). */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = ["awaiting_payment", "confirmed"];

export const fulfilmentSchema = z.enum(["delivery", "pickup"]);

/** For people: `NC-` + Qatar date (YYMMDD) + 6 characters without look-alikes (no I, L, O, U). */
export const orderReferenceSchema = z.string().regex(/^NC-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/);

const digits = (max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[0-9]{1,${max}}$`), `${label}: numbers only.`);

/** Qatar, generously boxed: a shared point outside it is refused (D264). */
export const QATAR_BOUNDS = { south: 24.4, north: 26.3, west: 50.7, east: 51.7 } as const;
/** A rougher point than this is not kept: it would send the driver to the wrong street (D264). */
export const MAX_PIN_ACCURACY_METRES = 1000;
const outsideQatar = "This location is outside Qatar.";

/**
 * A point the customer shared from their device ("Share my location", D263): latitude, longitude and
 * the device's accuracy in metres. Optional help for the driver; the plate stays the address.
 */
export const addressPinSchema = z.object({
  lat: z.number().min(QATAR_BOUNDS.south, outsideQatar).max(QATAR_BOUNDS.north, outsideQatar),
  lng: z.number().min(QATAR_BOUNDS.west, outsideQatar).max(QATAR_BOUNDS.east, outsideQatar),
  accuracy: z.number().int().min(0).max(MAX_PIN_ACCURACY_METRES, "This location is too rough to use."),
});

/** The pin in Google Maps (its "Maps URLs": no key or account needed). */
export function pinMapsUrl(pin: AddressPin): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
}

/** Qatar address plate (D122): zone, street and building numbers plus optional details, and an optional pin (D263). */
export const qatarAddressSchema = z.object({
  zone: digits(3, "Zone"),
  street: digits(4, "Street"),
  building: digits(4, "Building"),
  floor: z.string().trim().max(20).default(""),
  flat: z.string().trim().max(20).default(""),
  landmark: z.string().trim().max(120).default(""),
  note: z.string().trim().max(300).default(""),
  pin: addressPinSchema.nullable().default(null),
});

/**
 * A phone SkipCash accepts (8c; its sandbox, 2026-10-11): a Qatari number (8 digits, with or without
 * 974, +974 or 00974), or another country's number with its code after + or 00, at most 14 digits
 * (SkipCash takes 15 characters, "+" included). Another country's local format (0919…) is refused
 * here, because SkipCash refuses it at payment.
 */
function isPayablePhone(value: string): boolean {
  const compact = value.replace(/[\s()-]/g, "");
  return /^(?:\+974|00974|974)?[2-9]\d{7}$/.test(compact) || /^(?:\+|00)[1-9]\d{7,13}$/.test(compact);
}

/**
 * A contact phone (checkout, booking and the account's profile, 10a): at most 20 characters in total
 * (the database column), "+" included, and one SkipCash accepts.
 */
export const contactPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?=.{8,20}$)\+?[0-9 ()-]+$/,
    "Use 8 to 20 characters: digits, spaces, brackets or dashes, with an optional + at the start.",
  )
  .refine(isPayablePhone, "Use a Qatari number, or add your country code with + (for example +63 912 345 6789).");

export const orderContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: contactPhoneSchema,
});

export const checkoutLineSchema = z.object({
  product: slugSchema,
  /** The pack's public code within the product. */
  variant: slugSchema,
  quantity: z.number().int().min(1).max(ORDER_LIMITS.maxQuantity),
});

/** Delivery or pickup with its details, and each item once: checked the same way for a quote and a checkout. */
function checkCart(
  value: { fulfilment: z.infer<typeof fulfilmentSchema>; delivery: unknown; lines: readonly z.infer<typeof checkoutLineSchema>[] },
  context: z.RefinementCtx,
): void {
  if (value.fulfilment === "delivery" && !value.delivery) {
    context.addIssue({ code: "custom", path: ["delivery"], message: "Choose an area, a time and an address." });
  }
  if (value.fulfilment === "pickup" && value.delivery) {
    context.addIssue({ code: "custom", path: ["delivery"], message: "Pickup orders have no delivery details." });
  }
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    const key = `${line.product}/${line.variant}`;
    if (seen.has(key)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "This item is already in the order." });
    }
    seen.add(key);
  });
}

export const checkoutRequestSchema = z
  .object({
    /** One per checkout attempt in the browser; a repeat returns the same order. */
    idempotencyKey: z.uuid(),
    locale: localeSchema,
    /** Logged-in customers: the account email is used instead of `contact.email`. */
    contact: orderContactSchema,
    fulfilment: fulfilmentSchema,
    delivery: z
      .object({ areaId: z.uuid(), windowId: z.uuid(), address: qatarAddressSchema })
      .nullable(),
    lines: z.array(checkoutLineSchema).min(1).max(ORDER_LIMITS.maxLines),
    /** The promo code box (#11): one code per order. A code that gives nothing stops checkout (PROMO_CODE_INVALID). */
    code: promoCodeEntrySchema.nullish(),
    /** The total the customer saw (the quote's); a different server total stops checkout (PRICE_CHANGED). */
    expectedTotal: z.number().int().nonnegative(),
  })
  .superRefine(checkCart);

/**
 * `POST /api/checkout/quote` (11b): the price of a cart from the server, with its discounts. Nothing is
 * saved or held. Only the area matters for the fee, so no window or address is needed.
 */
export const checkoutQuoteRequestSchema = z
  .object({
    fulfilment: fulfilmentSchema,
    delivery: z.object({ areaId: z.uuid() }).nullable(),
    lines: z.array(checkoutLineSchema).min(1).max(ORDER_LIMITS.maxLines),
    code: promoCodeEntrySchema.nullish(),
  })
  .superRefine(checkCart);

export const quoteLineSchema = z.object({
  product: z.string(),
  variant: z.string(),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  /** This line's share of the discounts. */
  discount: z.number().int().nonnegative(),
  /** Unit price × quantity − discount. */
  lineTotal: z.number().int().nonnegative(),
});

export const checkoutQuoteSchema = z.object({
  lines: z.array(quoteLineSchema),
  /** The items at their list prices. */
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  /** Everything charged for delivery: the area's fee plus the Pet Houses' delivery charges (#14, D268). */
  deliveryFee: z.number().int().nonnegative(),
  /** The part of `deliveryFee` for Pet Houses: each house's own charge, per house; 0 without one or for pickup. */
  houseDeliveryFee: z.number().int().nonnegative(),
  /**
   * The longest "ready in about … days" of the cart's Pet Houses (#14), or null without one: delivery
   * times start that many days after today. Send it as the windows' `leadDays`.
   */
  houseLeadDays: z.number().int().min(0).max(HOUSE_MAX_LEAD_DAYS).nullable(),
  /** Subtotal + delivery fee − discount: send it back as checkout's `expectedTotal`. */
  total: z.number().int().nonnegative(),
  /** The promotions that take something off, largest first. */
  promotions: z.array(orderPromotionSchema),
  /**
   * The code's answer; null when none was entered. For a guest, offers for new customers and
   * per-customer limits are checked with the email at checkout.
   */
  code: z.object({ status: promoCodeStatusSchema, message: z.string() }).nullable(),
});

export const cancelOrderRequestSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const orderLineSchema = z.object({
  product: z.string(),
  variant: z.string(),
  sku: z.string(),
  name: localisedTextSchema,
  label: localisedTextSchema,
  weightGrams: z.number().int().positive().nullable(),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  /** This line's share of the promotions' discounts (#11). */
  discount: z.number().int().nonnegative(),
  /** Unit price × quantity − discount: what was paid for this line, and the most a refund for it should be. */
  lineTotal: z.number().int().nonnegative(),
  /**
   * A Pet House line's own copy (#14, D268): made to order or from stock, "ready in about min–max days"
   * and its delivery charge per house, as when it was ordered. Null for other items.
   */
  house: z
    .object({
      madeToOrder: z.boolean(),
      leadTime: z.object({ minDays: z.number().int().nonnegative(), maxDays: z.number().int().nonnegative() }),
      deliveryFee: z.number().int().nonnegative(),
    })
    .nullable(),
});

/** The customer's side of paying (8b): what the order page may offer and say. */
export const customerPaymentSchema = z.object({
  /**
   * Pay now (or Continue to payment, or Pay again) works now: the order awaits payment inside its
   * hold, a payment company is set up, and an attempt is open or still allowed (D147).
   */
  canPay: z.boolean(),
  /** The latest attempt; its reference is the `?payment=` the customer comes back with. */
  latest: z.object({ reference: z.string(), status: paymentStatusSchema }).nullable(),
  /** New attempts still allowed (D147: 3 per order). */
  attemptsLeft: z.number().int().nonnegative(),
  /** A payment we received that staff must handle (D136, D146, D152); the page says what happens next. */
  attention: paymentAttentionSchema.nullable(),
});

export const customerOrderSchema = z.object({
  reference: orderReferenceSchema,
  status: orderStatusSchema,
  fulfilment: fulfilmentSchema,
  placedAt: z.string(),
  /** While Awaiting payment: when the held stock and seat are released. */
  holdExpiresAt: z.string().nullable(),
  contact: orderContactSchema,
  delivery: z
    .object({
      area: localisedTextSchema,
      address: qatarAddressSchema,
      window: z.object({ date: localDateSchema, start: clockTimeSchema, end: clockTimeSchema }),
    })
    .nullable(),
  lines: z.array(orderLineSchema),
  /** The items at their list prices. */
  subtotal: z.number().int().nonnegative(),
  /** Everything charged for delivery, the Pet Houses' charges included (#14). */
  deliveryFee: z.number().int().nonnegative(),
  /** The part of `deliveryFee` for Pet Houses (#14, D268); 0 without one. */
  houseDeliveryFee: z.number().int().nonnegative(),
  /** What the promotions took off the items (#11). */
  discount: z.number().int().nonnegative(),
  /** Subtotal + delivery fee − discount: what is paid. */
  total: z.number().int().nonnegative(),
  /** The order's own copy of its promotions (D203). */
  promotions: z.array(orderPromotionSchema),
  canCancel: z.boolean(),
  /** A paid order that was cancelled and is not refunded in full yet; staff refund it (D124, D139). */
  refundNeeded: z.boolean(),
  cancelledAt: z.string().nullable(),
  payment: customerPaymentSchema,
});

export const checkoutResponseSchema = z.object({
  order: customerOrderSchema,
  /** Guest orders only: the private link key (`/orders/<reference>#k=<key>`). Never logged. */
  guestKey: z.string().nullable(),
});

export const orderSummarySchema = customerOrderSchema
  .pick({
    reference: true,
    status: true,
    fulfilment: true,
    placedAt: true,
    discount: true,
    total: true,
  })
  .extend({
    /** The order has a Pet House (#14), for its mark in "My orders". */
    hasHouse: z.boolean(),
  });

export const orderListResponseSchema = z.object({ orders: z.array(orderSummarySchema) });

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Fulfilment = z.infer<typeof fulfilmentSchema>;
export type QatarAddress = z.infer<typeof qatarAddressSchema>;
export type AddressPin = z.infer<typeof addressPinSchema>;
export type OrderContact = z.infer<typeof orderContactSchema>;
export type CheckoutLine = z.infer<typeof checkoutLineSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutQuoteRequest = z.infer<typeof checkoutQuoteRequestSchema>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type CustomerPayment = z.infer<typeof customerPaymentSchema>;
export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
