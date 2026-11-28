/**
 * fix-rg: data for the printable documents (docs/testing/printable-documents.md).
 *
 *   GET /api/documents/business                          business header (name, contact, CR, VAT, logo)
 *   GET /api/documents/purchase-orders/:id               purchase order + status sheet / goods received note
 *   GET /api/documents/supplier-vouchers/:kind/:id       payment voucher: kind = payment (bill or freight
 *                                                        bill payment) | prepayment
 *   GET /api/documents/sales-orders/:id/receipts/:pid    payment receipt for one installment payment
 *   GET /api/documents/sales-orders/:id/deliveries/:did  delivery note for one delivery
 *
 * Read only. Each document is guarded by the module that guards viewing the order: purchasing.view,
 * salesOrders.view (B2B delivery notes keep their own documents on the B2B tab, b2b.view).
 * Money in riyals; quantities as stored (weight goods in grams, with sellBy so the client prints kg).
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { d, fmt, lineAmount } from "../lib/money.js";
import { fail, dayOf } from "../lib/bizError.js";
import { FILE_SELECT } from "../lib/businessFiles.js";
import { poMoney, sellByMap } from "../lib/purchaseExtras.js";
import { pairApi, poStatusPair, soStatusPair } from "../lib/orderStatus.js";
import { loadOrder, paidStatus } from "../lib/salesOrders.js";

const router = Router();
router.use(authMiddleware);

const PERSON = { select: { id: true, name: true, nameEn: true } };
const LOGO_URL = "/brand/logo.png";

/** Reference printed on purchase-order documents (same as pending stock / pending payments). */
export const poReference = (id) => `PO ${String(id).slice(-6).toUpperCase()}`;
const voucherNo = (prefix, id) => `${prefix}-${String(id).slice(-8).toUpperCase()}`;

async function anyModule(req, list) {
  for (const [mod, action] of list) if (await hasModule(req, mod, action)) return true;
  return false;
}

async function businessHeader(orgId) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, legalName: true, phone: true, publicEmail: true, publicAddress: true, addressText: true, city: true, crNumber: true, vatNumber: true },
  });
  return {
    name: org?.name || "",
    legalName: org?.legalName || null,
    phone: org?.phone || null,
    email: org?.publicEmail || null,
    address: org?.publicAddress || org?.addressText || null,
    city: org?.city || null,
    crNumber: org?.crNumber || null,
    vatNumber: org?.vatNumber || null,
    logoUrl: LOGO_URL,
  };
}

router.get("/business", async (req, res) => {
  const ok = await anyModule(req, [["purchasing", "view"], ["salesOrders", "view"], ["b2b", "view"]]);
  if (!ok) throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
  res.json(await businessHeader(req.user.organizationId));
});

// ------------------------------------------------------------------ purchase orders

const productInfo = (p, v) => ({
  productName: p?.name || "",
  productNameEn: p?.nameEn || p?.name || "",
  variant: v ? v.label : null,
  variantEn: v ? v.labelEn || v.label : null,
  sku: v?.sku || p?.sku || null,
  sellBy: p?.sellBy || "UNIT",
});

/**
 * Receipts of a purchase order: each receipt raised one GOODS bill in the same transaction, after its
 * RECEIPT stock movements (note = order id). A movement belongs to the first goods bill created at or
 * after it. Returns [{ billId, receivedAt, amount, lines: [{ lineId, quantity }] }] in date order.
 */
function receiptsOf(order, goodsBills, movements) {
  const bills = [...goodsBills].sort((a, b) => a.createdAt - b.createdAt);
  const out = bills.map((b) => ({ billId: b.id, receivedAt: b.createdAt, amount: fmt(d(b.amount)), lines: new Map() }));
  const lineLeft = new Map(order.lines.map((l) => [l.id, l.quantityReceived]));
  for (const mv of [...movements].sort((a, b) => a.createdAt - b.createdAt)) {
    let idx = bills.findIndex((b) => b.createdAt >= mv.createdAt);
    if (idx < 0) idx = bills.length - 1;
    if (idx < 0) continue;
    // The order line with this product / variant that still has received quantity to account for.
    const line = order.lines.find((l) => l.productId === mv.productId && (l.variantId || null) === (mv.variantId || null) && lineLeft.get(l.id) > 0);
    if (!line) continue;
    const qty = Math.min(mv.quantityDelta, lineLeft.get(line.id));
    lineLeft.set(line.id, lineLeft.get(line.id) - qty);
    const m = out[idx].lines;
    m.set(line.id, (m.get(line.id) || 0) + qty);
  }
  return out.map((r) => ({ ...r, lines: [...r.lines.entries()].map(([lineId, quantity]) => ({ lineId, quantity })) }));
}

