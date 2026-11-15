import { z } from "zod";
import { clockTimeSchema, localDateSchema } from "./delivery.js";
import {
  fulfilmentSchema,
  type Fulfilment,
  orderContactSchema,
  orderLineSchema,
  orderReferenceSchema,
  type OrderStatus,
  orderStatusSchema,
  qatarAddressSchema,
} from "./orders.js";
import { paymentAttentionSchema } from "./payments.js";
import { adminOrderPromotionSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Staff order handling (branch 7c, D131-D134). The step rules live here so the API and the admin
 * screen always agree on what is allowed next.
 */

/** Orders that are still running: staff may cancel these (D131). */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  "awaiting_payment",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "ready_for_pickup",
];

/** The next step forward, or null. An unpaid order never moves forward: payment confirms it. */
export function nextOrderStatus(status: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  switch (status) {
    case "confirmed":
      return "preparing";
    case "preparing":
      return fulfilment === "delivery" ? "out_for_delivery" : "ready_for_pickup";
    case "out_for_delivery":
      return "delivered";
    case "ready_for_pickup":
      return "collected";
    default:
      return null;
  }
}

/** One step back after a wrong click (D132), or null. Never after Delivered/Collected. */
export function previousOrderStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case "preparing":
      return "confirmed";
    case "out_for_delivery":
    case "ready_for_pickup":
      return "preparing";
    default:
      return null;
  }
}

export function staffCanCancel(status: OrderStatus): boolean {
  return OPEN_ORDER_STATUSES.includes(status);
}

/** From Preparing on the items may be packed or damaged, so staff are asked about stock (D131). */
export function cancellingAsksAboutStock(status: OrderStatus): boolean {
  return status === "preparing" || status === "out_for_delivery" || status === "ready_for_pickup";
}

/**
 * "Change delivery time" (#14, D268): a paid delivery order that has not left yet, for example a Pet
 * House that takes longer to make than estimated. The customer gets an email.
 */
export function canChangeDeliveryTime(status: OrderStatus, fulfilment: Fulfilment): boolean {
  return fulfilment === "delivery" && (status === "confirmed" || status === "preparing");
}

// --- List ---------------------------------------------------------------------------------------

export const ADMIN_ORDER_PAGE_SIZES = [10, 25, 50] as const;
export const adminOrderSortSchema = z.enum(["newest", "oldest", "window", "total"]);

/** Query-string filters (all optional). `status` is a comma-separated list. */
export const adminOrderQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      const parts = value.split(",").filter(Boolean);
      const parsed = z.array(orderStatusSchema).max(9).safeParse(parts);
      if (!parsed.success) {
        context.addIssue({ code: "custom", message: "Unknown order status." });
        return z.NEVER;
      }
      return parsed.data;
    }),
  fulfilment: fulfilmentSchema.optional(),
  area: z.uuid().optional(),
  /** "1": only orders with "Refund needed" or a payment that needs attention (8b). */
  needsAction: z.literal("1").optional(),
  /** "1": only orders with a Pet House (#14). */
  houses: z.literal("1").optional(),
  /** Which date the range applies to: when the order was placed, or its delivery window. */
  dateField: z.enum(["placed", "window"]).default("placed"),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  sort: adminOrderSortSchema.default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_ORDER_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 10, 25 or 50.")
    .default(25),
});

const orderWindowSchema = z.object({ date: localDateSchema, start: clockTimeSchema, end: clockTimeSchema });

export const adminOrderSummarySchema = z.object({
  reference: orderReferenceSchema,
  status: orderStatusSchema,
  fulfilment: fulfilmentSchema,
  placedAt: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  area: localisedTextSchema.nullable(),
  window: orderWindowSchema.nullable(),
  itemCount: z.number().int().nonnegative(),
  /** The order has a Pet House (#14): its mark in Orders, the day views and the customer's record. */
  hasHouse: z.boolean(),
  total: z.number().int().nonnegative(),
  refundNeeded: z.boolean(),
  /** A payment staff must handle (D136, D146, D152); the payment panel says what to do. */
  attention: paymentAttentionSchema.nullable(),
});

export const adminOrderListResponseSchema = z.object({
  orders: z.array(adminOrderSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** Orders per status for the summary cards, with every filter except status applied. */
  counts: z.record(orderStatusSchema, z.number().int().nonnegative()),
});

// --- Detail -------------------------------------------------------------------------------------

export const adminOrderHistoryEntrySchema = z.object({
  from: orderStatusSchema.nullable(),
  to: orderStatusSchema,
  actor: z.enum(["customer", "guest", "staff", "system"]),
  staffName: z.string().nullable(),
  reason: z.string().nullable(),
  at: z.string(),
});

export const adminOrderSchema = adminOrderSummarySchema.extend({
  locale: z.enum(["en", "ar"]),
  contact: orderContactSchema,
  hasAccount: z.boolean(),
  address: qatarAddressSchema.nullable(),
  lines: z.array(orderLineSchema),
  /** The items at their list prices. */
  subtotal: z.number().int().nonnegative(),
  /** Everything charged for delivery, the Pet Houses' charges included (#14). */
  deliveryFee: z.number().int().nonnegative(),
  /** The part of `deliveryFee` for Pet Houses (#14, D268); 0 without one. */
  houseDeliveryFee: z.number().int().nonnegative(),
  /** What the promotions took off the items (#11); the total is subtotal + delivery fee − discount. */
  discount: z.number().int().nonnegative(),
  /** The order's own copy of its promotions (D203), with each use's state. */
  promotions: z.array(adminOrderPromotionSchema),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.enum(["customer", "guest", "staff", "system"]).nullable(),
  cancelReason: z.string().nullable(),
  /** Set for cancelled/expired orders: whether the items went back into stock (D131). */
  stockReturned: z.boolean().nullable(),
  expiredAt: z.string().nullable(),
  history: z.array(adminOrderHistoryEntrySchema),
  /** Echo this back with every change; a change made by someone else in between is refused. */
  version: z.number().int().positive(),
  /** What staff may do now (from the step rules above). */
  actions: z.object({
    next: orderStatusSchema.nullable(),
    back: orderStatusSchema.nullable(),
    cancel: z.boolean(),
    asksAboutStock: z.boolean(),
    /** "Change delivery time" (#14). */
    changeTime: z.boolean(),
  }),
});

// --- Changes ------------------------------------------------------------------------------------

export const orderStepRequestSchema = z.object({ version: z.number().int().positive() });

export const staffCancelOrderRequestSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(300),
  /** Only used from Preparing on; earlier the items always go back (D131). */
  returnStock: z.boolean(),
});

/** "Change delivery time" (#14): the new window, and the version the screen loaded. */
export const changeDeliveryTimeRequestSchema = z.object({
  version: z.number().int().positive(),
  windowId: z.uuid(),
});

export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
export type ChangeDeliveryTimeRequest = z.infer<typeof changeDeliveryTimeRequestSchema>;
export type AdminOrderSort = z.infer<typeof adminOrderSortSchema>;
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrderListResponse = z.infer<typeof adminOrderListResponseSchema>;
export type AdminOrderHistoryEntry = z.infer<typeof adminOrderHistoryEntrySchema>;
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type OrderStepRequest = z.infer<typeof orderStepRequestSchema>;
export type StaffCancelOrderRequest = z.infer<typeof staffCancelOrderRequestSchema>;
