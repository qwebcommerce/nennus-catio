/**
 * fix-rb — assignment screen (module `dispatch`) and the approval queue for drivers' order edits
 * (module `driverApprovals`). See docs/testing/drivers-dispatch.md.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { d, fmt } from "../lib/money.js";
import { fail, optDate, optText } from "../lib/bizError.js";
import { clientVersion, requireVersion } from "../lib/recordVersion.js";
import { qatarDayKey, qatarDayStart } from "../lib/qatarTime.js";
import { lockOrder } from "../lib/salesOrders.js";
import {
  KINDS,
  ON_VAN,
  OPEN_JOB,
  TX,
  adjustPlan,
  assertVanType,
  auditJob,
  candidateSources,
  checkVersion,
  ensureJob,
  itemView,
  JOB_INC,
  loadJob,
  lockJob,
  logEvent,
  parseKey,
  pricedSoLines,
  requestView,
  resolveTarget,
  updateJob,
  vansWithDrivers,
} from "../lib/dispatch.js";

const PERSON = { select: { id: true, name: true, nameEn: true } };

// ================================================================== /api/dispatch

export const dispatchRouter = Router();
dispatchRouter.use(authMiddleware);
dispatchRouter.use(requireModule("dispatch", "view"));

function kindsFrom(q) {
  const k = String(q || "").toUpperCase();
  if (k === "DELIVERY") return KINDS.filter((x) => x !== "GROOMING");
  return KINDS.includes(k) ? [k] : KINDS;
}

/**
 * GET /api/dispatch/queue?kind=&show=unassigned|assigned|all
 * Unassigned orders grouped by zone (area zone → city → area name), plus vans with workload.
 */
dispatchRouter.get("/queue", async (req, res) => {
  const orgId = req.user.organizationId;
  const kinds = kindsFrom(req.query.kind);
  const show = ["assigned", "all"].includes(String(req.query.show)) ? String(req.query.show) : "unassigned";
  const statuses = show === "unassigned" ? ["UNASSIGNED", "DECLINED"] : show === "assigned" ? ON_VAN : OPEN_JOB;
  const [candidates, jobs, vans, areas] = await Promise.all([
    show === "assigned" ? [] : candidateSources(prisma, orgId, kinds),
    prisma.dispatchJob.findMany({ where: { organizationId: orgId, kind: { in: kinds }, status: { in: statuses } }, include: JOB_INC, orderBy: { createdAt: "asc" }, take: 500 }),
    vansWithDrivers(prisma, orgId),
    prisma.deliveryArea.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, nameEn: true, city: true, zone: true }, orderBy: { name: "asc" } }),
  ]);
  const items = [
    ...candidates.map((c) => itemView(c)),
    ...jobs.map((job) => itemView({ job })),
  ].filter((it) => it.status !== "CANCELLED");
  const groups = new Map();
  for (const it of items) {
    const zone = it.zone || "";
    if (!groups.has(zone)) groups.set(zone, []);
    groups.get(zone).push(it);
  }
  const out = [...groups].map(([zone, list]) => ({
    zone: zone || null,
    count: list.length,
    items: list.sort((a, b) => String(a.area?.nameEn || a.area?.name || "").localeCompare(String(b.area?.nameEn || b.area?.name || "")) || String(a.deliveryDate || "").localeCompare(String(b.deliveryDate || ""))),
  })).sort((a, b) => (a.zone == null) - (b.zone == null) || String(a.zone).localeCompare(String(b.zone)));
  res.json({
    show,
    total: items.length,
    unassigned: items.filter((i) => ["UNASSIGNED", "DECLINED"].includes(i.status)).length,
    groups: out,
    vans,
    areas,
  });
});

