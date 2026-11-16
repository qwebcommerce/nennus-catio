import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule, requirePermission } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { claimSlot, qatarDateTime, qatarDayBounds, qatarParts, qatarToday, slotTaken } from "../lib/groomingSlots.js";
import { LOCK_TX, acceptReviewPayments, lockParent, paymentTotals, refundParent, rejectReviewPayments, statusError } from "../lib/payments.js";
import { writeAudit } from "../lib/auditLog.js";
import { mailCustomer } from "../lib/mailer.js";

const router = Router();
router.use(authMiddleware);

/**
 * FR-29: the till's "today's grooming" panel. Read-only, for anyone with till access,
 * limited to the till's location and today's date in Qatar.
 */
router.get("/today", requirePermission("pos"), async (req, res) => {
  try {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    if (!branchId) return res.status(400).json({ error: "يجب اختيار الفرع", errorEn: "Choose the till location" });
    if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== branchId) {
      return res.status(403).json({ error: "لا يمكن الوصول لفرع آخر", errorEn: "This is another location" });
    }
    const br = await findBranchInOrg(prisma, req.user.organizationId, branchId);
    if (!br) return res.status(400).json({ error: "فرع غير صالح" });
    const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from = qatarDateTime(today, 0);
    const to = new Date(qatarDateTime(today, 24 * 60).getTime() - 1);
    const rows = await prisma.appointment.findMany({
      where: {
        organizationId: req.user.organizationId,
        branchId,
        startAt: { gte: from, lte: to },
        status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        petName: true,
        visitKind: true,
        customer: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: [{ startAt: "asc" }],
      take: 200,
    });
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "تعذر جلب المواعيد" });
  }
});

router.use(requireModule("grooming", "view"));

const STATUSES = ["BOOKED", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "DONE", "NO_SHOW", "CANCELLED"];

/**
 * FR-53 / FR-54: allowed staff status changes. CONFIRMED is reached only through a payment
 * (gateway or a resolved review), never set by hand; nothing goes back to PENDING_PAYMENT
 * or BOOKED, and DONE / NO_SHOW / CANCELLED are final.
 */
const NEXT = {
  PENDING_PAYMENT: ["CANCELLED"],
  BOOKED: ["CHECKED_IN", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
  DONE: [],
  NO_SHOW: [],
  CANCELLED: [],
};
const MOVABLE = ["PENDING_PAYMENT", "BOOKED", "CONFIRMED"];

function parseDateTime(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Calendar day in Qatar time (NFR-04), not the server's time zone. */
function parseDayBounds(dayRaw) {
  const raw = String(dayRaw || "").trim() || qatarToday();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return qatarDayBounds(raw);
  const day = new Date(raw);
  if (Number.isNaN(day.getTime())) return null;
  return qatarDayBounds(qatarToday(day));
}

async function assertBranchAllowed(req, branchId) {
  const bid = branchId || req.user.branchId || null;
  if (!bid) return null;
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    throw new Error("لا يمكن الوصول لفرع آخر");
  }
  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) throw new Error("فرع غير صالح");
  return br.id;
}

router.get("/services", async (req, res) => {
  const branchId = req.query.branchId ? String(req.query.branchId) : null;
  const rows = await prisma.groomingService.findMany({
    where: {
      organizationId: req.user.organizationId,
      active: true,
      ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
    },
    orderBy: [{ name: "asc" }],
  });
  res.json(rows);
});

router.post("/services", requireModule("grooming", "create"), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ error: "اسم الخدمة مطلوب" });
    const durationMin = Math.max(10, Math.min(360, Number(b.durationMin) || 60));
    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "سعر غير صالح" });
    }
    const branchId = b.branchId ? await assertBranchAllowed(req, String(b.branchId)) : null;
    const petTypeIds = Array.isArray(b.petTypeIds) ? [...new Set(b.petTypeIds.map(String))] : [];
    const petTypes = petTypeIds.length
      ? await prisma.catalogPetType.findMany({ where: { organizationId: req.user.organizationId, id: { in: petTypeIds } } })
      : [];
    const row = await prisma.groomingService.create({
      data: {
        organizationId: req.user.organizationId,
        branchId,
        name,
        nameEn: b.nameEn ? String(b.nameEn).trim() : null,
        included: b.included ? String(b.included).trim() : null,
        includedEn: b.includedEn ? String(b.includedEn).trim() : null,
        durationMin,
        price: new Prisma.Decimal(price.toFixed(2)),
        active: true,
        petLinks: { create: petTypes.map((pet) => ({ petTypeId: pet.id })) },
      },
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "فشل إنشاء الخدمة" });
  }
});

