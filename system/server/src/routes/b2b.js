import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { d, fmt, toDirhams } from "../lib/money.js";
import { fail, addDays, optDate, optText } from "../lib/bizError.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { checkProof } from "../lib/businessFiles.js";
import { isTillKind } from "../lib/locationKinds.js";
import { requireActiveStaff } from "../lib/staffPick.js";
import { allocatePaid, buildPlan, orderFields, prepareLines, priceOrder, settledStatus } from "../lib/salesOrders.js";
import { deliverOrderLines } from "../lib/soDelivery.js";
import {
  B2B_PAY_METHODS,
  INVOICE_INCLUDE,
  INVOICE_STATUSES,
  NOTE_INCLUDE,
  NOTE_STATUSES,
  RECEIPT_INCLUDE,
  dateRange,
  dayRange,
  invoiceStatusFor,
  invoiceView,
  loadInvoice,
  loadNote,
  loadReceipt,
  nextReference,
  noteStatusWhere,
  noteView,
  paidAtFrom,
  pendingByCustomer,
  receiptView,
  toCsv,
  todayDate,
} from "../lib/b2b.js";

/**
 * B2B / Wholesale tab (POS area): delivery note → invoice → cash receipt (lib/b2b.js).
 * Module `b2b`: view; create = delivery notes and invoices; edit = cash receipts;
 * delete = cancel a note not yet delivered / an invoice with no receipt; export.
 * Line price changes need Sales orders → edit and free lines Complimentary → create, as on sales orders.
 */
const router = Router();
router.use(authMiddleware);
router.use(requireModule("b2b", "view"));

const TX = { maxWait: 10000, timeout: 30000 };

async function rightsOf(req) {
  return {
    editPrice: await hasModule(req, "salesOrders", "edit"),
    giveFree: await hasModule(req, "complimentary", "create"),
  };
}

// ------------------------------------------------------------------ meta

/** Business customers, active staff (receipt collector picker) and selling locations. */
router.get("/meta", async (req, res) => {
  const orgId = req.user.organizationId;
  const [customers, staff, branches] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: orgId, isBusiness: true },
      select: { id: true, name: true, companyName: true, phone: true },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      take: 1000,
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      select: { id: true, name: true, nameEn: true, role: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, nameEn: true, kind: true, isMain: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    }),
  ]);
  res.json({ customers, staff, branches, me: req.user.sub, payMethods: B2B_PAY_METHODS });
});

/** Per customer: invoices not fully paid (amount, dates, overdue) and notes delivered but not invoiced. */
router.get("/pending", async (req, res) => {
  res.json(await pendingByCustomer(prisma, req.user.organizationId, { customerId: req.query.customerId ? String(req.query.customerId) : "" }));
});

// ------------------------------------------------------------------ delivery notes

