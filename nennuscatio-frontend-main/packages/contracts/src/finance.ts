import { z } from "zod";
import { petLabelSchema } from "./bookings.js";
import { localDateSchema } from "./delivery.js";
import { groomingLocationSchema } from "./grooming.js";
import { fulfilmentSchema } from "./orders.js";
import { paymentAttentionSchema, paymentProviderSchema, refundMethodSchema, refundStatusSchema } from "./payments.js";
import { promotionUseStatusSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Finance (branch #12, D222-D223). Website money only: in-store sales arrive with the POS (#16).
 * Money comes from payments and refunds, never from order totals, so a day matches the payment
 * company's statement. A payment counts on the Qatar day it succeeded and a refund on the day it
 * completed (answer 1A), so past days never change. Finance shapes never carry a phone, email or
 * address (answer 4A).
 */

/** The longest period one finance request may cover, in days. */
export const FINANCE_MAX_DAYS = 366;
export const FINANCE_PAGE_SIZES = [25, 50, 100] as const;
/** The most rows one finance CSV may contain; staff narrow the filters for more. */
export const FINANCE_EXPORT_MAX_ROWS = 10_000;

/** Products: shop orders; houses: orders with a Pet House (#14); grooming: bookings; relocation: relocation quotes (#15). */
export const financeTypeSchema = z.enum(["products", "houses", "grooming", "relocation"]);
export const financeGroupingSchema = z.enum(["day", "week", "month"]);
/** What a payment is for: an order, a grooming booking or a relocation request (#15). */
export const payableKindSchema = z.enum(["order", "booking", "relocation"]);
/** How much of an order's or booking's money has come back. */
export const financeTransactionStatusSchema = z.enum(["paid", "partly_refunded", "refunded"]);
/** Refund statuses as staff filter them; "in_progress" is requested or processing at the payment company. */
export const financeRefundFilterSchema = z.enum(["completed", "in_progress", "manual_pending", "failed", "cancelled"]);
export const financeSortOrderSchema = z.enum(["asc", "desc"]);

export type FinanceType = z.infer<typeof financeTypeSchema>;
export type FinanceGrouping = z.infer<typeof financeGroupingSchema>;
export type PayableKind = z.infer<typeof payableKindSchema>;
export type FinanceTransactionStatus = z.infer<typeof financeTransactionStatusSchema>;
export type FinanceRefundFilter = z.infer<typeof financeRefundFilterSchema>;

/** Days from `from` to `to`, both included. */
export function periodDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function checkPeriod(value: { from: string; to: string }, context: z.RefinementCtx): void {
  if (value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "The end date must not be before the start date." });
  } else if (periodDays(value.from, value.to) > FINANCE_MAX_DAYS) {
    context.addIssue({ code: "custom", path: ["to"], message: `Choose at most ${FINANCE_MAX_DAYS} days.` });
  }
}

function checkAmounts(value: { min?: number; max?: number }, context: z.RefinementCtx): void {
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
    context.addIssue({ code: "custom", path: ["max"], message: "The minimum must not be more than the maximum." });
  }
}

const amountFilter = z.coerce.number().int().min(0).max(100_000_000).optional();

/** Filters shared by the three lists; amounts are in dirhams (QAR 0.01). */
const listShape = {
  from: localDateSchema,
  to: localDateSchema,
  q: z.string().trim().max(100).optional(),
  type: financeTypeSchema.optional(),
  min: amountFilter,
  max: amountFilter,
  order: financeSortOrderSchema.default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (FINANCE_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 25, 50 or 100.")
    .default(25),
};

function checkList(value: { from: string; to: string; min?: number; max?: number }, context: z.RefinementCtx): void {
  checkPeriod(value, context);
  checkAmounts(value, context);
}

export const financeOverviewQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema, grouping: financeGroupingSchema.default("day") })
  .superRefine(checkPeriod);

export const financeTransactionQuerySchema = z
  .object({
    ...listShape,
    status: financeTransactionStatusSchema.optional(),
    sort: z.enum(["date", "reference", "customer", "type", "amount", "status"]).default("date"),
  })
  .superRefine(checkList);

export const financePaymentQuerySchema = z
  .object({
    ...listShape,
    provider: paymentProviderSchema.optional(),
    sort: z.enum(["date", "reference", "customer", "type", "amount"]).default("date"),
  })
  .superRefine(checkList);

export const financeRefundQuerySchema = z
  .object({
    ...listShape,
    status: financeRefundFilterSchema.optional(),
    method: refundMethodSchema.optional(),
    sort: z.enum(["date", "reference", "customer", "type", "amount", "status"]).default("date"),
  })
  .superRefine(checkList);

export type FinanceOverviewQuery = z.infer<typeof financeOverviewQuerySchema>;
export type FinanceTransactionQuery = z.infer<typeof financeTransactionQuerySchema>;
export type FinancePaymentQuery = z.infer<typeof financePaymentQuerySchema>;
export type FinanceRefundQuery = z.infer<typeof financeRefundQuerySchema>;

// --- Overview ------------------------------------------------------------------------------------

const money = z.number().int();
const count = z.number().int().nonnegative();
export const moneyCountSchema = z.object({ amount: money, count });

