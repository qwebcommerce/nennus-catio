# Analytics and reports

What was added on 27 November 2026 (branch `fix-rc`): business analytics (grooming, product sales,
new registered users, peak order hours), a compact summary on the Dashboard, and scrollable,
searchable histories of transactions and expenses on the Reports screen. How each figure is
defined, the permission, the endpoints and how it was tested.

## Where it is

- **Business analytics** (`/analytics`, sidebar → Dashboard → *Business analytics*). One date range
  (inclusive Qatar days, presets *last 7 days*, *last 30 days*, *this month*; default the last 30
  days) and an optional location, then four tabs: *Grooming*, *Products*, *New users*, *Peak
  hours*. Each tab has figure tiles, a bar chart (recharts, already used by the app), a per-day table
  with a total row, and a *Download CSV* button. Monthly revenue and profit are not repeated: the
  page links to Finance (profit and loss) and to the monthly profit chart on the Dashboard.
- **Dashboard → Today at a glance** (`components/AnalyticsTodayCard.jsx`, its own component under
  the pending-payments card): today's grooming (done / pending / cancelled, no-shows when any),
  today's product orders (placed / pending / cancelled), new website users this week (from Sunday)
  and today, and the busiest order hour of the last 30 days. One request, one query.
- **Reports → Transactions history** (new tab, also `/reports?tab=history`; *Sales history* links to
  it). Every row of Finance's sales-and-refunds list, newest first: date, time (Qatar), reference,
  customer and phone, payment method, channel, amount. Filters: dates, payment method, channel, type.
  Search: customer phone or any receipt / order reference. The list loads 50 rows at a time and
  loads the next page when you scroll to the end (or press *Load more*). The totals above the list
  are for the whole filtered set.
- **Reports → Expenses.** The capped list (500 rows) is replaced by the expenses history: date of
  the expense, time it was recorded (Qatar), payee and receipt number, category, paid from, amount;
  filters dates / paid from / category; search payee, receipt number or note; same paging; edit and
  delete as before. The expense form has two new optional fields, *Payee* and *Receipt no.*

## Permission

Everything uses the existing **`finance`** module (no new module): `finance.view` to see the
analytics, the Dashboard card and the histories; `finance.export` for the CSV files. Reason: the
figures are the same money Finance and Reports already show (Reports is opened with the legacy
`reports` key, which is `finance.view`), so a separate `reports` module would only let the two drift
apart, and the role / permission work in progress on another branch is not touched.

- Server: `routes/analytics.js` uses `requireModule("finance", "view")`; the new export lists are
  registered with module `finance` in `routes/exports.js` (which checks `export`).
- Client: route `/analytics` is `Protected module={["finance","view"]}`; the sidebar link and the
  Dashboard card show only with `canModule("finance","view")`; CSV buttons only with
  `canModule("finance","export")`.
- Like Finance, staff with the right see the whole business; `?branchId=` narrows to one location.

## Definitions

Days and hours are **Qatar time** (UTC+3, no daylight saving): an order at 23:30 Qatar time counts on
that Qatar day, one at 00:30 on the next day (both are the same UTC day). Amounts are whole dirhams in
the database and riyals in the API.

**Grooming** (by the day of the appointment):
- *bookings* — every real booking. A website hold that was never paid (still waiting for payment, or
  expired and cancelled by the sweep) is not a booking;
- *done* = DONE; *pending* = BOOKED, CONFIRMED, CHECKED_IN or IN_PROGRESS (booked or confirmed, not
  done yet); *cancelled* = CANCELLED; *no-shows* = NO_SHOW. They add up to *bookings*;
- *value done* — the price of the bookings done that day;
- *paid in (net)* — grooming payments received that day minus grooming refunds, by payment date. This
  is Finance's GROOMING channel (revenue − refunds) for the same days.

**Products** (till = IN_STORE, VAN, WEBSITE, and SALES_ORDER = B2B):
- till, van and website orders by the day of the sale, counted as in Finance (not cancelled, not
  waiting for payment); amount = sale total;
- sales orders by the day of each delivery at its revenue (Finance recognises sales-order revenue at
  delivery); count = deliveries;
