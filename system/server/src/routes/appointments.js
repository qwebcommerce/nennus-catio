import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { qatarParts, slotTaken } from "../lib/groomingSlots.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

const STATUSES = ["BOOKED", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "DONE", "NO_SHOW", "CANCELLED"];

function parseDateTime(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseDayBounds(dayRaw) {
  const raw = String(dayRaw || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const from = new Date(y, mo, d, 0, 0, 0, 0);
    const to = new Date(y, mo, d, 23, 59, 59, 999);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { from, to };
    }
  }
  const day = raw ? new Date(raw) : new Date();
  if (Number.isNaN(day.getTime())) return null;
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(day);
  to.setHours(23, 59, 59, 999);
  return { from, to };
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

router.post("/services", async (req, res) => {
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
    const bounds = parseDayBounds(req.query.day || new Date().toISOString().slice(0, 10));
    if (!bounds) return res.status(400).json({ error: "تاريخ غير صالح" });
    const { from, to } = bounds;

    if (branchId) await assertBranchAllowed(req, branchId);

    const rows = await prisma.appointment.findMany({
      where: {
        organizationId: req.user.organizationId,
        ...(branchId ? { branchId } : {}),
        startAt: { gte: from, lte: to },
      },
      include: {
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

router.post("/schedule", async (req, res) => {
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

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const startAt = parseDateTime(b.startAt);
    const endAt = parseDateTime(b.endAt);
    if (!startAt || !endAt || endAt <= startAt) {
      return res.status(400).json({ error: "وقت الموعد غير صالح" });
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
    }
    if (customerId) {
      const c = await prisma.customer.findFirst({
        where: { id: customerId, organizationId: req.user.organizationId },
      });
      if (!c) return res.status(400).json({ error: "العميل غير صالح" });
    }

    const reminder24hAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    const reminder2hAt = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
    const reminders = [];
    if (reminder24hAt > new Date()) {
      reminders.push({ channel: "WHATSAPP", scheduledAt: reminder24hAt });
    }
    if (reminder2hAt > new Date()) {
      reminders.push({ channel: "SMS", scheduledAt: reminder2hAt });
    }

    const row = await prisma.appointment.create({
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
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "فشل إنشاء الموعد" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!existing) return res.status(404).json({ error: "الموعد غير موجود" });
    if (existing.branchId) await assertBranchAllowed(req, existing.branchId);

    const b = req.body || {};
    const data = {};
    if (b.status != null) {
      const st = String(b.status).toUpperCase();
      if (!STATUSES.includes(st)) {
        return res.status(400).json({ error: "حالة غير صالحة" });
      }
      data.status = st;
    }
    if (b.startAt != null || b.endAt != null) {
      const startAt = parseDateTime(b.startAt || existing.startAt);
      const endAt = parseDateTime(b.endAt || existing.endAt);
      if (!startAt || !endAt || endAt <= startAt) return res.status(400).json({ error: "وقت الموعد غير صالح" });
      const taken = await slotTaken(prisma, req.user.organizationId, startAt, endAt, existing.id);
      const local = qatarParts(startAt);
      const schedules = await prisma.groomingSchedule.findMany({
        where: { organizationId: req.user.organizationId, weekday: local.weekday, isActive: true },
      });
      const room = schedules.reduce((max, row) => Math.max(max, row.capacity), 0);
      if (schedules.length && taken >= room) return res.status(409).json({ error: "That time is already full" });
      data.startAt = startAt;
      data.endAt = endAt;
    }
    if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).trim() : null;
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data,
      });
      return updated;
    });
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "تعذر تعديل الموعد" });
  }
});

router.post("/reminders/mark-due", async (req, res) => {
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
          startAt: true,
          customer: { select: { name: true, phone: true, email: true } },
        },
      },
    },
    take: 200,
  });
  if (!due.length) return res.json({ processed: 0 });
  await prisma.appointmentReminder.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { status: "SENT", sentAt: now },
  });
  res.json({ processed: due.length, items: due });
});

export default router;
