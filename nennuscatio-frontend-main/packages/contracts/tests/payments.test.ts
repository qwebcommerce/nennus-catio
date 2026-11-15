import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminOrderPaymentsSchema,
  apiErrorCodeSchema,
  closeMismatchRequestSchema,
  completeManualRefundSchema,
  confirmLatePaymentRequestSchema,
  fakeGatewayPaymentSchema,
  OPEN_PAYMENT_STATUSES,
  PAYMENT_LIMITS,
  payNowRequestSchema,
  payNowResponseSchema,
  paymentAttentionSchema,
  paymentProviderSchema,
  paymentStatusSchema,
  refundMethodSchema,
  refundRequestSchema,
  refundStatusSchema,
} from "../src/index.js";

test("payment vocabulary matches the approved #8 plan (D136-D150)", () => {
  assert.deepEqual(paymentProviderSchema.options, ["fake", "skipcash"]);
  assert.deepEqual(paymentStatusSchema.options, ["created", "pending", "succeeded", "failed", "cancelled", "abandoned"]);
  assert.deepEqual(paymentAttentionSchema.options, ["paid_after_expiry", "paid_after_cancel", "duplicate_payment", "amount_mismatch"]);
  assert.deepEqual(refundMethodSchema.options, ["api", "manual"]);
  assert.deepEqual(refundStatusSchema.options, ["requested", "processing", "completed", "failed", "pending_manual", "cancelled"]);
});

test("only created and pending attempts are open (one per order at a time)", () => {
  assert.deepEqual([...OPEN_PAYMENT_STATUSES], ["created", "pending"]);
  for (const status of OPEN_PAYMENT_STATUSES) assert.equal(paymentStatusSchema.safeParse(status).success, true);
});

test("time to pay and attempts follow D147", () => {
  assert.deepEqual(PAYMENT_LIMITS, { minutesToPay: 15, attemptsPerOrder: 3 });
  assert.equal(Object.isFrozen(PAYMENT_LIMITS), true);
});

test("unknown values are refused", () => {
  assert.equal(paymentProviderSchema.safeParse("paypal").success, false);
  assert.equal(paymentStatusSchema.safeParse("paid").success, false);
  assert.equal(refundStatusSchema.safeParse("done").success, false);
});

// --- 8a-2: Pay now and the fake gateway ----------------------------------------------------------

test("Pay now answers with the attempt's page and the order's new hold", () => {
  const answer = {
    payment: { reference: "NC-261009-4F7KQ2-P1", status: "pending", checkoutUrl: "/en/payments/fake/fake_x" },
    holdExpiresAt: "2026-10-09T20:15:00.000Z",
  };
  assert.deepEqual(payNowResponseSchema.parse(answer), answer);
  assert.equal(payNowResponseSchema.safeParse({ ...answer, payment: { ...answer.payment, status: "paid" } }).success, false);
  assert.deepEqual(payNowRequestSchema.parse({}), {});
});

test("the fake gateway's page shows the amount, its own state and where to go back (development only)", () => {
  const page = {
    providerPaymentId: "fake_1",
    reference: "NC-261009-4F7KQ2-P1",
    amount: 2500,
    currency: "QAR",
    state: "open",
    returnUrl: "http://localhost:3000/en/orders/NC-261009-4F7KQ2?payment=NC-261009-4F7KQ2-P1",
  };
  assert.deepEqual(fakeGatewayPaymentSchema.parse(page), page);
  assert.equal(fakeGatewayPaymentSchema.safeParse({ ...page, state: "paid" }).success, false);
  assert.equal(fakeGatewayPaymentSchema.safeParse({ ...page, amount: 0 }).success, false);
  const { returnUrl: _returnUrl, ...withoutReturn } = page;
  assert.equal(fakeGatewayPaymentSchema.safeParse(withoutReturn).success, false);
});