/** GET /api/dispatch/summary — counts for the dashboard. */
dispatchRouter.get("/summary", async (req, res) => {
  const orgId = req.user.organizationId;
  const [candidates, waiting, byStatus, deliveredToday, pendingChanges] = await Promise.all([
    candidateSources(prisma, orgId),
    prisma.dispatchJob.count({ where: { organizationId: orgId, status: { in: ["UNASSIGNED", "DECLINED"] } } }),
    prisma.dispatchJob.groupBy({ by: ["status"], where: { organizationId: orgId, status: { in: ON_VAN } }, _count: { _all: true } }),
    prisma.dispatchJob.count({ where: { organizationId: orgId, status: "DELIVERED", deliveredAt: { gte: qatarDayStart(qatarDayKey()) } } }),
    prisma.driverChangeRequest.count({ where: { organizationId: orgId, status: "PENDING" } }),
  ]);
  const c = (s) => byStatus.find((r) => r.status === s)?._count._all || 0;
  res.json({ unassigned: candidates.length + waiting, assigned: c("ASSIGNED"), accepted: c("ACCEPTED"), deliveredToday, pendingChanges });
});

/** GET /api/dispatch/items/:key — one order with its job and history. */
dispatchRouter.get("/items/:key", async (req, res) => {
  const orgId = req.user.organizationId;
  const { kind, sourceId } = parseKey(req.params.key);
  const field = { WEB_ORDER: "saleId", POS_DELIVERY: "saleId", SALES_ORDER: "salesOrderId", GROOMING: "appointmentId" }[kind];
  const job = await prisma.dispatchJob.findFirst({ where: { organizationId: orgId, [field]: sourceId }, include: JOB_INC });
  if (job) {
    const [events, requests] = await Promise.all([
      prisma.dispatchEvent.findMany({ where: { jobId: job.id }, include: { user: PERSON }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.driverChangeRequest.findMany({ where: { jobId: job.id }, include: { requestedBy: PERSON, decidedBy: PERSON }, orderBy: { createdAt: "asc" } }),
    ]);
    return res.json({ ...itemView({ job }), events, changeRequests: requests.map(requestView) });
  }
  const [cand] = (await candidateSources(prisma, orgId, [kind])).filter((c) => c.row.id === sourceId);
  if (!cand) throw fail(404, "DISPATCH_ORDER_NOT_FOUND", "الطلب غير موجود", "Order not found");
  res.json({ ...itemView(cand), events: [], changeRequests: [] });
});

function itemsFrom(body) {
  const raw = Array.isArray(body?.items) ? body.items : Array.isArray(body?.keys) ? body.keys.map((key) => ({ key })) : [];
  if (!raw.length) throw fail(400, "DISPATCH_NOTHING_SELECTED", "اختر طلباً واحداً على الأقل", "Select at least one order");
  if (raw.length > 100) throw fail(400, "DISPATCH_TOO_MANY", "اختر 100 طلب كحد أقصى في المرة", "Select at most 100 orders at a time");
  const seen = new Set();
  return raw.filter((r) => {
    const k = String(r?.key || "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((r) => {
    parseKey(r.key);
    const v = r.version == null || r.version === "" ? null : Number(r.version);
    return { key: String(r.key), version: Number.isInteger(v) && v >= 1 ? v : null };
  });
}

/**
 * POST /api/dispatch/assign { items: [{ key, version? }] | keys: [...], driverUserId | vehicleId, note? }
 * New assignments need dispatch.create; moving a job that is already on another van needs dispatch.edit.
 */
dispatchRouter.post("/assign", requireModule("dispatch", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const items = itemsFrom(req.body);
  const note = optText(req.body?.note, 300);
  const { vehicle, driver } = await resolveTarget(prisma, orgId, req.body || {});
  const canReassign = await hasModule(req, "dispatch", "edit");
  const done = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const it of items) {
      const job = await ensureJob(tx, orgId, it.key);
      checkVersion(job, it.version);
      assertVanType(job.kind, vehicle);
      if (!OPEN_JOB.includes(job.status)) {
        throw fail(400, "DISPATCH_JOB_CLOSED", "هذه المهمة مُسلَّمة أو ملغاة", "This job is already delivered or cancelled");
      }
      const view = itemView({ job });
      if (view.status === "CANCELLED") throw fail(400, "DISPATCH_NOT_ASSIGNABLE", "هذا الطلب لا يحتاج توصيلاً الآن (مُسلَّم أو ملغى أو ليس للتوصيل)", "This order does not need delivering now (delivered, cancelled or not for delivery)");
      const onVan = ON_VAN.includes(job.status);
      if (onVan && job.vehicleId === vehicle.id && (job.driverUserId || null) === (driver?.id || null)) {
        out.push({ key: it.key, jobId: job.id, unchanged: true });
        continue;
      }
      if (onVan && !canReassign) {
        throw fail(403, "DISPATCH_REASSIGN_FORBIDDEN", "إعادة الإسناد تحتاج صلاحية تعديل التوزيع", "Reassigning needs the dispatch edit right", { key: it.key });
      }
      const type = onVan ? "REASSIGNED" : "ASSIGNED";
      const updated = await updateJob(tx, job, {
        status: "ASSIGNED",
        vehicleId: vehicle.id,
        driverUserId: driver?.id || null,
        assignedAt: new Date(),
        assignedByUserId: req.user.sub,
        seenAt: null,
        acceptedAt: null,
        declinedAt: null,
        declineReason: null,
      });
      await logEvent(tx, updated, type, {
        userId: req.user.sub,
        note,
        meta: { from: onVan ? { vehicleId: job.vehicleId, driverUserId: job.driverUserId, vehicle: job.vehicle?.plate || null, driver: job.driver?.nameEn || job.driver?.name || null } : null, to: { vehicle: vehicle.plate, driver: driver?.nameEn || driver?.name || null } },
      });
      await auditJob(tx, updated, type === "ASSIGNED" ? "DISPATCH_ASSIGN" : "DISPATCH_REASSIGN", req.user.sub, `${type === "ASSIGNED" ? "assigned to" : "reassigned to"} ${vehicle.plate}${driver ? ` (${driver.nameEn || driver.name})` : ""}`, { vehicleId: vehicle.id, driverUserId: driver?.id || null, previousVehicleId: onVan ? job.vehicleId : null });
      out.push({ key: it.key, jobId: updated.id, version: updated.version, status: updated.status, event: type });
    }
    return out;
  }, TX);
  res.json({ assigned: done.filter((x) => !x.unchanged).length, items: done });
});

