import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { parseMoney } from "../lib/money.js";
import { qatarRange } from "../lib/qatarTime.js";

const router = Router();
router.use(authMiddleware);

const CATEGORIES = new Set(["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"]);
const SOURCES = new Set(["CASH", "BANK"]);
const BAD_AMOUNT = { error: "المبلغ غير صالح", errorAr: "المبلغ غير صالح (بحد أقصى منزلتين عشريتين)", errorEn: "Enter a valid amount (at most 2 decimals)" };
const BAD_SOURCE = { error: "اختر الدفع من النقد أو من البنك", errorAr: "اختر الدفع من النقد أو من البنك", errorEn: "Choose whether it was paid from cash or from the bank" };

function parseDate(s) {
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** قائمة مصاريف مع فلترة */
router.get("/", requireRole("ADMIN", "MANAGER"), requirePermission("expenses"), async (req, res) => {
  const orgId = req.user.organizationId;
  const dates = req.query.from || req.query.to ? qatarRange(req.query, { defaultFrom: new Date(0) }) : null;
  if ((req.query.from || req.query.to) && !dates) return res.status(400).json({ error: "تاريخ غير صالح", errorAr: "تاريخ غير صالح", errorEn: "Invalid date" });
  const cat = req.query.category ? String(req.query.category).toUpperCase() : null;
  const source = req.query.paidFrom ? String(req.query.paidFrom).toUpperCase() : null;

  const where = {
    organizationId: orgId,
    ...(dates ? { expenseDate: { gte: dates.from, lt: dates.to } } : {}),
    ...(cat && CATEGORIES.has(cat) ? { category: cat } : {}),
    ...(source && SOURCES.has(source) ? { paidFrom: source } : {}),
  };

  const rows = await prisma.expense.findMany({
    where,
    orderBy: { expenseDate: "desc" },
    take: 500,
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN", "MANAGER"), requirePermission("expenses"), async (req, res) => {
  const orgId = req.user.organizationId;
  const { category, amount, description, expenseDate, paidFrom } = req.body || {};
  const cat = String(category || "").toUpperCase();
  if (!CATEGORIES.has(cat)) {
    return res.status(400).json({ error: "فئة مصروف غير صالحة", errorAr: "فئة مصروف غير صالحة", errorEn: "Invalid expense category" });
  }
  const amt = parseMoney(amount, { allowZero: false });
  if (!amt) return res.status(400).json(BAD_AMOUNT);
  const source = String(paidFrom || "").toUpperCase();
  if (!SOURCES.has(source)) return res.status(400).json(BAD_SOURCE);
  const ed = expenseDate ? parseDate(expenseDate) : null;
  if (!ed) {
    return res.status(400).json({ error: "تاريخ المصروف مطلوب" });
  }

  const row = await prisma.expense.create({
    data: {
      organizationId: orgId,
      category: cat,
      amount: amt,
      paidFrom: source,
      description:
        description != null && String(description).trim()
          ? String(description).trim().slice(0, 500)
          : null,
      expenseDate: ed,
      createdByUserId: req.user.sub,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await writeAudit({
    userId: req.user.sub,
    action: "EXPENSE_CREATE",
    entityType: "Expense",
    entityId: row.id,
    summary: `${cat} ${amt.toFixed(2)} ${source}`,
  });

  res.status(201).json(row);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), requirePermission("expenses"), async (req, res) => {
  const orgId = req.user.organizationId;
  const { category, amount, description, expenseDate, paidFrom } = req.body || {};
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
    const amt = parseMoney(amount, { allowZero: false });
    if (!amt) return res.status(400).json(BAD_AMOUNT);
    data.amount = amt;
  }
  if (paidFrom != null) {
    const source = String(paidFrom).toUpperCase();
    if (!SOURCES.has(source)) return res.status(400).json(BAD_SOURCE);
    data.paidFrom = source;
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

  const row = await prisma.expense.update({
    where: { id: existing.id },
    data,
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(row);
});

router.delete("/:id", requireRole("ADMIN", "MANAGER"), requirePermission("expenses"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.expense.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).end();
  await prisma.expense.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
