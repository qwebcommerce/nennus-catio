/**
 * fix-rd — accountant confirmation of money collected outside the till drawer flow
 * (docs/testing/payment-confirmation.md).
 *
 * What waits for confirmation (status PENDING_CONFIRMATION → CONFIRMED | REJECTED):
 *  - B2B cash receipts (B2bReceipt, with their SalesOrderPayment rows),
 *  - sales-order installment payments (SalesOrderPayment without a receipt),
 *  - customer account collections (CustomerAccountLedger PAYMENT entries),
 *  - a driver's cash-on-delivery (one of the above, with dispatchJobId set).
 * Till sales at the POS are not included: they count at once.
 *
 * Rules (owner decision: money counts in finance only after the accountant confirms it):
 *  - finance money in, exports, balances "paid" and installment allocation count CONFIRMED rows
 *    only (SalesOrder.amountPaid, B2bInvoice.amountPaid, Customer.accountBalance move on confirm);
 *  - recorded-but-unconfirmed amounts are kept in amountPending / accountPending: they block
 *    overpaying (the same debt cannot be collected twice) and show as "received, awaiting
 *    confirmation"; a rejection frees them again;
 *  - whoever collected or recorded a payment cannot decide on it (ADMIN excepted);
 *  - every decision is versioned (NFR-13) and audited.
 * Cash drawer: see saleCash.js (drawer cash counts while pending; a rejection made while the
 * session is open takes it out; one made after the cash-up closed leaves the closed cash-up as is).
 */
import { prisma } from "./prisma.js";
import { d, fmt } from "./money.js";
import { fail, optText } from "./bizError.js";
import { writeAudit } from "./auditLog.js";
import { versionedUpdate } from "./recordVersion.js";
import { allocatePaid, lockOrder, settledStatus } from "./salesOrders.js";
import { invoiceStatusFor } from "./b2b.js";
import { FILE_SELECT } from "./businessFiles.js";

export const CONFIRM_STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "REJECTED"];
export const CONFIRM_KINDS = ["B2B_RECEIPT", "SO_PAYMENT", "ACCOUNT_PAYMENT"];
export const TX = { maxWait: 10000, timeout: 30000 };

export { CONFIRMED, inDrawerWhere } from "./paymentConfirmWhere.js";

const PERSON = { select: { id: true, name: true, nameEn: true, role: true } };
const PLACE = { select: { id: true, name: true, nameEn: true, kind: true } };
const CUSTOMER = { select: { id: true, name: true, companyName: true, phone: true } };

const SO_PAYMENT_INC = {
  order: { select: { id: true, organizationId: true, reference: true, dnReference: true, orderType: true, customer: CUSTOMER, invoice: { select: { id: true, reference: true } } } },
  branch: PLACE,
  proofFile: { select: FILE_SELECT },
  user: PERSON,
  collectedBy: PERSON,
  confirmedBy: PERSON,
  rejectedBy: PERSON,
};
const RECEIPT_INC = {
  invoice: { select: { id: true, reference: true } },
  customer: CUSTOMER,
  branch: PLACE,
  proofFile: { select: FILE_SELECT },
  user: PERSON,
  collectedBy: PERSON,
  confirmedBy: PERSON,
  rejectedBy: PERSON,
  cashSession: { select: { id: true, closedAt: true } },
  payments: { select: { id: true, amount: true, order: { select: { id: true, reference: true, dnReference: true } } } },
};
const LEDGER_INC = {
  customer: CUSTOMER,
  branch: PLACE,
  proofFile: { select: FILE_SELECT },
  createdBy: PERSON,
  collectedBy: PERSON,
  confirmedBy: PERSON,
  rejectedBy: PERSON,
  sale: { select: { id: true, reference: true, invoiceNumber: true } },
};

const money = (dh) => fmt(Math.abs(d(dh)));

function common(row) {
  return {
    version: row.version,
    status: row.confirmStatus,
    method: row.method || row.paymentMethod || null,
    proofFile: row.proofFile || null,
    branch: row.branch || null,
    collectedBy: row.collectedBy || null,
    confirmedAt: row.confirmedAt,
    confirmedBy: row.confirmedBy || null,
    rejectedAt: row.rejectedAt,
    rejectedBy: row.rejectedBy || null,
    rejectReason: row.rejectReason || null,
    viaDriver: Boolean(row.dispatchJobId),
    dispatchJobId: row.dispatchJobId || null,
    createdAt: row.createdAt,
  };
}