/** POST /api/dispatch/unassign { items | keys, note? } — back to the unassigned list (dispatch.edit). */
dispatchRouter.post("/unassign", requireModule("dispatch", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const items = itemsFrom(req.body);
  const note = optText(req.body?.note, 300);
  const done = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const it of items) {
      const job = await ensureJob(tx, orgId, it.key);
      checkVersion(job, it.version);
      if (!["ASSIGNED", "ACCEPTED", "DECLINED"].includes(job.status)) {
        throw fail(400, "DISPATCH_NOT_ASSIGNED", "هذا الطلب غير مُسند لأي سائق", "This order is not assigned to anyone");
      }
      const updated = await updateJob(tx, job, { status: "UNASSIGNED", vehicleId: null, driverUserId: null, seenAt: null, acceptedAt: null });
      await logEvent(tx, updated, "UNASSIGNED", { userId: req.user.sub, driverUserId: job.driverUserId, vehicleId: job.vehicleId, note, meta: { vehicle: job.vehicle?.plate || null, driver: job.driver?.nameEn || job.driver?.name || null } });
      await auditJob(tx, { ...updated, vehicle: job.vehicle }, "DISPATCH_UNASSIGN", req.user.sub, `unassigned from ${job.vehicle?.plate || "—"}`, { previousVehicleId: job.vehicleId, previousDriverUserId: job.driverUserId });
      out.push({ key: it.key, jobId: updated.id, version: updated.version, status: updated.status });
    }
    return out;
  }, TX);
  res.json({ unassigned: done.length, items: done });
});

