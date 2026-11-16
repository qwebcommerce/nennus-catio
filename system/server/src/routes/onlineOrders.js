import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { commitSaleHolds, releaseSaleHolds, restoreCommittedHolds } from "../lib/webOrder.js";
import { refundSkipcashPayment } from "../lib/skipcash.js";
import { writeAudit } from "../lib/auditLog.js";
import { mailCustomer } from "../lib/mailer.js";
import { Prisma } from "../lib/prisma-client-bundle.js";

const router = Router();
router.use(authMiddleware);

const NEXT = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  READY_FOR_PICKUP: ["COLLECTED"],
};

router.get("/", requireRole("ADMIN", "MANAGER", "CASHIER"), async (req, res) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.test(String(req.query.day || "")) ? String(req.query.day) : "";
  const rows = await prisma.sale.findMany({
    where: {
      orderChannel: "WEBSITE",
      branch: { organizationId: req.user.organizationId },
      ...(day ? { deliveryDate: new Date(`${day}T00:00:00.000Z`), fulfillment: "DELIVERY" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: { include: { product: { select: { name: true, nameEn: true, sellBy: true } }, variant: true } },
      deliveryWindow: true,
      deliveryArea: true,
    },
  });
  res.json(rows);
});

router.post("/:id/dispatch", requireRole("ADMIN", "MANAGER", "CASHIER"), async (req, res) => {
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
      total: Number(sale.total),
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

router.post("/:id/resolve-payment", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", paymentReview: true, branch: { organizationId: req.user.organizationId } },
  });
  if (!sale || sale.webStatus !== "PENDING_PAYMENT") return res.status(404).json({ error: "No payment is waiting for review" });
  if (req.body?.accept) {
    await prisma.$transaction(async (tx) => {
      await commitSaleHolds(tx, sale);
      await tx.sale.update({
        where: { id: sale.id },
        data: { webStatus: "CONFIRMED", paymentReview: false, amountPaid: sale.total, amountDue: 0, invoiceStatus: "PAID", paidAt: new Date() },
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await releaseSaleHolds(tx, sale.id);
      await tx.sale.update({ where: { id: sale.id }, data: { webStatus: "CANCELLED", paymentReview: false } });
    });
  }
  await writeAudit({ userId: req.user.sub, action: "PAYMENT_REVIEW", entityType: "Sale", entityId: sale.id, summary: req.body?.accept ? "accepted" : "rejected" });
  res.json({ id: sale.id, accepted: Boolean(req.body?.accept) });
});

router.post("/:id/refund", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const amount = Number(req.body?.amount);
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, orderChannel: "WEBSITE", branch: { organizationId: req.user.organizationId } },
    include: { refunds: true, customer: true, items: true },
  });
  if (!sale?.gatewayPaymentId || sale.webStatus === "PENDING_PAYMENT" || sale.webStatus === "CANCELLED") {
    return res.status(400).json({ error: "This order has no confirmed card payment" });
  }
  const already = sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0);
  const remaining = Number(sale.total) - already;
  if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) {
    return res.status(400).json({ error: "Refund amount is not valid" });
  }
  const gateway = await refundSkipcashPayment({ id: sale.gatewayPaymentId, amount });
  const refund = await prisma.refund.create({
    data: {
      branchId: sale.branchId,
      userId: req.user.sub,
      saleId: sale.id,
      total: new Prisma.Decimal(amount.toFixed(2)),
      gatewayRefundId: gateway.id,
      note: "SkipCash refund",
      ...(req.body?.restock && Math.abs(amount - remaining) < 0.05
        ? {
            items: {
              create: sale.items.map((item) => ({
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
  });
  if (req.body?.restock && Math.abs(amount - remaining) < 0.05) {
    await prisma.$transaction((tx) => restoreCommittedHolds(tx, sale.id));
  }
  await writeAudit({ userId: req.user.sub, action: "ONLINE_REFUND", entityType: "Refund", entityId: refund.id, summary: amount.toFixed(2) });
  await mailCustomer(sale.customer, "refund", { reference: sale.invoiceNumber || sale.id.slice(-8).toUpperCase(), amount });
  res.status(201).json(refund);
});

router.post("/:id/status", requireRole("ADMIN", "MANAGER", "CASHIER"), async (req, res) => {
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
      if (next === "CANCELLED") await restoreCommittedHolds(tx, row.id);
      return tx.sale.update({
        where: { id: row.id },
        data: {
          webStatus: next,
          ...(next === "CANCELLED" ? { invoiceStatus: "CANCELLED" } : {}),
        },
      });
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
      await mailCustomer(buyer, "order", { reference: sale.invoiceNumber || sale.id.slice(-8).toUpperCase(), status: sale.webStatus });
    }
    res.json({ id: sale.id, status: sale.webStatus });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not update the order" });
  }
});

export default router;
