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
