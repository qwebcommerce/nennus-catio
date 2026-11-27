/**
 * B2B / Wholesale: delivery note → invoice → cash receipt, built on the sales-orders engine.
 *
 * - Delivery note (DN-000001) = a SalesOrder with orderType B2B and a dnReference. Issuing it
 *   confirms it; delivering it moves the stock out through the sales-order delivery
 *   (lib/soDelivery.js), so revenue and cost are recognised at delivery, as for any sales order.
 * - Invoice (INV-000001) = B2bInvoice over one or more delivered notes of one customer. Its due
 *   date (invoice date + payment terms) becomes the due date of each note's single installment,
 *   so the existing pending payments (lib/pending.js) show it.
 * - Cash receipt (RC-000001) = B2bReceipt against an invoice: cash or bank transfer (proof
 *   required), partial allowed, overpaying refused. It is spread over the invoice's notes oldest
 *   first as SalesOrderPayment rows (receiptId), so money in, the cash-up and finance count it
 *   exactly once, through the same rows as every sales-order payment.
 *
 * Statuses shown on a note: ISSUED (not delivered yet) → DELIVERED (not invoiced) → INVOICED →
 * PART_PAID → PAID; CANCELLED. All amounts whole dirhams (NFR-03); the API speaks riyals.
 */
import { d } from "./money.js";
import { toApi } from "./moneyFields.js";
import { fail, dayOf } from "./bizError.js";
import { qatarDayKey, qatarDayStart } from "./qatarTime.js";
import { FILE_SELECT } from "./businessFiles.js";
import { SO_INCLUDE, soView } from "./salesOrders.js";

export const B2B_PAY_METHODS = ["CASH", "BANK_TRANSFER"];
export const NOTE_STATUSES = ["ISSUED", "DELIVERED", "INVOICED", "PART_PAID", "PAID", "CANCELLED"];
export const INVOICE_STATUSES = ["ISSUED", "PART_PAID", "PAID", "CANCELLED"];

const PERSON = { select: { id: true, name: true, nameEn: true } };
const CUSTOMER = { select: { id: true, name: true, companyName: true, phone: true, email: true, address: true, isBusiness: true } };
const BRANCH = { select: { id: true, name: true, nameEn: true, kind: true, address: true } };

export const NOTE_INCLUDE = {
  ...SO_INCLUDE,
  customer: CUSTOMER,
  branch: BRANCH,
  invoice: { select: { id: true, reference: true, status: true, invoiceDate: true, dueDate: true, total: true, amountPaid: true } },
};

export const RECEIPT_INCLUDE = {
  customer: CUSTOMER,
  invoice: { select: { id: true, reference: true, total: true, amountPaid: true, status: true, invoiceDate: true, dueDate: true } },
  collectedBy: PERSON,
  user: PERSON,
  branch: BRANCH,
  proofFile: { select: FILE_SELECT },
  payments: { select: { id: true, orderId: true, amount: true, order: { select: { id: true, reference: true, dnReference: true } } } },
};

export const INVOICE_INCLUDE = {
  customer: CUSTOMER,
  user: PERSON,
  orders: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      branch: BRANCH,
      lines: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          product: { select: { id: true, name: true, nameEn: true, sku: true, sellBy: true } },
          variant: { select: { id: true, label: true, labelEn: true, sku: true } },
        },
      },
      deliveries: { select: { deliveredAt: true }, orderBy: { deliveredAt: "asc" } },
    },
  },
  receipts: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }], include: { collectedBy: PERSON, user: PERSON, proofFile: { select: FILE_SELECT } } },
};

const fmt2 = (dh) => (dh / 100).toFixed(2);

/** Today in Qatar as a @db.Date value. */
export function todayDate() {
  return new Date(`${qatarDayKey()}T00:00:00Z`);
}

/** Status of a delivery note for the B2B tab. */
export function noteStatus(order) {
  if (order.status === "CANCELLED") return "CANCELLED";
  const delivered = (order.lines || []).length > 0 && order.lines.every((l) => l.quantityDelivered >= l.quantity);
  if (!delivered) return "ISSUED";
  const inv = order.invoice;
  if (!inv || inv.status === "CANCELLED") return "DELIVERED";
  if (inv.status === "PAID") return "PAID";
  if (inv.status === "PART_PAID") return "PART_PAID";
  return "INVOICED";
}

