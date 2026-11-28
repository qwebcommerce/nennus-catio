/**
 * Purchase-order attachments (supplier quotation / invoice), payment terms and expected date,
 * prepayments and freight bills. Mounted on /api/purchase-orders before the main router.
 * Rules: see lib/purchaseExtras.js.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { d, fmt, toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import { fail, optDate, optText, addDays } from "../lib/bizError.js";
import { requireVersion, assertVersion, versionedUpdate } from "../lib/recordVersion.js";
import { FILE_SELECT, checkProof, saveBusinessFile } from "../lib/businessFiles.js";
import { singleFile } from "./files.js";
import {
  applyPrepaymentsTx,
  capitaliseReceivedFreight,
  freightAllocation,
  orderValue,
  poMoney,
  sellByMap,
} from "../lib/purchaseExtras.js";
import { todayDate } from "../lib/salesOrders.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("purchasing", "view"));

const TX = { maxWait: 10000, timeout: 30000 };

async function findOrder(orgId, id, include = {}) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: String(id), organizationId: orgId }, include });
  if (!order) throw fail(404, "PO_NOT_FOUND", "أمر الشراء غير موجود", "Order not found");
  return order;
}

async function lockPo(tx, orgId, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} AND "organizationId" = ${orgId} FOR UPDATE`;
  if (!rows.length) throw fail(404, "PO_NOT_FOUND", "أمر الشراء غير موجود", "Order not found");
}

const MONEY_INCLUDE = {
  lines: true,
  bills: { include: { payments: { include: { proofFile: { select: FILE_SELECT } } }, proofFile: { select: FILE_SELECT }, supplier: { select: { id: true, name: true, isFreight: true } } } },
  prepayments: { orderBy: { paidAt: "asc" }, include: { proofFile: { select: FILE_SELECT } } },
  attachments: { select: FILE_SELECT, orderBy: { createdAt: "asc" } },
  supplier: { select: { id: true, name: true, paymentTermsDays: true } },
};

/** GET /:id/money — value, received, billed, paid, prepaid, freight, with the rows behind them. */
router.get("/:id/money", async (req, res) => {
  const order = await findOrder(req.user.organizationId, req.params.id, MONEY_INCLUDE);
  const sellBy = await sellByMap(prisma, order.lines);
  const m = poMoney(order, sellBy);
  res.json({
    orderId: order.id,
    status: order.status,
    version: order.version,
    expectedDate: order.expectedDate,
    paymentTermsDays: order.paymentTermsDays,
    paymentDueDate: order.paymentDueDate,
    money: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? fmt(v) : v])),
    bills: toApi("SupplierBill", order.bills),
    prepayments: toApi("SupplierPrepayment", order.prepayments),
    attachments: order.attachments,
  });
});

/** PATCH /:id/terms — expected delivery date and payment terms (NFR-13 version required). */
router.patch("/:id/terms", requireModule("purchasing", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const order = await findOrder(req.user.organizationId, req.params.id);
  assertVersion(order, version);
  const body = req.body || {};
  const data = {};
  if ("expectedDate" in body) data.expectedDate = optDate(body.expectedDate, "expectedDate");
  if ("paymentDueDate" in body) data.paymentDueDate = optDate(body.paymentDueDate, "paymentDueDate");
  if ("paymentTermsDays" in body) {
    const n = body.paymentTermsDays == null || body.paymentTermsDays === "" ? null : Number(body.paymentTermsDays);
    if (n != null && (!Number.isInteger(n) || n < 0 || n > 365)) throw fail(400, "TERMS_INVALID", "مدة السداد غير صالحة (0 إلى 365 يوماً)", "Payment terms must be 0 to 365 days");
    data.paymentTermsDays = n;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await versionedUpdate(tx, "purchaseOrder", { id: order.id, version, data });
    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_ORDER_TERMS",
      entityType: "PurchaseOrder",
      entityId: order.id,
      branchId: order.branchId,
      summary: `Terms: ${Object.keys(data).join(", ")}`,
      meta: data,
    }, tx);
    return row;
  }, TX);
  res.json(toApi("PurchaseOrder", updated));
});

// ------------------------------------------------------------------ attachments

router.post("/:id/attachments", requireModule("purchasing", "create"), singleFile, async (req, res) => {
  const order = await findOrder(req.user.organizationId, req.params.id);
  const count = await prisma.businessFile.count({ where: { purchaseOrderId: order.id } });
  if (count >= 20) throw fail(400, "TOO_MANY_FILES", "عدد المرفقات كبير جداً (20 كحد أقصى)", "Too many attachments (at most 20)");
  const file = await saveBusinessFile({
    orgId: req.user.organizationId,
    userId: req.user.sub,
    purpose: "PO_ATTACHMENT",
    purchaseOrderId: order.id,
    buffer: req.file?.buffer,
    originalName: req.file?.originalname,
  });
  await writeAudit({
    userId: req.user.sub,
    action: "PURCHASE_ORDER_ATTACHMENT",
    entityType: "PurchaseOrder",
    entityId: order.id,
    branchId: order.branchId,
    summary: `Attached ${file.fileName} (${file.mime}, ${file.size} bytes)`,
    meta: { fileId: file.id },
  });
  res.status(201).json(file);
});

router.get("/:id/attachments", async (req, res) => {
  const order = await findOrder(req.user.organizationId, req.params.id);
  res.json(await prisma.businessFile.findMany({ where: { purchaseOrderId: order.id }, select: FILE_SELECT, orderBy: { createdAt: "asc" } }));
});