function notesWhere(req) {
  const where = { organizationId: req.user.organizationId, orderType: "B2B" };
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  const status = String(req.query.status || "").toUpperCase();
  if (NOTE_STATUSES.includes(status)) Object.assign(where, noteStatusWhere(status));
  const range = dayRange(req.query);
  if (range) where.createdAt = range;
  const q = String(req.query.q || "").trim();
  if (q) {
    where.OR = [
      { dnReference: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

router.get("/delivery-notes", async (req, res) => {
  const rows = await prisma.salesOrder.findMany({ where: notesWhere(req), orderBy: { createdAt: "desc" }, take: 300, include: NOTE_INCLUDE });
  res.json(rows.map(noteView));
});

router.get("/delivery-notes/:id", async (req, res) => {
  res.json(noteView(await loadNote(prisma, req.user.organizationId, req.params.id)));
});

/**
 * POST /api/b2b/delivery-notes — issue a delivery note for a business customer.
 * body: { customerId, branchId (default: main location), deliveryDate, lines[{ productId, variantId?,
 * quantity, unitPrice?, isFree? }], discountAmount?, freeReason?, paymentTerms?, paymentTermsDays?,
 * note?, deliver (default true: the goods leave now — stock out, revenue and cost at delivery) }.
 * With deliver, a stock shortage refuses the whole note (409 SO_STOCK_SHORT) and nothing is saved.
 */
router.post("/delivery-notes", requireModule("b2b", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const customer = await prisma.customer.findFirst({ where: { id: String(body.customerId || ""), organizationId: orgId }, select: { id: true, isBusiness: true } });
  if (!customer) throw fail(400, "SO_CUSTOMER_REQUIRED", "اختر عميلاً للطلب", "Choose the customer for the order");
  if (!customer.isBusiness) throw fail(400, "B2B_CUSTOMER_NOT_BUSINESS", "اختر عميل شركة (فعّل «عميل شركة» في بطاقة العميل)", "Choose a business customer (tick “Business customer” on the customer card)");
  let branchId = body.branchId ? String(body.branchId) : "";
  if (!branchId) {
    const main = await prisma.branch.findFirst({ where: { organizationId: orgId, isMain: true, isActive: true }, select: { id: true } });
    branchId = main?.id || "";
  }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId }, select: { id: true, isActive: true } });
  if (!branch || branch.isActive === false) throw fail(400, "SO_BRANCH_REQUIRED", "اختر موقع البيع (موقع نشط)", "Choose an active selling location");
  const fields = orderFields(body);
  const lines = await prepareLines(prisma, orgId, body.lines, await rightsOf(req));
  if (lines.some((l) => l.isFree) && !fields.freeReason) {
    throw fail(400, "FREE_REASON_REQUIRED", "اكتب سبب إعطاء البضاعة مجاناً", "Enter the reason the goods are given free");
  }
  const totals = priceOrder(lines, body.discountAmount);
  // One installment for the whole note; the invoice later sets its due date.
  const plan = buildPlan(totals.total, null, { termsDays: fields.paymentTermsDays });
  const deliver = body.deliver !== false && body.deliver !== "false";

  const orderId = await prisma.$transaction(async (tx) => {
    const dnReference = await nextReference(tx, "DN-", "nc_b2b_dn_ref_seq");
    const created = await tx.salesOrder.create({
      data: {
        organizationId: orgId,
        orderType: "B2B",
        dnReference,
        customerId: customer.id,
        branchId: branch.id,
        userId: req.user.sub,
        ...fields,
        deliveryDate: fields.deliveryDate || todayDate(),
        status: "CONFIRMED",
        confirmedAt: new Date(),
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        total: totals.total,
        lines: { create: lines.map(({ sellBy, ...l }) => l) },
        installments: { create: plan },
      },
      include: { lines: true },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "B2B_NOTE_ISSUE",
      entityType: "SalesOrder",
      entityId: created.id,
      branchId: created.branchId,
      summary: `${dnReference} (${created.reference}) total ${fmt(created.total)}`,
      meta: { lines: lines.length, freeLines: lines.filter((l) => l.isFree).length, freeReason: fields.freeReason, deliver },
    }, tx);
    if (deliver) {
      const wanted = new Map(created.lines.map((l) => [l.id, l.quantity]));
      await deliverOrderLines(tx, { orgId, userId: req.user.sub, orderId: created.id, wanted, note: `Delivery note ${dnReference}` });
    }
    return created.id;
  }, TX);
  res.status(201).json(noteView(await loadNote(prisma, orgId, orderId)));
});

/** POST /api/b2b/delivery-notes/:id/deliver — deliver everything still to deliver on an issued note. */
router.post("/delivery-notes/:id/deliver", requireModule("b2b", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const note = await loadNote(prisma, orgId, req.params.id);
  if (req.body?.version != null) assertVersion(note, requireVersion(req));
  if (!["CONFIRMED", "PARTLY_DELIVERED"].includes(note.status)) {
    throw fail(400, "SO_NOT_DELIVERABLE", "يمكن التسليم من طلب مؤكد لم يُسلَّم بالكامل", "Deliver from a confirmed order that is not fully delivered");
  }
  const wanted = new Map(note.lines.filter((l) => l.quantity > l.quantityDelivered).map((l) => [l.id, l.quantity - l.quantityDelivered]));
  await prisma.$transaction((tx) => deliverOrderLines(tx, { orgId, userId: req.user.sub, orderId: note.id, wanted, note: `Delivery note ${note.dnReference}` }), TX);
  res.status(201).json(noteView(await loadNote(prisma, orgId, note.id)));
});

/** POST /api/b2b/delivery-notes/:id/cancel { version, reason } — only before anything was delivered. */
router.post("/delivery-notes/:id/cancel", requireModule("b2b", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const reason = optText(req.body?.reason, 300);
  if (!reason) throw fail(400, "REASON_REQUIRED", "اكتب سبب الإلغاء", "Enter the reason for cancelling");
  const note = await loadNote(prisma, orgId, req.params.id);
  assertVersion(note, version);
  if (note.status !== "CONFIRMED" || note.lines.some((l) => l.quantityDelivered > 0)) {
    throw fail(400, "B2B_NOTE_DELIVERED", "لا يمكن إلغاء سند تسليم بعد تسليم البضاعة", "A delivery note cannot be cancelled once goods were delivered");
  }
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "salesOrder", { id: note.id, version, where: { status: "CONFIRMED", amountPaid: 0 }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await writeAudit({
      userId: req.user.sub,
      action: "B2B_NOTE_CANCEL",
      entityType: "SalesOrder",
      entityId: note.id,
      branchId: note.branchId,
      summary: `${note.dnReference} cancelled: ${reason}`,
    }, tx);
  }, TX);
  res.json(noteView(await loadNote(prisma, orgId, note.id)));
});