function billPayment(p, bill) {
  return {
    id: p.id,
    voucherNo: voucherNo(bill.kind === "FREIGHT" ? "FV" : "PV", p.id),
    amount: fmt(d(p.amount)),
    method: p.method,
    reference: p.reference || null,
    paidAt: p.paidAt,
    paidBy: p.user || null,
    proofAttached: Boolean(p.proofFileId),
  };
}

router.get("/purchase-orders/:id", requireModule("purchasing", "view"), async (req, res) => {
  const orgId = req.user.organizationId;
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: String(req.params.id), organizationId: orgId },
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true, address: true, isFreight: true, paymentTermsDays: true } },
      branch: { select: { id: true, name: true, nameEn: true } },
      user: PERSON,
      lines: { orderBy: { id: "asc" }, include: { variant: { select: { label: true, labelEn: true, sku: true } } } },
      bills: {
        orderBy: { createdAt: "asc" },
        include: { payments: { orderBy: { paidAt: "asc" }, include: { user: PERSON } }, supplier: { select: { id: true, name: true, isFreight: true } } },
      },
      prepayments: { orderBy: { paidAt: "asc" }, include: { user: PERSON } },
    },
  });
  if (!order) throw fail(404, "PO_NOT_FOUND", "أمر الشراء غير موجود", "Order not found");
  const sellBy = await sellByMap(prisma, order.lines);
  const products = new Map(
    (await prisma.product.findMany({ where: { id: { in: order.lines.map((l) => l.productId) } }, select: { id: true, name: true, nameEn: true, sku: true, sellBy: true } })).map((p) => [p.id, p]),
  );
  const movements = await prisma.stockMovement.findMany({
    where: { organizationId: orgId, reason: "RECEIPT", note: order.id, branchId: order.branchId },
    select: { productId: true, variantId: true, quantityDelta: true, createdAt: true },
  });
  const m = poMoney(order, sellBy);
  const goods = order.bills.filter((b) => b.kind !== "FREIGHT");
  const freight = order.bills.filter((b) => b.kind === "FREIGHT");
  const billView = (b) => ({
    id: b.id,
    kind: b.kind,
    supplier: b.supplier?.name || "",
    reference: b.reference || null,
    createdAt: b.createdAt,
    dueDate: dayOf(b.dueDate),
    amount: fmt(d(b.amount)),
    amountPaid: fmt(d(b.amountPaid)),
    owed: fmt(d(b.amount) - d(b.amountPaid)),
    status: b.status,
    payments: b.payments.map((p) => billPayment(p, b)),
  });
  res.json({
    business: await businessHeader(orgId),
    id: order.id,
    reference: poReference(order.id),
    status: order.status,
    createdAt: order.createdAt,
    expectedDate: dayOf(order.expectedDate),
    paymentTermsDays: order.paymentTermsDays ?? order.supplier?.paymentTermsDays ?? null,
    paymentTermsFrom: order.paymentTermsDays != null ? "ORDER" : order.supplier?.paymentTermsDays != null ? "SUPPLIER" : null,
    paymentDueDate: dayOf(order.paymentDueDate),
    note: order.note || null,
    supplier: order.supplier,
    branch: order.branch,
    createdBy: order.user,
    lines: order.lines.map((l) => {
      const p = products.get(l.productId);
      return {
        id: l.id,
        productId: l.productId,
        variantId: l.variantId,
        ...productInfo(p, l.variant),
        quantity: l.quantity,
        quantityReceived: l.quantityReceived,
        outstanding: Math.max(0, l.quantity - l.quantityReceived),
        unitCost: fmt(d(l.unitCost)),
        lineTotal: fmt(lineAmount(l.unitCost, l.quantity, sellBy.get(l.productId))),
        receivedValue: fmt(lineAmount(l.unitCost, l.quantityReceived, sellBy.get(l.productId))),
      };
    }),
    subtotal: fmt(m.value),
    total: fmt(m.value),
    money: {
      value: fmt(m.value),
      received: fmt(m.received),
      billed: fmt(m.billed),
      prepaid: fmt(m.prepaid),
      prepaidUnapplied: fmt(m.prepaidUnapplied),
      paid: fmt(m.paid),
      owedOnBills: fmt(m.owed),
      // What is left to pay for the whole order (value − paid); negative never: overpaying is refused.
      balance: fmt(Math.max(0, m.value - m.paid)),
      freight: fmt(m.freight),
      freightPaid: fmt(m.freightPaid),
      freightOwed: fmt(m.freight - m.freightPaid),
    },
    statusPair: pairApi(poStatusPair(order, m)),
    receipts: receiptsOf(order, goods, movements),
    goodsBills: goods.map(billView),
    freightBills: freight.map(billView),
    prepayments: order.prepayments.map((p) => ({
      id: p.id,
      voucherNo: voucherNo("PP", p.id),
      amount: fmt(d(p.amount)),
      amountApplied: fmt(d(p.amountApplied)),
      method: p.method,
      reference: p.reference || null,
      paidAt: p.paidAt,
      paidBy: p.user || null,
      proofAttached: Boolean(p.proofFileId),
    })),
  });
});

