/**
 * fix-rb — driver / van dashboard (module `driver`). A driver works with the van of their own
 * location only (user.branchId is a van location with a vehicle); another van is refused.
 * The business owner / ADMIN may open any van with ?vehicleId=.
 *
 * Delivery vans see delivery jobs (website, till for delivery, sales orders); grooming vans see
 * their home-visit bookings only.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { d, fmt } from "../lib/money.js";
import { fail, optText } from "../lib/bizError.js";
import { clientVersion, requireVersion } from "../lib/recordVersion.js";
import { qatarDayKey, qatarDayStart } from "../lib/qatarTime.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { mailCustomer } from "../lib/mailer.js";
import { deliverSalesOrder } from "../lib/soDelivery.js";
import { changeWebOrderStatus } from "../lib/webOrderStatus.js";
import { APPOINTMENT_NEXT } from "./appointments.js";
import {
  JOB_INC,
  ON_VAN,
  TX,
  auditJob,
  checkVersion,
  itemView,
  lockJob,
  logEvent,
  readChanges,
  requestView,
  updateJob,
} from "../lib/dispatch.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("driver", "view"));

const PERSON = { select: { id: true, name: true, nameEn: true } };
const PLACE = { select: { id: true, name: true, nameEn: true, kind: true } };
const DAY = 86400000;

/** The van this request works with: { vehicle, branch }. */
async function myVan(req) {
  if (req._van) return req._van;
  const orgId = req.user.organizationId;
  const asked = req.query.vehicleId ? String(req.query.vehicleId) : null;
  let vehicle = null;
  if (req.user.role === "ADMIN" && asked) {
    vehicle = await prisma.vehicle.findFirst({ where: { id: asked, organizationId: orgId }, include: { branch: PLACE } });
    if (!vehicle) throw fail(404, "DRIVER_VAN_NOT_FOUND", "المركبة غير موجودة", "Vehicle not found");
  } else {
    const branch = req.user.branchId ? await prisma.branch.findFirst({ where: { id: req.user.branchId, organizationId: orgId }, select: { id: true, kind: true } }) : null;
    vehicle = branch?.kind === "VAN" ? await prisma.vehicle.findFirst({ where: { organizationId: orgId, branchId: branch.id }, include: { branch: PLACE } }) : null;
    if (!vehicle) throw fail(403, "DRIVER_NO_VAN", "موقعك ليس سيارة لها مركبة. اطلب من المدير ربطك بسيارة.", "Your location is not a van with a vehicle. Ask a manager to link you to a van.");
    if (asked && asked !== vehicle.id) throw fail(403, "DRIVER_OTHER_VAN", "هذه بيانات سيارة أخرى", "This is another van's data");
  }
  req._van = { vehicle, branchId: vehicle.branchId };
  return req._van;
}

// Every driver call works on one van; found before any transaction (the pool may have one connection).
router.use(async (req, _res, next) => {
  try {
    await myVan(req);
    next();
  } catch (e) {
    next(e);
  }
});

function kindsFor(vehicle) {
  return vehicle.type === "GROOMING" ? ["GROOMING"] : ["WEB_ORDER", "POS_DELIVERY", "SALES_ORDER"];
}

/** A job of this van (another van's job is refused). */
async function myJob(tx, req, id) {
  const { vehicle } = await myVan(req);
  const job = await lockJob(tx, req.user.organizationId, id);
  if (job.vehicleId !== vehicle.id) throw fail(403, "DRIVER_OTHER_VAN", "هذه بيانات سيارة أخرى", "This is another van's data");
  return job;
}

function vanView(vehicle) {
  return { id: vehicle.id, name: vehicle.name, plate: vehicle.plate, type: vehicle.type, isActive: vehicle.isActive, version: vehicle.version, branch: vehicle.branch };
}

