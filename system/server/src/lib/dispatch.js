/**
 * fix-rb — drivers and dispatch: delivery jobs (DispatchJob), assignment history (DispatchEvent)
 * and driver change requests (DriverChangeRequest). See docs/testing/drivers-dispatch.md.
 *
 * A job is made the first time an order is assigned (or edited on the assignment screen). Until
 * then the order is an assignable "candidate", found from its own tables:
 *  - WEB_ORDER     website delivery orders that are confirmed / preparing / out for delivery
 *  - POS_DELIVERY  shop-till sales marked "for delivery" (or paid on delivery)
 *  - SALES_ORDER   confirmed sales orders with goods still to deliver
 *  - GROOMING      home-visit grooming bookings (grooming vans only)
 * Items are addressed by a key "<KIND>:<order id>".
 *
 * Money: whole dirhams in the database, riyal strings in the API (NFR-03). Nothing here moves
 * stock or money itself: deliveries and order edits go through the order's own paths
 * (lib/soDelivery.js, lib/webOrderStatus.js, the sales-order pricing helpers).
 */
import { prisma } from "./prisma.js";
import { writeAudit } from "./auditLog.js";
import { d, fmt, lineAmount } from "./money.js";
import { addDays, dayOf, fail, optDate, optText } from "./bizError.js";
import { qatarDayKey, qatarDayStart } from "./qatarTime.js";
import { resolveStoredImageUrl } from "./productImageUrl.js";
import { priceOrder } from "./salesOrders.js";

export const TX = { maxWait: 10000, timeout: 30000 };
export const KINDS = ["WEB_ORDER", "POS_DELIVERY", "SALES_ORDER", "GROOMING"];
/** Jobs still on someone's list (or waiting for a driver). */
export const OPEN_JOB = ["UNASSIGNED", "ASSIGNED", "ACCEPTED", "DECLINED"];
export const ON_VAN = ["ASSIGNED", "ACCEPTED"];

const WEB_OPEN = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
const SO_OPEN = ["CONFIRMED", "PARTLY_DELIVERED"];
const APPT_OPEN = ["BOOKED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"];
const POS_DAYS = 30;

const PERSON = { select: { id: true, name: true, nameEn: true } };
const PRODUCT = { select: { id: true, name: true, nameEn: true, sellBy: true, imageUrl: true } };
const VARIANT = { select: { id: true, label: true, labelEn: true } };
const CUSTOMER = { select: { id: true, name: true, phone: true, address: true, companyName: true } };
const AREA = { select: { id: true, name: true, nameEn: true, city: true, zone: true } };

export const SALE_INC = {
  customer: CUSTOMER,
  deliveryArea: AREA,
  deliveryWindow: { select: { id: true, label: true, labelEn: true, startTime: true, endTime: true } },
  items: { include: { product: PRODUCT, variant: VARIANT } },
  branch: { select: { id: true, name: true, nameEn: true, kind: true } },
};
export const SO_INC = {
  customer: CUSTOMER,
  lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { product: PRODUCT, variant: VARIANT } },
  branch: { select: { id: true, name: true, nameEn: true, kind: true } },
};
export const APPT_INC = {
  customer: CUSTOMER,
  service: { select: { id: true, name: true, nameEn: true } },
  area: AREA,
};
export const JOB_INC = {
  sale: { include: SALE_INC },
  salesOrder: { include: SO_INC },
  appointment: { include: APPT_INC },
  vehicle: { select: { id: true, name: true, plate: true, type: true, branchId: true } },
  driver: PERSON,
  area: AREA,
  assignedBy: PERSON,
  changeRequests: { where: { status: "PENDING" }, select: { id: true, version: true, createdAt: true } },
};

export function keyOf(kind, id) {
  return `${kind}:${id}`;
}

