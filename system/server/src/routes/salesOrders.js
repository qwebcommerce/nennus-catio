import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { d, fmt, lineAmount, toDirhams } from "../lib/money.js";
import { fail, optText } from "../lib/bizError.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { moveStock } from "../lib/stockLedger.js";
import { stockRowKey } from "../lib/dbErrors.js";
import { heldQuantity } from "../lib/webOrder.js";
import { checkProof } from "../lib/businessFiles.js";
import { deliverSalesOrder } from "../lib/salesOrderDelivery.js";
import { qatarDayKey, qatarDayStart } from "../lib/qatarTime.js";
import {
  OPEN_STATUSES,
  SO_INCLUDE,
  SO_PAY_METHODS,
  allocatePaid,
  buildPlan,
  deliveryRevenue,
  loadOrder,
  lockOrder,
  orderFields,
  prepareLines,
  priceOrder,
  settledStatus,
  soView,
} from "../lib/salesOrders.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("salesOrders", "view"));

const TX = { maxWait: 10000, timeout: 30000 };

async function rightsOf(req) {
  return {
    editPrice: await hasModule(req, "salesOrders", "edit"),
    giveFree: await hasModule(req, "complimentary", "create"),
  };
}

async function checkCustomerAndBranch(orgId, customerId, branchId) {
  const customer = await prisma.customer.findFirst({ where: { id: String(customerId || ""), organizationId: orgId }, select: { id: true } });
  if (!customer) throw fail(400, "SO_CUSTOMER_REQUIRED", "اختر عميلاً للطلب", "Choose the customer for the order");
  const branch = await prisma.branch.findFirst({ where: { id: String(branchId || ""), organizationId: orgId }, select: { id: true, isActive: true } });
  if (!branch || branch.isActive === false) throw fail(400, "SO_BRANCH_REQUIRED", "اختر موقع البيع (موقع نشط)", "Choose an active selling location");
  return { customer, branch };
}

function freeReasonCheck(lines, freeReason) {
  if (lines.some((l) => l.isFree) && !freeReason) {
    throw fail(400, "FREE_REASON_REQUIRED", "اكتب سبب إعطاء البضاعة مجاناً", "Enter the reason the goods are given free");
  }
}

function lineRows(lines) {
  return lines.map(({ sellBy, ...l }) => l);
}

/** Stock at the order's location for each line still to deliver (warning only; nothing is reserved). */
async function stockCheck(db, order) {
  const out = [];
  for (const line of order.lines) {
    const pending = line.quantity - line.quantityDelivered;
    if (pending <= 0) continue;
    const row = line.variantId
      ? await db.variantStock.findUnique({ where: { variantId_branchId: { variantId: line.variantId, branchId: order.branchId } } })
      : await db.inventory.findUnique({ where: { productId_branchId: { productId: line.productId, branchId: order.branchId } } });
    const held = await heldQuantity(db, { branchId: order.branchId, productId: line.productId, variantId: line.variantId });
    const available = Math.max(0, (row?.quantity || 0) - held);
    out.push({ lineId: line.id, productId: line.productId, variantId: line.variantId, pending, available, short: Math.max(0, pending - available) });
  }
  return out;
}

// ------------------------------------------------------------------ list / read

router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const where = { organizationId: orgId };
  const status = String(req.query.status || "").toUpperCase();
  if (["DRAFT", "CONFIRMED", "PARTLY_DELIVERED", "DELIVERED", "COMPLETED", "CANCELLED"].includes(status)) where.status = status;
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  const q = String(req.query.q || "").trim();
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  const rows = await prisma.salesOrder.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: SO_INCLUDE });
  let list = rows.map((o) => soView(o));
  if (String(req.query.overdue || "") === "1") list = list.filter((o) => o.overdue);
  res.json(list);
});

router.get("/:id", async (req, res) => {
  const order = await loadOrder(prisma, req.user.organizationId, req.params.id);
  res.json({ ...soView(order), stock: await stockCheck(prisma, order) });
});

// ------------------------------------------------------------------ create / edit

