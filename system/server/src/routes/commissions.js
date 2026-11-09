import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

router.get("/rules", async (req, res) => {
  const rows = await prisma.commissionRule.findMany({
    where: { organizationId: req.user.organizationId },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  res.json(rows);
});

router.post("/rules", async (req, res) => {
  const b = req.body || {};
  const employeeId = String(b.employeeId || "");
  const percent = Number(b.percent);
  if (!employeeId) return res.status(400).json({ error: "employeeId مطلوب" });
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return res.status(400).json({ error: "النسبة غير صالحة" });
  }
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: req.user.organizationId },
  });
  if (!emp) return res.status(400).json({ error: "الموظف غير موجود" });
  const row = await prisma.commissionRule.create({
    data: {
      organizationId: req.user.organizationId,
      employeeId,
      base: "APPOINTMENT_SERVICE_AMOUNT",
      percent: new Prisma.Decimal(percent.toFixed(2)),
      active: b.active !== false,
    },
  });
  res.status(201).json(row);
});

router.patch("/rules/:id", async (req, res) => {
  const existing = await prisma.commissionRule.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "القاعدة غير موجودة" });
  const b = req.body || {};
  const data = {};
  if (b.active !== undefined) data.active = Boolean(b.active);
  if (b.percent !== undefined) {
    const p = Number(b.percent);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return res.status(400).json({ error: "النسبة غير صالحة" });
    }
    data.percent = new Prisma.Decimal(p.toFixed(2));
  }
  const row = await prisma.commissionRule.update({ where: { id: existing.id }, data });
  res.json(row);
});

router.get("/entries", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;
  const where = {
    organizationId: req.user.organizationId,
    ...(employeeId ? { employeeId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };
  const rows = await prisma.commissionEntry.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      appointment: { select: { id: true, startAt: true, status: true } },
      rule: { select: { id: true, percent: true, active: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const total = rows.reduce((s, r) => s + Number(r.commissionAmount || 0), 0);
  res.json({ entries: rows, total });
});

export default router;