/** One queue row (the same shape for every kind). */
export function queueRow(kind, row) {
  if (kind === "B2B_RECEIPT") {
    return {
      key: `B2B_RECEIPT:${row.id}`,
      kind,
      id: row.id,
      ...common(row),
      amount: money(row.amount),
      reference: row.bankReference || null,
      document: row.reference,
      invoiceRef: row.invoice?.reference || null,
      orderRefs: (row.payments || []).map((p) => p.order?.dnReference || p.order?.reference).filter(Boolean),
      customer: row.customer ? { id: row.customer.id, name: row.customer.companyName || row.customer.name, phone: row.customer.phone } : null,
      recordedBy: row.user || null,
      paidAt: row.paidAt,
      cashSession: row.cashSession ? { id: row.cashSession.id, closed: Boolean(row.cashSession.closedAt) } : null,
    };
  }
  if (kind === "SO_PAYMENT") {
    const o = row.order;
    return {
      key: `SO_PAYMENT:${row.id}`,
      kind,
      id: row.id,
      ...common(row),
      amount: money(row.amount),
      reference: row.reference || null,
      document: o?.orderType === "B2B" && o?.dnReference ? o.dnReference : o?.reference,
      invoiceRef: o?.invoice?.reference || null,
      orderRefs: [o?.reference].filter(Boolean),
      orderId: o?.id || null,
      customer: o?.customer ? { id: o.customer.id, name: o.customer.companyName || o.customer.name, phone: o.customer.phone } : null,
      recordedBy: row.user || null,
      paidAt: row.paidAt,
      cashSession: null,
    };
  }
  return {
    key: `ACCOUNT_PAYMENT:${row.id}`,
    kind,
    id: row.id,
    ...common(row),
    amount: money(row.amount),
    reference: row.reference || null,
    document: row.sale ? row.sale.reference || row.sale.invoiceNumber : null,
    invoiceRef: row.sale?.invoiceNumber || null,
    orderRefs: [],
    customer: row.customer ? { id: row.customer.id, name: row.customer.companyName || row.customer.name, phone: row.customer.phone } : null,
    recordedBy: row.createdBy || null,
    paidAt: row.createdAt,
    cashSession: null,
  };
}

function dayStart(s) {
  return new Date(`${s}T00:00:00+03:00`);
}

/**
 * The queue: ?status=PENDING_CONFIRMATION (default) | CONFIRMED | REJECTED | ALL, kind, method,
 * collectedById, from / to (Qatar days, by payment date), q (reference, customer, document).
 */