export function parseKey(raw) {
  const m = /^(WEB_ORDER|POS_DELIVERY|SALES_ORDER|GROOMING):([A-Za-z0-9_-]{1,64})$/.exec(String(raw || ""));
  if (!m) throw fail(400, "DISPATCH_KEY_INVALID", "طلب غير صالح للتوصيل", "Not a valid delivery order");
  return { kind: m[1], sourceId: m[2] };
}

const sourceField = { WEB_ORDER: "saleId", POS_DELIVERY: "saleId", SALES_ORDER: "salesOrderId", GROOMING: "appointmentId" };

// ------------------------------------------------------------------ till "for delivery"

/**
 * Till sale for delivery: { forDelivery: true, customerId, deliveryAddress, deliveryAreaId?,
 * deliveryDate?, deliveryWindowId? }. Returns the Sale columns to save, or null.
 */
export async function parseTillDelivery(db, orgId, body, { customerId, deliveryAddress }) {
  if (!(body?.forDelivery === true || body?.forDelivery === "true")) return null;
  if (!customerId || !String(customerId).trim()) {
    throw fail(400, "DISPATCH_CUSTOMER_REQUIRED", "اختر العميل لطلب التوصيل", "Choose the customer for a delivery order");
  }
  if (!deliveryAddress) {
    throw fail(400, "DISPATCH_ADDRESS_REQUIRED", "أدخل عنوان التوصيل", "Enter the delivery address");
  }
  const out = { fulfillment: "DELIVERY", deliveryAddress, deliveryDate: optDate(body.deliveryDate, "deliveryDate") || new Date(`${qatarDayKey()}T00:00:00Z`) };
  if (body.deliveryAreaId) {
    const area = await db.deliveryArea.findFirst({ where: { id: String(body.deliveryAreaId), organizationId: orgId, isActive: true }, select: { id: true } });
    if (!area) throw fail(400, "DISPATCH_AREA_INVALID", "منطقة التوصيل غير صالحة", "Choose a valid delivery area");
    out.deliveryAreaId = area.id;
  }
  if (body.deliveryWindowId) {
    const win = await db.deliveryWindow.findFirst({ where: { id: String(body.deliveryWindowId), organizationId: orgId, isActive: true }, select: { id: true } });
    if (!win) throw fail(400, "DISPATCH_WINDOW_INVALID", "وقت التوصيل غير صالح", "Choose a valid delivery time window");
    out.deliveryWindowId = win.id;
  }
  return out;
}

// ------------------------------------------------------------------ candidates and views

function posWhere(orgId) {
  return {
    orderChannel: "IN_STORE",
    branch: { organizationId: orgId },
    invoiceStatus: { not: "CANCELLED" },
    OR: [{ fulfillment: "DELIVERY" }, { paymentMethod: "ON_DELIVERY" }],
    createdAt: { gte: new Date(Date.now() - POS_DAYS * 86400000) },
  };
}

/** Orders that can be assigned and have no job yet, by kind. */
export async function candidateSources(db, orgId, kinds = KINDS) {
  const want = new Set(kinds);
  const todayStart = qatarDayStart(qatarDayKey());
  const [web, pos, so, appt] = await Promise.all([
    want.has("WEB_ORDER")
      ? db.sale.findMany({ where: { orderChannel: "WEBSITE", fulfillment: "DELIVERY", webStatus: { in: WEB_OPEN }, branch: { organizationId: orgId }, dispatchJob: null }, include: SALE_INC, orderBy: { createdAt: "asc" }, take: 300 })
      : [],
    want.has("POS_DELIVERY")
      ? db.sale.findMany({ where: { ...posWhere(orgId), dispatchJob: null }, include: SALE_INC, orderBy: { createdAt: "asc" }, take: 300 })
      : [],
    want.has("SALES_ORDER")
      ? db.salesOrder.findMany({ where: { organizationId: orgId, status: { in: SO_OPEN }, dispatchJob: null }, include: SO_INC, orderBy: { createdAt: "asc" }, take: 300 })
      : [],
    want.has("GROOMING")
      ? db.appointment.findMany({ where: { organizationId: orgId, visitKind: "HOME", status: { in: APPT_OPEN }, startAt: { gte: addDays(todayStart, -1) }, dispatchJob: null }, include: APPT_INC, orderBy: { startAt: "asc" }, take: 300 })
      : [],
  ]);
  return [
    ...web.map((row) => ({ kind: "WEB_ORDER", row })),
    ...pos.map((row) => ({ kind: "POS_DELIVERY", row })),
    ...so.map((row) => ({ kind: "SALES_ORDER", row })),
    ...appt.map((row) => ({ kind: "GROOMING", row })),
  ];
}

