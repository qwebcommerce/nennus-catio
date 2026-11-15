import { z } from "zod";
import { bookingStatusSchema, petLabelSchema } from "./bookings.js";
import { localDateSchema } from "./delivery.js";
import { groomingLocationSchema } from "./grooming.js";
import { fulfilmentSchema, orderStatusSchema } from "./orders.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * The admin Dashboard (branch #12, D222-D223). Each part is present only when the staff member's
 * role may see the page it comes from (answer 3A): money needs Finance View, orders Orders View,
 * bookings Bookings View, relocation requests Relocation View (#15), stock Products View. A part a role
 * may not see is `null`.
 *
 * Two kinds of date: money and paid orders and bookings count on the Qatar day they were paid;
 * appointments and deliveries on their own day.
 */

export const DASHBOARD_PERIODS = [1, 7, 30] as const;
/** Recent orders and upcoming bookings listed. */
export const DASHBOARD_LIST_LIMIT = 8;
/** The day's operations listed per kind; the totals say how many there are. */
export const DASHBOARD_OPERATIONS_LIMIT = 60;
/** Packs listed under stock alerts; the counts cover all of them. */
export const DASHBOARD_STOCK_LIMIT = 12;

export const dashboardQuerySchema = z.object({
  date: localDateSchema,
  days: z.coerce
    .number()
    .int()
    .refine((value) => (DASHBOARD_PERIODS as readonly number[]).includes(value), "Choose 1, 7 or 30 days.")
    .default(1),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const money = z.number().int();
const count = z.number().int().nonnegative();

const orderOperationSchema = z.object({
  kind: z.literal("order"),
  reference: z.string(),
  /** When it was paid, Qatar time (HH:MM). */
  time: z.string(),
  customerName: z.string(),
  fulfilment: fulfilmentSchema,
  total: money,
  status: orderStatusSchema,
});
const deliveryOperationSchema = z.object({
  kind: z.literal("delivery"),
  reference: z.string(),
  /** The delivery window, Qatar time. */
  time: z.string(),
  end: z.string(),
  customerName: z.string(),
  area: localisedTextSchema.nullable(),
  status: orderStatusSchema,
});
const bookingOperationSchema = z.object({
  kind: z.literal("booking"),
  reference: z.string(),
  /** The appointment, Qatar time. */
  time: z.string(),
  end: z.string(),
  customerName: z.string(),
  /** The pet as "group · breed" (D246). */
  pet: petLabelSchema,
  packageName: localisedTextSchema,
  location: groomingLocationSchema,
  status: bookingStatusSchema,
});
export const dashboardOperationSchema = z.discriminatedUnion("kind", [
  orderOperationSchema,
  deliveryOperationSchema,
  bookingOperationSchema,
]);
export type DashboardOperation = z.infer<typeof dashboardOperationSchema>;

export const dashboardSchema = z.object({
  date: localDateSchema,
  days: z.number().int(),
  /** Finance View only. */
  money: z
    .object({
      /** The chosen day. */
      day: z.object({ paid: money, refunds: money, net: money }),
      /** The performance period: the chosen day, or the 7 or 30 days ending on it. */
      period: z.object({
        paid: money,
        refunds: money,
        net: money,
        /** The average total of orders first paid in the period; null without such orders. */
        averageOrder: money.nullable(),
        discounts: money,
      }),
      /** Net per hour ("00"-"23") for one day, otherwise per date, oldest first. */
      series: z.array(z.object({ key: z.string(), net: money })),
    })
    .nullable(),
  /** Orders View only. */
  orders: z
    .object({
      /** Orders first paid on the chosen day. */
      paidToday: count,
      /** Orders first paid in the performance period. */
      paidInPeriod: count,
      /** Paid delivery orders whose window is on the chosen day (not cancelled or expired). */
      deliveriesToday: count,
      /** Paid and waiting to be prepared (Confirmed). */
      toPrepare: count,
      /** The chosen day's deliveries not yet out (Confirmed or Preparing). */
      deliveriesNotOut: count,
      /** Orders and bookings needing attention are counted per page; see `attention`. */
      recent: z.array(
        z.object({
          reference: z.string(),
          paidAt: z.string(),
          customerName: z.string(),
          type: z.enum(["products", "houses"]),
          total: money,
          status: orderStatusSchema,
        }),
      ),
      operations: z.array(z.union([orderOperationSchema, deliveryOperationSchema])),
      operationTotals: z.object({ orders: count, deliveries: count }),
    })
    .nullable(),
  /** Bookings View only. */
  bookings: z
    .object({
      /** Appointments on the chosen day (not cancelled or expired, and paid). */
      today: count,
      /** Bookings first paid in the performance period. */
      paidInPeriod: count,
      upcoming: z.array(
        z.object({
          reference: z.string(),
          startsAt: z.string(),
          customerName: z.string(),
          pet: petLabelSchema,
          packageName: localisedTextSchema,
          location: groomingLocationSchema,
          status: bookingStatusSchema,
        }),
      ),
      operations: z.array(bookingOperationSchema),
      operationTotals: z.object({ bookings: count }),
    })
    .nullable(),
  /**
   * Relocation View only (#15 15d): requests waiting for the team, by step, those in progress, and the
   * quotes first paid in the performance period (from payments only, D222).
   */
  relocation: z
    .object({
      /** New (Submitted), documents to review (Documents Received), a quote to issue (Under Review), paid and waiting to start (Paid). */
      waiting: z.object({ submitted: count, documentsReceived: count, underReview: count, paid: count }),
      inProgress: count,
      paidInPeriod: count,
    })
    .nullable(),
  /** Each count is null when the role may not see where it leads. */
  attention: z.object({
    /** Orders (Orders View), bookings (Bookings View) and relocation requests (Relocation View) with a payment needing attention. */
    payments: count.nullable(),
    /** Orders, bookings and relocation requests owing money back (Finance View, answer 2A). */
    refunds: count.nullable(),
  }),
  /** Products View only. Active shop packs at or below their low-stock threshold (5 when none is set). */
  stock: z
    .object({
      outOfStock: count,
      low: count,
      alerts: z.array(
        z.object({
          productId: z.uuid(),
          product: localisedTextSchema,
          label: localisedTextSchema,
          sku: z.string(),
          stock: z.number().int(),
          threshold: z.number().int(),
        }),
      ),
    })
    .nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

/** The low-stock threshold when a pack has none (the product editor's default). */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