router.post("/", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  await checkCustomerAndBranch(orgId, body.customerId, body.branchId);
  const fields = orderFields(body);
  const lines = await prepareLines(prisma, orgId, body.lines, await rightsOf(req));
  freeReasonCheck(lines, fields.freeReason);
  const totals = priceOrder(lines, body.discountAmount);
  const plan = buildPlan(totals.total, body.plan, { termsDays: fields.paymentTermsDays });
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.salesOrder.create({
      data: {
        organizationId: orgId,
        customerId: String(body.customerId),
        branchId: String(body.branchId),
        userId: req.user.sub,
        ...fields,
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        total: totals.total,
        lines: { create: lineRows(lines) },
        installments: { create: plan },
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_CREATE",
      entityType: "SalesOrder",
      entityId: created.id,
      branchId: created.branchId,
      summary: `${created.reference} total ${fmt(created.total)}`,
      meta: { lines: lines.length, freeLines: lines.filter((l) => l.isFree).length, freeReason: fields.freeReason, installments: plan.length },
    }, tx);
    return created;
  }, TX);
  res.status(201).json(soView(await loadOrder(prisma, orgId, order.id)));
});

/** PUT /:id — replace a draft (lines, plan, fields). NFR-13: version required. */
router.put("/:id", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const body = req.body || {};
  const existing = await loadOrder(prisma, orgId, req.params.id);
  assertVersion(existing, version);
  if (existing.status !== "DRAFT") throw fail(400, "SO_NOT_DRAFT", "يمكن تعديل الأسطر في المسودة فقط", "Lines can be changed on a draft only");
  await checkCustomerAndBranch(orgId, body.customerId, body.branchId);
  const fields = orderFields(body);
  const lines = await prepareLines(prisma, orgId, body.lines, await rightsOf(req), existing.lines);
  freeReasonCheck(lines, fields.freeReason);
  const totals = priceOrder(lines, body.discountAmount);
  const plan = buildPlan(totals.total, body.plan, { termsDays: fields.paymentTermsDays });
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "salesOrder", {
      id: existing.id,
      version,
      where: { status: "DRAFT" },
      data: {
        customerId: String(body.customerId),
        branchId: String(body.branchId),
        ...fields,
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        total: totals.total,
      },
    });
    await tx.salesOrderLine.deleteMany({ where: { orderId: existing.id } });
    await tx.salesOrderInstallment.deleteMany({ where: { orderId: existing.id } });
    await tx.salesOrderLine.createMany({ data: lineRows(lines).map((l) => ({ ...l, orderId: existing.id })) });
    if (plan.length) await tx.salesOrderInstallment.createMany({ data: plan.map((p) => ({ ...p, orderId: existing.id })) });
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_EDIT",
      entityType: "SalesOrder",
      entityId: existing.id,
      branchId: String(body.branchId),
      summary: `${existing.reference} total ${fmt(totals.total)}`,
      meta: { freeReason: fields.freeReason, freeLines: lines.filter((l) => l.isFree).length },
    }, tx);
  }, TX);
  res.json(soView(await loadOrder(prisma, orgId, existing.id)));
});

/** PATCH /:id — delivery date, note, terms; the plan too while nothing has been paid. */
router.patch("/:id", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const existing = await loadOrder(prisma, orgId, req.params.id);
  assertVersion(existing, version);
  if (["CANCELLED", "COMPLETED"].includes(existing.status)) throw fail(400, "SO_CLOSED", "الطلب مغلق", "This order is closed");
  const body = req.body || {};
  const data = {};
  const fields = orderFields({ ...existing, deliveryDate: existing.deliveryDate ? existing.deliveryDate.toISOString().slice(0, 10) : null, ...body });
  for (const key of ["deliveryDate", "note", "paymentTerms", "paymentTermsDays"]) if (key in body) data[key] = fields[key];
  let plan = null;
  if (Array.isArray(body.plan)) {
    if (d(existing.amountPaid) > 0) throw fail(400, "SO_PLAN_LOCKED", "لا يمكن تغيير خطة الدفع بعد تسجيل دفعة", "The payment plan cannot change after a payment was recorded");
    plan = buildPlan(d(existing.total), body.plan, { termsDays: fields.paymentTermsDays });
  }
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "salesOrder", { id: existing.id, version, data, where: { status: existing.status } });
    if (plan) {
      await tx.salesOrderInstallment.deleteMany({ where: { orderId: existing.id } });
      if (plan.length) await tx.salesOrderInstallment.createMany({ data: plan.map((p) => ({ ...p, orderId: existing.id })) });
    }
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_EDIT",
      entityType: "SalesOrder",
      entityId: existing.id,
      branchId: existing.branchId,
      summary: `${existing.reference}: ${Object.keys(data).concat(plan ? ["plan"] : []).join(", ")}`,
    }, tx);
  }, TX);
  res.json(soView(await loadOrder(prisma, orgId, existing.id)));
});

