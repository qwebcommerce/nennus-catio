/**
 * Analytics and reports (fix-rc). Permission: the `finance` module (view to read, export for the CSV
 * files in routes/exports.js) — the same right as Finance and Reports, so whoever sees the money
 * also sees these figures. Dates are inclusive Qatar days (?from=YYYY-MM-DD&to=YYYY-MM-DD), default
 * the last 30 days. Like Finance, an optional ?branchId= narrows to one location.
 *
 *   GET /api/analytics/grooming     per day: bookings, done, pending, cancelled, no-shows, value, paid
 *   GET /api/analytics/products     per day and channel: orders, amount, pending, cancelled; top products
 *   GET /api/analytics/users        website registrations per day / week / month (?groupBy=)
 *   GET /api/analytics/peak-hours   orders by Qatar hour and weekday (?channel=)
 *   GET /api/analytics/today        compact Dashboard summary (one query)
 *   GET /api/analytics/history      transactions history: Finance's rows, filtered, searched, paged
 *   GET /api/analytics/expenses     expenses history, filtered, searched, paged
 */
import { Router } from "express";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { qatarDayKey, qatarDayStart, qatarRange } from "../lib/qatarTime.js";
import { groomingAnalytics, newUsersAnalytics, peakHoursAnalytics, productAnalytics, todaySummary } from "../lib/analytics.js";
import { expenseHistory, historyFilters, transactionHistory } from "../lib/history.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

const DAY_MS = 86400000;
const MAX_DAYS = 731;
const INVALID_DATES = { error: "تاريخ غير صالح", errorAr: "تاريخ غير صالح", errorEn: "Invalid date" };
const RANGE_TOO_LONG = { error: "الفترة طويلة جداً (سنتان كحد أقصى)", errorAr: "الفترة طويلة جداً (سنتان كحد أقصى)", errorEn: "The date range is too long (two years at most)" };
const BAD_CURSOR = { error: "رابط الصفحة التالية غير صالح", errorAr: "رابط الصفحة التالية غير صالح", errorEn: "Invalid page cursor" };

/** [from, to) for ?from=&to= (inclusive Qatar days); default the last 30 days. Sends 400 and returns null when invalid. */
export function analyticsRange(req, res) {
  const last30 = qatarDayStart(qatarDayKey(new Date(Date.now() - 29 * DAY_MS)));
  const dates = qatarRange(req.query, { defaultFrom: last30 });
  if (!dates || dates.to <= dates.from) {
    res.status(400).json(INVALID_DATES);
    return null;
  }
  if (dates.to - dates.from > MAX_DAYS * DAY_MS) {
    res.status(400).json(RANGE_TOO_LONG);
    return null;
  }
  return dates;
}

const branchOf = (req) => (req.query.branchId ? String(req.query.branchId) : "");

router.get("/grooming", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  res.json(await groomingAnalytics(req.user.organizationId, dates, { branchId: branchOf(req) }));
});

router.get("/products", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  res.json(await productAnalytics(req.user.organizationId, dates, { branchId: branchOf(req), top: req.query.top }));
});

router.get("/users", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  const raw = String(req.query.groupBy || "day").toLowerCase();
  const groupBy = ["day", "week", "month"].includes(raw) ? raw : "day";
  res.json(await newUsersAnalytics(req.user.organizationId, dates, { groupBy }));
});

router.get("/peak-hours", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  const channel = String(req.query.channel || "").toUpperCase();
  res.json(await peakHoursAnalytics(req.user.organizationId, dates, { channel, branchId: branchOf(req) }));
});

router.get("/today", async (req, res) => {
  res.json(await todaySummary(req.user.organizationId));
});

router.get("/history", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  const filters = historyFilters(req.query);
  if (filters.badCursor) return res.status(400).json(BAD_CURSOR);
  res.json(await transactionHistory(req.user.organizationId, dates, filters));
});

router.get("/expenses", async (req, res) => {
  const dates = analyticsRange(req, res);
  if (!dates) return;
  if (req.query.cursor && !historyFilters(req.query).cursor) return res.status(400).json(BAD_CURSOR);
  res.json(await expenseHistory(req.user.organizationId, dates, req.query));
});

export default router;