function hhmm(date) {
  return new Date(new Date(date).getTime() + 3 * 3600000).toISOString().slice(11, 16);
}

function windowText(w) {
  if (!w) return null;
  return `${w.labelEn || w.label} ${w.startTime}–${w.endTime}`;
}

function lineOut(l, { so = false } = {}) {
  const name = l.variant ? `${l.product?.name} (${l.variant.label})` : l.product?.name;
  const nameEn = l.variant ? `${l.product?.nameEn || l.product?.name} (${l.variant.labelEn || l.variant.label})` : l.product?.nameEn || l.product?.name;
  return {
    id: l.id,
    productId: l.productId,
    variantId: l.variantId || null,
    name,
    nameEn,
    sellBy: l.product?.sellBy || "PIECE",
    imageUrl: resolveStoredImageUrl(l.product?.imageUrl),
    quantity: l.quantity,
    ...(so ? { quantityDelivered: l.quantityDelivered, isFree: l.isFree } : {}),
    unitPrice: fmt(l.unitPrice),
    subtotal: fmt(l.subtotal),
  };
}

/** What every view needs from the order itself (defaults for a new job, too). */
export function sourceFacts(kind, row) {
  if (kind === "WEB_ORDER" || kind === "POS_DELIVERY") {
    const refunded = false;
    return {
      reference: row.reference || row.invoiceNumber || row.id.slice(-8).toUpperCase(),
      customer: row.customer ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone } : null,
      address: row.deliveryAddress || row.customer?.address || null,
      area: row.deliveryArea || null,
      deliveryDate: dayOf(row.deliveryDate) || qatarDayKey(row.createdAt),
      timeNote: windowText(row.deliveryWindow),
      total: d(row.total),
      toCollect: Math.max(0, d(row.amountDue)),
      paidOnline: kind === "WEB_ORDER",
      sourceStatus: kind === "WEB_ORDER" ? row.webStatus : row.invoiceStatus,
      closed: kind === "WEB_ORDER" ? ["DELIVERED", "CANCELLED", "COLLECTED"].includes(row.webStatus) : row.invoiceStatus === "CANCELLED" || refunded,
      cancelled: kind === "WEB_ORDER" ? row.webStatus === "CANCELLED" : row.invoiceStatus === "CANCELLED",
      lines: (row.items || []).map((l) => lineOut(l)),
      location: row.branch || null,
      createdAt: row.createdAt,
    };
  }
  if (kind === "SALES_ORDER") {
    // fix-ra: a B2B delivery note (orderType B2B) is assignable like any sales order and shows its DN
    // number; its money is collected later by a cash receipt on the invoice, not by the driver.
    const b2b = row.orderType === "B2B";
    return {
      reference: b2b && row.dnReference ? `${row.dnReference} · ${row.reference}` : row.reference,
      b2b,
      customer: row.customer ? { id: row.customer.id, name: row.customer.companyName || row.customer.name, phone: row.customer.phone } : null,
      address: row.customer?.address || null,
      area: null,
      deliveryDate: dayOf(row.deliveryDate),
      timeNote: null,
      total: d(row.total),
      toCollect: b2b ? 0 : Math.max(0, d(row.total) - d(row.amountPaid)),
      paidOnline: false,
      sourceStatus: row.status,
      closed: !SO_OPEN.includes(row.status),
      cancelled: row.status === "CANCELLED",
      lines: (row.lines || []).map((l) => lineOut(l, { so: true })),
      location: row.branch || null,
      createdAt: row.createdAt,
    };
  }
  // GROOMING
  return {
    reference: row.reference || row.id.slice(-8).toUpperCase(),
    customer: row.customer ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone } : null,
    address: row.address || row.customer?.address || null,
    area: row.area || null,
    deliveryDate: qatarDayKey(row.startAt),
    timeNote: `${hhmm(row.startAt)}–${hhmm(row.endAt)}`,
    total: d(row.amount),
    toCollect: Math.max(0, d(row.amount) - d(row.amountPaid)),
    paidOnline: d(row.amountPaid) > 0,
    sourceStatus: row.status,
    closed: ["DONE", "NO_SHOW", "CANCELLED"].includes(row.status),
    cancelled: row.status === "CANCELLED",
    lines: [],
    booking: {
      id: row.id,
      version: row.version,
      petName: row.petName,
      petType: row.petType,
      breed: row.breed,
      service: row.service,
      startAt: row.startAt,
      endAt: row.endAt,
      notes: row.notes,
      status: row.status,
    },
    location: null,
    createdAt: row.createdAt,
  };
}