router.post("/:id/confirm", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const existing = await loadOrder(prisma, orgId, req.params.id);
  assertVersion(existing, version);
  if (existing.status !== "DRAFT") throw fail(400, "SO_NOT_DRAFT", "يمكن تأكيد المسودة فقط", "Only a draft can be confirmed");
  if (!existing.lines.length) throw fail(400, "SO_LINES_REQUIRED", "أضف سطراً واحداً على الأقل", "Add at least one line");
  freeReasonCheck(existing.lines, existing.freeReason);
  const planSum = existing.installments.reduce((s, i) => s + d(i.amount), 0);
  if (planSum !== d(existing.total)) throw fail(400, "SO_PLAN_SUM", "مجموع الدفعات يجب أن يساوي إجمالي الطلب", "The installments must add up to the order total");
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "salesOrder", {
      id: existing.id,
      version,
      where: { status: "DRAFT" },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_CONFIRM",
      entityType: "SalesOrder",
      entityId: existing.id,
      branchId: existing.branchId,
      summary: `${existing.reference} confirmed, total ${fmt(existing.total)}`,
    }, tx);
  }, TX);
  const order = await loadOrder(prisma, orgId, existing.id);
  const stock = await stockCheck(prisma, order);
  res.json({ ...soView(order), stock, stockShort: stock.some((s) => s.short > 0) });
});

router.post("/:id/cancel", requireModule("salesOrders", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const reason = optText(req.body?.reason, 300);
  if (!reason) throw fail(400, "REASON_REQUIRED", "اكتب سبب الإلغاء", "Enter the reason for cancelling");
  const existing = await loadOrder(prisma, orgId, req.params.id);
  assertVersion(existing, version);
  if (!["DRAFT", "CONFIRMED"].includes(existing.status) || existing.lines.some((l) => l.quantityDelivered > 0)) {
    throw fail(400, "SO_CANNOT_CANCEL", "لا يمكن إلغاء طلب تم تسليم جزء منه", "An order with delivered goods cannot be cancelled");
  }
  if (d(existing.amountPaid) > 0) {
    throw fail(400, "SO_PAID_CANNOT_CANCEL", "لا يمكن إلغاء طلب عليه دفعات مسجلة", "An order with recorded payments cannot be cancelled");
  }
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "salesOrder", {
      id: existing.id,
      version,
      where: { status: { in: ["DRAFT", "CONFIRMED"] }, amountPaid: 0 },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_CANCEL",
      entityType: "SalesOrder",
      entityId: existing.id,
      branchId: existing.branchId,
      summary: `${existing.reference} cancelled: ${reason}`,
    }, tx);
  }, TX);
  res.json(soView(await loadOrder(prisma, orgId, existing.id)));
});

// ------------------------------------------------------------------ payments

/** Payment date: today (now) or an earlier Qatar day (noon that day). Never in the future. */
function paidAtFrom(raw) {
  if (raw == null || String(raw).trim() === "") return new Date();
  const day = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
  const today = qatarDayKey();
  if (day > today) throw fail(400, "PAYMENT_DATE_FUTURE", "لا يمكن تسجيل دفعة بتاريخ لاحق", "A payment cannot be dated in the future");
  if (day === today) return new Date();
  return new Date(qatarDayStart(day).getTime() + 12 * 3600 * 1000);
}

