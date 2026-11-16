import { Router } from "express";
import { writeAudit } from "../lib/auditLog.js";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { receivePurchaseOrderTx } from "../lib/purchaseReceive.js";
import { dec, money, parseMoney } from "../lib/money.js";

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

router.post("/bills/:id/payments", requireModule("purchasing", "create"), async (req, res) => {
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