export async function listConfirmations(orgId, query = {}) {
  const status = String(query.status || "PENDING_CONFIRMATION").toUpperCase();
  const st = CONFIRM_STATUSES.includes(status) ? { confirmStatus: status } : {};
  const kind = CONFIRM_KINDS.includes(String(query.kind || "").toUpperCase()) ? String(query.kind).toUpperCase() : "";
  const method = String(query.method || "").toUpperCase();
  const who = query.collectedById ? String(query.collectedById) : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || "")) ? dayStart(query.from) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || "")) ? new Date(dayStart(query.to).getTime() + 86400000) : null;
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : null;
  const q = String(query.q || "").trim();
  const take = Math.min(500, Math.max(1, Number(query.limit) || 300));
  const ci = (v) => ({ contains: v, mode: "insensitive" });
  const viaDriver = query.via === "driver" ? { dispatchJobId: { not: null } } : {};

  const [receipts, soPays, ledger] = await Promise.all([
    !kind || kind === "B2B_RECEIPT"
      ? prisma.b2bReceipt.findMany({
        where: {
          organizationId: orgId, ...st, ...viaDriver,
          ...(method ? { method } : {}),
          ...(who ? { collectedById: who } : {}),
          ...(range ? { paidAt: range } : {}),
          ...(q ? { OR: [{ reference: ci(q) }, { bankReference: ci(q) }, { invoice: { reference: ci(q) } }, { customer: { name: ci(q) } }, { customer: { companyName: ci(q) } }] } : {}),
        },
        include: RECEIPT_INC, orderBy: [{ paidAt: "desc" }, { id: "desc" }], take,
      })
      : [],
    !kind || kind === "SO_PAYMENT"
      ? prisma.salesOrderPayment.findMany({
        where: {
          receiptId: null, order: { organizationId: orgId }, ...st, ...viaDriver,
          ...(method ? { method } : {}),
          ...(who ? { collectedByUserId: who } : {}),
          ...(range ? { paidAt: range } : {}),
          ...(q ? { OR: [{ reference: ci(q) }, { order: { reference: ci(q) } }, { order: { dnReference: ci(q) } }, { order: { customer: { name: ci(q) } } }, { order: { customer: { companyName: ci(q) } } }] } : {}),
        },
        include: SO_PAYMENT_INC, orderBy: [{ paidAt: "desc" }, { id: "desc" }], take,
      })
      : [],
    !kind || kind === "ACCOUNT_PAYMENT"
      ? prisma.customerAccountLedger.findMany({
        where: {
          organizationId: orgId, entryType: "PAYMENT", ...st, ...viaDriver,
          ...(method ? { paymentMethod: method } : {}),
          ...(who ? { collectedByUserId: who } : {}),
          ...(range ? { createdAt: range } : {}),
          ...(q ? { OR: [{ reference: ci(q) }, { customer: { name: ci(q) } }, { customer: { phone: { contains: q } } }, { sale: { invoiceNumber: ci(q) } }, { sale: { reference: ci(q) } }] } : {}),
        },
        include: LEDGER_INC, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
      })
      : [],
  ]);
  const rows = [
    ...receipts.map((r) => queueRow("B2B_RECEIPT", r)),
    ...soPays.map((r) => queueRow("SO_PAYMENT", r)),
    ...ledger.map((r) => queueRow("ACCOUNT_PAYMENT", r)),
  ].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt) || String(b.id).localeCompare(String(a.id))).slice(0, take);
  const total = rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
  return { rows, totals: { count: rows.length, amount: fmt(total) } };
}