// ------------------------------------------------------------------ prepayments

router.post("/:id/prepayments", requireModule("purchasing", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const amount = toDirhams(body.amount, { allowZero: false });
  if (amount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
  const method = String(body.method || "").toUpperCase();
  if (!["CASH", "BANK"].includes(method)) throw fail(400, "SUPPLIER_METHOD_INVALID", "اختر الدفع نقداً أو من البنك", "Choose cash or bank");
  const paidAt = body.paidAt ? optDate(body.paidAt, "paidAt") : null;
  const order0 = await findOrder(orgId, req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    await lockPo(tx, orgId, order0.id);
    const order = await tx.purchaseOrder.findUnique({ where: { id: order0.id }, include: { lines: true, bills: true, prepayments: true } });
    if (order.status === "CANCELLED") throw fail(400, "PO_CANCELLED", "أمر الشراء ملغى", "This purchase order is cancelled");
    const sellBy = await sellByMap(tx, order.lines);
    const value = orderValue(order, sellBy);
    const goodsPaid = order.bills.filter((b) => b.kind !== "FREIGHT").reduce((s, b) => s + d(b.amountPaid), 0);
    const unapplied = order.prepayments.reduce((s, p) => s + d(p.amount) - d(p.amountApplied), 0);
    const room = value - goodsPaid - unapplied;
    if (amount > room) {
      throw fail(400, "PREPAY_TOO_LARGE", "الدفعة المقدمة أكبر من المتبقي غير المدفوع من قيمة الأمر", "The prepayment is more than the unpaid value of the order", { room: fmt(Math.max(0, room)) });
    }
    const proofFileId = await checkProof(tx, { orgId, userId: req.user.sub, method, proofFileId: body.proofFileId });
    const created = await tx.supplierPrepayment.create({
      data: {
        organizationId: orgId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        amount,
        method,
        reference: optText(body.reference, 120),
        note: optText(body.note, 500),
        ...(paidAt ? { paidAt: new Date(paidAt.getTime() + 9 * 3600 * 1000) } : {}),
        proofFileId,
        userId: req.user.sub,
      },
    });
    const applied = await applyPrepaymentsTx(tx, order.id);
    await writeAudit({
      userId: req.user.sub,
      action: "SUPPLIER_PREPAYMENT",
      entityType: "PurchaseOrder",
      entityId: order.id,
      branchId: order.branchId,
      summary: `Prepayment ${fmt(amount)} ${method}${applied ? `, ${fmt(applied)} applied to open bills` : ""}`,
      meta: { prepaymentId: created.id, proofFileId },
    }, tx);
    return created;
  }, TX);
  res.status(201).json(toApi("SupplierPrepayment", await prisma.supplierPrepayment.findUnique({ where: { id: result.id } })));
});

// ------------------------------------------------------------------ freight

router.post("/:id/freight", requireModule("purchasing", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const amount = toDirhams(body.amount, { allowZero: false });
  if (amount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
  const company = await prisma.supplier.findFirst({
    where: { id: String(body.freightCompanyId || ""), organizationId: orgId, isActive: true, isFreight: true },
  });
  if (!company) throw fail(400, "FREIGHT_COMPANY_REQUIRED", "اختر شركة شحن (مورد مُعلَّم كشركة شحن)", "Choose a freight company (a supplier marked as freight)");
  const dueIn = optDate(body.dueDate, "dueDate");
  const order0 = await findOrder(orgId, req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    await lockPo(tx, orgId, order0.id);
    const order = await tx.purchaseOrder.findUnique({ where: { id: order0.id }, include: { lines: { orderBy: { id: "asc" } } } });
    if (!["SENT", "PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status)) {
      throw fail(400, "FREIGHT_PO_STATUS", "أضف الشحن لأمر شراء مُرسل (ليس مسودة أو ملغى)", "Add freight to a sent order (not a draft or cancelled order)");
    }
    const proofFileId = await checkProof(tx, { orgId, userId: req.user.sub, method: null, proofFileId: body.proofFileId });
    const sellBy = await sellByMap(tx, order.lines);
    const allocation = freightAllocation(order, sellBy, amount);
    const map = new Map(allocation.map((r) => [r.lineId, r.amount]));
    const already = await capitaliseReceivedFreight(tx, { order, allocation: map, sellBy });
    const bill = await tx.supplierBill.create({
      data: {
        organizationId: orgId,
        supplierId: company.id,
        purchaseOrderId: order.id,
        kind: "FREIGHT",
        amount,
        dueDate: dueIn || addDays(todayDate(), company.paymentTermsDays || 0),
        reference: optText(body.reference, 120),
        note: optText(body.note, 500),
        proofFileId,
        freightAllocation: allocation,
        freightCapitalised: already.capitalised,
        freightExpensed: already.expensed,
        userId: req.user.sub,
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "FREIGHT_BILL",
      entityType: "PurchaseOrder",
      entityId: order.id,
      branchId: order.branchId,
      summary: `Freight ${fmt(amount)} from ${company.name}; added to stock cost now ${fmt(already.capitalised)}, goods already sold ${fmt(already.expensed)}`,
      meta: { billId: bill.id, allocation, adjusted: already.lines },
    }, tx);
    return bill;
  }, TX);
  res.status(201).json(toApi("SupplierBill", result));
});

export default router;