// ------------------------------------------------------------------ supplier payment vouchers

router.get("/supplier-vouchers/:kind/:id", requireModule("purchasing", "view"), async (req, res) => {
  const orgId = req.user.organizationId;
  const kind = String(req.params.kind);
  if (kind === "payment") {
    const p = await prisma.supplierPayment.findFirst({
      where: { id: String(req.params.id), bill: { organizationId: orgId } },
      include: {
        user: PERSON,
        proofFile: { select: FILE_SELECT },
        bill: { include: { supplier: { select: { id: true, name: true, phone: true, email: true, isFreight: true } }, payments: { select: { id: true, amount: true, paidAt: true } }, prepaymentApplications: { select: { amount: true } } } },
      },
    });
    if (!p) throw fail(404, "VOUCHER_NOT_FOUND", "سند الصرف غير موجود", "Payment voucher not found");
    const bill = p.bill;
    // Balance of the bill right after this payment (prepayments applied count as paid).
    const before = bill.payments.filter((x) => x.paidAt < p.paidAt || (x.paidAt.getTime() === p.paidAt.getTime() && x.id < p.id)).reduce((s, x) => s + d(x.amount), 0);
    const applied = bill.prepaymentApplications.reduce((s, x) => s + d(x.amount), 0);
    return res.json({
      business: await businessHeader(orgId),
      kind: bill.kind === "FREIGHT" ? "FREIGHT_PAYMENT" : "BILL_PAYMENT",
      id: p.id,
      voucherNo: voucherNo(bill.kind === "FREIGHT" ? "FV" : "PV", p.id),
      amount: fmt(d(p.amount)),
      method: p.method,
      reference: p.reference || null,
      note: p.note || null,
      paidAt: p.paidAt,
      paidBy: p.user,
      supplier: bill.supplier,
      purchaseOrderId: bill.purchaseOrderId,
      purchaseOrderReference: bill.purchaseOrderId ? poReference(bill.purchaseOrderId) : null,
      bill: {
        id: bill.id,
        kind: bill.kind,
        reference: bill.reference || null,
        createdAt: bill.createdAt,
        dueDate: dayOf(bill.dueDate),
        amount: fmt(d(bill.amount)),
        balanceAfter: fmt(Math.max(0, d(bill.amount) - applied - before - d(p.amount))),
        balanceNow: fmt(d(bill.amount) - d(bill.amountPaid)),
      },
      proofAttached: Boolean(p.proofFileId),
      proofFileName: p.proofFile?.fileName || null,
    });
  }
  if (kind === "prepayment") {
    const p = await prisma.supplierPrepayment.findFirst({
      where: { id: String(req.params.id), organizationId: orgId },
      include: { user: PERSON, proofFile: { select: FILE_SELECT }, supplier: { select: { id: true, name: true, phone: true, email: true, isFreight: true } } },
    });
    if (!p) throw fail(404, "VOUCHER_NOT_FOUND", "سند الصرف غير موجود", "Payment voucher not found");
    return res.json({
      business: await businessHeader(orgId),
      kind: "PREPAYMENT",
      id: p.id,
      voucherNo: voucherNo("PP", p.id),
      amount: fmt(d(p.amount)),
      amountApplied: fmt(d(p.amountApplied)),
      method: p.method,
      reference: p.reference || null,
      note: p.note || null,
      paidAt: p.paidAt,
      paidBy: p.user,
      supplier: p.supplier,
      purchaseOrderId: p.purchaseOrderId,
      purchaseOrderReference: poReference(p.purchaseOrderId),
      bill: null,
      proofAttached: Boolean(p.proofFileId),
      proofFileName: p.proofFile?.fileName || null,
    });
  }
  throw fail(400, "VOUCHER_KIND_INVALID", "نوع السند غير معروف", "Unknown voucher kind");
});

// ------------------------------------------------------------------ sales orders

async function soForDocument(req) {
  const orgId = req.user.organizationId;
  const order = await loadOrder(prisma, orgId, req.params.id);
  if (order.orderType === "B2B") {
    throw fail(400, "DOC_USE_B2B", "هذا سند تسليم لمبيعات الشركات — اطبع مستنداته من تبويب مبيعات الشركات / الجملة", "This is a B2B delivery note. Print its documents from the B2B / Wholesale tab.", { b2b: true });
  }
  const customer = await prisma.customer.findUnique({ where: { id: order.customerId }, select: { id: true, name: true, companyName: true, phone: true, address: true } });
  return { order, customer, business: await businessHeader(orgId) };
}