/** Pending count and amount (sidebar badge, Dashboard card). */
export async function pendingCount(orgId) {
  const pending = { confirmStatus: "PENDING_CONFIRMATION" };
  const [r, p, l] = await Promise.all([
    prisma.b2bReceipt.aggregate({ where: { organizationId: orgId, ...pending }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.salesOrderPayment.aggregate({ where: { receiptId: null, order: { organizationId: orgId }, ...pending }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.customerAccountLedger.aggregate({ where: { organizationId: orgId, entryType: "PAYMENT", ...pending }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const amount = d(r._sum.amount) + d(p._sum.amount) + Math.abs(d(l._sum.amount));
  return {
    pending: r._count._all + p._count._all + l._count._all,
    amount: fmt(amount),
    byKind: { B2B_RECEIPT: r._count._all, SO_PAYMENT: p._count._all, ACCOUNT_PAYMENT: l._count._all },
  };
}

export function parseKey(key) {
  const [kind, id] = String(key || "").split(":");
  if (!CONFIRM_KINDS.includes(kind) || !id) throw fail(404, "PAYMENT_CONFIRM_NOT_FOUND", "الدفعة غير موجودة", "Payment not found");
  return { kind, id };
}

/** The payment row in this organisation (any status). */
async function loadRow(db, orgId, kind, id) {
  let row = null;
  if (kind === "B2B_RECEIPT") row = await db.b2bReceipt.findFirst({ where: { id, organizationId: orgId }, include: RECEIPT_INC });
  else if (kind === "SO_PAYMENT") row = await db.salesOrderPayment.findFirst({ where: { id, order: { organizationId: orgId } }, include: SO_PAYMENT_INC });
  else row = await db.customerAccountLedger.findFirst({ where: { id, organizationId: orgId, entryType: "PAYMENT" }, include: LEDGER_INC });
  if (!row) throw fail(404, "PAYMENT_CONFIRM_NOT_FOUND", "الدفعة غير موجودة", "Payment not found");
  return row;
}

export async function loadConfirmation(orgId, key) {
  const { kind, id } = parseKey(key);
  return queueRow(kind, await loadRow(prisma, orgId, kind, id));
}

/** Whoever collected or recorded the money cannot decide on it (the top admin excepted). */
function assertNotOwn(user, kind, row) {
  if (user.role === "ADMIN") return;
  const recorder = kind === "ACCOUNT_PAYMENT" ? row.createdByUserId : row.userId;
  const collector = kind === "B2B_RECEIPT" ? row.collectedById : row.collectedByUserId;
  if (user.sub === recorder || user.sub === collector) {
    throw fail(403, "PAYMENT_SELF_CONFIRM", "لا يمكنك تأكيد أو رفض دفعة حصّلتها أو سجّلتها بنفسك", "You cannot confirm or reject a payment you collected or recorded yourself");
  }
}

function assertPending(row) {
  if (row.confirmStatus !== "PENDING_CONFIRMATION") {
    throw fail(409, "PAYMENT_ALREADY_DECIDED", "تم البت في هذه الدفعة من قبل", "This payment was already confirmed or rejected", { status: row.confirmStatus });
  }
}

/** Confirmed money reaches the order: installments (oldest first), amountPaid, status. */
async function applyToOrder(tx, orgId, orderId, amount) {
  await lockOrder(tx, orgId, orderId);
  const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { installments: true, lines: true } });
  const before = allocatePaid(order.installments, d(order.amountPaid));
  const after = allocatePaid(order.installments, d(order.amountPaid) + amount);
  const allocation = after.map((a, i) => ({ installmentId: a.id, seq: a.seq, amount: a.paid - before[i].paid })).filter((a) => a.amount > 0);
  for (const a of after) if (a.paid !== before.find((b) => b.id === a.id).paid) await tx.salesOrderInstallment.update({ where: { id: a.id }, data: { amountPaid: a.paid } });
  const amountPaid = d(order.amountPaid) + amount;
  const status = settledStatus({ ...order, amountPaid }, order.lines);
  await tx.salesOrder.update({
    where: { id: order.id },
    data: { amountPaid, amountPending: { decrement: amount }, status, ...(status === "COMPLETED" && order.status !== "COMPLETED" ? { completedAt: new Date() } : {}) },
  });
  return allocation;
}

async function releaseFromOrder(tx, orgId, orderId, amount) {
  await lockOrder(tx, orgId, orderId);
  await tx.salesOrder.update({ where: { id: orderId }, data: { amountPending: { decrement: amount } } });
}

/** Cash in a till session that is already closed (a rejection then leaves that cash-up as it was). */
async function closedDrawerNote(tx, kind, row) {
  const method = row.method || row.paymentMethod;
  if (method !== "CASH") return null;
  if (kind === "B2B_RECEIPT" && row.cashSession) return { cashSessionId: row.cashSession.id, closed: Boolean(row.cashSession.closedAt) };
  const at = row.createdAt;
  const session = await tx.cashSession.findFirst({
    where: { branchId: row.branchId, openedAt: { lte: at }, OR: [{ closedAt: null }, { closedAt: { gte: at } }] },
    select: { id: true, closedAt: true },
    orderBy: { openedAt: "desc" },
  });
  return session ? { cashSessionId: session.id, closed: Boolean(session.closedAt) } : null;
}

/**
 * Confirm (decision = "CONFIRM") or reject ("REJECT", reason required) one queue row.
 * `user` = req.user. Returns the fresh queue row.
 */
export async function decide({ user, key, version, decision, reason }) {
  const orgId = user.organizationId;
  const { kind, id } = parseKey(key);
  const why = optText(reason, 500);
  if (decision === "REJECT" && !why) throw fail(400, "REASON_REQUIRED", "اكتب سبب الرفض", "Enter the reason for rejecting");
  const head = await loadRow(prisma, orgId, kind, id);
  assertNotOwn(user, kind, head);
  assertPending(head);
  const now = new Date();
  const confirmData = { confirmStatus: "CONFIRMED", confirmedAt: now, confirmedByUserId: user.sub };
  const rejectData = { confirmStatus: "REJECTED", rejectedAt: now, rejectedByUserId: user.sub, rejectReason: why };
  const pendingOnly = { confirmStatus: "PENDING_CONFIRMATION" };

  await prisma.$transaction(async (tx) => {
    let meta = {};
    let amount = 0;
    let branchId = head.branchId || null;
    if (kind === "B2B_RECEIPT") {
      await tx.$queryRaw`SELECT id FROM "B2bInvoice" WHERE id = ${head.invoiceId} FOR UPDATE`;
      await versionedUpdate(tx, "b2bReceipt", { id, version, where: pendingOnly, data: decision === "CONFIRM" ? confirmData : rejectData });
      amount = d(head.amount);
      const pays = await tx.salesOrderPayment.findMany({ where: { receiptId: id }, orderBy: { id: "asc" } });
      const parts = [];
      for (const p of pays) {
        if (decision === "CONFIRM") {
          const allocation = await applyToOrder(tx, orgId, p.orderId, d(p.amount));
          await tx.salesOrderPayment.update({ where: { id: p.id }, data: { ...confirmData, allocation } });
          parts.push({ paymentId: p.id, orderId: p.orderId, amount: fmt(p.amount), allocation });
        } else {
          await releaseFromOrder(tx, orgId, p.orderId, d(p.amount));
          await tx.salesOrderPayment.update({ where: { id: p.id }, data: rejectData });
          parts.push({ paymentId: p.id, orderId: p.orderId, amount: fmt(p.amount) });
        }
      }
      const inv = await tx.b2bInvoice.findUnique({ where: { id: head.invoiceId } });
      const paid = d(inv.amountPaid) + (decision === "CONFIRM" ? amount : 0);
      await tx.b2bInvoice.update({
        where: { id: inv.id },
        data: {
          amountPending: { decrement: amount },
          ...(decision === "CONFIRM" ? { amountPaid: paid, status: inv.status === "CANCELLED" ? "CANCELLED" : invoiceStatusFor(d(inv.total), paid) } : {}),
        },
      });
      meta = { receipt: head.reference, invoice: head.invoice?.reference, parts };
    } else if (kind === "SO_PAYMENT") {
      amount = d(head.amount);
      if (decision === "CONFIRM") {
        await lockOrder(tx, orgId, head.orderId);
        await versionedUpdate(tx, "salesOrderPayment", { id, version, where: pendingOnly, data: confirmData });
        const allocation = await applyToOrder(tx, orgId, head.orderId, amount);
        await tx.salesOrderPayment.update({ where: { id }, data: { allocation } });
        meta = { order: head.order?.reference, allocation };
      } else {
        await lockOrder(tx, orgId, head.orderId);
        await versionedUpdate(tx, "salesOrderPayment", { id, version, where: pendingOnly, data: rejectData });
        await releaseFromOrder(tx, orgId, head.orderId, amount);
        meta = { order: head.order?.reference };
      }
    } else {
      amount = Math.abs(d(head.amount));
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${head.customerId} FOR UPDATE`;
      await versionedUpdate(tx, "customerAccountLedger", { id, version, where: pendingOnly, data: decision === "CONFIRM" ? confirmData : rejectData });
      await tx.customer.update({
        where: { id: head.customerId },
        data: { accountPending: { decrement: amount }, ...(decision === "CONFIRM" ? { accountBalance: { decrement: amount } } : {}) },
      });
      meta = { customerId: head.customerId, saleId: head.saleId || null };
    }
    const drawer = decision === "REJECT" ? await closedDrawerNote(tx, kind, head) : null;
    await writeAudit({
      userId: user.sub,
      action: decision === "CONFIRM" ? "PAYMENT_CONFIRM" : "PAYMENT_REJECT",
      entityType: kind === "B2B_RECEIPT" ? "B2bReceipt" : kind === "SO_PAYMENT" ? "SalesOrderPayment" : "CustomerAccountLedger",
      entityId: id,
      branchId,
      summary: `${decision === "CONFIRM" ? "Confirmed" : "Rejected"} ${kind} ${fmt(amount)} ${head.method || head.paymentMethod || ""}${why ? `: ${why}` : ""}`,
      meta: {
        ...meta,
        amount: fmt(amount),
        method: head.method || head.paymentMethod || null,
        collectedById: kind === "B2B_RECEIPT" ? head.collectedById : head.collectedByUserId,
        reason: why,
        ...(drawer ? { drawer, rejectedAfterCashUpClosed: drawer.closed } : {}),
      },
    }, tx);
  }, TX);
  return loadConfirmation(orgId, key);
}