/** Prisma filter for a note status (orders of type B2B). */
export function noteStatusWhere(status) {
  switch (status) {
    case "CANCELLED":
      return { status: "CANCELLED" };
    case "ISSUED":
      return { status: { in: ["CONFIRMED", "PARTLY_DELIVERED"] } };
    case "DELIVERED":
      return { status: { in: ["DELIVERED", "COMPLETED"] }, invoiceId: null };
    case "INVOICED":
      return { invoice: { status: "ISSUED" } };
    case "PART_PAID":
      return { invoice: { status: "PART_PAID" } };
    case "PAID":
      return { invoice: { status: "PAID" } };
    default:
      return {};
  }
}

/** Qatar-day range filter on a timestamp column: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). */
export function dayRange(query) {
  const out = {};
  const from = String(query?.from || "").slice(0, 10);
  const to = String(query?.to || "").slice(0, 10);
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(qatarDayStart(s).getTime());
  if (from) {
    if (!ok(from)) throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
    out.gte = qatarDayStart(from);
  }
  if (to) {
    if (!ok(to)) throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
    out.lt = new Date(qatarDayStart(to).getTime() + 86400000);
  }
  return Object.keys(out).length ? out : null;
}

/** Same for @db.Date columns (stored as UTC midnight of the calendar day). */
export function dateRange(query) {
  const out = {};
  const from = String(query?.from || "").slice(0, 10);
  const to = String(query?.to || "").slice(0, 10);
  if (from) out.gte = new Date(`${from}T00:00:00Z`);
  if (to) out.lte = new Date(`${to}T00:00:00Z`);
  for (const v of Object.values(out)) if (Number.isNaN(v.getTime())) throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
  return Object.keys(out).length ? out : null;
}

export function noteView(order) {
  const view = soView(order);
  const deliveredAt = (order.deliveries || []).length ? order.deliveries[order.deliveries.length - 1].deliveredAt : null;
  return {
    ...view,
    dnReference: order.dnReference,
    b2bStatus: noteStatus(order),
    deliveredAt,
    invoice: order.invoice ? toApi("B2bInvoice", order.invoice) : null,
  };
}

export function invoiceView(inv, today = qatarDayKey()) {
  const view = toApi("B2bInvoice", inv);
  const balance = d(inv.total) - d(inv.amountPaid);
  const open = inv.status === "ISSUED" || inv.status === "PART_PAID";
  const due = dayOf(inv.dueDate);
  const overdue = open && balance > 0 && due < today;
  const daysOverdue = overdue ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000) : 0;
  return {
    ...view,
    invoiceDate: dayOf(inv.invoiceDate),
    dueDate: due,
    balance: fmt2(balance),
    overdue,
    daysOverdue,
    orders: (inv.orders || []).map((o) => ({
      ...toApi("SalesOrder", o),
      deliveredAt: o.deliveries?.length ? o.deliveries[o.deliveries.length - 1].deliveredAt : null,
    })),
    receipts: toApi("B2bReceipt", inv.receipts || []),
  };
}

export function receiptView(r) {
  return {
    ...toApi("B2bReceipt", r),
    invoice: r.invoice ? { ...toApi("B2bInvoice", r.invoice), invoiceDate: dayOf(r.invoice.invoiceDate), dueDate: dayOf(r.invoice.dueDate) } : null,
    payments: (r.payments || []).map((p) => ({ ...toApi("SalesOrderPayment", p) })),
  };
}

export function invoiceStatusFor(total, paid) {
  if (total <= 0 || paid >= total) return "PAID";
  return paid > 0 ? "PART_PAID" : "ISSUED";
}

/** Payment date: today (now) or an earlier Qatar day (noon that day). Never in the future. */
export function paidAtFrom(raw) {
  if (raw == null || String(raw).trim() === "") return new Date();
  const day = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
  const today = qatarDayKey();
  if (day > today) throw fail(400, "PAYMENT_DATE_FUTURE", "لا يمكن تسجيل دفعة بتاريخ لاحق", "A payment cannot be dated in the future");
  if (day === today) return new Date();
  return new Date(qatarDayStart(day).getTime() + 12 * 3600 * 1000);
}

export async function loadNote(db, orgId, id) {
  const order = await db.salesOrder.findFirst({ where: { id: String(id), organizationId: orgId, orderType: "B2B" }, include: NOTE_INCLUDE });
  if (!order) throw fail(404, "B2B_NOTE_NOT_FOUND", "سند التسليم غير موجود", "Delivery note not found");
  return order;
}