// ------------------------------------------------------------------ invoices

function invoicesWhere(req) {
  const where = { organizationId: req.user.organizationId };
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  const status = String(req.query.status || "").toUpperCase();
  if (INVOICE_STATUSES.includes(status)) where.status = status;
  if (status === "OVERDUE") {
    where.status = { in: ["ISSUED", "PART_PAID"] };
    where.dueDate = { lt: todayDate() };
  }
  const range = dateRange(req.query);
  if (range) where.invoiceDate = range;
  const q = String(req.query.q || "").trim();
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

router.get("/invoices", async (req, res) => {
  const rows = await prisma.b2bInvoice.findMany({ where: invoicesWhere(req), orderBy: { createdAt: "desc" }, take: 300, include: INVOICE_INCLUDE });
  res.json(rows.map((r) => invoiceView(r)));
});

router.get("/invoices/:id", async (req, res) => {
  res.json(invoiceView(await loadInvoice(prisma, req.user.organizationId, req.params.id)));
});

/**
 * POST /api/b2b/invoices { deliveryNoteIds[], invoiceDate?, paymentTermsDays?, note? }
 * Delivered, not yet invoiced notes of ONE customer. Due date = invoice date + terms (default:
 * the longest terms on the notes, else due on the invoice date).
 */
router.post("/invoices", requireModule("b2b", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const ids = Array.isArray(body.deliveryNoteIds) ? [...new Set(body.deliveryNoteIds.map(String))] : [];
  if (!ids.length) throw fail(400, "B2B_NOTES_REQUIRED", "اختر سند تسليم واحداً على الأقل", "Choose at least one delivery note");
  if (ids.length > 100) throw fail(400, "B2B_TOO_MANY_NOTES", "عدد سندات التسليم كبير جداً", "Too many delivery notes");
  const invoiceDate = optDate(body.invoiceDate, "invoiceDate") || todayDate();
  if (invoiceDate > todayDate()) throw fail(400, "B2B_INVOICE_DATE_FUTURE", "لا يمكن إصدار فاتورة بتاريخ لاحق", "An invoice cannot be dated in the future");
  let termsDays = body.paymentTermsDays == null || body.paymentTermsDays === "" ? null : Number(body.paymentTermsDays);
  if (termsDays != null && (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365)) {
    throw fail(400, "TERMS_INVALID", "مدة السداد غير صالحة (0 إلى 365 يوماً)", "Payment terms must be 0 to 365 days");
  }

  const invoiceId = await prisma.$transaction(async (tx) => {
    // Lock the notes in a fixed order so two invoices cannot take the same note.
    const sorted = [...ids].sort();
    for (const id of sorted) await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${id} AND "organizationId" = ${orgId} FOR UPDATE`;
    const notes = await tx.salesOrder.findMany({
      where: { id: { in: ids }, organizationId: orgId, orderType: "B2B" },
      include: { lines: true, installments: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (notes.length !== ids.length) throw fail(404, "B2B_NOTE_NOT_FOUND", "سند التسليم غير موجود", "Delivery note not found");
    const customerIds = new Set(notes.map((n) => n.customerId));
    if (customerIds.size !== 1) throw fail(400, "B2B_ONE_CUSTOMER", "الفاتورة لعميل واحد — اختر سندات تسليم لنفس العميل", "An invoice is for one customer. Choose delivery notes of the same customer.");
    for (const n of notes) {
      const delivered = n.lines.every((l) => l.quantityDelivered >= l.quantity);
      if (!delivered || !["DELIVERED", "COMPLETED"].includes(n.status)) {
        throw fail(400, "B2B_NOTE_NOT_DELIVERED", "يمكن فوترة سندات التسليم المُسلَّمة فقط", "Only delivered delivery notes can be invoiced", { dnReference: n.dnReference });
      }
      if (n.invoiceId) throw fail(409, "B2B_NOTE_INVOICED", "سند التسليم مُفوتر مسبقاً", "This delivery note is already invoiced", { dnReference: n.dnReference });
      if (d(n.amountPaid) > 0) throw fail(409, "B2B_NOTE_INVOICED", "سند التسليم مُفوتر مسبقاً", "This delivery note is already invoiced", { dnReference: n.dnReference });
    }
    if (termsDays == null) {
      const given = notes.map((n) => n.paymentTermsDays).filter((x) => x != null);
      termsDays = given.length ? Math.max(...given) : 0;
    }
    const dueDate = addDays(invoiceDate, termsDays);
    const total = notes.reduce((s, n) => s + d(n.total), 0);
    const inv = await tx.b2bInvoice.create({
      data: {
        organizationId: orgId,
        customerId: notes[0].customerId,
        userId: req.user.sub,
        invoiceDate,
        dueDate,
        paymentTermsDays: termsDays,
        total,
        amountPaid: 0,
        status: invoiceStatusFor(total, 0),
        note: optText(body.note, 1000),
      },
    });
    for (const n of notes) {
      const updated = await tx.salesOrder.updateMany({ where: { id: n.id, invoiceId: null }, data: { invoiceId: inv.id } });
      if (updated.count !== 1) throw fail(409, "B2B_NOTE_INVOICED", "سند التسليم مُفوتر مسبقاً", "This delivery note is already invoiced", { dnReference: n.dnReference });
      // The invoice due date is when each note's money is due (pending payments, overdue).
      await tx.salesOrderInstallment.updateMany({ where: { orderId: n.id }, data: { dueDate } });
    }
    await writeAudit({
      userId: req.user.sub,
      action: "B2B_INVOICE_ISSUE",
      entityType: "B2bInvoice",
      entityId: inv.id,
      branchId: notes[0].branchId,
      summary: `${inv.reference}: ${notes.map((n) => n.dnReference).join(", ")} total ${fmt(total)} due ${dueDate.toISOString().slice(0, 10)}`,
      meta: { notes: notes.map((n) => n.id), termsDays },
    }, tx);
    return inv.id;
  }, TX);
  res.status(201).json(invoiceView(await loadInvoice(prisma, orgId, invoiceId)));
});

/** POST /api/b2b/invoices/:id/cancel { version, reason } — only with no receipt; its notes are free to invoice again. */
router.post("/invoices/:id/cancel", requireModule("b2b", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const reason = optText(req.body?.reason, 300);
  if (!reason) throw fail(400, "REASON_REQUIRED", "اكتب سبب الإلغاء", "Enter the reason for cancelling");
  const inv = await loadInvoice(prisma, orgId, req.params.id);
  assertVersion(inv, version);
  if (inv.status === "CANCELLED") throw fail(400, "B2B_INVOICE_CANCELLED", "الفاتورة ملغاة", "This invoice is cancelled");
  if (inv.receipts.length || d(inv.amountPaid) > 0) {
    throw fail(400, "B2B_INVOICE_HAS_RECEIPTS", "لا يمكن إلغاء فاتورة عليها سندات قبض", "An invoice with cash receipts cannot be cancelled");
  }
  await prisma.$transaction(async (tx) => {
    await versionedUpdate(tx, "b2bInvoice", { id: inv.id, version, where: { amountPaid: 0 }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await tx.salesOrder.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } });
    await writeAudit({
      userId: req.user.sub,
      action: "B2B_INVOICE_CANCEL",
      entityType: "B2bInvoice",
      entityId: inv.id,
      branchId: req.user.branchId || null,
      summary: `${inv.reference} cancelled: ${reason}`,
    }, tx);
  }, TX);
  res.json(invoiceView(await loadInvoice(prisma, orgId, inv.id)));
});

// ------------------------------------------------------------------ cash receipts

/**
 * POST /api/b2b/invoices/:id/receipts
 * body: { amount, method: CASH | BANK_TRANSFER, bankReference?, proofFileId (required for bank
 * transfer), collectedById (default: me), paidAt (default today), note? }
 * Partial receipts are allowed; more than the invoice balance is refused. The receipt is spread
 * over the invoice's notes oldest first (SalesOrderPayment rows). Cash goes to the collector's
 * location (else the note's) and into its open cash session when there is one.
 */
router.post("/invoices/:id/receipts", requireModule("b2b", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const amount = toDirhams(body.amount, { allowZero: false });
  if (amount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
  const method = String(body.method || "").toUpperCase();
  if (!B2B_PAY_METHODS.includes(method)) throw fail(400, "B2B_METHOD_INVALID", "طريقة الدفع: نقداً أو تحويل بنكي", "Payment method must be cash or bank transfer");
  const paidAt = paidAtFrom(body.paidAt);
  const bankReference = optText(body.bankReference ?? body.reference, 120);
  const collector = await requireActiveStaff(prisma, orgId, body.collectedById || req.user.sub);
  const invHead = await prisma.b2bInvoice.findFirst({ where: { id: String(req.params.id), organizationId: orgId }, select: { id: true } });
  if (!invHead) throw fail(404, "B2B_INVOICE_NOT_FOUND", "الفاتورة غير موجودة", "Invoice not found");

  const receiptId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "B2bInvoice" WHERE id = ${invHead.id} FOR UPDATE`;
    const inv = await tx.b2bInvoice.findUnique({
      where: { id: invHead.id },
      include: { orders: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { installments: true, lines: true } } },
    });
    if (!["ISSUED", "PART_PAID"].includes(inv.status)) {
      throw fail(400, "B2B_INVOICE_NOT_OPEN", "الفاتورة مدفوعة بالكامل أو ملغاة", "This invoice is fully paid or cancelled");
    }
    const balance = d(inv.total) - d(inv.amountPaid);
    if (amount > balance) {
      throw fail(400, "B2B_OVERPAY", "المبلغ أكبر من المتبقي على الفاتورة", "The amount is more than the invoice balance", { balance: fmt(balance) });
    }
    const proofFileId = await checkProof(tx, { orgId, userId: req.user.sub, method, proofFileId: body.proofFileId });
    // Where the money came in: the collector's location, else the first note's.
    const branchId = collector.branchId || inv.orders[0].branchId;
    let cashSessionId = null;
    if (method === "CASH") {
      const loc = await tx.branch.findUnique({ where: { id: branchId }, select: { kind: true } });
      if (isTillKind(loc?.kind)) {
        const session = await tx.cashSession.findFirst({ where: { branchId, closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true } });
        cashSessionId = session?.id || null;
      }
    }
    const receipt = await tx.b2bReceipt.create({
      data: {
        organizationId: orgId,
        invoiceId: inv.id,
        customerId: inv.customerId,
        amount,
        method,
        bankReference,
        note: optText(body.note, 500),
        paidAt,
        proofFileId,
        collectedById: collector.id,
        branchId,
        cashSessionId,
        userId: req.user.sub,
      },
    });
    // Spread over the notes, oldest first, each up to its balance.
    let left = amount;
    const parts = [];
    for (const order of inv.orders) {
      if (left <= 0) break;
      const owed = d(order.total) - d(order.amountPaid);
      if (owed <= 0) continue;
      const take = Math.min(owed, left);
      left -= take;
      const before = allocatePaid(order.installments, d(order.amountPaid));
      const after = allocatePaid(order.installments, d(order.amountPaid) + take);
      const allocation = after.map((a, i) => ({ installmentId: a.id, seq: a.seq, amount: a.paid - before[i].paid })).filter((a) => a.amount > 0);
      for (const a of after) await tx.salesOrderInstallment.update({ where: { id: a.id }, data: { amountPaid: a.paid } });
      await tx.salesOrderPayment.create({
        data: {
          orderId: order.id,
          branchId,
          amount: take,
          method,
          reference: bankReference || receipt.reference,
          note: `Cash receipt ${receipt.reference}`,
          paidAt,
          allocation,
          receiptId: receipt.id,
          userId: req.user.sub,
        },
      });
      const amountPaid = d(order.amountPaid) + take;
      const status = settledStatus({ ...order, amountPaid }, order.lines);
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { amountPaid, status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) },
      });
      parts.push({ orderId: order.id, dnReference: order.dnReference, amount: take });
    }
    if (left !== 0) throw fail(409, "B2B_TRY_AGAIN", "تغيّرت الفاتورة. حاول مرة أخرى.", "The invoice changed. Try again.");
    const paid = d(inv.amountPaid) + amount;
    await tx.b2bInvoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: invoiceStatusFor(d(inv.total), paid) } });
    await writeAudit({
      userId: req.user.sub,
      action: "B2B_RECEIPT",
      entityType: "B2bInvoice",
      entityId: inv.id,
      branchId,
      summary: `${receipt.reference} on ${inv.reference}: ${fmt(amount)} ${method}${bankReference ? ` ref ${bankReference}` : ""}, collected by ${collector.nameEn || collector.name}`,
      meta: { receiptId: receipt.id, parts, proofFileId, cashSessionId, collectedById: collector.id },
    }, tx);
    return receipt.id;
  }, TX);
  const receipt = await loadReceipt(prisma, orgId, receiptId);
  res.status(201).json({ receipt: receiptView(receipt), invoice: invoiceView(await loadInvoice(prisma, orgId, receipt.invoiceId)) });
});

