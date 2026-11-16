import { Router } from "express";
import { writeAudit } from "../lib/auditLog.js";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requirePermission, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { dec, money, parseMoney } from "../lib/money.js";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission("purchases"));

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

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const supplierId = String(req.body?.supplierId || "");
  const branchId = String(req.body?.branchId || req.user.branchId || "");
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: req.user.organizationId, isActive: true },
  });
  const branch = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!supplier) return res.status(400).json({ error: "Choose an active supplier" });
  if (!branch) return res.status(400).json({ error: "Choose the location that will receive the goods" });
  if (!lines.length) return res.status(400).json({ error: "Add at least one line" });
  const prepared = [];
  for (const line of lines) {
    const product = await prisma.product.findFirst({
      where: { id: String(line.productId || ""), organizationId: req.user.organizationId },
    });
    if (!product) return res.status(400).json({ error: "A line product was not found" });
    const qty = Math.floor(Number(line.quantity) || 0);
    const cost = Number(line.unitCost);
    if (qty < 1 || !Number.isFinite(cost) || cost < 0) {
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

router.post("/:id/send", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "DRAFT") return res.status(400).json({ error: "Only a draft can be sent" });
  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "SENT" },
    include,
  });
  res.json(updated);
});

router.post("/:id/cancel", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED") {
    return res.status(400).json({ error: "A received order cannot be cancelled" });
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
    include,
  });
  res.json(updated);
});

router.post("/:id/receive", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const orgId = req.user.organizationId;
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    include: { lines: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!["SENT", "PARTIALLY_RECEIVED"].includes(order.status)) {
    return res.status(400).json({ error: "Send the order before receiving goods" });
  }
  const requested = new Map(
    (Array.isArray(req.body?.lines) ? req.body.lines : []).map((line) => [String(line.id), Math.floor(Number(line.quantity) || 0)])
  );
  try {
    const result = await prisma.$transaction(async (tx) => {
      let receivedCost = new Prisma.Decimal(0);
      let anyLeft = false;
      for (const line of order.lines) {
        const remaining = line.quantity - line.quantityReceived;
        const qty = requested.has(line.id) ? requested.get(line.id) : remaining;
        if (qty < 0 || qty > remaining) {
          const err = new Error("A receipt cannot take more than the quantity still on order");
          err.status = 400;
          throw err;
        }
        if (qty === 0) {
          if (remaining > 0) anyLeft = true;
          continue;
        }
        const cost = line.unitCost;
        receivedCost = receivedCost.add(cost.mul(qty));
        if (line.variantId) {
          const stock = await tx.variantStock.findUnique({
            where: { variantId_branchId: { variantId: line.variantId, branchId: order.branchId } },
          });
          const oldQty = stock?.quantity ?? 0;
          const oldCost = stock?.unitCost != null ? Number(stock.unitCost) : Number(cost);
          const nextQty = oldQty + qty;
          const unitCost = new Prisma.Decimal(((oldQty * oldCost + qty * Number(cost)) / nextQty).toFixed(2));
          await tx.variantStock.upsert({
            where: { variantId_branchId: { variantId: line.variantId, branchId: order.branchId } },
            create: { variantId: line.variantId, branchId: order.branchId, quantity: qty, unitCost: cost, minStockLevel: 5 },
            update: { quantity: { increment: qty }, unitCost },
          });
        } else {
          const stock = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: line.productId, branchId: order.branchId } },
          });
          const oldQty = stock?.quantity ?? 0;
          const oldCost = stock?.unitCost != null ? Number(stock.unitCost) : Number(cost);
          const nextQty = oldQty + qty;
          const unitCost = new Prisma.Decimal(((oldQty * oldCost + qty * Number(cost)) / nextQty).toFixed(2));
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: line.productId, branchId: order.branchId } },
            create: { productId: line.productId, branchId: order.branchId, quantity: qty, unitCost: cost, minStockLevel: 5 },
            update: { quantity: { increment: qty }, unitCost },
          });
        }
        await tx.stockMovement.create({
          data: {
            organizationId: orgId,
            productId: line.productId,
            variantId: line.variantId,
            branchId: order.branchId,
            quantityDelta: qty,
            reason: "RECEIPT",
            note: order.id,
            userId: req.user.sub,
          },
        });
        const nextReceived = line.quantityReceived + qty;
        if (nextReceived < line.quantity) anyLeft = true;
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: nextReceived },
        });
      }
      if (receivedCost.lte(0)) {
        const err = new Error("Enter a quantity to receive");
        err.status = 400;
        throw err;
      }
      const bill = await tx.supplierBill.create({
        data: {
          organizationId: orgId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          amount: receivedCost,
        },
      });
      const updated = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: anyLeft ? "PARTIALLY_RECEIVED" : "RECEIVED" },
        include,
      });
      return { order: updated, bill };
    });
    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_RECEIPT",
      entityType: "PurchaseOrder",
      entityId: result.order.id,
      summary: result.order.status,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not receive" });
  }
});

