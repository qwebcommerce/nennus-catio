import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dashboardQuerySchema,
  dashboardSchema,
  FINANCE_MAX_DAYS,
  financeDetailSchema,
  financeOverviewQuerySchema,
  financePaymentSchema,
  financeRefundQuerySchema,
  financeRefundSchema,
  financeTransactionQuerySchema,
  financeTransactionSchema,
  periodDays,
} from "../src/index.js";

test("a period counts both of its days", () => {
  assert.equal(periodDays("2026-10-14", "2026-10-14"), 1);
  assert.equal(periodDays("2026-10-01", "2026-10-31"), 31);
  assert.equal(periodDays("2026-01-01", "2026-12-31"), 365);
  assert.equal(periodDays("2028-01-01", "2028-12-31"), 366);
});

test("the overview needs a period of at most a year, in order, and groups by day by default", () => {
  assert.deepEqual(financeOverviewQuerySchema.parse({ from: "2026-10-01", to: "2026-10-14" }), {
    from: "2026-10-01",
    to: "2026-10-14",
    grouping: "day",
  });
  assert.equal(financeOverviewQuerySchema.safeParse({ from: "2026-10-14", to: "2026-10-13" }).success, false);
  assert.equal(financeOverviewQuerySchema.safeParse({ from: "2026-10-14" }).success, false);
  assert.equal(financeOverviewQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success, false);
  const longest = { from: "2028-01-01", to: "2028-12-31" };
  assert.equal(periodDays(longest.from, longest.to), FINANCE_MAX_DAYS);
  assert.equal(financeOverviewQuerySchema.safeParse(longest).success, true);
  assert.equal(financeOverviewQuerySchema.safeParse({ from: "2027-12-31", to: "2028-12-31" }).success, false);
  assert.equal(financeOverviewQuerySchema.safeParse({ ...longest, grouping: "year" }).success, false);
});

test("list filters: defaults, page sizes, amounts and statuses", () => {
  const parsed = financeTransactionQuerySchema.parse({ from: "2026-10-01", to: "2026-10-14" });
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 25);
  assert.equal(parsed.sort, "date");
  assert.equal(parsed.order, "desc");
  assert.deepEqual(
    financeTransactionQuerySchema.parse({ from: "2026-10-01", to: "2026-10-14", min: "500", max: "1500", pageSize: "100" }),
    { from: "2026-10-01", to: "2026-10-14", min: 500, max: 1500, order: "desc", page: 1, pageSize: 100, sort: "date" },
  );
  const period = { from: "2026-10-01", to: "2026-10-14" };
  assert.equal(financeTransactionQuerySchema.safeParse({ ...period, pageSize: "30" }).success, false);
  assert.equal(financeTransactionQuerySchema.safeParse({ ...period, min: "2000", max: "1000" }).success, false);
  assert.equal(financeTransactionQuerySchema.safeParse({ ...period, min: "-1" }).success, false);
  assert.equal(financeTransactionQuerySchema.safeParse({ ...period, status: "partly_refunded" }).success, true);
  assert.equal(financeTransactionQuerySchema.safeParse({ ...period, status: "pending" }).success, false);
  assert.equal(financeRefundQuerySchema.safeParse({ ...period, status: "in_progress", method: "manual" }).success, true);
  assert.equal(financeRefundQuerySchema.safeParse({ ...period, status: "requested" }).success, false);
});

/** Answer 4A: Finance never carries a phone, email or address, so none can reach the Finance role. */
test("finance shapes have no contact fields", () => {
  const forbidden = /email|phone|address|zone|street|building|landmark|note/i;
  const keys = (shape: Record<string, unknown>): string[] =>
    Object.entries(shape).flatMap(([key, value]) => {
      const inner = value as { def?: { shape?: Record<string, unknown>; element?: { def?: { shape?: Record<string, unknown> } }; innerType?: { def?: { shape?: Record<string, unknown> } } } };
      const nested = inner.def?.shape ?? inner.def?.element?.def?.shape ?? inner.def?.innerType?.def?.shape;
      return [key, ...(nested ? keys(nested) : [])];
    });
  for (const schema of [financeTransactionSchema, financePaymentSchema, financeRefundSchema, financeDetailSchema]) {
    for (const key of keys(schema.shape)) assert.doesNotMatch(key, forbidden, key);
  }
});

test("the dashboard covers one day, 7 days or 30 days", () => {
  assert.deepEqual(dashboardQuerySchema.parse({ date: "2026-10-14" }), { date: "2026-10-14", days: 1 });
  assert.equal(dashboardQuerySchema.parse({ date: "2026-10-14", days: "30" }).days, 30);
  assert.equal(dashboardQuerySchema.safeParse({ date: "2026-10-14", days: "3" }).success, false);
  assert.equal(dashboardQuerySchema.safeParse({}).success, false);
});

test("a dashboard for a role without any page has every part empty", () => {
  const empty = { date: "2026-10-14", days: 1, money: null, orders: null, bookings: null, relocation: null, attention: { payments: null, refunds: null }, stock: null };
  assert.deepEqual(dashboardSchema.parse(empty), empty);
});
