import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { dec, money } from "../lib/money.js";
import { qatarDayKey, qatarDayStart, qatarRange } from "../lib/qatarTime.js";
import { COUNTED_SALE } from "../lib/financeData.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

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

/** Day and month keys are Qatar calendar days. */
function dayKey(d) {
  return qatarDayKey(new Date(d));
}

function monthKey(d) {
  return qatarDayKey(new Date(d)).slice(0, 7);
}

/** Period keys from the Qatar day of `from` to the Qatar day before `toExclusive`. */
function eachPeriodKey(from, toExclusive, groupBy) {
  const keys = [];
  const first = qatarDayKey(from);
  const last = qatarDayKey(new Date(toExclusive.getTime() - 1));
  let cur = qatarDayStart(first);
  const end = qatarDayStart(last);
  while (cur <= end) {
    const key = groupBy === "month" ? monthKey(cur) : dayKey(cur);
    if (keys[keys.length - 1] !== key) keys.push(key);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
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

  // Inclusive Qatar days; default is the last 30 days.
  const last30 = qatarDayStart(qatarDayKey(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
  const range = qatarRange(req.query, { defaultFrom: last30 });
  if (!range) return res.status(400).json({ error: "تاريخ غير صالح", errorAr: "تاريخ غير صالح", errorEn: "Invalid date" });
  const { from, to } = range;

  const branchId =
    req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const bf = branchScope(req, branchId);

  const sales = await prisma.sale.findMany({
    where: {
      ...bf,
      ...COUNTED_SALE,
      createdAt: { gte: from, lt: to },
    },
    select: { total: true, createdAt: true },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      organizationId: orgId,
      expenseDate: { gte: from, lt: to },
    },
    select: { amount: true, expenseDate: true, category: true },
  });

  const periodKeys = eachPeriodKey(from, to, groupBy);

  const salesByPeriod = new Map();
  const expensesByPeriod = new Map();
  for (const k of periodKeys) {
    salesByPeriod.set(k, dec(0));
    expensesByPeriod.set(k, dec(0));
  }

  for (const s of sales) {
    const k = groupBy === "month" ? monthKey(s.createdAt) : dayKey(s.createdAt);
    salesByPeriod.set(k, (salesByPeriod.get(k) || dec(0)).plus(dec(s.total)));
  }

  for (const e of expenses) {
    const k = groupBy === "month" ? monthKey(e.expenseDate) : dayKey(e.expenseDate);
    expensesByPeriod.set(k, (expensesByPeriod.get(k) || dec(0)).plus(dec(e.amount)));
  }

  const series = periodKeys.map((key) => ({
    period: key,
    sales: money(salesByPeriod.get(key)),
    expenses: money(expensesByPeriod.get(key)),
    net: money((salesByPeriod.get(key) || dec(0)).minus(expensesByPeriod.get(key) || dec(0))),
  }));

  const byCategory = { RENT: dec(0), PAYROLL: dec(0), ELECTRICITY: dec(0), INTERNET: dec(0), OTHER: dec(0) };
  let expenseTotal = dec(0);
  for (const e of expenses) {
    expenseTotal = expenseTotal.plus(dec(e.amount));
    if (byCategory[e.category]) byCategory[e.category] = byCategory[e.category].plus(dec(e.amount));
  }
  const expenseByCategory = Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, money(v)]));

  const salesTotal = sales.reduce((acc, x) => acc.plus(dec(x.total)), dec(0));

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    series,
    expenseByCategory,
    totals: {
      sales: money(salesTotal),
      expenses: money(expenseTotal),
      net: money(salesTotal.minus(expenseTotal)),
    },
    salesCount: sales.length,
    expenseCount: expenses.length,
  });
});

export default router;
