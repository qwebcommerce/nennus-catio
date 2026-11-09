import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission("reports"));

function branchScope(req, branchId) {
  const orgId = req.user.organizationId;
  if (branchId) {
    return {
      branchId: String(branchId),
      branch: { organizationId: orgId },
    };
  }
  return { branch: { organizationId: orgId } };
}

function parseDateEndOfDay(s) {
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateStart(s) {
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

function eachPeriodKey(from, to, groupBy) {
  const keys = [];
  if (groupBy === "month") {
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endM = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endM) {
      keys.push(monthKey(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) {
      keys.push(dayKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return keys;
}

/**
 * تحليلات: مبيعات مقابل مصاريف، تفصيل مصاريف حسب الفئة، سلاسل زمنية
 * ?from= &to= (ISO) &branchId= &groupBy=day|month
 */
router.get("/analytics", async (req, res) => {
  const orgId = req.user.organizationId;
  const groupBy = String(req.query.groupBy || "day").toLowerCase() === "month" ? "month" : "day";

  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.query.branchId &&
    String(req.query.branchId) !== req.user.branchId
  ) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  let from = req.query.from ? parseDateStart(req.query.from) : null;
  let to = req.query.to ? parseDateEndOfDay(req.query.to) : null;
  if (!from || !to) {
    to = new Date();
    to.setHours(23, 59, 59, 999);
    from = new Date(to);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }

  const branchId =
    req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const bf = branchScope(req, branchId);

  const sales = await prisma.sale.findMany({
    where: {
      ...bf,
      createdAt: { gte: from, lte: to },
    },
    select: { total: true, createdAt: true },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      organizationId: orgId,
      expenseDate: { gte: from, lte: to },
    },
    select: { amount: true, expenseDate: true, category: true },
  });

  const periodKeys = eachPeriodKey(from, to, groupBy);

  const salesByPeriod = new Map();
  const expensesByPeriod = new Map();
  for (const k of periodKeys) {
    salesByPeriod.set(k, 0);
    expensesByPeriod.set(k, 0);
  }

  for (const s of sales) {
    const k = groupBy === "month" ? monthKey(s.createdAt) : dayKey(s.createdAt);
    if (!salesByPeriod.has(k)) salesByPeriod.set(k, 0);
    salesByPeriod.set(k, salesByPeriod.get(k) + Number(s.total));
  }

  for (const e of expenses) {
    const k = groupBy === "month" ? monthKey(e.expenseDate) : dayKey(e.expenseDate);
    if (!expensesByPeriod.has(k)) expensesByPeriod.set(k, 0);
    expensesByPeriod.set(k, expensesByPeriod.get(k) + Number(e.amount));
  }

  const series = periodKeys.map((key) => ({
    period: key,
    sales: round2(salesByPeriod.get(key) || 0),
    expenses: round2(expensesByPeriod.get(key) || 0),
    net: round2((salesByPeriod.get(key) || 0) - (expensesByPeriod.get(key) || 0)),
  }));

  const expenseByCategory = {
    RENT: 0,
    PAYROLL: 0,
    ELECTRICITY: 0,
    INTERNET: 0,
    OTHER: 0,
  };
  let expenseTotal = 0;
  for (const e of expenses) {
    const a = Number(e.amount);
    expenseTotal += a;
    if (expenseByCategory[e.category] != null) {
      expenseByCategory[e.category] += a;
    }
  }
  Object.keys(expenseByCategory).forEach((k) => {
    expenseByCategory[k] = round2(expenseByCategory[k]);
  });

  const salesTotal = sales.reduce((s, x) => s + Number(x.total), 0);

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    series,
    expenseByCategory,
    totals: {
      sales: round2(salesTotal),
      expenses: round2(expenseTotal),
      net: round2(salesTotal - expenseTotal),
    },
    salesCount: sales.length,
    expenseCount: expenses.length,
  });
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export default router;