const AGE_BUCKETS = [
  { key: "0-30", min: 0, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61-90", min: 61, max: 90 },
  { key: "90+", min: 91, max: Infinity },
];
const DAY_MS = 24 * 60 * 60 * 1000;

function billView(bill, now = new Date()) {
  const owed = dec(bill.amount).minus(dec(bill.amountPaid));
  const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(bill.createdAt).getTime()) / DAY_MS));
  const bucket = AGE_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max)?.key || "90+";
  return { ...bill, owed: money(owed), ageDays, ageBucket: bucket };
}

/** FR-104: bills with amount, paid and owed. Filters: supplierId, open=1, age=0-30|31-60|61-90|90+. */
router.get("/bills", async (req, res) => {
  const open = ["1", "true", "yes"].includes(String(req.query.open || "").toLowerCase());
  const age = AGE_BUCKETS.some((b) => b.key === String(req.query.age || "")) ? String(req.query.age) : "";
  const rows = await prisma.supplierBill.findMany({
    where: {
      organizationId: req.user.organizationId,
      ...(req.query.supplierId ? { supplierId: String(req.query.supplierId) } : {}),
      ...(open ? { status: { in: ["OPEN", "PARTIAL"] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true } }, payments: { orderBy: { paidAt: "desc" } }, purchaseOrder: { select: { id: true, status: true } } },
  });
  const now = new Date();
  res.json(rows.map((bill) => billView(bill, now)).filter((bill) => !age || bill.ageBucket === age));
});

/** FR-104: what is still owed, per supplier and by age. */
router.get("/bills/aging", async (req, res) => {
  const rows = await prisma.supplierBill.findMany({
    where: { organizationId: req.user.organizationId, status: { in: ["OPEN", "PARTIAL"] } },
    include: { supplier: { select: { id: true, name: true } } },
  });
  const now = new Date();
  const bySupplier = new Map();
  const totals = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, dec(0)]));
  let grand = dec(0);
  for (const bill of rows) {
    const view = billView(bill, now);
    const owed = dec(bill.amount).minus(dec(bill.amountPaid));
    const entry = bySupplier.get(bill.supplierId) || {
      supplierId: bill.supplierId,
      supplier: bill.supplier?.name || "",
      bills: 0,
      buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, dec(0)])),
      owed: dec(0),
    };
    entry.bills += 1;
    entry.buckets[view.ageBucket] = entry.buckets[view.ageBucket].plus(owed);
    entry.owed = entry.owed.plus(owed);
    bySupplier.set(bill.supplierId, entry);
    totals[view.ageBucket] = totals[view.ageBucket].plus(owed);
    grand = grand.plus(owed);
  }
  const suppliers = [...bySupplier.values()]
    .map((entry) => ({
      ...entry,
      owed: money(entry.owed),
      buckets: Object.fromEntries(Object.entries(entry.buckets).map(([k, v]) => [k, money(v)])),
    }))
    .sort((a, b) => b.owed - a.owed);
  res.json({
    buckets: AGE_BUCKETS.map((b) => b.key),
    suppliers,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, money(v)])),
    owed: money(grand),
  });
});

router.post("/bills/:id/payments", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const amount = parseMoney(req.body?.amount, { allowZero: false });
  const method = String(req.body?.method || "").toUpperCase();
  if (!amount) {
    return res.status(400).json({ error: "Enter a payment amount (at most 2 decimals)", errorAr: "أدخل مبلغ الدفعة (منزلتان عشريتان كحد أقصى)", errorEn: "Enter a payment amount (at most 2 decimals)" });
  }
  if (!["CASH", "BANK"].includes(method)) {
    return res.status(400).json({ error: "Choose cash or bank", errorAr: "اختر الدفع نقداً أو من البنك", errorEn: "Choose cash or bank" });
  }
  try {
    const bill = await prisma.$transaction(async (tx) => {
      // Lock the bill row so parallel payments cannot both pass the balance check.
      await tx.$queryRaw`SELECT "id" FROM "SupplierBill" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const row = await tx.supplierBill.findFirst({
        where: { id: req.params.id, organizationId: req.user.organizationId },
      });
      if (!row) {
        const err = new Error("Bill not found");
        err.status = 404;
        err.errorAr = "الفاتورة غير موجودة";
        throw err;
      }
      const balance = dec(row.amount).minus(dec(row.amountPaid));
      if (amount.greaterThan(balance)) {
        const err = new Error("A payment cannot be larger than the balance");
        err.status = 400;
        err.errorAr = "لا يمكن أن تزيد الدفعة عن الرصيد المتبقي";
        throw err;
      }
      await tx.supplierPayment.create({
        data: {
          billId: row.id,
          amount,
          method,
          userId: req.user.sub,
          note: req.body?.note ? String(req.body.note).trim().slice(0, 500) : null,
        },
      });
      const amountPaid = dec(row.amountPaid).plus(amount);
      const status = amountPaid.greaterThanOrEqualTo(dec(row.amount)) ? "PAID" : "PARTIAL";
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
      summary: `${amount.toFixed(2)} ${method} → ${String(bill.amountPaid)}`,
    });
    res.json(billView(bill));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not record the payment", errorEn: e.message, errorAr: e.errorAr });
  }
});

export default router;
