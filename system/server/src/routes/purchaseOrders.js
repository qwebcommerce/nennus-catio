import { Router } from "express";
import { writeAudit } from "../lib/auditLog.js";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { receivePurchaseOrderTx } from "../lib/purchaseReceive.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("purchasing", "view"));

const include = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, nameEn: true } },
  lines: true,
  bills: { include: { payments: true } },
};

router.get("/", async (req, res) => {
  const rows = await prisma.purchaseOrder.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include,
  });
  res.json(rows);
});

router.post("/", requireModule("purchasing", "create"), async (req, res) => {
  const supplierId = String(req.body?.supplierId || "");
  const branchId = String(req.body?.branchId || req.user.branchId || "");
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: req.user.organizationId, isActive: true },
  });
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId: req.user.organizationId },
    select: { id: true, isActive: true },
  });
  if (!supplier) return res.status(400).json({ error: "Choose an active supplier" });
  if (!branch) return res.status(400).json({ error: "Choose the location that will receive the goods" });
  if (branch.isActive === false) {
    return res.status(400).json({
      error: "An inactive location cannot receive goods",
      errorAr: "لا يمكن طلب بضاعة إلى موقع غير نشط",
      errorEn: "An inactive location cannot receive goods",
    });
  }
  if (!lines.length) return res.status(400).json({ error: "Add at least one line" });
  const prepared = [];
  for (const line of lines) {
    const product = await prisma.product.findFirst({
      where: { id: String(line.productId || ""), organizationId: req.user.organizationId },
    });
    if (!product) return res.status(400).json({ error: "A line product was not found" });
    const qty = Number(line.quantity);
    const cost = Number(line.unitCost);
    if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: "Each line needs a quantity and a unit cost" });
    }
    let variantId = null;
    if (line.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: String(line.variantId), productId: product.id, organizationId: req.user.organizationId },
      });
      if (!variant) return res.status(400).json({ error: "A line variant was not found" });
      variantId = variant.id;
    }
    prepared.push({
      productId: product.id,
      variantId,
      quantity: qty,
      unitCost: new Prisma.Decimal(cost.toFixed(2)),
    });
  }
  const order = await prisma.purchaseOrder.create({
    data: {
      organizationId: req.user.organizationId,
      supplierId: supplier.id,
      branchId,
      userId: req.user.sub,
      note: req.body?.note ? String(req.body.note).trim() : null,
      lines: { create: prepared },
    },
    include,
  });
  res.status(201).json(order);
});

router.post("/:id/send", requireModule("purchasing", "edit"), async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "DRAFT") return res.status(400).json({ error: "Only a draft can be sent" });
  const moved = await prisma.purchaseOrder.updateMany({
    where: { id: order.id, status: "DRAFT" },
    data: { status: "SENT" },
  });
  if (moved.count !== 1) return res.status(400).json({ error: "Only a draft can be sent" });
  res.json(await prisma.purchaseOrder.findUnique({ where: { id: order.id }, include }));
});

router.post("/:id/cancel", requireModule("purchasing", "edit"), async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  // Only a draft or a sent order with nothing received can be cancelled (checked again in the update).
  const moved = await prisma.purchaseOrder.updateMany({
    where: { id: order.id, status: { in: ["DRAFT", "SENT"] } },
    data: { status: "CANCELLED" },
  });
  if (moved.count !== 1) {
    return res.status(400).json({
      error: order.status === "CANCELLED" ? "The order is already cancelled" : "A received order cannot be cancelled",
    });
  }
  res.json(await prisma.purchaseOrder.findUnique({ where: { id: order.id }, include }));
});

router.post("/:id/receive", requireModule("purchasing", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const requested = new Map();
  for (const line of lines) {
    const qty = Number(line?.quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: "Each received quantity must be a whole number" });
    }
    requested.set(String(line?.id), qty);
  }
  try {
    const result = await prisma.$transaction(
      (tx) =>
        receivePurchaseOrderTx(tx, {
          orgId,
          userId: req.user.sub,
          orderId: String(req.params.id),
          requested: requested.size ? requested : null,
        }),
      { maxWait: 15000, timeout: 60000 },
    );
    const order = await prisma.purchaseOrder.findUnique({ where: { id: result.orderId }, include });
    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_RECEIPT",
      entityType: "PurchaseOrder",
      entityId: order.id,
      branchId: order.branchId,
      summary: `${order.status}: bill ${result.bill.amount}`,
      meta: { billId: result.bill.id, received: result.received },
    });
    res.json({ order, bill: result.bill });
  } catch (e) {
    res.status(e.status || 400).json({
      error: e.message || "Could not receive",
      ...(e?.errorEn ? { errorAr: e.errorAr, errorEn: e.errorEn } : {}),
    });
  }
});

router.get("/bills", async (req, res) => {
  const rows = await prisma.supplierBill.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true } }, payments: true, purchaseOrder: { select: { id: true, status: true } } },
  });
  res.json(rows);
});

router.post("/bills/:id/payments", requireModule("purchasing", "create"), async (req, res) => {
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  const method = String(req.body?.method || "").toUpperCase() === "BANK" ? "BANK" : "CASH";
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Enter a payment amount" });
  try {
    const bill = await prisma.$transaction(async (tx) => {
      // Lock the bill so parallel payments cannot pay more than the balance.
      await tx.$queryRaw`SELECT id FROM "SupplierBill" WHERE id = ${String(req.params.id)} FOR UPDATE`;
      const row = await tx.supplierBill.findFirst({
        where: { id: req.params.id, organizationId: req.user.organizationId },
      });
      if (!row) {
        const err = new Error("Bill not found");
        err.status = 404;
        throw err;
      }
      const balance = Number(row.amount) - Number(row.amountPaid);
      if (amount - balance > 0.001) {
        const err = new Error("A payment cannot be larger than the balance");
        err.status = 400;
        throw err;
      }
      await tx.supplierPayment.create({
        data: {
          billId: row.id,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          method,
          userId: req.user.sub,
          note: req.body?.note ? String(req.body.note).trim() : null,
        },
      });
      const amountPaid = new Prisma.Decimal((Number(row.amountPaid) + amount).toFixed(2));
      const status = Number(amountPaid) + 0.001 >= Number(row.amount) ? "PAID" : "PARTIAL";
      return tx.supplierBill.update({
        where: { id: row.id },
        data: { amountPaid, status },
        include: { payments: true, supplier: { select: { id: true, name: true } } },
      });
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SUPPLIER_PAYMENT",
      entityType: "SupplierBill",
      entityId: bill.id,
      summary: String(bill.amountPaid),
    });
    res.json(bill);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not record the payment" });
  }
});

export default router;