router.get("/", async (req, res) => {
  try {
    const branchId = req.query.branchId ? String(req.query.branchId) : req.user.branchId || null;
    const bounds = parseDayBounds(req.query.day || qatarToday());
    if (!bounds) return res.status(400).json({ error: "تاريخ غير صالح" });
    const { from, to } = bounds;

    if (branchId) await assertBranchAllowed(req, branchId);

    const rows = await prisma.appointment.findMany({
      where: {
        organizationId: req.user.organizationId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
        startAt: { gte: from, lte: to },
      },
      include: {
        payments: { select: { id: true, kind: true, method: true, status: true, amount: true, reviewReason: true, createdAt: true } },
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, durationMin: true, price: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ startAt: "asc" }],
      take: 500,
    });
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "تعذر جلب المواعيد" });
  }
});

router.get("/schedule", async (req, res) => {
  const rows = await prisma.groomingSchedule.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  res.json(rows);
});

router.post("/schedule", requireModule("grooming", "edit"), async (req, res) => {
  const weekday = Number(req.body?.weekday);
  const startTime = String(req.body?.startTime || "").trim();
  const endTime = String(req.body?.endTime || "").trim();
  const capacity = Math.floor(Number(req.body?.capacity) || 0);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !startTime || !endTime || capacity < 1) {
    return res.status(400).json({ error: "Weekday, times, and a capacity of at least one are required" });
  }
  const row = await prisma.groomingSchedule.create({
    data: { organizationId: req.user.organizationId, weekday, startTime, endTime, capacity },
  });
  res.status(201).json(row);
});

router.post("/", requireModule("grooming", "create"), async (req, res) => {
  try {
    const b = req.body || {};
    const startAt = parseDateTime(b.startAt);
    let endAt = parseDateTime(b.endAt);
    if (!startAt) {
      return res.status(400).json({ error: "وقت الموعد غير صالح", errorEn: "Invalid booking time" });
    }
    if (startAt.getTime() < Date.now() - 60 * 60 * 1000) {
      return res.status(400).json({ error: "لا يمكن الحجز في وقت مضى", errorEn: "That time has already passed" });
    }
    const branchId = await assertBranchAllowed(req, b.branchId ? String(b.branchId) : null);
    if (!branchId) {
      return res.status(400).json({ error: "يجب اختيار الفرع" });
    }
    const serviceId = b.serviceId ? String(b.serviceId) : null;
    const customerId = b.customerId ? String(b.customerId) : null;

    if (serviceId) {
      const service = await prisma.groomingService.findFirst({
        where: { id: serviceId, organizationId: req.user.organizationId, active: true },
      });
      if (!service) return res.status(400).json({ error: "الخدمة غير صالحة" });
      // The package sets the length of the booking.
      endAt = new Date(startAt.getTime() + Math.max(10, service.durationMin || 60) * 60 * 1000);
    }
    if (!endAt || endAt <= startAt) {
      return res.status(400).json({ error: "وقت الموعد غير صالح", errorEn: "Invalid booking time" });
    }
    if (customerId) {
      const c = await prisma.customer.findFirst({
        where: { id: customerId, organizationId: req.user.organizationId },
      });
      if (!c) return res.status(400).json({ error: "العميل غير صالح" });
    }

    const reminder24hAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    const reminder2hAt = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
    // Email is the only notification channel (FR-87): one email reminder the day before.
    const reminders = [];
    if (reminder24hAt > new Date()) {
      reminders.push({ channel: "EMAIL", scheduledAt: reminder24hAt });
    }

    const row = await prisma.$transaction(async (tx) => {
      // Staff bookings respect grooming hours and capacity too (FR-48, NFR-06).
      await claimSlot(tx, { organizationId: req.user.organizationId, startAt, endAt, grid: null });
      return tx.appointment.create({
      data: {
        organizationId: req.user.organizationId,
        branchId,
        customerId,
        serviceId,
        petName: b.petName ? String(b.petName).trim() : null,
        petType: ["CAT", "DOG", "OTHER"].includes(String(b.petType || "").toUpperCase())
          ? String(b.petType).toUpperCase()
          : "OTHER",
        notes: b.notes ? String(b.notes).trim() : null,
        status: "BOOKED",
        startAt,
        endAt,
        reminder24hAt,
        reminder2hAt,
        createdByUserId: req.user.sub,
        reminders: { create: reminders },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, durationMin: true, price: true } },
      },
      });
    }, LOCK_TX);
    res.status(201).json(row);
  } catch (e) {
    res.status(e.status || 400).json({
      error: e.errorAr || (e instanceof Error ? e.message : "فشل إنشاء الموعد"),
      ...(e.errorEn ? { errorEn: e.errorEn, errorAr: e.errorAr } : {}),
    });
  }
});