export async function loadInvoice(db, orgId, id) {
  const inv = await db.b2bInvoice.findFirst({ where: { id: String(id), organizationId: orgId }, include: INVOICE_INCLUDE });
  if (!inv) throw fail(404, "B2B_INVOICE_NOT_FOUND", "الفاتورة غير موجودة", "Invoice not found");
  return inv;
}

export async function loadReceipt(db, orgId, id) {
  const r = await db.b2bReceipt.findFirst({ where: { id: String(id), organizationId: orgId }, include: RECEIPT_INCLUDE });
  if (!r) throw fail(404, "B2B_RECEIPT_NOT_FOUND", "سند القبض غير موجود", "Cash receipt not found");
  return r;
}

/** Next human reference from a sequence (DN-000001 …). */
export async function nextReference(tx, prefix, seq) {
  const rows = await tx.$queryRawUnsafe(`SELECT nc_ref($1::text, $2::regclass) AS ref`, prefix, seq);
  return rows[0].ref;
}

/**
 * Money owed per customer for the B2B tab: invoices not fully paid (amount, invoice date, due
 * date, overdue) and delivery notes delivered but not invoiced yet.
 */
export async function pendingByCustomer(db, orgId, { customerId = "" } = {}) {
  const today = qatarDayKey();
  const [invoices, notes] = await Promise.all([
    db.b2bInvoice.findMany({
      where: { organizationId: orgId, status: { in: ["ISSUED", "PART_PAID"] }, ...(customerId ? { customerId } : {}) },
      include: { customer: CUSTOMER },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    db.salesOrder.findMany({
      where: {
        organizationId: orgId,
        orderType: "B2B",
        invoiceId: null,
        status: { in: ["DELIVERED", "COMPLETED"] },
        ...(customerId ? { customerId } : {}),
      },
      include: { customer: CUSTOMER, deliveries: { select: { deliveredAt: true }, orderBy: { deliveredAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const byCustomer = new Map();
  const entry = (c) => {
    if (!byCustomer.has(c.id)) {
      byCustomer.set(c.id, {
        customerId: c.id,
        customer: c.companyName || c.name,
        contact: c.name,
        invoices: [],
        notInvoiced: [],
        owed: 0,
        overdue: 0,
        notInvoicedTotal: 0,
      });
    }
    return byCustomer.get(c.id);
  };
  for (const inv of invoices) {
    const e = entry(inv.customer);
    const owed = d(inv.total) - d(inv.amountPaid);
    const due = dayOf(inv.dueDate);
    const overdue = owed > 0 && due < today;
    e.invoices.push({
      id: inv.id,
      reference: inv.reference,
      invoiceDate: dayOf(inv.invoiceDate),
      dueDate: due,
      total: fmt2(d(inv.total)),
      paid: fmt2(d(inv.amountPaid)),
      owed: fmt2(owed),
      overdue,
      daysOverdue: overdue ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000) : 0,
      status: inv.status,
    });
    e.owed += owed;
    if (overdue) e.overdue += owed;
  }
  for (const o of notes) {
    const e = entry(o.customer);
    const total = d(o.total) - d(o.amountPaid);
    e.notInvoiced.push({
      id: o.id,
      dnReference: o.dnReference,
      deliveredAt: o.deliveries.length ? o.deliveries[o.deliveries.length - 1].deliveredAt : null,
      total: fmt2(d(o.total)),
    });
    e.notInvoicedTotal += total;
  }
  const rows = [...byCustomer.values()].map((e) => ({
    ...e,
    owed: fmt2(e.owed),
    overdue: fmt2(e.overdue),
    notInvoicedTotal: fmt2(e.notInvoicedTotal),
  }));
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.owed) - Number(a.owed) || a.customer.localeCompare(b.customer));
  const totals = rows.reduce(
    (t, r) => ({ owed: t.owed + Math.round(Number(r.owed) * 100), overdue: t.overdue + Math.round(Number(r.overdue) * 100), notInvoiced: t.notInvoiced + Math.round(Number(r.notInvoicedTotal) * 100) }),
    { owed: 0, overdue: 0, notInvoiced: 0 },
  );
  return { asOf: today, customers: rows, totals: { owed: fmt2(totals.owed), overdue: fmt2(totals.overdue), notInvoiced: fmt2(totals.notInvoiced) } };
}

/** CSV with a BOM (Excel opens Arabic correctly). */
export function toCsv(header, rows) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
