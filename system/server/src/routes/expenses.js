import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

const CATEGORIES = new Set(["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"]);

function parseDate(s) {
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** قائمة مصاريف مع فلترة */
router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const from = req.query.from ? parseDate(req.query.from) : null;
  const to = req.query.to ? parseDate(req.query.to) : null;
  const cat = req.query.category ? String(req.query.category).toUpperCase() : null;

  const where = {
    organizationId: orgId,
    ...(from || to
      ? {
          expenseDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(cat && CATEGORIES.has(cat) ? { category: cat } : {}),
  };

  const rows = await prisma.expense.findMany({
    where,
    orderBy: { expenseDate: "desc" },
    take: 500,
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

router.post("/", requireModule("finance", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const { category, amount, description, expenseDate } = req.body || {};
  const cat = String(category || "").toUpperCase();
  if (!CATEGORIES.has(cat)) {
    return res.status(400).json({ error: "فئة مصروف غير صالحة" });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    return res.status(400).json({ error: "المبلغ غير صالح" });
  }
  const ed = expenseDate ? parseDate(expenseDate) : null;
  if (!ed) {
    return res.status(400).json({ error: "تاريخ المصروف مطلوب" });
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        organizationId: orgId,
        category: cat,
        amount: new Prisma.Decimal(amt.toFixed(2)),
        description:
          description != null && String(description).trim()
            ? String(description).trim().slice(0, 500)
            : null,
        expenseDate: ed,
        createdByUserId: req.user.sub,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await writeAudit(
      {
        userId: req.user.sub,
        action: "EXPENSE_CREATE",
        entityType: "Expense",
        entityId: created.id,
        summary: `${cat} ${amt}`,
      },
      tx
    );
    return created;
  });

  res.status(201).json(row);
});

router.patch("/:id", requireModule("finance", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const { category, amount, description, expenseDate } = req.body || {};
  const existing = await prisma.expense.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).json({ error: "غير موجود" });

  const data = {};
  if (category != null) {
    const cat = String(category).toUpperCase();
    if (!CATEGORIES.has(cat)) return res.status(400).json({ error: "فئة غير صالحة" });
    data.category = cat;
  }
  if (amount != null) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: "المبلغ غير صالح" });
    data.amount = new Prisma.Decimal(amt.toFixed(2));
  }
  if (description !== undefined) {
    data.description =
      description != null && String(description).trim()
        ? String(description).trim().slice(0, 500)
        : null;
  }
  if (expenseDate != null) {
    const ed = parseDate(expenseDate);
    if (!ed) return res.status(400).json({ error: "تاريخ غير صالح" });
    data.expenseDate = ed;
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id: existing.id },
      data,
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await writeAudit(
      {
        userId: req.user.sub,
        action: "EXPENSE_UPDATE",
        entityType: "Expense",
        entityId: existing.id,
        summary: `${updated.category} ${Number(updated.amount)}`,
        meta: {
          before: {
            category: existing.category,
            amount: Number(existing.amount),
            description: existing.description,
            expenseDate: existing.expenseDate,
          },
          changes: Object.keys(data),
        },
      },
      tx
    );
    return updated;
  });
  res.json(row);
});

router.delete("/:id", requireModule("finance", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.expense.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).end();
  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id: existing.id } });
    await writeAudit(
      {
        userId: req.user.sub,
        action: "EXPENSE_DELETE",
        entityType: "Expense",
        entityId: existing.id,
        summary: `${existing.category} ${Number(existing.amount)}`,
        meta: {
          category: existing.category,
          amount: Number(existing.amount),
          description: existing.description,
          expenseDate: existing.expenseDate,
        },
      },
      tx
    );
  });
  res.status(204).end();
});

export default router;