router.patch("/:id", requireModule("grooming", "edit"), async (req, res) => {
  try {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!existing) return res.status(404).json({ error: "الموعد غير موجود" });
    if (existing.branchId) await assertBranchAllowed(req, existing.branchId);

    const b = req.body || {};
    const data = {};
    let next = null;
    if (b.status != null) {
      next = String(b.status).toUpperCase();
      if (!STATUSES.includes(next)) {
        return res.status(400).json({ error: "حالة غير صالحة", errorEn: "Invalid status" });
      }
      if (next === existing.status) next = null;
      else if (!(NEXT[existing.status] || []).includes(next)) {
        const why =
          next === "CONFIRMED"
            ? "A booking is confirmed only by its payment"
            : `A ${existing.status} booking cannot become ${next}`;
        return res.status(400).json({ error: "تغيير الحالة غير مسموح", errorEn: why, errorAr: "تغيير الحالة غير مسموح" });
      }
      if (next) data.status = next;
      // A paid booking cancelled by staff is flagged so the refund is decided (FR-55).
      if (next === "CANCELLED" && Number(existing.amountPaid) > 0) {
        data.paymentReview = true;
        data.paymentReviewReason = "REFUND_DUE";
      }
    }
    let move = null;
    if (b.startAt != null || b.endAt != null) {
      if (!MOVABLE.includes(existing.status) || next) {
        return res.status(400).json({ error: "لا يمكن نقل هذا الموعد", errorEn: "Only an upcoming booking can be moved, without a status change" });
      }
      const startAt = parseDateTime(b.startAt || existing.startAt);
      const length = new Date(existing.endAt).getTime() - new Date(existing.startAt).getTime();
      const endAt = b.endAt && !b.startAt ? parseDateTime(b.endAt) : startAt ? new Date(startAt.getTime() + length) : null;
      if (!startAt || !endAt || endAt <= startAt) return res.status(400).json({ error: "وقت الموعد غير صالح", errorEn: "Invalid booking time" });
      if (startAt.getTime() < Date.now()) return res.status(400).json({ error: "لا يمكن النقل إلى وقت مضى", errorEn: "Cannot move a booking into the past" });
      move = { startAt, endAt };
      data.startAt = startAt;
      data.endAt = endAt;
    }
    if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).trim() : null;
    const row = await prisma.$transaction(async (tx) => {
      // Moves respect hours and capacity, checked under the schedule lock (FR-53, NFR-06).
      if (move) await claimSlot(tx, { organizationId: req.user.organizationId, ...move, excludeId: existing.id, grid: null });
      // Guarded: the change applies only if nobody changed the status in between.
      const updated = await tx.appointment.updateMany({
        where: { id: existing.id, status: existing.status },
        data,
      });
      if (!updated.count) throw statusError("The booking changed. Refresh and try again.", 409);
      return tx.appointment.findUnique({ where: { id: existing.id } });
    }, LOCK_TX);
    if (next || move) {
      await writeAudit({
        userId: req.user.sub,
        action: "BOOKING_UPDATE",
        entityType: "Appointment",
        entityId: row.id,
        branchId: row.branchId,
        summary: `${row.reference || row.id}: ${existing.status}${next ? ` -> ${next}` : ""}${move ? ` moved to ${move.startAt.toISOString()}` : ""}`,
      });
    }
    // Booking update email (FR-85): cancellation, other status changes and a new time.
    if ((next || move) && row.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: row.customerId } });
      await mailCustomer(customer, "booking", {
        reference: row.reference || row.id.slice(-8).toUpperCase(),
        status: next ? row.status : "RESCHEDULED",
        startAt: row.startAt,
      });
    }
    res.json(row);
  } catch (e) {
    res.status(e.status || 400).json({
      error: e.errorAr || (e instanceof Error ? e.message : "تعذر تعديل الموعد"),
      ...(e.errorEn ? { errorEn: e.errorEn } : { errorEn: e.message }),
    });
  }
});

/**
 * FR-79: staff resolve a booking payment that could not confirm automatically
 * (late, wrong amount, duplicate) or a refund that is due after a cancel.
 * accept=true keeps the money (and confirms the booking if the slot is still free);
 * accept=false refunds it.
 */