/** PATCH /api/dispatch/items/:key { version?, address, areaId, deliveryDate, timeNote, note } — dispatch.edit. */
dispatchRouter.patch("/items/:key", requireModule("dispatch", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const version = clientVersion(req);
  const data = {};
  if (body.address !== undefined) data.address = optText(body.address, 500);
  if (body.timeNote !== undefined) data.timeNote = optText(body.timeNote, 120);
  if (body.note !== undefined) data.note = optText(body.note, 500);
  if (body.deliveryDate !== undefined) data.deliveryDate = optDate(body.deliveryDate, "deliveryDate");
  if (body.areaId !== undefined) {
    if (body.areaId) {
      const area = await prisma.deliveryArea.findFirst({ where: { id: String(body.areaId), organizationId: orgId }, select: { id: true } });
      if (!area) throw fail(400, "DISPATCH_AREA_INVALID", "منطقة التوصيل غير صالحة", "Choose a valid delivery area");
      data.areaId = area.id;
    } else data.areaId = null;
  }
  if (!Object.keys(data).length) throw fail(400, "DRIVER_CHANGE_EMPTY", "لا يوجد تغيير لطلبه", "There is no change to request");
  const job = await prisma.$transaction(async (tx) => {
    const current = await ensureJob(tx, orgId, req.params.key);
    // NFR-13: an existing job is edited from the version the screen loaded (a new one has none yet).
    if (!current._created) {
      if (version == null) requireVersion(req);
      checkVersion(current, version);
    }
    if (!OPEN_JOB.includes(current.status)) throw fail(400, "DISPATCH_JOB_CLOSED", "هذه المهمة مُسلَّمة أو ملغاة", "This job is already delivered or cancelled");
    const updated = await updateJob(tx, current, data);
    await logEvent(tx, updated, "EDITED", { userId: req.user.sub, meta: { fields: Object.keys(data) } });
    await auditJob(tx, updated, "DISPATCH_EDIT", req.user.sub, `edited ${Object.keys(data).join(", ")}`);
    return updated;
  }, TX);
  res.json(itemView({ job }));
});

// ================================================================== /api/driver-approvals

export const approvalsRouter = Router();
approvalsRouter.use(authMiddleware);
approvalsRouter.use(requireModule("driverApprovals", "view"));

const REQUEST_INC = { job: { include: JOB_INC }, requestedBy: PERSON, decidedBy: PERSON };

/** Sales-order total before / after, for the approver. */
function preview(r) {
  if (r.job?.kind !== "SALES_ORDER" || !r.changes?.lines?.length || !r.job.salesOrder) return null;
  try {
    const { totals } = pricedSoLines(r.job.salesOrder, r.changes.lines);
    return { totalBefore: fmt(r.job.salesOrder.total), totalAfter: fmt(totals.total), amountPaid: fmt(r.job.salesOrder.amountPaid) };
  } catch {
    return null;
  }
}

approvalsRouter.get("/count", async (req, res) => {
  const pending = await prisma.driverChangeRequest.count({ where: { organizationId: req.user.organizationId, status: "PENDING" } });
  res.json({ pending });
});

