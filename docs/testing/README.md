# Requirements test report — 16 November 2026

The system in `system/` (Express API + React website, staff admin and till) was tested against every
requirement in `agreement.pdf` (FR-01 to FR-112, NFR-01 to NFR-23 and the binding rules in section 6).

Tests ran against a live local copy of the API on a fresh Postgres database with the seed data. Each
requirement was exercised through the API, including the negative case (overselling, wrong role,
double release, tampered totals, concurrent requests), and side effects were checked in the database.
SkipCash, Resend and FleetWiz could not be reached from the test environment; their paths were
tested with signed test notifications and a mock gateway, or judged from the code.

Verdicts: **PASS** works as required · **PARTIAL** works with gaps · **FAIL** implemented but broken ·
**MISSING** not implemented · **CODE-ONLY** looks right in the code, could not be run.

| Area | Report | Pass | Partial | Fail | Missing | Code-only |
|---|---|---|---|---|---|---|
| Accounts, roles, permissions, audit, sessions | [T1](T1.md) | 4 | 1 | 10 | 1 | – |
| Catalogue, stock by location, warehouses, purchasing | [T2](T2.md) | 8 | 11 | 4 | – | – |
| Shop and van till, van sales, cash-up, till refunds | [T3](T3.md) | 8 | 8 | 2 | – | 2 |
| Online shop, delivery, pet houses, promotions, payments | [T4](T4.md) | 19 | 8 | 5 | – | 1 |
| Grooming, relocation, customer records | [T5](T5.md) | 7 | 10 | 4 | – | – |
| Finance, dashboard, exports, email, money, backups | [T6](T6.md) | 1 | 8 | 9 | – | 2 |
| Website and staff screens (browser tests) | [T7](T7.md) | 11 | 6 | 1 | – | 6 |

Counts are requirement rows in each report; binding-rule rows are listed in the reports but not all are counted here.

## What works well

- Till search and sale are fast (about 10 ms search, under 70 ms per sale locally) and a till sale never takes stock below zero, even under concurrent sales.
- Stock transfers between locations are atomic and refuse more than the source holds.
- Card payment happens on SkipCash's page; the signed notification is verified; no card data is stored.
- Promotions never change the variant price; the website sells only from the owner-chosen location.
- English/Arabic switching and right-to-left layout work on every page; pickup checkout does not ask for a time.

## Most serious defects (fix first)

### Security and access
1. Staff customer list returns customers' `passwordHash` and token hashes, even to a cashier (T1).
2. Deleted or demoted staff keep their old access for up to 7 days; the role comes from the token (T1).
3. The per-module permission matrix is mostly not enforced; managers can change owner-only settings (T1).
4. Staff-only pet notes are returned to customers in relocation responses (T1).
5. Relocation documents accept any file type and are served inline (stored XSS risk); image uploads are not checked (T5).
6. Session tokens are stored where page scripts can read them; there is no stale-edit protection (T1).

### Money and stock correctness
7. Concurrent requests break limits: grooming slots, delivery seats and website stock are all overbooked under parallel checkouts; purchase orders can be received twice (T2, T4, T5).
8. Holds can be committed or released twice when more than one server instance runs, as on Vercel (T4).
9. Payment notifications don't check the amount for bookings and relocation; late payments are confirmed or ignored instead of going to staff (T4, T5).
10. Refunds can exceed what was paid (till and online); refunds on weight goods are 1000× too high; refunds restock by default without writing a stock movement (T3, T4).
11. Stock is changed without a stock movement or audit row by product edit, stock count and the older purchase screen (T2, T3).
12. Money is stored as decimal riyals and summed in floating point; P&L dates are off (refund dated on sale day, single-day range returns zero) (T6).
13. The database enforces none of the stock, money or status rules (T2).

### Missing or broken features
14. Staff grooming and relocation screens can't be opened: the public `/grooming` and `/relocation` routes catch them first (T7).
15. Email has no queue or retry; a failed email can turn a saved action into an error (T6).
16. Buy-one-get-one makes every unit free (T4).
17. Cart lines can't be edited or removed (T7).
18. Cash-up has no card total; expenses can't record cash or bank; no low-stock level per location (T2, T3, T6).
19. Online orders have no short reference customers can quote (T4).
20. Exported PDFs show about one row and drop Arabic text (T6).

See each area report for the full table, file and line references, and exact steps to reproduce.

## Environment notes