export function zoneOf(area) {
  if (!area) return null;
  return area.zone || area.city || area.nameEn || area.name;
}

/** What each kind lets a driver change (needs approval). */
export function editableFor(kind, facts) {
  if (kind === "SALES_ORDER") {
    const noneDelivered = facts.sourceStatus === "CONFIRMED" && facts.lines.every((l) => !l.quantityDelivered);
    return { lines: noneDelivered, note: true, address: true, timeNote: true, deliveryDate: true };
  }
  if (kind === "GROOMING") return { lines: false, note: false, address: false, timeNote: false, deliveryDate: false };
  // Website orders were paid online and till sales were paid / recorded at the till: only where and when.
  return { lines: false, note: true, address: true, timeNote: true, deliveryDate: false };
}

function sourceOf(job) {
  return job.sale || job.salesOrder || job.appointment;
}

/** One item for lists (a job, or a candidate without a job). */
export function itemView(input) {
  const job = input.job || null;
  const kind = job ? job.kind : input.kind;
  const row = job ? sourceOf(job) : input.row;
  const f = sourceFacts(kind, row);
  const area = job ? job.area || (job.areaId ? null : f.area) : f.area;
  const status = job ? (f.cancelled && OPEN_JOB.includes(job.status) ? "CANCELLED" : job.status) : "UNASSIGNED";
  return {
    key: keyOf(kind, row.id),
    jobId: job?.id || null,
    version: job?.version ?? null,
    kind,
    sourceId: row.id,
    reference: f.reference,
    /** fix-ra: a B2B delivery note (paid later by a cash receipt on its invoice). */
    b2b: Boolean(f.b2b),
    status,
    customer: f.customer,
    address: job?.address ?? f.address,
    area: area ? { id: area.id, name: area.name, nameEn: area.nameEn, city: area.city, zone: area.zone } : null,
    zone: zoneOf(area),
    deliveryDate: job?.deliveryDate ? dayOf(job.deliveryDate) : f.deliveryDate,
    timeNote: job?.timeNote ?? f.timeNote,
    note: job?.note ?? null,
    total: fmt(f.total),
    toCollect: fmt(f.toCollect),
    paidOnline: f.paidOnline,
    sourceStatus: f.sourceStatus,
    lines: f.lines,
    booking: f.booking || null,
    location: f.location,
    vehicle: job?.vehicle || null,
    driver: job?.driver || null,
    assignedAt: job?.assignedAt || null,
    assignedBy: job?.assignedBy || null,
    seenAt: job?.seenAt || null,
    acceptedAt: job?.acceptedAt || null,
    declinedAt: job?.declinedAt || null,
    declineReason: job?.declineReason || null,
    deliveredAt: job?.deliveredAt || null,
    pendingChange: job?.changeRequests?.[0] || null,
    editable: editableFor(kind, f),
    createdAt: f.createdAt,
  };
}