approvalsRouter.get("/", async (req, res) => {
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(String(req.query.status || "").toUpperCase()) ? String(req.query.status).toUpperCase() : null;
  const rows = await prisma.driverChangeRequest.findMany({
    where: { organizationId: req.user.organizationId, ...(status ? { status } : {}) },
    include: REQUEST_INC,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  const counts = await prisma.driverChangeRequest.groupBy({ by: ["status"], where: { organizationId: req.user.organizationId }, _count: { _all: true } });
  res.json({
    counts: Object.fromEntries(["PENDING", "APPROVED", "REJECTED"].map((s) => [s, counts.find((c) => c.status === s)?._count._all || 0])),
    items: rows.map((r) => ({ ...requestView(r), preview: preview(r) })),
  });
});

async function lockRequest(tx, orgId, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "DriverChangeRequest" WHERE id = ${String(id)} AND "organizationId" = ${orgId} FOR UPDATE`;
  if (!rows.length) throw fail(404, "DRIVER_CHANGE_NOT_FOUND", "طلب التعديل غير موجود", "Change request not found");
  return tx.driverChangeRequest.findUnique({ where: { id: String(id) }, include: REQUEST_INC });
}

function stale() {
  return fail(409, "DRIVER_CHANGE_STALE", "تغيّر الطلب منذ أن طلب السائق التعديل. ارفض الطلب واطلب من السائق إعادة الطلب.", "The order changed since the driver asked. Reject the request and ask the driver to send it again.");
}

/** Applies approved sales-order line changes through the sales-order pricing rules (NFR-13 version bump, audit). */
async function applySoLines(tx, { orgId, userId, job, request }) {
  await lockOrder(tx, orgId, job.salesOrderId);
  const order = await tx.salesOrder.findUnique({
    where: { id: job.salesOrderId },
    include: { lines: { include: { product: { select: { sellBy: true } } } }, installments: true },
  });
  if (order.status !== "CONFIRMED" || order.lines.some((l) => l.quantityDelivered > 0)) {
    throw fail(409, "DRIVER_CHANGE_SO_DELIVERED", "يمكن تعديل أسطر طلب البيع قبل أي تسليم فقط", "Sales-order lines can be changed only before anything is delivered");
  }
  // The driver's view of the lines must still be the order's lines.
  for (const b of request.before.lines || []) {
    const line = order.lines.find((l) => l.id === b.lineId);
    if (!line || line.quantity !== b.quantity) throw stale();
  }
  if (order.lines.length !== (request.before.lines || []).length) throw stale();
  const { kept, removed, totals } = pricedSoLines(order, request.changes.lines);
  // fix-rd: payments awaiting confirmation count as paid here (they may still be confirmed).
  if (totals.total < d(order.amountPaid) + d(order.amountPending)) {
    throw fail(400, "DRIVER_CHANGE_BELOW_PAID", "بعد التعديل يصبح إجمالي الطلب أقل من المدفوع. سجّل استرداداً أولاً أو ارفض الطلب.", "After this change the order total would be less than what was paid. Reject the request or settle the refund first.", { total: fmt(totals.total), paid: fmt(order.amountPaid) });
  }
  const plan = adjustPlan(order.installments, d(order.total), totals.total);
  const moved = await tx.salesOrder.updateMany({
    where: { id: order.id, version: order.version, status: "CONFIRMED" },
    data: { subtotal: totals.subtotal, discountAmount: totals.discount, total: totals.total, version: { increment: 1 } },
  });
  if (moved.count !== 1) throw stale();
  if (removed.length) await tx.salesOrderLine.deleteMany({ where: { id: { in: removed.map((l) => l.id) }, quantityDelivered: 0 } });
  for (const l of kept) {
    await tx.salesOrderLine.update({ where: { id: l.id }, data: { quantity: l.quantity, subtotal: l.subtotal, discountShare: l.discountShare } });
  }
  for (const r of plan.removed) await tx.salesOrderInstallment.delete({ where: { id: r.id } });
  for (const r of plan.rows.filter((x) => x.changed)) await tx.salesOrderInstallment.update({ where: { id: r.id }, data: { amount: r.amount, percent: null } });
  const after = await tx.salesOrder.findUnique({ where: { id: order.id }, select: { version: true, total: true } });
  await writeAudit({
    userId,
    action: "SALES_ORDER_EDIT",
    entityType: "SalesOrder",
    entityId: order.id,
    branchId: order.branchId,
    summary: `${order.reference}: driver change approved, total ${fmt(order.total)} -> ${fmt(totals.total)}`,
    meta: { driverChangeRequestId: request.id, lines: request.changes.lines, removedLines: removed.map((l) => l.id) },
  }, tx);
  return { orderVersionBefore: order.version, orderVersionAfter: after.version, totalBefore: fmt(order.total), totalAfter: fmt(after.total), removedLines: removed.length };
}

/** POST /api/driver-approvals/:id/approve { version, note? } — driverApprovals.edit. */
approvalsRouter.post("/:id/approve", requireModule("driverApprovals", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const note = optText(req.body?.note, 500);
  const result = await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, orgId, req.params.id);
    if (request.version !== version) throw fail(409, "STALE_EDIT", "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.", "This record was changed by someone else. Reload and try again.", { currentVersion: request.version });
    if (request.status !== "PENDING") throw fail(400, "DRIVER_CHANGE_DECIDED", "تم البت في طلب التعديل هذا", "This change request was already decided");
    const job = await lockJob(tx, orgId, request.jobId);
    if (!["ASSIGNED", "ACCEPTED"].includes(job.status)) throw stale();
    const c = request.changes || {};
    const applied = {};
    if (c.lines?.length) {
      if (job.kind !== "SALES_ORDER") throw fail(400, "DRIVER_CHANGE_NOT_ALLOWED", "لا يمكن تعديل هذا في هذا النوع من الطلبات", "This cannot be changed on this kind of order", { field: "lines" });
      Object.assign(applied, await applySoLines(tx, { orgId, userId: req.user.sub, job, request }));
    }
    if (c.deliveryDate && job.kind === "SALES_ORDER") {
      await tx.salesOrder.update({ where: { id: job.salesOrderId }, data: { deliveryDate: new Date(`${c.deliveryDate}T00:00:00Z`) } });
      if (!applied.orderVersionAfter) applied.orderDeliveryDate = c.deliveryDate;
    }
    const data = {};
    for (const f of ["note", "address", "timeNote"]) if (f in c) data[f] = c[f];
    if (c.deliveryDate) data.deliveryDate = new Date(`${c.deliveryDate}T00:00:00Z`);
    const updatedJob = Object.keys(data).length ? await updateJob(tx, job, data) : job;
    const decided = await tx.driverChangeRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", decidedByUserId: req.user.sub, decidedAt: new Date(), decisionNote: note, applied },
      include: REQUEST_INC,
    });
    await logEvent(tx, updatedJob, "CHANGE_APPROVED", { userId: req.user.sub, note, meta: { requestId: request.id, applied } });
    await auditJob(tx, updatedJob, "DRIVER_CHANGE_APPROVE", req.user.sub, `change request approved (${Object.keys(c).join(", ")})`, { requestId: request.id, applied });
    return decided;
  }, TX);
  res.json(requestView(result));
});

/** POST /api/driver-approvals/:id/reject { version, reason } — kept with the reason. */
approvalsRouter.post("/:id/reject", requireModule("driverApprovals", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const reason = optText(req.body?.reason, 500);
  if (!reason) throw fail(400, "REASON_REQUIRED", "اكتب سبب الرفض", "Enter the reason for rejecting");
  const result = await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, orgId, req.params.id);
    if (request.version !== version) throw fail(409, "STALE_EDIT", "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.", "This record was changed by someone else. Reload and try again.", { currentVersion: request.version });
    if (request.status !== "PENDING") throw fail(400, "DRIVER_CHANGE_DECIDED", "تم البت في طلب التعديل هذا", "This change request was already decided");
    const decided = await tx.driverChangeRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedByUserId: req.user.sub, decidedAt: new Date(), decisionNote: reason },
      include: REQUEST_INC,
    });
    await logEvent(tx, request.job, "CHANGE_REJECTED", { userId: req.user.sub, note: reason, meta: { requestId: request.id } });
    await auditJob(tx, request.job, "DRIVER_CHANGE_REJECT", req.user.sub, `change request rejected: ${reason}`, { requestId: request.id });
    return decided;
  }, TX);
  res.json(requestView(result));
});

