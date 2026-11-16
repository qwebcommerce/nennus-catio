import { Router } from "express";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { qatarRange } from "../lib/qatarTime.js";
import { financeFilters, financeSummary, financeTransactions, stockValueRows } from "../lib/financeData.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

const INVALID_DATES = { error: "Invalid dates", errorAr: "تاريخ غير صالح", errorEn: "Invalid dates" };

/**
 * Profit and loss and money in / out. Dates are Qatar days and inclusive:
 * from=2026-11-16&to=2026-11-16 is the whole of that day. Refunds count on the refund date.
 */
router.get("/summary", async (req, res) => {
  const dates = qatarRange(req.query);
  if (!dates) return res.status(400).json(INVALID_DATES);
  const filters = financeFilters(req.query);
  const orgId = req.user.organizationId;
  const [summary, stock] = await Promise.all([
    financeSummary(orgId, dates, filters),
    stockValueRows(orgId, filters.branchId),
  ]);
  res.json({ ...summary, stockValue: stock.total, stockValueByLocation: stock.byLocation });
});

/** FR-103: sales and refunds by channel, filtered by channel, location, date and type. */
router.get("/transactions", async (req, res) => {
  const dates = qatarRange(req.query);
  if (!dates) return res.status(400).json(INVALID_DATES);
  const result = await financeTransactions(req.user.organizationId, dates, financeFilters(req.query));
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
  res.json({ from: dates.from, to: dates.to, totals: result.totals, rows: result.rows.slice(0, limit), truncated: result.rows.length > limit });
});

/** FR-107: stock value per location and product. */
router.get("/stock-value", async (req, res) => {
  const { branchId } = financeFilters(req.query);
  res.json(await stockValueRows(req.user.organizationId, branchId));
});

export default router;