- *pending website orders* — website orders placed that day that are paid but not yet delivered or
  collected (CONFIRMED, PREPARING, OUT_FOR_DELIVERY, READY_FOR_PICKUP); *pending sales-order
  deliveries* — sales orders created that day still CONFIRMED or PARTLY_DELIVERED. The tab also shows
  how many are open right now, whatever day they were placed;
- *cancelled* — orders placed that day and later cancelled (invoice cancelled: till voids, website
  orders cancelled by staff or the customer) plus cancelled sales orders. Website checkouts that were
  never paid (expired holds) are not cancellations (`abandoned` in the API);
- *top products* — Σ line amounts of counted sales (free lines count 0) plus Σ delivered sales-order
  line revenue, by product; quantity in pieces, or kg for weight goods (stored as grams);
- equal to Finance: IN_STORE, WEBSITE and SALES_ORDER revenue and order counts; VAN = Finance VAN
  revenue − damaged stock sold (damaged stock sold off a van is not a product order).

**New registered users** — website accounts by their registration time. New column
`Customer.registeredAt`, set by `/api/shop/register` (kept when an unconfirmed account registers
again) and filled from `createdAt` for existing accounts by the migration. Group by day, week
(starting Sunday) or month; the total is for the range.

**Peak hours** — orders by Qatar hour of day and by weekday (0 = Sunday): till, van and website sales
that count, and sales orders (not draft or cancelled) at the time they were created. Channel filter.

**Transactions history** — exactly Finance's rows (`financeTransactions`): counted sales; refunds of
counted sales on the refund date; grooming / relocation payments and refunds; sales-order deliveries;
van returns received; damaged stock sold. For the same dates, channel, location and type the totals
equal `/api/finance/transactions`. Differences on a row: the reference of a website order is its
order reference (NC-ORD-…) when it has no invoice number, and a refund shows the method the money
went back by (when recorded) rather than its sale's.

Search (`q`): a phone number in any format (digits are compared, at least 4), or text matched against
the till receipt / invoice number, the website order reference, the sales-order reference
(NC-SO-…), grooming / relocation references, the van-return reference, payment references (Fawran,
link, transfer) and the customer's name. `%` and `_` are matched literally.

**Expenses history** — totals per *paid from* equal Finance's expenses by source for the same days.

## Endpoints

