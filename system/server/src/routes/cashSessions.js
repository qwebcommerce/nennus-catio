import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { computeSessionExpectedCash } from "../lib/saleCash.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/open", async (req, res) => {
  const branchId = req.query.branchId || req.user.branchId;
  if (!branchId) return res.json(null);
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== String(branchId)) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  const session = await prisma.cashSession.findFirst({
    where: {
      branchId: String(branchId),
      closedAt: null,
      branch: { organizationId: req.user.organizationId },
    },
    include: {
      openedBy: { select: { id: true, name: true } },
      branch: { select: { name: true } },
    },
  });
  res.json(session);
});

router.post("/open", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("cashSession"), async (req, res) => {
  const { branchId, openingFloat } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن فتح صندوق لفرع آخر" });
  }
  const existing = await prisma.cashSession.findFirst({
    where: {
      branchId: bid,
      closedAt: null,
      branch: { organizationId: req.user.organizationId },
    },
  });
  if (existing) {
    return res.status(400).json({ error: "يوجد جلسة مفتوحة لهذا الفرع" });
  }
  const fl = Number(openingFloat);
  const opening =
    Number.isNaN(fl) || fl < 0 ? new Prisma.Decimal(0) : new Prisma.Decimal(fl.toFixed(2));

  const session = await prisma.cashSession.create({
    data: {
      branchId: bid,
      openedByUserId: req.user.sub,
      openingFloat: opening,
    },
    include: {
      openedBy: { select: { id: true, name: true } },
      branch: { select: { name: true } },
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "CASH_SESSION_OPEN",
    entityType: "CashSession",
    entityId: session.id,
    branchId: bid,
    summary: `Open float ${opening}`,
  });
  res.status(201).json(session);
});

router.post("/:id/close", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("cashSession"), async (req, res) => {
  const { closingCountedCash, note } = req.body || {};
  const counted = Number(closingCountedCash);
  if (Number.isNaN(counted) || counted < 0) {
    return res.status(400).json({ error: "المبلغ المعدود غير صالح" });
  }
  const session = await prisma.cashSession.findFirst({
    where: {
      id: req.params.id,
      branch: { organizationId: req.user.organizationId },
    },
  });
  if (!session || session.closedAt) {
    return res.status(400).json({ error: "الجلسة غير موجودة أو مُغلقة" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== session.branchId) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  const closedAt = new Date();
  const expectedNum = await computeSessionExpectedCash(prisma, session, closedAt);
  const expected = new Prisma.Decimal(expectedNum.toFixed(2));
  const closingDec = new Prisma.Decimal(counted.toFixed(2));
  const variance = closingDec.sub(expected);

  const updated = await prisma.cashSession.update({
    where: { id: session.id },
    data: {
      closedAt,
      closedByUserId: req.user.sub,
      closingCountedCash: closingDec,
      expectedCash: expected,
      cashVariance: variance,
      note: note != null && String(note).trim() ? String(note).trim() : null,
    },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  await writeAudit({
    userId: req.user.sub,
    action: "CASH_SESSION_CLOSE",
    entityType: "CashSession",
    entityId: updated.id,
    branchId: session.branchId,
    summary: `Close counted ${closingDec} expected ${expected} variance ${variance}`,
    meta: {
      expected: expected.toString(),
      counted: closingDec.toString(),
      variance: variance.toString(),
    },
  });

  res.json(updated);
});

router.get("/", async (req, res) => {
  const { branchId, limit = "30" } = req.query;
  const where = {
    branch: { organizationId: req.user.organizationId },
  };
  if (req.user.role !== "ADMIN") {
    if (!req.user.branchId) return res.json([]);
    where.branchId = req.user.branchId;
  } else if (branchId) {
    where.branchId = String(branchId);
  }
  const rows = await prisma.cashSession.findMany({
    where,
    orderBy: { openedAt: "desc" },
    take: Math.min(100, Math.max(1, parseInt(String(limit), 10) || 30)),
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  res.json(rows);
});

export default router;