const soLine = (l) => ({
  id: l.id,
  ...productInfo(l.product, l.variant),
  quantity: l.quantity,
  isFree: l.isFree,
  unitPrice: fmt(d(l.unitPrice)),
  subtotal: fmt(d(l.subtotal)),
});

function orderHead(order, customer) {
  return {
    orderId: order.id,
    orderReference: order.reference,
    orderStatus: order.status,
    customer,
    branch: order.branch,
    total: fmt(d(order.total)),
    deliveryDate: dayOf(order.deliveryDate),
  };
}

router.get("/sales-orders/:id/receipts/:paymentId", requireModule("salesOrders", "view"), async (req, res) => {
  const { order, customer, business } = await soForDocument(req);
  const list = order.payments; // paidAt, createdAt order (SO_INCLUDE)
  const idx = list.findIndex((p) => p.id === String(req.params.paymentId));
  if (idx < 0) throw fail(404, "SO_PAYMENT_NOT_FOUND", "الدفعة غير موجودة في هذا الطلب", "Payment not found on this order");
  const p = list[idx];
  const upTo = list.slice(0, idx + 1);
  const sum = (rows) => rows.reduce((s, x) => s + d(x.amount), 0);
  const total = d(order.total);
  // After this payment: counting this and earlier payments that were not rejected (recorded money),
  // and counting confirmed ones only (what finance shows as paid).
  const recordedUpTo = sum(upTo.filter((x) => x.confirmStatus !== "REJECTED"));
  const confirmedUpTo = sum(upTo.filter((x) => x.confirmStatus === "CONFIRMED"));
  res.json({
    business,
    ...orderHead(order, customer),
    receiptNo: `${order.reference}-R${idx + 1}`,
    payment: {
      id: p.id,
      amount: fmt(d(p.amount)),
      method: p.method,
      reference: p.reference || null,
      note: p.note || null,
      paidAt: p.paidAt,
      recordedBy: p.user || null,
      collectedBy: p.collectedBy || p.user || null,
      confirmStatus: p.confirmStatus,
      confirmedAt: p.confirmedAt || null,
      confirmedBy: p.confirmedBy || null,
      rejectedAt: p.rejectedAt || null,
      rejectReason: p.rejectReason || null,
      proofAttached: Boolean(p.proofFileId),
      allocation: p.allocation || null,
    },
    // Remaining balance after this payment once it (and the earlier ones) are confirmed.
    balanceAfter: fmt(Math.max(0, total - recordedUpTo)),
    // Balance after this payment counting only confirmed money (what is paid in the books).
    confirmedBalanceAfter: fmt(Math.max(0, total - confirmedUpTo)),
    now: {
      paid: fmt(d(order.amountPaid)),
      awaiting: fmt(d(order.amountPending)),
      balance: fmt(total - d(order.amountPaid)),
      paidStatus: paidStatus(order),
    },
    statusPair: pairApi(soStatusPair(order)),
  });
});

router.get("/sales-orders/:id/deliveries/:deliveryId", requireModule("salesOrders", "view"), async (req, res) => {
  const { order, customer, business } = await soForDocument(req);
  const list = order.deliveries; // deliveredAt order (SO_INCLUDE)
  const idx = list.findIndex((x) => x.id === String(req.params.deliveryId));
  if (idx < 0) throw fail(404, "SO_DELIVERY_NOT_FOUND", "التسليم غير موجود في هذا الطلب", "Delivery not found on this order");
  const dl = list[idx];
  const upTo = list.slice(0, idx + 1);
  const deliveredUpTo = (lineId) => upTo.reduce((s, x) => s + x.lines.filter((y) => y.lineId === lineId).reduce((a, y) => a + y.quantity, 0), 0);
  res.json({
    business,
    ...orderHead(order, customer),
    deliveryNo: `${order.reference}-D${idx + 1}`,
    delivery: { id: dl.id, deliveredAt: dl.deliveredAt, deliveredBy: dl.user || null, note: dl.note || null },
    lines: order.lines.map((l) => {
      const now = dl.lines.filter((y) => y.lineId === l.id).reduce((a, y) => a + y.quantity, 0);
      const cumulative = deliveredUpTo(l.id);
      return { ...soLine(l), deliveredNow: now, deliveredToDate: cumulative, outstandingAfter: Math.max(0, l.quantity - cumulative) };
    }),
    // Outstanding on the order today (later deliveries included).
    outstandingNow: order.lines.reduce((s, l) => s + Math.max(0, l.quantity - l.quantityDelivered), 0),
    statusPair: pairApi(soStatusPair(order)),
  });
});

export default router;