All `GET`, `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive Qatar days, default last 30 days, at most two
years), optional `branchId`:

| Endpoint | Returns | Queries |
| --- | --- | --- |
| `/api/analytics/grooming` | `days[]`, `totals` | 1 |
| `/api/analytics/products` | `days[]` with `channels`, `totals`, `pendingNow`, `topProducts` (`?top=`) | 3 |
| `/api/analytics/users?groupBy=day\|week\|month` | `periods[]`, `totals` | 1 |
| `/api/analytics/peak-hours?channel=` | `hours[24]`, `weekdays[7]`, `grid[7][24]`, `totals.peakHour` | 1 |
| `/api/analytics/today` | Dashboard summary | 1 |
| `/api/analytics/history?method=&channel=&type=&q=&limit=&cursor=` | `rows`, `totals`, `nextCursor` | 1 |
| `/api/analytics/expenses?paidFrom=&category=&q=&limit=&cursor=` | `rows`, `totals`, `nextCursor` | 1 |

(plus the usual sign-in / permission lookups). Every figure is a `GROUP BY` in Postgres over the
range, so a year costs the same queries as a week. Paging is keyset on (date, id): pages do not
repeat or skip rows while new sales arrive; a bad cursor is a 400.

CSV (and XLSX / PDF) through the existing `/api/exports/:list` with the same parameters:
`grooming-daily`, `products-daily`, `top-products`, `new-users`, `peak-hours`, `history`,
`expense-history` (`lib/analyticsExports.js`).

## Database

Migration `20261130100000_analytics_reports` (additive):
- `Expense.payee`, `Expense.reference` (optional text);
- `Customer.registeredAt` (+ backfill for existing website accounts);
- indexes: `Sale(branchId, createdAt)`, `Sale(createdAt)`, `Sale(customerId)`, `SaleItem(saleId)`,
  `Refund(branchId, createdAt)`, `Payment(organizationId, createdAt)`,
  `SalesOrderDelivery(deliveredAt)`, `Appointment(organizationId, startAt)`,
  `Customer(organizationId, registeredAt)`. Created with `IF NOT EXISTS`.

## Demo data

`scripts/demo-data.mjs` (content in `scripts/demo/analytics.mjs`) adds, through the API like the rest:
five more website sign-ups spread over the month at different hours (sign-ups on 14 different days),
three grooming bookings taken at the desk (two cancelled by phone, one no-show), a website order at
23:35, and payees / receipt numbers for the demo expenses. The loader now also retries a till sale
answered with `409 TRY_AGAIN` (a deadlock between the parallel lanes), as it already did for other
deadlock answers. Load followed by remove restores every table exactly.

## Tests

Scripts and screenshots: `SCRATCH/tests/fix-rc/` (`api-test.cjs`, `browser-test.cjs`, `perf.cjs`).

**API — 213/213** (fresh seeded DB + demo). Every metric is compared with sums computed directly from
the database with an independent Qatar-day expression (`AT TIME ZONE 'Asia/Qatar'`):
- Qatar-day boundary: orders at 23:30 and 00:30 Qatar time, grooming at 23:30 / 00:30, a registration
  at 00:30 — each lands on the right day in products, history, peak hours (hour and weekday),
  grooming and new users;
- grooming per day (bookings, done, pending, cancelled, no-show, value) and paid in = database =
  Finance GROOMING; location filter;
- products per day and channel, pending website / sales-order, cancelled, open now, top products;
  totals = Finance channels; location filter = Finance;
- new users by day / week (Sunday) / month;
- peak hours by hour and weekday for all channels and each channel;
- Dashboard today summary;
- history totals = Finance for 11 filter combinations; paging walks every row once, newest first,
  while a new sale arrives between pages; bad cursor / bad date / too long range → 400;
- payment-method filter for every method, methods add up; cash refunds = database;
- search by phone (4 formats), till and van receipt number (full and partial), website order
  reference (any case), sales-order reference, grooming reference, van-return reference, payment
  reference; unknown → none; `%` literal;
- expenses: payee and receipt saved and edited; totals and paid-from = Finance; search = database;
  paging;
- CSV: totals row = API, rows = history total, search honoured, Arabic headers, XLSX;
- permissions: cashier refused every endpoint and export (403, bilingual), signed out 401; manager
  with Finance view but no export reads everything and is refused the CSVs; without view refused.

**Browser — 129/129** at 1280 and 390 px, English and Arabic: Analytics (all four tabs, totals rows
= API, charts drawn, week grouping, channel filter), Dashboard card = API, Reports history (totals =
Finance, 50 rows then infinite scroll, method filter, phone search, receipt search), Reports expenses
(search by payee, paid-from filter = Finance, a new expense with payee and receipt appears); no page
errors, no sideways scroll; cashier: page refused, no card, no link.

**Load times through the lag proxy** (50 ms each way, `connection_limit=1`, demo data; median of 3):

| Request | Time |
| --- | --- |
| grooming 30 days / 365 days | 321 ms / 318 ms |
| products 30 days / 365 days | 525 ms / 527 ms |
| new users (week) | 315 ms |
| peak hours | 313 ms |
| today (Dashboard card) | 321 ms |
| history page 1 / phone search | 323 ms / 323 ms |
| expenses page 1 | 315 ms |
| for reference: Finance transactions / summary | 2535 ms / 4736 ms |

About 200 ms of each is sign-in and permission lookups; the analytics themselves are one round trip
(products three), whatever the range.

**Regression:** business day 323/323; fix-so API 150/150 and UI 116/116; fix-so/vr API 125/125 and
browser 76/76; demo load → remove identical on all 98 tables; client build; `node --check` on all
server files; `npm run check:errors`.

The old `fix-so/vr/verify-demo.mjs` (written before sales orders were added to the demo) reports 5
differences on the demo: its P&L sums leave out sales-order revenue / cost and its bill checks
predate prepayments and freight. They are not caused by this work (the revenue gap equals the demo's
sales-order revenue exactly).

## Update (fix-rd)

Recording, confirming or rejecting collected money (`payment-confirmation.md`) does not change the
analytics or the transactions history: they report revenue (sales, deliveries, grooming payments),
not collections. Finance money in counts confirmed collections only.