export const financeOverviewSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  grouping: financeGroupingSchema,
  /** Successful payments whose money arrived in the period. */
  paid: moneyCountSchema,
  /** Refunds completed in the period. */
  refunds: moneyCountSchema,
  /** paid − refunds; a day with only refunds is below zero. */
  net: money,
  /** Money owed back to customers now, whatever the period (answer 2A). */
  toRefund: moneyCountSchema,
  /**
   * Orders and bookings first paid in the period, from each one's own copy of its prices:
   * items − discount + deliveryFees + visitFees = total. `items` is before discounts (a booking's
   * package price).
   */
  sales: z.object({ count, items: money, discount: money, deliveryFees: money, visitFees: money, total: money }),
  /** Later payments for an order or booking already paid: a second payment, or one after it expired or was cancelled. */
  otherPayments: moneyCountSchema,
  /** Always the four types, in this order: products, houses, grooming, relocation. */
  byType: z.array(z.object({ type: financeTypeSchema, paid: money, refunds: money, net: money })),
  /** Discounts given on the sales above, by promotion (each order's own copy of its promotions). */
  promotions: z.array(z.object({ name: localisedTextSchema, code: z.string().nullable(), uses: count, discount: money })),
  /**
   * Relocation quotes paid, and refunds made, outside the website in the period (#15, D279 answer 10),
   * recorded by staff: never website money, so never in the figures above (D222).
   */
  outside: z.object({ paid: moneyCountSchema, refunded: moneyCountSchema }),
  /** One bucket per day, week (Monday first) or month of the period, oldest first; `start` is its first day. */
  series: z.array(z.object({ start: localDateSchema, paid: money, refunds: money, net: money })),
});
export type FinanceOverview = z.infer<typeof financeOverviewSchema>;

// --- Lists ---------------------------------------------------------------------------------------

const sourceSchema = z.object({ kind: payableKindSchema, reference: z.string() });

export const financeTransactionSchema = z.object({
  kind: payableKindSchema,
  reference: z.string(),
  type: financeTypeSchema,
  /** When its first payment succeeded: the day it counts on. */
  paidAt: z.string(),
  customerName: z.string(),
  /** Every successful payment of it. */
  paid: money,
  /** Completed refunds. */
  refunded: money,
  status: financeTransactionStatusSchema,
  provider: paymentProviderSchema,
  payments: count,
});

export const financePaymentSchema = z.object({
  /** Our payment reference. */
  reference: z.string(),
  provider: paymentProviderSchema,
  /** The payment company's id, to find the line on its statement. */
  providerPaymentId: z.string().nullable(),
  source: sourceSchema,
  type: financeTypeSchema,
  customerName: z.string(),
  amount: money,
  /** Completed refunds of this payment. */
  refunded: money,
  succeededAt: z.string(),
  /** Not the first payment of its order or booking. */
  extra: z.boolean(),
});

export const financeRefundSchema = z.object({
  id: z.uuid(),
  paymentReference: z.string(),
  providerRefundId: z.string().nullable(),
  manualReference: z.string().nullable(),
  source: sourceSchema,
  type: financeTypeSchema,
  customerName: z.string(),
  amount: money,
  method: refundMethodSchema,
  status: refundStatusSchema,
  reason: z.string(),
  requestedAt: z.string(),
  requestedBy: z.string(),
  completedAt: z.string().nullable(),
  completedBy: z.string().nullable(),
});

function listSchema<T extends z.ZodType>(row: T) {
  return z.object({
    rows: z.array(row),
    total: count,
    page: z.number().int().min(1),
    pageSize: z.number().int(),
    /** The sum of the amount column over every matching row, not only this page. */
    sum: money,
  });
}

export const financeTransactionListSchema = listSchema(financeTransactionSchema);
export const financePaymentListSchema = listSchema(financePaymentSchema);
export const financeRefundListSchema = listSchema(financeRefundSchema);

export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;
export type FinancePayment = z.infer<typeof financePaymentSchema>;
export type FinanceRefund = z.infer<typeof financeRefundSchema>;
export type FinanceTransactionList = z.infer<typeof financeTransactionListSchema>;
export type FinancePaymentList = z.infer<typeof financePaymentListSchema>;
export type FinanceRefundList = z.infer<typeof financeRefundListSchema>;

// --- One transaction -------------------------------------------------------------------------------

export const financeDetailSchema = z.object({
  kind: payableKindSchema,
  reference: z.string(),
  type: financeTypeSchema,
  /** The order's or booking's own status. */
  status: z.string(),
  placedAt: z.string(),
  /** `recordId` opens the customer record; only for roles that may view Customers (answer 4A). */
  customer: z.object({ name: z.string(), recordId: z.uuid().nullable() }),
  fulfilment: fulfilmentSchema.nullable(),
  /** Order lines; a booking has one line, its package. */
  lines: z.array(
    z.object({
      name: localisedTextSchema,
      label: localisedTextSchema,
      quantity: z.number().int().positive(),
      unitPrice: money,
      discount: money,
      total: money,
    }),
  ),
  booking: z
    .object({ date: localDateSchema, time: z.string(), location: groomingLocationSchema, pet: petLabelSchema })
    .nullable(),
  breakdown: z.object({ items: money, discount: money, deliveryFee: money, visitFee: money, total: money }),
  promotions: z.array(
    z.object({ name: localisedTextSchema, code: z.string().nullable(), discount: money, status: promotionUseStatusSchema }),
  ),
  /** Successful payments, oldest first. */
  payments: z.array(
    z.object({
      reference: z.string(),
      provider: paymentProviderSchema,
      providerPaymentId: z.string().nullable(),
      amount: money,
      refunded: money,
      succeededAt: z.string(),
    }),
  ),
  refunds: z.array(financeRefundSchema.omit({ source: true, type: true, customerName: true })),
  paid: money,
  refunded: money,
  toRefund: money,
  refundNeeded: z.boolean(),
  attention: paymentAttentionSchema.nullable(),
});
export type FinanceDetail = z.infer<typeof financeDetailSchema>;