- `prisma/schema.prisma` declares `OfflineInventoryReceipt`, which no migration creates (schema drift).
- Verify and reset links are returned in API responses when `NODE_ENV` is not `production`; confirm production sets it.
- The default plan caps an organisation at 3 locations, which blocks a warehouse + shop + several vans.

## Fix status — 17 November 2026

All 20 defects listed above were fixed in four groups (security, stock/till/purchasing, web
shop/payments/grooming, finance/email/screens) and merged. Each fix was first reproduced, then
re-tested; race conditions were tested with 20 parallel requests across two server instances.
After merging, every group's suite passed on one fresh database with all migrations applied
(about 700 checks, 0 failures).

New database migrations (additive only, nothing dropped):
`20261117101000_staff_active_sessions_audit_lock`, `20261117102000_stock_till_rules`,
`20261117103000_fc_payments_references`, `20261117104000_finance_paid_from_email_outbox`.

Second pass (18 November 2026), also fixed and merged:
- NFR-13: every editable record carries a version; a save from an older copy is refused (409) and the screen reloads.
- NFR-03: money is stored as whole dirhams (integer columns) and all server arithmetic is integer; the API and screens still use riyals with two decimals. Migration `20261118103000_money_dirhams` (see `NFR-03-money.md`).
- Grooming and relocation payments are included in finance, P&L, money in/out and exports.
- Server-side SkipCash payment lookup (customer return, staff "check payment status", before a hold expires). The lookup URL is unverified against SkipCash's docs; a failed lookup changes nothing.
- Uploaded product images are re-encoded (auto-orient, metadata stripped, max 1600 px, WebP).

Third pass (screen-by-screen use and a full business day), also fixed:
- Every staff screen and the website were used in the browser (desktop, phone, Arabic) and about 50 bugs fixed, among them:
  weight goods billed 1000x on purchase orders, transfers losing unit cost, till total ignoring offers and coupons until
  the sale was saved, refunds hitting the wrong variant, resumed held carts staying on the held list, deletes of used
  categories, suppliers and locations, a deadlock between a till sale and a website payment, and the low-stock list.
- A scripted business day across all modules (purchase, transfer, till, refund, cash-up, van, website order, grooming,
  price change, cashier, end-of-day finance) checks that every connected screen agrees: 323 of 323 checks pass.
- Remaining small gaps: vehicles and promotions can only be paused, not edited; the website checkout does not show the
  offer discount before the card page (the amount charged is correct).

Still open:
- Confirm the SkipCash payment-lookup endpoint against SkipCash's API documentation.

**Deploying the money migration:** deploy outside opening hours. Migrations run during the Vercel build,
while the previous deployment is still live; a sale or edit made by the old code in that window would be
written into the converted columns with the wrong scale. Check first that no single amount exceeds
21,474,836.47 QAR (queries in `NFR-03-money.md`).

