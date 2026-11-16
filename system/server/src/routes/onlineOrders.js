import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { recommitReleasedHolds, releaseSaleHolds, restoreCommittedHolds } from "../lib/webOrder.js";
import { LOCK_TX, acceptReviewPayments, lockParent, rejectReviewPayments, statusError } from "../lib/payments.js";
import { d, fmt, riyals, toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import { refundSkipcashPayment } from "../lib/skipcash.js";
import { writeAudit } from "../lib/auditLog.js";
import { checkGatewayPayment } from "../lib/paymentLookup.js";
import { mailCustomer } from "../lib/mailer.js";

/** Money columns are whole dirhams (NFR-03). */
const cents = (v) => d(v);

const router = Router();
router.use(authMiddleware);
router.use(requireModule("orders", "view"));

const NEXT = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  // FR-38 / FR-39: staff can still cancel once the order has left or is waiting at the counter.
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  READY_FOR_PICKUP: ["COLLECTED", "CANCELLED"],
};

router.get("/", async (req, res) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.test(String(req.query.day || "")) ? String(req.query.day) : "";
  const q = String(req.query.q || "").trim();
  const review = req.query.review === "1";
  const rows = await prisma.sale.findMany({
    where: {
      orderChannel: "WEBSITE",
      branch: { organizationId: req.user.organizationId },
      ...(day ? { deliveryDate: new Date(`${day}T00:00:00.000Z`), fulfillment: "DELIVERY" } : {}),
      ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
      ...(review ? { paymentReview: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: { include: { product: { select: { name: true, nameEn: true, sellBy: true } }, variant: true } },
      deliveryWindow: true,
      deliveryArea: true,
      refunds: { select: { id: true, total: true, createdAt: true } },
      payments: { select: { id: true, kind: true, method: true, status: true, amount: true, reviewReason: true, createdAt: true } },
    },
  });
  res.json(toApi("Sale", rows));
});

router.post("/:id/dispatch", requireModule("orders", "edit"), async (req, res) => {
  const url = process.env.FLEETWIZ_API_URL?.trim();
  const key = process.env.FLEETWIZ_API_KEY?.trim();
  if (!url || !key) {
    return res.status(409).json({
      error: "FleetWiz is not connected. Mark the order out for delivery here until it is.",
      code: "FLEETWIZ_NOT_CONFIGURED",
    });
  }
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", fulfillment: "DELIVERY", branch: { organizationId: req.user.organizationId } },
    include: { customer: true, deliveryWindow: true },
  });
  if (!sale || !sale.webStatus || ["PENDING_PAYMENT", "CANCELLED"].includes(sale.webStatus)) {
    return res.status(400).json({ error: "Only a confirmed delivery can be sent" });
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: sale.id,
      phone: sale.customer?.phone || "",
      address: sale.deliveryAddress,
      lat: sale.deliveryLat != null ? Number(sale.deliveryLat) : null,
      lng: sale.deliveryLng != null ? Number(sale.deliveryLng) : null,
      window: sale.deliveryWindow?.label || "",
      total: riyals(sale.total),
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(502).json({ error: "FleetWiz did not accept the order" });
  const updated = await prisma.sale.update({
    where: { id: sale.id },
    data: {
      fleetwizReference: String(json.reference || json.id || sale.id),
      fleetwizStatus: String(json.status || "SENT"),
    },
  });
  res.json({ id: updated.id, fleetwizReference: updated.fleetwizReference, fleetwizStatus: updated.fleetwizStatus });
});

/**
 * FR-79: staff resolve a payment that could not confirm the order automatically
 * (wrong amount, late payment, stock changed, duplicate, or a refund due after a customer cancel).
 * accept=true keeps the money and confirms the order (taking stock again if the hold was released);
 * accept=false refunds the reviewed payment(s) through the gateway.
 */