test("payment refusals have their own error codes", () => {
  for (const code of ["PAYMENTS_UNAVAILABLE", "PAYMENT_ATTEMPTS_EXCEEDED", "PAYMENT_IN_PROGRESS", "PAYMENT_START_FAILED", "ORDER_NOT_PAYABLE", "REFUND_FAILED"]) {
    assert.equal(apiErrorCodeSchema.safeParse(code).success, true, code);
  }
});

// --- 8a-4: refunds, staff payment details, confirming a late payment ------------------------------

test("a refund needs a positive whole amount and a reason (D137, D139)", () => {
  assert.deepEqual(refundRequestSchema.parse({ amount: 1500, reason: "  Damaged item  " }), { amount: 1500, reason: "Damaged item" });
  assert.equal(refundRequestSchema.safeParse({ amount: 0, reason: "x" }).success, false);
  assert.equal(refundRequestSchema.safeParse({ amount: 10.5, reason: "x" }).success, false);
  assert.equal(refundRequestSchema.safeParse({ amount: 100, reason: "   " }).success, false);
  assert.equal(refundRequestSchema.safeParse({ amount: 100, reason: "x".repeat(301) }).success, false);
});

test("manual refunds and closing a wrong-amount payment need the provider's reference", () => {
  assert.deepEqual(completeManualRefundSchema.parse({ manualReference: " SC-REF-1 " }), { manualReference: "SC-REF-1" });
  assert.equal(completeManualRefundSchema.safeParse({ manualReference: "" }).success, false);
  assert.deepEqual(closeMismatchRequestSchema.parse({ manualReference: "SC-REF-2" }), { manualReference: "SC-REF-2" });
  assert.equal(closeMismatchRequestSchema.safeParse({}).success, false);
});

test("confirming a late payment carries the order's version and a window or none", () => {
  const windowId = "0190f0a4-7c3e-7000-8000-000000000001";
  assert.deepEqual(confirmLatePaymentRequestSchema.parse({ version: 3, windowId }), { version: 3, windowId });
  assert.deepEqual(confirmLatePaymentRequestSchema.parse({ version: 3, windowId: null }), { version: 3, windowId: null });
  assert.equal(confirmLatePaymentRequestSchema.safeParse({ version: 3 }).success, false);
  assert.equal(confirmLatePaymentRequestSchema.safeParse({ version: 0, windowId: null }).success, false);
});

test("the staff payment panel lists attempts, refunds and what staff may do next", () => {
  const panel = {
    orderReference: "NC-261010-4F7KQ2",
    attention: "amount_mismatch",
    refundNeeded: false,
    attempts: [
      {
        reference: "NC-261010-4F7KQ2-P1",
        provider: "fake",
        status: "pending",
        amount: 2500,
        refunded: 0,
        createdAt: "2026-10-10T08:00:00.000Z",
        succeededAt: null,
        reported: { amount: 2400, currency: "QAR", state: "succeeded" },
        mismatchClosed: null,
      },
    ],
    refunds: [
      {
        id: "0190f0a4-7c3e-7000-8000-000000000002",
        paymentReference: "NC-261010-4F7KQ2-P1",
        amount: 500,
        reason: "Damaged item",
        method: "manual",
        status: "pending_manual",
        providerRefundId: null,
        manualReference: null,
        requestedBy: "Owner",
        completedBy: null,
        createdAt: "2026-10-10T09:00:00.000Z",
        completedAt: null,
      },
    ],
    actions: { refundable: [], closableMismatches: ["NC-261010-4F7KQ2-P1"], canConfirmLate: false, refundsBy: "manual" },
  };
  assert.deepEqual(adminOrderPaymentsSchema.parse(panel), panel);
  assert.equal(adminOrderPaymentsSchema.safeParse({ ...panel, attention: "late" }).success, false);
  // 8b: the refund dialog says how the refund is made, so the panel must say it.
  assert.equal(adminOrderPaymentsSchema.safeParse({ ...panel, actions: { ...panel.actions, refundsBy: "cash" } }).success, false);
  assert.equal(
    adminOrderPaymentsSchema.safeParse({ ...panel, actions: { ...panel.actions, refundable: [{ paymentReference: "x", maxAmount: 0 }] } }).success,
    false,
  );
});