// ------------------------------------------------------------------ jobs

async function loadSource(db, orgId, kind, sourceId) {
  if (kind === "WEB_ORDER" || kind === "POS_DELIVERY") {
    const row = await db.sale.findFirst({ where: { id: sourceId, branch: { organizationId: orgId } }, include: SALE_INC });
    if (!row) return null;
    const isWeb = row.orderChannel === "WEBSITE";
    if ((kind === "WEB_ORDER") !== isWeb) return null;
    return row;
  }
  if (kind === "SALES_ORDER") return db.salesOrder.findFirst({ where: { id: sourceId, organizationId: orgId }, include: SO_INC });
  return db.appointment.findFirst({ where: { id: sourceId, organizationId: orgId }, include: APPT_INC });
}

function eligible(kind, row) {
  if (kind === "WEB_ORDER") return row.fulfillment === "DELIVERY" && WEB_OPEN.includes(row.webStatus);
  if (kind === "POS_DELIVERY") return row.orderChannel === "IN_STORE" && row.invoiceStatus !== "CANCELLED" && (row.fulfillment === "DELIVERY" || row.paymentMethod === "ON_DELIVERY");
  if (kind === "SALES_ORDER") return SO_OPEN.includes(row.status);
  return row.visitKind === "HOME" && APPT_OPEN.includes(row.status);
}

const NOT_ASSIGNABLE = () => fail(400, "DISPATCH_NOT_ASSIGNABLE", "هذا الطلب لا يحتاج توصيلاً الآن (مُسلَّم أو ملغى أو ليس للتوصيل)", "This order does not need delivering now (delivered, cancelled or not for delivery)");

/** The job for an order key, made on first use (in `tx`, row locked). */
export async function ensureJob(tx, orgId, key) {
  const { kind, sourceId } = parseKey(key);
  const field = sourceField[kind];
  let job = await tx.dispatchJob.findFirst({ where: { organizationId: orgId, [field]: sourceId } });
  let created = false;
  if (!job) {
    const row = await loadSource(tx, orgId, kind, sourceId);
    if (!row) throw fail(404, "DISPATCH_ORDER_NOT_FOUND", "الطلب غير موجود", "Order not found");
    if (!eligible(kind, row)) throw NOT_ASSIGNABLE();
    const f = sourceFacts(kind, row);
    // Two people making the same job at once: the unique source column lets only one through.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispatch:${key}`}))`;
    job = await tx.dispatchJob.findFirst({ where: { organizationId: orgId, [field]: sourceId } });
    if (!job) {
      job = await tx.dispatchJob.create({
        data: {
          organizationId: orgId,
          kind,
          [field]: sourceId,
          address: f.address,
          areaId: f.area?.id || null,
          deliveryDate: f.deliveryDate ? new Date(`${f.deliveryDate}T00:00:00Z`) : null,
          timeNote: f.timeNote,
        },
      });
      created = true;
    }
  }
  await tx.$queryRaw`SELECT id FROM "DispatchJob" WHERE id = ${job.id} FOR UPDATE`;
  const out = await tx.dispatchJob.findUnique({ where: { id: job.id }, include: JOB_INC });
  return Object.assign(out, { _created: created });
}

export async function loadJob(db, orgId, id) {
  const job = await db.dispatchJob.findFirst({ where: { id: String(id), organizationId: orgId }, include: JOB_INC });
  if (!job) throw fail(404, "DISPATCH_JOB_NOT_FOUND", "مهمة التوصيل غير موجودة", "Delivery job not found");
  return job;
}