function receiptsWhere(req) {
  const where = { organizationId: req.user.organizationId };
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  if (req.query.invoiceId) where.invoiceId = String(req.query.invoiceId);
  const method = String(req.query.method || "").toUpperCase();
  if (B2B_PAY_METHODS.includes(method)) where.method = method;
  if (req.query.collectedById) where.collectedById = String(req.query.collectedById);
  const range = dayRange(req.query);
  if (range) where.paidAt = range;
  const q = String(req.query.q || "").trim();
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { invoice: { reference: { contains: q, mode: "insensitive" } } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

router.get("/receipts", async (req, res) => {
  const rows = await prisma.b2bReceipt.findMany({ where: receiptsWhere(req), orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 300, include: RECEIPT_INCLUDE });
  res.json(rows.map(receiptView));
});

router.get("/receipts/:id", async (req, res) => {
  res.json(receiptView(await loadReceipt(prisma, req.user.organizationId, req.params.id)));
});

// ------------------------------------------------------------------ export

const R = (dh) => (d(dh) / 100).toFixed(2);
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const who = (c) => c?.companyName || c?.name || "";

/** GET /api/b2b/export/:kind (notes | invoices | receipts) — CSV with the list filters. */
router.get("/export/:kind", requireModule("b2b", "export"), async (req, res) => {
  const kind = String(req.params.kind);
  let csv;
  if (kind === "notes") {
    const rows = await prisma.salesOrder.findMany({ where: notesWhere(req), orderBy: { createdAt: "desc" }, take: 5000, include: NOTE_INCLUDE });
    csv = toCsv(
      ["Delivery note", "Order", "Customer", "Location", "Delivery date", "Delivered at", "Status", "Total (QAR)", "Paid (QAR)", "Invoice"],
      rows.map((o) => {
        const v = noteView(o);
        return [o.dnReference, o.reference, who(o.customer), o.branch?.nameEn || o.branch?.name, day(o.deliveryDate), v.deliveredAt ? new Date(v.deliveredAt).toISOString() : "", v.b2bStatus, R(o.total), R(o.amountPaid), o.invoice?.reference || ""];
      }),
    );
  } else if (kind === "invoices") {
    const rows = await prisma.b2bInvoice.findMany({ where: invoicesWhere(req), orderBy: { createdAt: "desc" }, take: 5000, include: INVOICE_INCLUDE });
    csv = toCsv(
      ["Invoice", "Customer", "Invoice date", "Due date", "Status", "Overdue", "Total (QAR)", "Paid (QAR)", "Balance (QAR)", "Delivery notes"],
      rows.map((inv) => {
        const v = invoiceView(inv);
        return [inv.reference, who(inv.customer), v.invoiceDate, v.dueDate, inv.status, v.overdue ? "yes" : "no", R(inv.total), R(inv.amountPaid), v.balance, inv.orders.map((o) => o.dnReference).join(" ")];
      }),
    );
  } else if (kind === "receipts") {
    const rows = await prisma.b2bReceipt.findMany({ where: receiptsWhere(req), orderBy: { paidAt: "desc" }, take: 5000, include: RECEIPT_INCLUDE });
    csv = toCsv(
      ["Receipt", "Invoice", "Customer", "Paid at", "Method", "Bank reference", "Amount (QAR)", "Collected by", "Location", "Cash session"],
      rows.map((r) => [r.reference, r.invoice?.reference, who(r.customer), new Date(r.paidAt).toISOString(), r.method, r.bankReference || "", R(r.amount), r.collectedBy?.nameEn || r.collectedBy?.name, r.branch?.nameEn || r.branch?.name, r.cashSessionId || ""]),
    );
  } else {
    throw fail(400, "B2B_EXPORT_KIND", "نوع التصدير غير معروف", "Unknown export kind");
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="b2b-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