Production settings needed: `CRON_SECRET`, `RESEND_API_KEY`, `SHOP_FROM_EMAIL`, `APP_PUBLIC_URL`,
`NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never a `VITE_` variable).
The daily cron sends due emails (Vercel Hobby; emails are also sent immediately when queued) and removes direct
document uploads that were not confirmed within 24 hours.

**File storage (agreement 8.1 / 8.3):** with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set, product images go to the
public bucket `product-images` and relocation documents to the private bucket `relocation-documents` (both created on
first use; nothing to set up in the Supabase dashboard). A document download keeps the signed 5-minute API link and the
permission/ownership check, then redirects to a Supabase signed URL valid 60 seconds (forced download). Shop customers
upload documents up to 10 MB straight to the bucket; the API checks each file (PDF/JPEG/PNG bytes, size) before it is
attached. Every build runs `scripts/move-files-to-storage.mjs` after the migrations: it copies images and documents still
in the database into the buckets and rewrites product image URLs; it never deletes the database copies (a later cleanup,
after the owner confirms the files in the dashboard). An image whose bytes are not a real image is left in the database.
Without the two variables everything stays in the database as before (local development).

## Demo data

An empty system looks bad in a demo, so the server can fill the live database with a realistic demo
pet shop and 30 days of activity, and take all of it out again with one switch before the shop goes
live. The owner does not run anything locally: it is controlled with one Vercel environment variable.

**Owner steps (Vercel → the project → Settings → Environment Variables, Production):**
1. Add `DEMO_DATA` = `load`, then redeploy (Deployments → the latest → Redeploy). The build log shows
   `[demo] loaded … demo rows` (a few minutes). Loading again does nothing while the demo is loaded.
2. Before going live: change `DEMO_DATA` to `remove`, redeploy. The build log shows `[demo] remove: deleted … rows`.
3. Delete the `DEMO_DATA` variable (leaving it on `remove` is harmless, it finds nothing the next time).

A demo problem never fails the build; it is reported in the log as `DEMO DATA … FAILED` and the
database is left as it was (a failed load removes what it had created).

**What is created** (organisation = `SHOP_ORGANIZATION_ID`, else the first one with a website location):
6 categories and 6 pet types (an existing one with the same English name is reused), a warehouse, a shop
(the website sells from it while the demo is loaded) and 2 vans with vehicles, 3 demo staff
(`demo.*@example.com`, random passwords nobody knows), 3 suppliers, 33 products (Arabic + English,
pack-size variants, 2 sold by weight, 10 pet houses using the images in `client/public/images/pet-houses`,
5 in stock and 5 made to order with lead time and delivery charge), 6 Doha delivery areas and 3 windows,
4 grooming packages (Basic/Full for cats and dogs), grooming hours on days that have none, 3 promotions
(10 % off cat food, coupon `WELCOME15`, buy 2 get 1 wet food), 12 customers with pets and addresses
(`*.demo@example.com`, `+974 5000 01xx`). Activity over the last 30 days in Qatar business hours:
5 purchase orders (one partly received) with bills paid in full, in part or not yet; transfers from the
warehouse to the shop and vans; a shop till every day with cash, card and split sales and a cash-up;
van sales (cash, card, Fawran, payment link) on about 15 days; 16 website orders through a mock card gateway
(delivered, collected, preparing, out for delivery, one cancelled and refunded, one awaiting payment
review); 2 till refunds (one with the goods returned); 10 past grooming bookings (done, a no-show) and up to 3
upcoming ones (today and tomorrow, when a slot is still free); 3 relocation requests (submitted, quote sent, paid and in progress); rent, electricity,
supplies and van fuel expenses.

**How it stays faithful:** `scripts/demo-data.mjs` starts the real app inside the build process and
creates everything through its own HTTP API as the owner and the demo staff, so stock movements, unit
costs, cost of goods, bills, payments, promotions, audit rows, references and versions are what the app
writes. Each action runs at its planned time: the loader's requests carry that time and, inside the app,
the clock and the Prisma timestamps follow it, so all rules that depend on time apply as on that day. In
that process RESEND_API_KEY, FleetWiz and Supabase Storage are switched off, SkipCash is replaced by an
in-process mock with throw-away keys, and queued demo mail is marked never to send.

**How removal works:** every row the app creates during the load is listed in the `DemoRecord` table
(migration `20261119103000_demo_data`): rows created directly are caught by a Prisma query extension,
rows created inside them by following foreign keys from them. `remove` deletes exactly those rows in one
transaction, children first; the audit-log guard trigger is disabled only around the delete of demo audit
rows. Rows someone created later on top of demo rows (for example a test sale of a demo product at the
demo shop) are removed with them, because they cannot exist without them. The website selling location is
put back as it was. Nothing else is touched.

While the demo is loaded: the website sells from the demo shop (goods held only at other locations do not
show on the website), the 3 demo staff count towards the 10-active-user limit, and if staff act on demo
records (for example refund a demo website order) the app talks to the real services with demo references,
which they refuse. Remove the demo before the first real order.

Locally: `node scripts/demo-data.mjs load|remove|status` in `system/server` (uses `server/.env`).

## Client change rounds — November 2026

Each feature has its own write-up in this folder:

| Feature | Document |
|---|---|
| Transfer history, van returns, damaged stock | `van-returns.md` |
| Sales orders, installments, bank transfer, free goods, PO documents, freight | `sales-orders-payments.md` |
| Roles, unlimited locations, B2B / Wholesale | `b2b-roles-branches.md` |
| Drivers, dispatch, driver edit approvals, grooming vans | `drivers-dispatch.md` |
| Analytics, reports and expenses history | `analytics-reports.md` |
| Accountant confirmation of collected money | `payment-confirmation.md` |
| Grooming coupons | `coupons.md` |
| Menu by role, preview as role, "Who sees what" | `menu-roles.md` |
| Printable PO / SO documents, payment and delivery status | `printable-documents.md` |

To explain access to the client, open **Setup & admin → Who sees what** in the staff app and print it.