export async function lockJob(tx, orgId, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "DispatchJob" WHERE id = ${String(id)} AND "organizationId" = ${orgId} FOR UPDATE`;
  if (!rows.length) throw fail(404, "DISPATCH_JOB_NOT_FOUND", "مهمة التوصيل غير موجودة", "Delivery job not found");
  return tx.dispatchJob.findUnique({ where: { id: String(id) }, include: JOB_INC });
}

/** Conditional job write (NFR-13): the job must still be at `version`, and match `where`. */
export async function updateJob(tx, job, data, where = {}) {
  const r = await tx.dispatchJob.updateMany({ where: { id: job.id, version: job.version, ...where }, data: { ...data, version: { increment: 1 } } });
  if (r.count !== 1) throw fail(409, "STALE_EDIT", "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.", "This record was changed by someone else. Reload and try again.");
  return tx.dispatchJob.findUnique({ where: { id: job.id }, include: JOB_INC });
}

export function checkVersion(job, version) {
  if (version != null && job.version !== version) {
    throw fail(409, "STALE_EDIT", "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.", "This record was changed by someone else. Reload and try again.", { currentVersion: job.version });
  }
}

export async function logEvent(tx, job, type, { userId, driverUserId, vehicleId, note, meta } = {}) {
  return tx.dispatchEvent.create({
    data: {
      organizationId: job.organizationId,
      jobId: job.id,
      type,
      userId: userId || null,
      driverUserId: driverUserId ?? job.driverUserId ?? null,
      vehicleId: vehicleId ?? job.vehicleId ?? null,
      note: note ? String(note).slice(0, 500) : null,
      ...(meta ? { meta } : {}),
    },
  });
}

export function jobLabel(job) {
  const row = sourceOf(job);
  return `${job.kind} ${row ? sourceFacts(job.kind, row).reference : job.id}`;
}

/** Audit row for a dispatch action; branch = the van's location when there is one. */
export async function auditJob(tx, job, action, userId, summary, meta) {
  await writeAudit({
    userId,
    action,
    entityType: "DispatchJob",
    entityId: job.id,
    branchId: job.vehicle?.branchId || null,
    summary: `${jobLabel(job)}: ${summary}`,
    meta,
  }, tx);
}

// ------------------------------------------------------------------ vans and drivers

/** Vehicles with a van location, their staff and open workload. */
export async function vansWithDrivers(db, orgId) {
  const vehicles = await db.vehicle.findMany({
    where: { organizationId: orgId, isActive: true, branchId: { not: null }, branch: { isActive: true } },
    include: { branch: { select: { id: true, name: true, nameEn: true, users: { where: { active: true }, select: { id: true, name: true, nameEn: true, role: true } } } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const counts = await db.dispatchJob.groupBy({ by: ["vehicleId", "status"], where: { organizationId: orgId, status: { in: ON_VAN } }, _count: { _all: true } });
  const deliveredToday = await db.dispatchJob.groupBy({
    by: ["vehicleId"],
    where: { organizationId: orgId, status: "DELIVERED", deliveredAt: { gte: qatarDayStart(qatarDayKey()) } },
    _count: { _all: true },
  });
  return vehicles.map((v) => {
    const c = (s) => counts.find((r) => r.vehicleId === v.id && r.status === s)?._count._all || 0;
    return {
      id: v.id,
      name: v.name,
      plate: v.plate,
      type: v.type,
      branch: { id: v.branch.id, name: v.branch.name, nameEn: v.branch.nameEn },
      drivers: v.branch.users.filter((u) => u.role !== "ADMIN"),
      workload: { assigned: c("ASSIGNED"), accepted: c("ACCEPTED"), open: c("ASSIGNED") + c("ACCEPTED"), deliveredToday: deliveredToday.find((r) => r.vehicleId === v.id)?._count._all || 0 },
    };
  });
}

/**
 * Where a job goes: { driverUserId } (the driver's van location must have a vehicle) or
 * { vehicleId } (a van; driver optional).
 */
export async function resolveTarget(db, orgId, { driverUserId, vehicleId }) {
  if (driverUserId) {
    const user = await db.user.findFirst({ where: { id: String(driverUserId), organizationId: orgId, active: true }, select: { id: true, name: true, nameEn: true, branchId: true } });
    if (!user) throw fail(400, "DISPATCH_DRIVER_INVALID", "السائق غير موجود أو غير نشط", "Driver not found or not active");
    const vehicle = user.branchId
      ? await db.vehicle.findFirst({ where: { organizationId: orgId, branchId: user.branchId, isActive: true, branch: { kind: "VAN", isActive: true } } })
      : null;
    if (!vehicle) throw fail(400, "DISPATCH_DRIVER_NO_VAN", "موقع هذا الموظف ليس سيارة لها مركبة", "This staff member's location is not a van with a vehicle");
    if (vehicleId && String(vehicleId) !== vehicle.id) throw fail(400, "DISPATCH_DRIVER_OTHER_VAN", "السائق يعمل على مركبة أخرى", "This driver works on another vehicle");
    return { vehicle, driver: user };
  }
  if (!vehicleId) throw fail(400, "DISPATCH_TARGET_REQUIRED", "اختر السائق أو المركبة", "Choose the driver or the van");
  const vehicle = await db.vehicle.findFirst({ where: { id: String(vehicleId), organizationId: orgId, isActive: true, branchId: { not: null }, branch: { kind: "VAN", isActive: true } } });
  if (!vehicle) throw fail(400, "DISPATCH_VAN_INVALID", "المركبة غير موجودة أو ليست مرتبطة بسيارة نشطة", "Vehicle not found, or not linked to an active van");
  return { vehicle, driver: null };
}

export function assertVanType(kind, vehicle) {
  const wants = kind === "GROOMING" ? "GROOMING" : "DELIVERY";
  if (vehicle.type !== wants) {
    throw kind === "GROOMING"
      ? fail(400, "DISPATCH_NEEDS_GROOMING_VAN", "حجوزات الزيارة المنزلية تُسند لسيارة تجميل فقط", "Home grooming bookings go to a grooming van only")
      : fail(400, "DISPATCH_NEEDS_DELIVERY_VAN", "طلبات التوصيل تُسند لسيارة توصيل فقط", "Delivery orders go to a delivery van only");
  }
}

// ------------------------------------------------------------------ driver change requests

/** Normalises a driver's requested changes for this job; throws when nothing (allowed) changes. */
export function readChanges(job, body) {
  const f = sourceFacts(job.kind, sourceOf(job));
  const allowed = editableFor(job.kind, f);
  const changes = {};
  const notAllowed = (what) => fail(400, "DRIVER_CHANGE_NOT_ALLOWED", "لا يمكن تعديل هذا في هذا النوع من الطلبات", "This cannot be changed on this kind of order", { field: what });
  if (Array.isArray(body?.lines) && body.lines.length) {
    if (!allowed.lines) {
      throw job.kind === "SALES_ORDER"
        ? fail(400, "DRIVER_CHANGE_SO_DELIVERED", "يمكن تعديل أسطر طلب البيع قبل أي تسليم فقط", "Sales-order lines can be changed only before anything is delivered")
        : notAllowed("lines");
    }
    const byId = new Map(f.lines.map((l) => [l.id, l]));
    const out = [];
    for (const raw of body.lines) {
      const line = byId.get(String(raw?.lineId || ""));
      if (!line) throw fail(400, "SO_LINE_NOT_FOUND", "السطر غير موجود في الطلب", "A line is not on this order");
      const qty = Number(raw?.quantity);
      if (!Number.isInteger(qty) || qty < 0) throw fail(400, "DRIVER_CHANGE_QTY_INVALID", "كمية غير صالحة (عدد صحيح، صفر لحذف السطر)", "Enter a whole quantity (0 removes the line)");
      if (qty !== line.quantity) out.push({ lineId: line.id, quantity: qty });
    }
    const after = f.lines.map((l) => out.find((o) => o.lineId === l.id)?.quantity ?? l.quantity);
    if (!after.some((q) => q > 0)) throw fail(400, "DRIVER_CHANGE_NO_LINES", "يجب أن يبقى سطر واحد على الأقل", "At least one line must stay on the order");
    if (out.length) changes.lines = out;
  }
  const text = (field, max) => {
    if (body?.[field] === undefined) return;
    const v = optText(body[field], max);
    const current = field === "address" ? job.address : field === "timeNote" ? job.timeNote : job.note;
    if ((v || null) === (current || null)) return;
    if (!allowed[field]) throw notAllowed(field);
    changes[field] = v;
  };
  text("note", 500);
  text("address", 500);
  text("timeNote", 120);
  if (body?.deliveryDate !== undefined && body.deliveryDate !== null && body.deliveryDate !== "") {
    const day = optDate(body.deliveryDate, "deliveryDate");
    const v = dayOf(day);
    if (v !== (job.deliveryDate ? dayOf(job.deliveryDate) : f.deliveryDate)) {
      if (!allowed.deliveryDate) throw notAllowed("deliveryDate");
      changes.deliveryDate = v;
    }
  }
  if (!Object.keys(changes).length) throw fail(400, "DRIVER_CHANGE_EMPTY", "لا يوجد تغيير لطلبه", "There is no change to request");
  const before = {
    orderVersion: sourceOf(job).version ?? null,
    lines: f.lines.map((l) => ({ lineId: l.id, quantity: l.quantity, name: l.name, nameEn: l.nameEn, sellBy: l.sellBy, unitPrice: l.unitPrice })),
    note: job.note || null,
    address: job.address || null,
    timeNote: job.timeNote || null,
    deliveryDate: job.deliveryDate ? dayOf(job.deliveryDate) : f.deliveryDate,
    total: fmt(f.total),
  };
  return { changes, before };
}

/**
 * Sales-order lines after a driver change, priced with the sales-order rules (same unit prices,
 * same order discount spread over the lines). Pure: used for the approval preview and the apply.
 */
export function pricedSoLines(order, lineChanges) {
  const qty = new Map((lineChanges || []).map((c) => [c.lineId, c.quantity]));
  const kept = [];
  const removed = [];
  for (const l of order.lines) {
    const q = qty.has(l.id) ? qty.get(l.id) : l.quantity;
    if (q <= 0) {
      removed.push(l);
      continue;
    }
    const sellBy = l.product?.sellBy || "PIECE";
    kept.push({ id: l.id, quantity: q, subtotal: l.isFree ? 0 : lineAmount(d(l.unitPrice), q, sellBy), discountShare: 0, isFree: l.isFree });
  }
  const discount = d(order.discountAmount);
  const totals = priceOrder(kept, discount ? fmt(discount) : null);
  return { kept, removed, totals };
}

/** Installments after the order total changes: more goes on the last one; less comes off the last unpaid amounts. */
export function adjustPlan(installments, oldTotal, newTotal) {
  const rows = [...installments].sort((a, b) => a.seq - b.seq).map((i) => ({ id: i.id, seq: i.seq, amount: d(i.amount), amountPaid: d(i.amountPaid), changed: false }));
  if (!rows.length) return { rows, removed: [] };
  let delta = newTotal - oldTotal;
  if (delta > 0) {
    rows[rows.length - 1].amount += delta;
    rows[rows.length - 1].changed = true;
  } else {
    let left = -delta;
    for (let i = rows.length - 1; i >= 0 && left > 0; i -= 1) {
      const take = Math.min(left, rows[i].amount - rows[i].amountPaid);
      if (take > 0) {
        rows[i].amount -= take;
        rows[i].changed = true;
        left -= take;
      }
    }
  }
  const removed = rows.filter((r) => r.amount === 0 && r.amountPaid === 0 && rows.length > 1);
  return { rows: rows.filter((r) => !removed.includes(r)), removed };
}

export function requestView(r) {
  const job = r.job ? itemView({ job: r.job }) : null;
  return {
    id: r.id,
    version: r.version,
    status: r.status,
    changes: r.changes,
    before: r.before,
    reason: r.reason,
    requestedBy: r.requestedBy || null,
    decidedBy: r.decidedBy || null,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    applied: r.applied,
    createdAt: r.createdAt,
    job,
  };
}