/** FR-76: staff ask the gateway for a pending or reviewed order's payment; a paid result confirms through the webhook's path. */
router.post("/:id/check-payment", requireModule("orders", "edit"), async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", branch: { organizationId: req.user.organizationId } },
    select: { id: true, reference: true, branchId: true },
  });
  if (!sale) return res.status(404).json({ error: "Order not found" });
  try {
    const result = await checkGatewayPayment({ parentKind: "sale", parentId: sale.id, source: "staff", req, allowReview: true });
    if (!result.checked) return res.status(400).json({ error: "There is no gateway payment to check", ...result });
    await writeAudit({
      userId: req.user.sub,
      action: "PAYMENT_LOOKUP",
      entityType: "Sale",
      entityId: sale.id,
      branchId: sale.branchId,
      summary: `${sale.reference || sale.id} gateway ${result.gatewayStatus}: ${result.outcome}`,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.post("/:id/resolve-payment", requireModule("orders", "edit"), async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", paymentReview: true, branch: { organizationId: req.user.organizationId } },
    include: { refunds: true },
  });
  if (!sale) return res.status(404).json({ error: "No payment is waiting for review" });
  const accept = Boolean(req.body?.accept);
  try {
    if (sale.paymentReviewReason === "REFUND_DUE") {
      // Customer cancelled a paid order: refund what is left, or keep it (staff decision, audited).
      if (!accept) {
        const already = sale.refunds.reduce((sum, row) => sum + cents(row.total), 0);
        const left = cents(sale.amountPaid) - already;
        if (left > 0) await refundOrder({ sale, amount: left, userId: req.user.sub, note: "Refund after customer cancel" });
      }
      await prisma.sale.update({ where: { id: sale.id }, data: { paymentReview: false, paymentReviewReason: null } });
    } else if (accept) {
      await prisma.$transaction(async (tx) => {
        await lockParent(tx, "sale", sale.id);
        const current = await tx.sale.findUnique({ where: { id: sale.id } });
        if (!["PENDING_PAYMENT", "CANCELLED"].includes(current.webStatus)) {
          throw statusError("This order is already confirmed. Refund the extra payment instead.", 400);
        }
        const accepted = await acceptReviewPayments(tx, "sale", sale.id);
        if (accepted <= 0) throw statusError("No payment is waiting for review", 404);
        // Takes each HELD or released hold exactly once; stock never goes below zero.
        await recommitReleasedHolds(tx, current);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            webStatus: "CONFIRMED",
            paymentReview: false,
            paymentReviewReason: null,
            amountPaid: accepted,
            amountDue: Math.max(0, d(current.total) - accepted),
            invoiceStatus: "PAID",
            paidAt: new Date(),
          },
        });
      }, LOCK_TX);
    } else {
      await rejectReviewPayments({ parentKind: "sale", parentId: sale.id, userId: req.user.sub });
      await prisma.$transaction(async (tx) => {
        const moved = await tx.sale.updateMany({ where: { id: sale.id, webStatus: "PENDING_PAYMENT" }, data: { webStatus: "CANCELLED" } });
        if (moved.count) await releaseSaleHolds(tx, sale.id);
        await tx.sale.update({ where: { id: sale.id }, data: { paymentReview: false, paymentReviewReason: null } });
      });
    }
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message || "Could not resolve the payment" });
  }
  await writeAudit({ userId: req.user.sub, action: "PAYMENT_REVIEW", entityType: "Sale", entityId: sale.id, summary: `${sale.paymentReviewReason || "REVIEW"}: ${accept ? "accepted" : "refunded"}` });
  res.json({ id: sale.id, reference: sale.reference, accepted: accept });
});

/**
 * FR-77: refunds can never add up to more than was captured. The order row is locked while
 * the remaining amount is checked and the refund row is written; the gateway is called after
 * the lock is released and the row is removed again if the gateway refuses. amount is whole dirhams.
 */
async function refundOrder({ sale, amount, userId, restock, note }) {
  const refund = await prisma.$transaction(async (tx) => {
    await lockParent(tx, "sale", sale.id);
    const fresh = await tx.sale.findUnique({ where: { id: sale.id }, include: { refunds: true, items: true } });
    const already = fresh.refunds.reduce((sum, row) => sum + cents(row.total), 0);
    const remaining = cents(fresh.amountPaid) - already;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
      throw statusError(`Refund amount is not valid. ${fmt(Math.max(0, remaining))} QAR is left to refund.`, 400);
    }
    const full = amount === remaining;
    return tx.refund.create({
      data: {
        branchId: fresh.branchId,
        userId,
        saleId: fresh.id,
        total: amount,
        note: note || "SkipCash refund",
        ...(restock && full
          ? {
              items: {
                create: fresh.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                  ...(item.costAmount != null ? { costAmount: item.costAmount } : {}),
                })),
              },
            }
          : {}),
      },
      include: { items: true },
    });
  }, LOCK_TX);
  let gateway;
  try {
    gateway = await refundSkipcashPayment({ id: sale.gatewayPaymentId, amount });
  } catch (e) {
    await prisma.refundItem.deleteMany({ where: { refundId: refund.id } });
    await prisma.refund.delete({ where: { id: refund.id } });
    throw statusError(e.message || "SkipCash did not refund the payment", e.status || 502);
  }
  const done = await prisma.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: gateway.id } });
  if (restock && refund.items.length) {
    await prisma.$transaction((tx) => restoreCommittedHolds(tx, sale.id));
  }
  return done;
}