async function vanJobs(orgId, vehicle, { history = false } = {}) {
  return prisma.dispatchJob.findMany({
    where: {
      organizationId: orgId,
      vehicleId: vehicle.id,
      kind: { in: kindsFor(vehicle) },
      ...(history ? { status: "DELIVERED", deliveredAt: { gte: new Date(Date.now() - 30 * DAY) } } : { status: { in: ON_VAN } }),
    },
    include: JOB_INC,
    orderBy: history ? [{ deliveredAt: "desc" }] : [{ deliveryDate: "asc" }, { assignedAt: "asc" }],
    take: history ? 100 : 300,
  });
}

/** GET /api/driver/notifications — unseen assignments (poll). */
router.get("/notifications", async (req, res) => {
  const { vehicle } = await myVan(req);
  const unseen = await prisma.dispatchJob.findMany({
    where: { organizationId: req.user.organizationId, vehicleId: vehicle.id, status: "ASSIGNED", seenAt: null, kind: { in: kindsFor(vehicle) } },
    select: { id: true, kind: true, assignedAt: true },
    orderBy: { assignedAt: "desc" },
  });
  res.json({ unseen: unseen.length, items: unseen });
});

/** POST /api/driver/seen — the driver opened the list: every unseen assignment is marked seen (logged). */
router.post("/seen", requireModule("driver", "create"), async (req, res) => {
  const { vehicle } = await myVan(req);
  const n = await prisma.$transaction(async (tx) => {
    const rows = await tx.dispatchJob.findMany({ where: { organizationId: req.user.organizationId, vehicleId: vehicle.id, status: "ASSIGNED", seenAt: null, kind: { in: kindsFor(vehicle) } }, include: JOB_INC });
    for (const job of rows) {
      const r = await tx.dispatchJob.updateMany({ where: { id: job.id, seenAt: null, status: "ASSIGNED" }, data: { seenAt: new Date() } });
      if (r.count) await logEvent(tx, job, "SEEN", { userId: req.user.sub });
    }
    return rows.length;
  }, TX);
  res.json({ seen: n });
});

/**
 * GET /api/driver/overview — the dashboard: van, assigned orders (or bookings), delivered history,
 * van stock with pictures, transfers, sales, pending payments, counts.
 */
