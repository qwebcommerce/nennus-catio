import { z } from "zod";

/**
 * Payments (#8, plan BRANCH_8_PAYMENTS, D136-D150). 8a-1 holds the shared vocabulary, which the
 * database checks mirror; the requests and answers arrive with the phase that uses them (8a-2 Pay
 * now, 8a-3 payment results, 8a-4 refunds). Money is integer minor units in QAR, as everywhere else.
 */

/** "fake" exists only in development and tests (never registered in production). */
export const paymentProviderSchema = z.enum(["fake", "skipcash"]);

/**
 * One attempt to pay: created → pending → succeeded, failed or cancelled; a pending attempt the
 * lookup job has not settled after 24 hours becomes abandoned (D148).
 */
export const paymentStatusSchema = z.enum(["created", "pending", "succeeded", "failed", "cancelled", "abandoned"]);

/** At most one open attempt per order at a time (a database unique index). */
export const OPEN_PAYMENT_STATUSES: readonly PaymentStatus[] = ["created", "pending"];

/** Why a paid order needs staff (D136, D146, plan section 13; amount_mismatch from the 8a-3 review). */
export const paymentAttentionSchema = z.enum(["paid_after_expiry", "paid_after_cancel", "duplicate_payment", "amount_mismatch"]);

/** "api" through the provider; "manual" when staff refund in the provider's dashboard (D76). */
export const refundMethodSchema = z.enum(["api", "manual"]);

/** api: requested → processing → completed or failed; manual: pending_manual → completed, or cancelled (withdrawn by staff). */
export const refundStatusSchema = z.enum(["requested", "processing", "completed", "failed", "pending_manual", "cancelled"]);

/** D147: each new attempt keeps the order at least this long; at most this many attempts per order. */
export const PAYMENT_LIMITS = Object.freeze({ minutesToPay: 15, attemptsPerOrder: 3 });

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentAttention = z.infer<typeof paymentAttentionSchema>;
export type RefundMethod = z.infer<typeof refundMethodSchema>;
export type RefundStatus = z.infer<typeof refundStatusSchema>;

// --- 8a-2: Pay now and the fake gateway ----------------------------------------------------------

/** Pay now has no body: the server takes the amount from the order. */
export const payNowRequestSchema = z.object({});

export const payNowResponseSchema = z.object({
  /** The open attempt: a new one, or the one already open (a double-click or a second tab). */
  payment: z.object({
    reference: z.string(),
    status: paymentStatusSchema,
    /** Where the customer pays: https:// at the provider, or a path on our site (the fake gateway). */
    checkoutUrl: z.string(),
  }),
  /**
   * The order's or booking's hold after this attempt (D147: at least 15 minutes from a new attempt).
   * Null for a relocation quote, which holds nothing and does not expire (#15).
   */
  holdExpiresAt: z.string().nullable(),
});

/** What the fake gateway says about a payment (development and tests only; the 8b test page). */
export const fakeGatewayStateSchema = z.enum(["open", "succeeded", "failed", "cancelled"]);

export const fakeGatewayPaymentSchema = z.object({
  providerPaymentId: z.string(),
  reference: z.string(),
  amount: z.number().int().positive(),
  currency: z.literal("QAR"),
  state: fakeGatewayStateSchema,
  /** Where the page sends the customer afterwards, as a real provider would (the order page). */
  returnUrl: z.string(),
});

export type PayNowResponse = z.infer<typeof payNowResponseSchema>;
export type FakeGatewayState = z.infer<typeof fakeGatewayStateSchema>;
export type FakeGatewayPayment = z.infer<typeof fakeGatewayPaymentSchema>;

// --- 8a-4: refunds, staff payment details, confirming a late payment ------------------------------

/** One attempt as staff see it (Orders → View). */
export const adminPaymentAttemptSchema = z.object({
  reference: z.string(),
  provider: paymentProviderSchema,
  status: paymentStatusSchema,
  amount: z.number().int().positive(),
  /** Refunded, or reserved for refunds still in progress. */
  refunded: z.number().int().nonnegative(),
  createdAt: z.string(),
  succeededAt: z.string().nullable(),
  /** What the provider reported when it differs from the attempt (a wrong-amount payment); else null. */
  reported: z.object({ amount: z.number().int().nonnegative(), currency: z.string(), state: z.string() }).nullable(),
  /** Staff refunded the wrong-amount payment in the provider's dashboard and closed it here (decision A). */
  mismatchClosed: z.object({ reference: z.string(), at: z.string(), by: z.string().nullable() }).nullable(),
});

export const adminRefundSchema = z.object({
  id: z.uuid(),
  paymentReference: z.string(),
  amount: z.number().int().positive(),
  reason: z.string(),
  method: refundMethodSchema,
  status: refundStatusSchema,
  providerRefundId: z.string().nullable(),
  /** The provider dashboard's reference for a manual refund. */
  manualReference: z.string().nullable(),
  requestedBy: z.string().nullable(),
  completedBy: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

/** An order's payments for the admin payment panel (8b), with what staff may do next. */
export const adminOrderPaymentsSchema = z.object({
  orderReference: z.string(),
  attention: paymentAttentionSchema.nullable(),
  refundNeeded: z.boolean(),
  attempts: z.array(adminPaymentAttemptSchema),
  refunds: z.array(adminRefundSchema),
  actions: z.object({
    /** Per completed payment: the most that can still be refunded (D137). */
    refundable: z.array(z.object({ paymentReference: z.string(), maxAmount: z.number().int().positive() })),
    /** Open attempts the provider reported paid with a different amount or currency (decision A). */
    closableMismatches: z.array(z.string()),
    /** "Confirm with a new delivery time": paid after its time ran out (D136). */
    canConfirmLate: z.boolean(),
    /** How a refund started now is made: by the payment company's API, or by staff in its dashboard (D76). */
    refundsBy: refundMethodSchema,
  }),
});

/** Staff start every refund (D139); partial refunds allowed (D137). */
export const refundRequestSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(300),
});

/** A manual refund done in the provider's dashboard, recorded with its reference (D76). */
export const completeManualRefundSchema = z.object({ manualReference: z.string().trim().min(1).max(100) });

/** A wrong-amount payment refunded in the provider's dashboard, then closed here (decision A). */
export const closeMismatchRequestSchema = z.object({ manualReference: z.string().trim().min(1).max(100) });

/** Same way of receiving (decision B): delivery needs a new window; pickup has none. */
export const confirmLatePaymentRequestSchema = z.object({
  version: z.number().int().positive(),
  windowId: z.uuid().nullable(),
});

export type AdminPaymentAttempt = z.infer<typeof adminPaymentAttemptSchema>;
export type AdminRefund = z.infer<typeof adminRefundSchema>;
export type AdminOrderPayments = z.infer<typeof adminOrderPaymentsSchema>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;
export type CompleteManualRefundRequest = z.infer<typeof completeManualRefundSchema>;
export type CloseMismatchRequest = z.infer<typeof closeMismatchRequestSchema>;
export type ConfirmLatePaymentRequest = z.infer<typeof confirmLatePaymentRequestSchema>;