router.post("/:id/refund", requireModule("orders", "refund"), async (req, res) => {
  const amount = toDirhams(req.body?.amount, { allowZero: false }) ?? NaN;
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", branch: { organizationId: req.user.organizationId } },
    include: { customer: true },
  });
  // A paid order stays refundable after a cancel (FR-38, FR-77): what matters is money captured.
  if (!sale?.gatewayPaymentId || !(d(sale.amountPaid) > 0)) {
    return res.status(400).json({ error: "This order has no confirmed card payment" });
  }
  let refund;
  try {
    refund = await refundOrder({ sale, amount, userId: req.user.sub, restock: Boolean(req.body?.restock) });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message || "Refund failed" });
  }
  const refunds = await prisma.refund.findMany({ where: { saleId: sale.id }, select: { total: true } });
  if (refunds.reduce((sum, row) => sum + cents(row.total), 0) >= cents(sale.amountPaid)) {
    await prisma.sale.updateMany({ where: { id: sale.id, paymentReviewReason: "REFUND_DUE" }, data: { paymentReview: false, paymentReviewReason: null } });
  }
  await writeAudit({ userId: req.user.sub, action: "ONLINE_REFUND", entityType: "Refund", entityId: refund.id, summary: `${sale.reference || sale.id} ${fmt(amount)}` });
  await mailCustomer(sale.customer, "refund", { reference: sale.reference || sale.invoiceNumber || sale.id.slice(-8).toUpperCase(), amount: fmt(amount) });
  res.status(201).json(toApi("Refund", refund));
});

router.post("/:id/status", requireModule("orders", "edit"), async (req, res) => {
  const next = String(req.body?.status || "").toUpperCase();
  try {
    const sale = await prisma.$transaction(async (tx) => {
      const row = await tx.sale.findFirst({
        where: { id: req.params.id, orderChannel: "WEBSITE", branch: { organizationId: req.user.organizationId } },
      });
      if (!row?.webStatus) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }
      const allowed = NEXT[row.webStatus] || [];
      if (!allowed.includes(next)) {
        const err = new Error("That status change is not allowed");
        err.status = 400;
        throw err;
      }
      if (next === "OUT_FOR_DELIVERY" && row.fulfillment !== "DELIVERY") {
        const err = new Error("Pickup orders become ready for pickup");
        err.status = 400;
        throw err;
      }
      if (next === "READY_FOR_PICKUP" && row.fulfillment !== "PICKUP") {
        const err = new Error("Delivery orders go out for delivery");
        err.status = 400;
        throw err;
      }
      // Guarded transition: of several parallel changes (or instances) only one applies.
      const moved = await tx.sale.updateMany({
        where: { id: row.id, webStatus: row.webStatus },
        data: {
          webStatus: next,
          ...(next === "CANCELLED" ? { invoiceStatus: "CANCELLED" } : {}),
          ...(next === "CANCELLED" && d(row.amountPaid) > 0 ? { paymentReview: true, paymentReviewReason: "REFUND_DUE" } : {}),
        },
      });
      if (!moved.count) {
        const err = new Error("The order changed. Refresh and try again.");
        err.status = 409;
        throw err;
      }
      if (next === "CANCELLED") await restoreCommittedHolds(tx, row.id);
      return tx.sale.findUnique({ where: { id: row.id } });
    });
    await writeAudit({
      userId: req.user.sub,
      action: "ORDER_STATUS",
      entityType: "Sale",
      entityId: sale.id,
      summary: sale.webStatus,
    });
    if (sale.customerId) {
      const buyer = await prisma.customer.findUnique({ where: { id: sale.customerId } });
      await mailCustomer(buyer, "order", { reference: sale.reference || sale.invoiceNumber || sale.id.slice(-8).toUpperCase(), status: sale.webStatus });
    }
    res.json({ id: sale.id, status: sale.webStatus });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not update the order" });
  }
});

export default router;