router.get("/overview", async (req, res) => {
  const orgId = req.user.organizationId;
  const { vehicle, branchId } = await myVan(req);
  const since = new Date(Date.now() - 30 * DAY);
  const [jobs, history, inv, vstock, transfers, sales, unpaidReturns, returnCounts, damagedHeld, requests] = await Promise.all([
    vanJobs(orgId, vehicle),
    vanJobs(orgId, vehicle, { history: true }),
    branchId ? prisma.inventory.findMany({ where: { branchId, quantity: { gt: 0 } }, select: { quantity: true, product: { select: { id: true, name: true, nameEn: true, sellBy: true, imageUrl: true, sku: true } } } }) : [],
    branchId ? prisma.variantStock.findMany({ where: { branchId, quantity: { gt: 0 } }, select: { quantity: true, variant: { select: { id: true, label: true, labelEn: true, product: { select: { id: true, name: true, nameEn: true, sellBy: true, imageUrl: true, sku: true } } } } } }) : [],
    prisma.stockTransfer.findMany({
      where: { organizationId: orgId, OR: [{ vehicleId: vehicle.id }, ...(branchId ? [{ fromBranchId: branchId }, { toBranchId: branchId }] : [])] },
      include: { fromBranch: PLACE, toBranch: PLACE, transferredBy: PERSON, _count: { select: { lines: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    branchId
      ? prisma.sale.findMany({
        where: { branchId, createdAt: { gte: since } },
        select: { id: true, reference: true, invoiceNumber: true, createdAt: true, total: true, amountPaid: true, amountDue: true, paymentMethod: true, invoiceStatus: true, customer: { select: { name: true } }, user: PERSON, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
      : [],
    prisma.vanReturn.findMany({
      where: { organizationId: orgId, paymentStatus: "UNPAID", amountOwed: { gt: 0 }, OR: [{ vehicleId: vehicle.id }, ...(branchId ? [{ vanBranchId: branchId }] : [])] },
      select: { id: true, reference: true, customerName: true, amountOwed: true, collectedAt: true, status: true },
      orderBy: { collectedAt: "desc" },
    }),
    prisma.vanReturn.groupBy({ by: ["status"], where: { organizationId: orgId, OR: [{ vehicleId: vehicle.id }, ...(branchId ? [{ vanBranchId: branchId }] : [])] }, _count: { _all: true } }),
    prisma.damagedStock.count({ where: { organizationId: orgId, status: "HELD", vanReturn: { OR: [{ vehicleId: vehicle.id }, ...(branchId ? [{ vanBranchId: branchId }] : [])] } } }),
    prisma.driverChangeRequest.findMany({
      where: { organizationId: orgId, job: { vehicleId: vehicle.id } },
      include: { requestedBy: PERSON, decidedBy: PERSON },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const items = jobs.map((job) => itemView({ job }));
  const done = history.map((job) => itemView({ job }));
  const stock = [
    ...inv.map((r) => ({ productId: r.product.id, variantId: null, name: r.product.name, nameEn: r.product.nameEn, sku: r.product.sku, sellBy: r.product.sellBy, quantity: r.quantity, imageUrl: resolveStoredImageUrl(r.product.imageUrl) })),
    ...vstock.map((r) => ({
      productId: r.variant.product.id, variantId: r.variant.id, sku: r.variant.product.sku,
      name: `${r.variant.product.name} (${r.variant.label})`, nameEn: `${r.variant.product.nameEn || r.variant.product.name} (${r.variant.labelEn || r.variant.label})`,
      sellBy: r.variant.product.sellBy, quantity: r.quantity, imageUrl: resolveStoredImageUrl(r.variant.product.imageUrl),
    })),
  ].sort((a, b) => String(a.nameEn).localeCompare(String(b.nameEn)));
  const collect = [...items, ...done.filter((i) => Number(i.toCollect) > 0)].filter((i) => Number(i.toCollect) > 0 && i.status !== "CANCELLED");
  const toDirh = (s) => Math.round(Number(s) * 100);
  const today = qatarDayStart(qatarDayKey());
  res.json({
    van: vanView(vehicle),
    orders: items,
    delivered: done,
    counts: {
      unseen: items.filter((i) => i.status === "ASSIGNED" && !i.seenAt).length,
      assigned: items.filter((i) => i.status === "ASSIGNED").length,
      accepted: items.filter((i) => i.status === "ACCEPTED").length,
      deliveredToday: done.filter((i) => i.deliveredAt && new Date(i.deliveredAt) >= today).length,
      pendingChanges: requests.filter((r) => r.status === "PENDING").length,
      returnsInVan: returnCounts.find((c) => c.status === "IN_VAN")?._count._all || 0,
      damagedHeld,
    },
    stock: {
      lines: stock.length,
      pieces: stock.filter((s) => s.sellBy !== "WEIGHT").reduce((a, s) => a + s.quantity, 0),
      grams: stock.filter((s) => s.sellBy === "WEIGHT").reduce((a, s) => a + s.quantity, 0),
      items: stock,
    },
    transfers: transfers.map((t) => ({
      id: t.id, reference: t.reference, createdAt: t.createdAt, fromBranch: t.fromBranch, toBranch: t.toBranch, transferredBy: t.transferredBy,
      vehiclePlate: t.vehiclePlate, itemCount: t._count.lines, direction: branchId && t.toBranchId === branchId ? "IN" : branchId && t.fromBranchId === branchId ? "OUT" : "",
    })),
    sales: {
      count: sales.length,
      total: fmt(sales.filter((s) => s.invoiceStatus !== "CANCELLED").reduce((a, s) => a + d(s.total), 0)),
      items: sales.map((s) => ({ id: s.id, reference: s.reference || s.invoiceNumber, createdAt: s.createdAt, total: fmt(s.total), amountDue: fmt(s.amountDue), paymentMethod: s.paymentMethod, invoiceStatus: s.invoiceStatus, customer: s.customer?.name || null, user: s.user, lines: s._count.items })),
    },
    pendingPayments: {
      orders: collect.map((i) => ({ key: i.key, kind: i.kind, reference: i.reference, customer: i.customer, toCollect: i.toCollect, status: i.status })),
      ordersTotal: fmt(collect.reduce((a, i) => a + toDirh(i.toCollect), 0)),
      returns: unpaidReturns.map((r) => ({ id: r.id, reference: r.reference, customerName: r.customerName, amountOwed: fmt(r.amountOwed), collectedAt: r.collectedAt, status: r.status })),
      returnsTotal: fmt(unpaidReturns.reduce((a, r) => a + d(r.amountOwed), 0)),
    },
    changeRequests: requests.map(requestView),
  });
});

/** GET /api/driver/jobs/:id — one of my jobs with its history. */
router.get("/jobs/:id", async (req, res) => {
  const job = await myJob(prisma, req, req.params.id);
  const events = await prisma.dispatchEvent.findMany({ where: { jobId: job.id }, include: { user: PERSON }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  res.json({ ...itemView({ job }), events });
});

/** POST /api/driver/jobs/:id/accept { version } */
router.post("/jobs/:id/accept", requireModule("driver", "create"), async (req, res) => {
  const version = requireVersion(req);
  const job = await prisma.$transaction(async (tx) => {
    const current = await myJob(tx, req, req.params.id);
    checkVersion(current, version);
    if (current.status !== "ASSIGNED") throw fail(400, "DRIVER_JOB_NOT_ASSIGNED", "هذا الطلب ليس بانتظار قبولك", "This order is not waiting for you to accept it");
    const now = new Date();
    const updated = await updateJob(tx, current, { status: "ACCEPTED", acceptedAt: now, ...(current.seenAt ? {} : { seenAt: now }) });
    if (!current.seenAt) await logEvent(tx, updated, "SEEN", { userId: req.user.sub });
    await logEvent(tx, updated, "ACCEPTED", { userId: req.user.sub });
    await auditJob(tx, updated, "DISPATCH_ACCEPT", req.user.sub, `accepted by driver`);
    return updated;
  }, TX);
  res.json(itemView({ job }));
});

/** POST /api/driver/jobs/:id/decline { version, reason } — back to the unassigned list. */
router.post("/jobs/:id/decline", requireModule("driver", "create"), async (req, res) => {
  const version = requireVersion(req);
  const reason = optText(req.body?.reason, 300);
  if (!reason) throw fail(400, "REASON_REQUIRED", "اكتب سبب الاعتذار عن الطلب", "Enter the reason for declining");
  const job = await prisma.$transaction(async (tx) => {
    const current = await myJob(tx, req, req.params.id);
    checkVersion(current, version);
    if (!ON_VAN.includes(current.status)) throw fail(400, "DRIVER_JOB_NOT_ASSIGNED", "هذا الطلب ليس بانتظار قبولك", "This order is not waiting for you to accept it");
    if (current.changeRequests.length) throw fail(409, "DRIVER_CHANGE_PENDING", "يوجد طلب تعديل بانتظار الموافقة على هذا الطلب", "A change request for this order is waiting for approval");
    const updated = await updateJob(tx, current, { status: "DECLINED", declinedAt: new Date(), declineReason: reason, vehicleId: null, driverUserId: null, acceptedAt: null });
    await logEvent(tx, updated, "DECLINED", { userId: req.user.sub, driverUserId: current.driverUserId || req.user.sub, vehicleId: current.vehicleId, note: reason });
    await auditJob(tx, { ...updated, vehicle: current.vehicle }, "DISPATCH_DECLINE", req.user.sub, `declined by driver: ${reason}`, { vehicleId: current.vehicleId });
    return updated;
  }, TX);
  res.json(itemView({ job }));
});

/** POST /api/driver/jobs/:id/change-requests { lines?, note?, address?, timeNote?, deliveryDate?, reason? } */
router.post("/jobs/:id/change-requests", requireModule("driver", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const created = await prisma.$transaction(async (tx) => {
    const job = await myJob(tx, req, req.params.id);
    const version = clientVersion(req);
    checkVersion(job, version);
    if (!ON_VAN.includes(job.status)) throw fail(400, "DRIVER_JOB_NOT_ASSIGNED", "هذا الطلب ليس بانتظار قبولك", "This order is not waiting for you to accept it");
    if (job.changeRequests.length) throw fail(409, "DRIVER_CHANGE_PENDING", "يوجد طلب تعديل بانتظار الموافقة على هذا الطلب", "A change request for this order is waiting for approval");
    const { changes, before } = readChanges(job, req.body || {});
    const row = await tx.driverChangeRequest.create({
      data: { organizationId: orgId, jobId: job.id, requestedByUserId: req.user.sub, changes, before, reason: optText(req.body?.reason, 500) },
      include: { requestedBy: PERSON, decidedBy: PERSON },
    });
    await logEvent(tx, job, "CHANGE_REQUESTED", { userId: req.user.sub, meta: { requestId: row.id, changes } });
    await auditJob(tx, job, "DRIVER_CHANGE_REQUEST", req.user.sub, `change requested (${Object.keys(changes).join(", ")})`, { requestId: row.id, changes });
    return row;
  }, TX);
  res.status(201).json(requestView(created));
});

const WEB_STEP = { CONFIRMED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED" };

/**
 * POST /api/driver/jobs/:id/deliver { version } — through the order's own path: a sales-order
 * delivery (everything still to deliver), the website order's DELIVERED status, or (till sale)
 * the job only (the sale was paid / recorded at the till).
 */
router.post("/jobs/:id/deliver", requireModule("driver", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const pre = await myJob(prisma, req, req.params.id);
  checkVersion(pre, version);
  if (pre.kind === "GROOMING") throw fail(400, "DRIVER_USE_BOOKING_STATUS", "أغلق الحجز من خيارات الحجز (تم / لم يحضر)", "Close a booking with its booking status (done / no-show)");
  if (pre.status !== "ACCEPTED") throw fail(400, "DRIVER_ACCEPT_FIRST", "اقبل الطلب أولاً", "Accept the order first");
  if (pre.changeRequests.length) throw fail(409, "DRIVER_CHANGE_PENDING", "يوجد طلب تعديل بانتظار الموافقة على هذا الطلب", "A change request for this order is waiting for approval");
  // Website order: step its status to DELIVERED (each step is an allowed staff step, audited and mailed).
  if (pre.kind === "WEB_ORDER") {
    let status = pre.sale.webStatus;
    if (!WEB_STEP[status] && status !== "DELIVERED") throw fail(400, "DISPATCH_NOT_ASSIGNABLE", "هذا الطلب لا يحتاج توصيلاً الآن (مُسلَّم أو ملغى أو ليس للتوصيل)", "This order does not need delivering now (delivered, cancelled or not for delivery)");
    while (status !== "DELIVERED") {
      try {
        const sale = await changeWebOrderStatus({ orgId, saleId: pre.saleId, next: WEB_STEP[status], userId: req.user.sub });
        status = sale.webStatus;
      } catch (e) {
        throw fail(e.status || 400, "DRIVER_WEB_STATUS", "تعذر تحديث حالة طلب الموقع. حدّث الصفحة وحاول مرة أخرى.", "Could not update the website order status. Refresh and try again.", { detail: e.message });
      }
    }
  }
  const job = await prisma.$transaction(async (tx) => {
    const current = await myJob(tx, req, req.params.id);
    checkVersion(current, version);
    if (current.status !== "ACCEPTED") throw fail(400, "DRIVER_ACCEPT_FIRST", "اقبل الطلب أولاً", "Accept the order first");
    let meta = null;
    if (current.kind === "SALES_ORDER") {
      const delivery = await deliverSalesOrder({ orgId, userId: req.user.sub, orderId: current.salesOrderId, lines: [], note: `Delivered by driver (${current.vehicle?.plate || ""})` }, tx);
      meta = { salesOrderDeliveryId: delivery.id, revenue: fmt(delivery.revenue), cost: fmt(delivery.cost) };
    }
    const updated = await updateJob(tx, current, { status: "DELIVERED", deliveredAt: new Date() });
    await logEvent(tx, updated, "DELIVERED", { userId: req.user.sub, meta });
    await auditJob(tx, updated, "DISPATCH_DELIVERED", req.user.sub, "delivered", meta);
    return updated;
  }, TX);
  res.json(itemView({ job }));
});

/**
 * POST /api/driver/jobs/:id/booking-status { status: IN_PROGRESS | DONE | NO_SHOW, version }
 * Grooming van: the booking's own status steps (DONE from an upcoming booking passes through
 * IN_PROGRESS). DONE / NO_SHOW closes the job.
 */
router.post("/jobs/:id/booking-status", requireModule("driver", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const target = String(req.body?.status || "").toUpperCase();
  if (!["IN_PROGRESS", "DONE", "NO_SHOW"].includes(target)) throw fail(400, "DRIVER_BOOKING_STATUS_INVALID", "حالة الحجز غير صالحة", "Invalid booking status");
  const result = await prisma.$transaction(async (tx) => {
    const job = await myJob(tx, req, req.params.id);
    checkVersion(job, version);
    if (job.kind !== "GROOMING") throw fail(400, "DRIVER_NOT_BOOKING", "هذا ليس حجز تجميل", "This is not a grooming booking");
    if (!ON_VAN.includes(job.status)) throw fail(400, "DRIVER_JOB_NOT_ASSIGNED", "هذا الطلب ليس بانتظار قبولك", "This order is not waiting for you to accept it");
    const appt = await tx.appointment.findUnique({ where: { id: job.appointmentId } });
    const path = [];
    let status = appt.status;
    if (target === "DONE" && ["BOOKED", "CONFIRMED", "CHECKED_IN"].includes(status)) path.push("IN_PROGRESS");
    path.push(target);
    let ver = appt.version;
    for (const next of path) {
      if (!(APPOINTMENT_NEXT[status] || []).includes(next)) {
        throw fail(400, "DRIVER_BOOKING_STEP", "لا يمكن نقل الحجز إلى هذه الحالة", "The booking cannot move to that status", { from: status, to: next });
      }
      const moved = await tx.appointment.updateMany({ where: { id: appt.id, status, version: ver }, data: { status: next, version: { increment: 1 } } });
      if (moved.count !== 1) throw fail(409, "STALE_EDIT", "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.", "This record was changed by someone else. Reload and try again.");
      await writeAudit({ userId: req.user.sub, action: "BOOKING_UPDATE", entityType: "Appointment", entityId: appt.id, branchId: appt.branchId, summary: `${appt.reference || appt.id}: ${status} -> ${next} (grooming van ${job.vehicle?.plate || ""})` }, tx);
      status = next;
      ver += 1;
    }
    const closing = ["DONE", "NO_SHOW"].includes(target);
    const data = { ...(job.status === "ASSIGNED" ? { status: "ACCEPTED", acceptedAt: new Date(), seenAt: job.seenAt || new Date() } : {}) };
    if (closing) Object.assign(data, { status: "DELIVERED", deliveredAt: new Date() });
    const updated = Object.keys(data).length ? await updateJob(tx, job, data) : job;
    if (job.status === "ASSIGNED") await logEvent(tx, updated, "ACCEPTED", { userId: req.user.sub, note: "started the booking" });
    if (closing) {
      await logEvent(tx, updated, "CLOSED", { userId: req.user.sub, note: target });
      await auditJob(tx, updated, "DISPATCH_BOOKING_CLOSED", req.user.sub, `booking ${target}`);
    }
    return { job: updated, appointmentId: appt.id, status, customerId: appt.customerId, reference: appt.reference, startAt: appt.startAt };
  }, TX);
  if (result.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: result.customerId } });
    await mailCustomer(customer, "booking", { reference: result.reference || result.appointmentId.slice(-8).toUpperCase(), status: result.status, startAt: result.startAt });
  }
  res.json(itemView({ job: await prisma.dispatchJob.findUnique({ where: { id: result.job.id }, include: JOB_INC }) }));
});

export default router;