router.post("/:id/resolve-payment", requireModule("grooming", "edit"), async (req, res) => {
  const existing = await prisma.appointment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId, paymentReview: true },
  });
  if (!existing) return res.status(404).json({ error: "لا يوجد دفع بانتظار المراجعة", errorEn: "No payment is waiting for review" });
  const accept = Boolean(req.body?.accept);
  try {
    if (existing.paymentReviewReason === "REFUND_DUE") {
      if (!accept) await refundRemaining(existing, req.user.sub);
      await prisma.appointment.update({ where: { id: existing.id }, data: { paymentReview: false, paymentReviewReason: null } });
    } else if (accept) {
      await prisma.$transaction(async (tx) => {
        await lockParent(tx, "appointment", existing.id);
        const current = await tx.appointment.findUnique({ where: { id: existing.id } });
        if (!["PENDING_PAYMENT", "CANCELLED"].includes(current.status)) {
          throw statusError("This booking is already paid. Refund the extra payment instead.", 400);
        }
        // The slot may have been taken since the hold lapsed; staff refund instead if it is full.
        await claimSlot(tx, { organizationId: current.organizationId, startAt: current.startAt, endAt: current.endAt, excludeId: current.id, grid: null });
        const accepted = await acceptReviewPayments(tx, "appointment", current.id);
        if (accepted <= 0) throw statusError("No payment is waiting for review", 404);
        await tx.appointment.update({
          where: { id: current.id },
          data: { status: "CONFIRMED", amountPaid: accepted, paidAt: new Date(), paymentReview: false, paymentReviewReason: null },
        });
      }, LOCK_TX);
    } else {
      await rejectReviewPayments({ parentKind: "appointment", parentId: existing.id, userId: req.user.sub });
      await prisma.appointment.updateMany({ where: { id: existing.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
      await prisma.appointment.update({ where: { id: existing.id }, data: { paymentReview: false, paymentReviewReason: null } });
    }
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.errorAr || e.message, errorEn: e.errorEn || e.message });
  }
  await writeAudit({
    userId: req.user.sub,
    action: "PAYMENT_REVIEW",
    entityType: "Appointment",
    entityId: existing.id,
    summary: `${existing.reference || existing.id} ${existing.paymentReviewReason}: ${accept ? "kept" : "refunded"}`,
  });
  res.json({ id: existing.id, reference: existing.reference, accepted: accept });
});

async function refundRemaining(existing, userId) {
  const totals = await paymentTotals(prisma, "appointment", existing.id);
  if (totals.remaining <= 0) return 0;
  await refundParent({
    parentKind: "appointment",
    parentId: existing.id,
    organizationId: existing.organizationId,
    amount: totals.remaining,
    userId,
    note: "Refund after cancel",
  });
  return totals.remaining;
}

/**
 * FR-55 / FR-77: refund a booking payment in full or in part. Online payments go back
 * through the gateway; cash or bank refunds are recorded by staff. No stock is touched.
 */
router.post("/:id/refund", requireModule("grooming", "refund"), async (req, res) => {
  const existing = await prisma.appointment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { customer: true },
  });
  if (!existing) return res.status(404).json({ error: "الموعد غير موجود", errorEn: "Booking not found" });
  try {
    const refund = await refundParent({
      parentKind: "appointment",
      parentId: existing.id,
      organizationId: existing.organizationId,
      amount: req.body?.amount,
      userId: req.user.sub,
      method: req.body?.method,
      note: req.body?.note,
    });
    await writeAudit({
      userId: req.user.sub,
      action: "BOOKING_REFUND",
      entityType: "Payment",
      entityId: refund.id,
      branchId: existing.branchId,
      summary: `${existing.reference || existing.id} ${Number(refund.amount).toFixed(2)} ${refund.method}`,
    });
    await mailCustomer(existing.customer, "refund", { reference: existing.reference || existing.id.slice(-8).toUpperCase(), amount: refund.amount });
    res.status(201).json(refund);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message, errorEn: e.message });
  }
});

/** Queues due reminder emails. Only email is sent (FR-87); other channels are never marked sent. */
router.post("/reminders/mark-due", requireModule("grooming", "edit"), async (req, res) => {
  const now = new Date();
  const due = await prisma.appointmentReminder.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      appointment: { organizationId: req.user.organizationId },
    },
    include: {
      appointment: {
        select: {
          id: true,
          reference: true,
          startAt: true,
          status: true,
          customer: { select: { name: true, email: true, locale: true, organizationId: true } },
        },
      },
    },
    take: 200,
  });
  let queued = 0;
  for (const reminder of due) {
    const appointment = reminder.appointment;
    const live = appointment && !["CANCELLED", "NO_SHOW", "DONE", "PENDING_PAYMENT"].includes(appointment.status);
    const row = reminder.channel === "EMAIL" && live && appointment.customer?.email
      ? await mailCustomer(appointment.customer, "booking", {
          reference: appointment.reference || appointment.id.slice(-8).toUpperCase(),
          status: appointment.status,
          startAt: appointment.startAt,
        })
      : null;
    if (row) queued += 1;
    await prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: row
        ? { status: "SENT", sentAt: now, error: null }
        : { status: "FAILED", error: reminder.channel !== "EMAIL" ? "Only email reminders are sent" : !live ? "Booking is not active" : "Customer has no email" },
    });
  }
  res.json({ processed: due.length, queued });
});

export default router;
