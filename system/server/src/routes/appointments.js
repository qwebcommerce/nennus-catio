import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "CHECKED_IN"];

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
    const row = await prisma.groomingService.create({
      data: {
        organizationId: req.user.organizationId,
        branchId,
        name,
        durationMin,
        price: new Prisma.Decimal(price.toFixed(2)),
        active: true,
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
        groomer: { select: { id: true, name: true } },
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

router.get("/availability", async (req, res) => {
  try {
    const groomerId = String(req.query.groomerId || "");
    const startAt = parseDateTime(req.query.startAt);
    const endAt = parseDateTime(req.query.endAt);
    const branchId = req.query.branchId ? String(req.query.branchId) : req.user.branchId || null;
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
    if (!groomerId || !startAt || !endAt || endAt <= startAt) {
      return res.status(400).json({ error: "بيانات التوقيت غير صالحة" });
    }
    if (branchId) await assertBranchAllowed(req, branchId);

    const overlap = await prisma.appointment.findFirst({
      where: {
        organizationId: req.user.organizationId,
        groomerId,
        ...(branchId ? { branchId } : {}),
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, startAt: true, endAt: true },
    });

    res.json({ available: !overlap, overlap: overlap || null });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "تعذر فحص التوفر" });
  }
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
    const groomerId = b.groomerId ? String(b.groomerId) : null;
    const serviceId = b.serviceId ? String(b.serviceId) : null;
    const customerId = b.customerId ? String(b.customerId) : null;

    if (groomerId) {
      const emp = await prisma.employee.findFirst({
        where: { id: groomerId, organizationId: req.user.organizationId },
        select: { id: true, branchId: true },
      });
      if (!emp) return res.status(400).json({ error: "الموظف غير صالح" });
      if (branchId && emp.branchId && emp.branchId !== branchId) {
        return res.status(400).json({ error: "الموظف ليس ضمن هذا الفرع" });
      }
      const overlap = await prisma.appointment.findFirst({
        where: {
          organizationId: req.user.organizationId,
          groomerId,
          status: { in: ACTIVE_STATUSES },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (overlap) return res.status(409).json({ error: "الموعد يتعارض مع موعد آخر لنفس الموظف" });
    }

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
        groomerId,
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
        groomer: { select: { id: true, name: true } },
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
      if (!["BOOKED", "CONFIRMED", "CHECKED_IN", "DONE", "NO_SHOW", "CANCELLED"].includes(st)) {
        return res.status(400).json({ error: "حالة غير صالحة" });
      }
      data.status = st;
    }
    if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).trim() : null;
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data,
      });
      if (data.status === "DONE" && existing.groomerId && existing.serviceId) {
        const already = await tx.commissionEntry.findFirst({
          where: {
            organizationId: req.user.organizationId,
            appointmentId: existing.id,
            employeeId: existing.groomerId,
          },
        });
        if (!already) {
          const rule = await tx.commissionRule.findFirst({
            where: {
              organizationId: req.user.organizationId,
              employeeId: existing.groomerId,
              active: true,
            },
            orderBy: { createdAt: "desc" },
          });
          if (rule) {
            const service = await tx.groomingService.findFirst({
              where: { id: existing.serviceId, organizationId: req.user.organizationId },
              select: { price: true, name: true },
            });
            const base = Number(service?.price || 0);
            if (base > 0) {
              const percent = Number(rule.percent || 0);
              const amount = (base * percent) / 100;
              await tx.commissionEntry.create({
                data: {
                  organizationId: req.user.organizationId,
                  employeeId: existing.groomerId,
                  ruleId: rule.id,
                  appointmentId: existing.id,
                  baseAmount: new Prisma.Decimal(base.toFixed(2)),
                  percent: new Prisma.Decimal(percent.toFixed(2)),
                  commissionAmount: new Prisma.Decimal(amount.toFixed(2)),
                  note: `Auto from appointment ${existing.id}${service?.name ? ` (${service.name})` : ""}`,
                },
              });
            }
          }
        }
      }
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