router.post("/:id/payments", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const amount = toDirhams(body.amount, { allowZero: false });
  if (amount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
  const method = String(body.method || "").toUpperCase();
  if (!SO_PAY_METHODS.includes(method)) throw fail(400, "PAYMENT_METHOD_INVALID", "طريقة الدفع غير معروفة", "Unknown payment method");
  const paidAt = paidAtFrom(body.paidAt);
  const reference = optText(body.reference, 120);
  const existing = await loadOrder(prisma, orgId, req.params.id);
  if (!OPEN_STATUSES.includes(existing.status)) {
    throw fail(400, "SO_NOT_OPEN", "سجّل الدفعات على طلب مؤكد فقط", "Record payments on a confirmed, open order");
  }
  if (method === "CASH") {
    const branch = await prisma.branch.findUnique({ where: { id: existing.branchId }, select: { kind: true } });
    if (branch?.kind !== "WAREHOUSE") {
      const session = await prisma.cashSession.findFirst({ where: { branchId: existing.branchId, closedAt: null }, select: { id: true } });
      if (!session) throw fail(400, "CASH_SESSION_REQUIRED", "لا توجد جلسة صندوق مفتوحة في موقع الطلب — افتح الصندوق لاستلام النقد", "No till session is open at the order's location. Open the till to take cash.");
    }
  }
  const payment = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orgId, existing.id);
    const order = await tx.salesOrder.findUnique({ where: { id: existing.id }, include: { installments: true, lines: true } });
    if (!OPEN_STATUSES.includes(order.status)) throw fail(400, "SO_NOT_OPEN", "سجّل الدفعات على طلب مؤكد فقط", "Record payments on a confirmed, open order");
    const balance = d(order.total) - d(order.amountPaid);
    if (amount > balance) {
      throw fail(400, "SO_OVERPAY", "المبلغ أكبر من المتبقي على الطلب", "The payment is more than the order balance", { balance: fmt(balance) });
    }
    const proofFileId = await checkProof(tx, { orgId, userId: req.user.sub, method, proofFileId: body.proofFileId });
    const before = allocatePaid(order.installments, d(order.amountPaid));
    const after = allocatePaid(order.installments, d(order.amountPaid) + amount);
    const allocation = after
      .map((a, i) => ({ installmentId: a.id, seq: a.seq, amount: a.paid - before[i].paid }))
      .filter((a) => a.amount > 0);
    for (const a of after) await tx.salesOrderInstallment.update({ where: { id: a.id }, data: { amountPaid: a.paid } });
    const created = await tx.salesOrderPayment.create({
      data: {
        orderId: order.id,
        branchId: order.branchId,
        amount,
        method,
        reference,
        note: optText(body.note, 500),
        paidAt,
        proofFileId,
        allocation,
        userId: req.user.sub,
      },
    });
    const amountPaid = d(order.amountPaid) + amount;
    const status = settledStatus({ ...order, amountPaid }, order.lines);
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { amountPaid, status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SALES_ORDER_PAYMENT",
      entityType: "SalesOrder",
      entityId: order.id,
      branchId: order.branchId,
      summary: `${order.reference}: ${fmt(amount)} ${method}${reference ? ` ref ${reference}` : ""}`,
      meta: { paymentId: created.id, allocation, proofFileId },
    }, tx);
    return created;
  }, TX);
  const order = await loadOrder(prisma, orgId, existing.id);
  res.status(201).json({ payment: { id: payment.id }, order: soView(order) });
});

// ------------------------------------------------------------------ deliveries

router.post("/:id/deliveries", requireModule("salesOrders", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  // fix-rb: the delivery itself lives in lib/salesOrderDelivery.js (the driver dashboard uses it too).
  const delivery = await deliverSalesOrder({ orgId, userId: req.user.sub, orderId: req.params.id, lines: body.lines, note: body.note });
  res.status(201).json({ delivery: { id: delivery.id }, order: soView(await loadOrder(prisma, orgId, req.params.id)) });
});

export default router;
