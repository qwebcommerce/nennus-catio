# Roles, locations and B2B / Wholesale

Branch `fix-ra`. Migrations (all additive):

| Migration | What |
|---|---|
| `20261128100000_roles` | `Role` gains `SUPERVISOR`, `SALES`, `ACCOUNTANT`, `B2B`, `DRIVER` (`ADD VALUE IF NOT EXISTS`); `Organization.roleModules` (JSONB). |
| `20261128100100_roles_data` | Copies the stored manager / cashier maps into `roleModules` and moves existing staff to the new roles (below). |
| `20261128100200_locations` | `LocationKind` gains `FACTORY` and `OTHER`; `Branch.isMain`; trigger `nc_branch_one_main` (one main location per organisation). |
| `20261128100300_b2b_wholesale` | `SalesOrder.orderType` (`STANDARD` / `B2B`), `dnReference`, `invoiceId`; `SalesOrderPayment.receiptId`; tables `B2bInvoice` and `B2bReceipt`; sequences for DN / INV / RC. |

Money is whole dirhams in the database and riyals in the API, as elsewhere.

## Roles

| Role | Label (EN / AR) | Location | Default rights (editable on the Permissions screen) |
|---|---|---|---|
| `ADMIN` | Top admin / المشرف الأعلى | optional | Everything, always. Not editable. |
| `SUPERVISOR` | Supervisor / مشرف | optional (none = business-wide) | Every module and action. Owner-only actions (roles and permissions, creating staff, business and payment settings, writing off damaged stock) stay behind `requireOwner`. |
| `SALES` | Sales / مبيعات | required | Till (view, sell, refund), website orders, customers, products view, sales orders view/create, grooming view, delivery view. Space marked for fix-rb's driver-assignment module. |
| `ACCOUNTANT` | Accountant / محاسب | optional | Finance (view, create, edit, export), purchasing, sales-order payments, B2B view + cash receipts + export, products and stock view only, customers view, till view. |
| `B2B` | B2B staff / موظف مبيعات الشركات | optional | B2B (all), customers (view/create/edit), products view, sales orders (view/create/edit price). |
| `DRIVER` | Driver / سائق | required (their van) | Till view/sell, products view (the till looks products up), van returns view/create. Space marked for fix-rb's driver module. |
| `MANAGER` | Manager (legacy) / مدير (قديم) | required | Legacy, same defaults as Supervisor. |
| `CASHIER` | Cashier (legacy) / كاشير (قديم) | required | Legacy, the old employee set. |

Every non-admin role has Locations → view, because the location list (`/api/branches`) feeds every screen.

**Decision: option (a), migrate.** Existing `MANAGER` users became `SUPERVISOR`; `CASHIER` users at a van became `DRIVER`, the other cashiers `SALES`. This is safe because:
- the server reads the user's role from the database on every request, so a migrated user keeps working with the same cookie (`sessionVersion` is not touched by the migration);
- people keep exactly the rights they had: the stored manager map is copied to `SUPERVISOR` (and kept for `MANAGER`), the stored cashier map to `SALES`, `DRIVER` (and kept for `CASHIER`). Where nothing was stored, the new role defaults apply. Modules added later keep their role defaults;
- the seed now creates `cashier@petstore.local` as `SALES` (it still sells, refunds and opens the till); the business-day test passes.
`MANAGER` and `CASHIER` remain valid enum values and the API still accepts them, so old rows and scripts work. The Users screen offers them only on a user who still has one; the Permissions screen shows their tab only while an active user has it.

**Storage.** `Organization.roleModules` is one JSON map keyed by role (`{"SALES": {"pos": {"view": true, …}}, …}`). `resolveModulePermissions` reads `roleModules[role]`, else (for `MANAGER` / `CASHIER`) the old `managerModules` / `cashierModules` columns, on top of `defaultModuleMap(role)`. Saving `MANAGER` or `CASHIER` also writes the old column. `defaultModuleMap` has one marked block per role (`-- fix-rb: … go here`) so other branches can add module lines without conflicts.

**Session refresh.** Changing a user's role bumps `sessionVersion`: their open sessions end (401 `SESSION_REVOKED`) and the next sign-in loads the new menus and rights. A name or location change does not sign them out.

**Hard-coded roles removed.** Client route guards and menu entries use module rights (`orders`, `promotions`, `finance`, `grooming`, `relocation`, `products`) instead of `ADMIN`/`MANAGER`/`CASHIER` lists; held carts allow every till user but floor associates (their own only); a customer's opening balance needs Finance → create; Categories edit buttons need Products → edit. `role === "ADMIN"` checks (top admin is business-wide) stay.

**Users.** The role picker shows the new roles in both languages; Supervisor, Accountant and B2B staff may have no location (business-wide). The active-user limit is **30** (owner decision), set by `MAX_ACTIVE_USERS` (ignored unless a whole number ≥ 1). Only active users count; the 31st is refused with 403 `USER_LIMIT` in both languages, deactivating someone frees a seat, and reactivation is checked the same way.

## Locations

- **Unlimited.** There was no server-side cap (`Organization.maxBranches` is unused; the unused "Branch limit reached" client message is removed). Tested with 12 new locations.
- **Kinds.** `SHOP`, `VAN`, `WAREHOUSE`, `FACTORY` (stock only, like a warehouse), `OTHER` (can run a till). Code asks `isTillKind()` (`lib/locationKinds.js`, client `lib/locationKinds.js`) instead of comparing with `WAREHOUSE`: the till, the POS location picker and the sales-order cash-session check. Stock, transfers, finance (van vs shop channels), van returns and the location filters work on any kind.
- **Main location.** `Branch.isMain`, exactly one per organisation (trigger refuses a second). The migration picks the website location, else the oldest shop, else the oldest non-van location. `POST /api/branches/:id/main { version }` (Locations → edit; 409 stale, 428 missing version) clears the previous one in the same transaction. A van cannot be main; the main location cannot be deactivated or deleted. Location lists show it first. B2B notes default to it.
- **Names.** Settings → **Locations** (owner): Arabic and English name of every location with its own Save (version-checked; a stale copy shows the notice and reloads), the main-location radio, and a link to the Locations screen. The Locations screen also edits both names and offers every kind.
- **Dashboard.** `GET /api/dashboard/sales-by-branch` lists every location of the business (any kind, inactive ones only while they have figures): till sales, sales-order / B2B revenue delivered from it, and the total, with kind and both names. Shown to the top admin and anyone with Finance → view, whatever location is active (before, the chart could only appear with no active location, which never happened).

## B2B / Wholesale

Screen: **POS → B2B / Wholesale** (`/pos/b2b`), with a "Till | B2B / Wholesale" sub-nav on the till and a sidebar entry. Tabs: Delivery notes, Invoices, Cash receipts, Pending by customer. Filters: customer, status, dates, search; CSV export. Works at 1280, tablet and 390 px, English and Arabic.

Built on the sales-orders engine — there is no second sales ledger:

1. **Delivery note** `DN-000001` = a `SalesOrder` with `orderType = B2B` for a business customer (`isBusiness`), lines (product / variant, quantity, price; price changes need Sales orders → edit, free lines Complimentary → create with a reason, exactly as on sales orders), delivery date, payment terms, optional discount. Issuing confirms it; **Deliver now** (default) or **Deliver** later moves the stock out through the shared sales-order delivery (`lib/soDelivery.js`, used by `/api/sales-orders/:id/deliveries` too): SALE movements, revenue and cost at delivery, free-line cost as Complimentary, 409 `SO_STOCK_SHORT` instead of negative stock (nothing is saved). A note not yet delivered can be cancelled. Printable delivery note without prices (prices optional), with received-by and signature lines.
2. **Invoice** `INV-000001` (`B2bInvoice`) from one or more delivered, not-yet-invoiced notes of **one** customer. Total = the notes' totals. Due date = invoice date (today or earlier) + terms (given, else the longest terms on the notes); it becomes the due date of each note's installment, so the existing pending payments and overdue flags follow it. An invoice with no receipt can be cancelled; its notes can be invoiced again. Printable invoice with amount due and due date.
3. **Cash receipt** `RC-000001` (`B2bReceipt`) against an invoice: cash or bank transfer (proof file required for bank transfer, 400 `PROOF_REQUIRED`), partial allowed, more than the balance refused (400 `B2B_OVERPAY`), date today or earlier, **collected by** any active staff member (default: the person recording). The receipt is spread over the invoice's notes oldest first as `SalesOrderPayment` rows (`receiptId`), so money in by method, the cash-up, finance and exports count it once. The money comes in at the collector's location (else the note's); cash is linked to that location's open till session when there is one (`cashSessionId`) and then appears in its cash-up. Printable receipt.

Statuses shown on a note: Issued (not delivered) → Delivered — not invoiced → Invoiced — unpaid → Partly paid → Paid; Cancelled. Invoices: Unpaid, Partly paid, Paid, Overdue, Cancelled. The underlying sales order also becomes `COMPLETED` when fully delivered and paid. A B2B note cannot be paid, re-planned or cancelled from the plain Sales orders screen (400 `SO_B2B_USE_RECEIPT` / `SO_B2B_USE_TAB`); it is listed there with its numbers.

**Pending by customer** (`GET /api/b2b/pending`): per customer, unpaid invoices (amount, paid, owed, invoice date, due date, days overdue) and notes delivered but not invoiced yet, with totals. The general pending payments (`lib/pending.js`, `/api/pending/payments`, its CSV) list B2B notes as sales-order rows with the note and invoice numbers.

**Accounting.** Revenue and cost at delivery in the existing **B2B / sales orders** channel; money in when a receipt is recorded, by method (cash, bank transfer); bank transfers never count as drawer cash. Exports: `/api/b2b/export/notes|invoices|receipts` (CSV, B2B → export) and the sales-orders export (shows DN / order / invoice numbers).

**Permission `b2b`:** view; create = delivery notes and invoices; edit = cash receipts; delete = cancel a note not yet delivered / an invoice without receipts; export. Defaults: Top admin and Supervisor all; B2B staff all; Accountant view + receipts + export; Sales and Driver none. Receipt proofs can be opened with B2B → view or Finance → view; uploading a proof is allowed with B2B → edit.

### Endpoints

`GET /api/b2b/meta` · `GET /api/b2b/pending` · `GET|POST /api/b2b/delivery-notes` · `GET /api/b2b/delivery-notes/:id` · `POST /api/b2b/delivery-notes/:id/deliver` · `POST /api/b2b/delivery-notes/:id/cancel` · `GET|POST /api/b2b/invoices` · `GET /api/b2b/invoices/:id` · `POST /api/b2b/invoices/:id/cancel` · `POST /api/b2b/invoices/:id/receipts` · `GET /api/b2b/receipts` · `GET /api/b2b/receipts/:id` · `GET /api/b2b/export/:kind` · `POST /api/branches/:id/main`.

## Demo data

Adds AB Trading W.L.L. with three notes from the warehouse: one invoiced and fully paid (bank transfer with proof by the accountant, then cash collected by van driver 1), one invoiced and unpaid (net 30), one delivered and not invoiced; demo users are Sales (shop), Driver (vans), Accountant, B2B staff and Supervisor. Load → status → remove restores every table exactly (row count + checksum).

## Tests (fix-ra, scratchpad `tests/fix-ra/`)

- `api-test.cjs` — 191/191: role defaults, users per role, refusals per role, editing a role (stale 409 / 428), legacy column fallback, role change ends the session, user limit 30 (31st refused, deactivation frees a seat, reactivation checked), 12 locations incl. vans and a factory, factory cannot run a till, transfer to the factory, main location (one only, stale, van, delete, deactivate, DB trigger), names with stale 409, factory on the dashboard, the B2B chain (stock, revenue at delivery, invoice totals and due dates, partial / full receipts, overpay, proof, collector, cash-up, pending per customer and in pending payments, finance against DB sums, exports, refusals, audit).
- `migration-test.sh` — 12/12: data move MANAGER → SUPERVISOR, CASHIER → SALES / DRIVER, maps copied, sessions untouched, main location picked.
- `limit-env-test.sh` — `MAX_ACTIVE_USERS` parsing (empty / invalid → 30).
- `ui-test.cjs` — 131/131 (1280 / 390 / 768, English / Arabic): Permissions tabs and saving, Users role picker and role change, Settings → Locations names / main / stale edit, Locations screen, dashboard per location, B2B tab end to end with printing (note with / without prices, invoice, receipt), filters, driver refused.
- Regression: business-day 323/323 (one step adapted: the van user is created as Driver, the legacy Cashier role is no longer offered); fix-so API 150/150 (adapted: the seed cashier is set to the legacy CASHIER role, because the seed cashier is now Sales and may use sales orders) and UI 116/116; fix-so/vr API 125/125 and browser 76/76; demo load → remove identical; client build, `node --check`, `check:errors`.

## Merged with fix-rb (drivers / dispatch) and fix-rc (analytics)

- **Migrations** run in order `20261128*` (fix-ra) → `20261129100000_drivers_dispatch` → `20261130100000_analytics_reports`; fix-rb adds the same role values with `IF NOT EXISTS`, so the roles data move is unchanged (migration test 12/12).
- **Rights.** fix-rb's modules `dispatch` (view, create = assign, edit = reassign), `driver` (view, create) and `driverApprovals` (view, edit) are folded into the per-role defaults: Supervisor all; Accountant dispatch view + approvals; Sales dispatch (no approvals); B2B staff dispatch (to send their delivery notes out; a fix-ra choice); Driver driver dashboard, van till, returns, products and customers view; legacy Cashier keeps `driver` view/create. fix-rb's early return for the new roles is gone: all roles are stored in `roleModules` and edited on the Permissions screen. `/api/branches` reads stay on Locations → view (every role has it), so fix-rb's special case was dropped.
- **One delivery path.** `lib/soDelivery.js` (`deliverSalesOrder` / `deliverOrderLines`) is used by `/api/sales-orders/:id/deliveries`, B2B delivery notes and the driver's "Mark delivered" (fix-rb's `lib/salesOrderDelivery.js` was folded in). A B2B delivery note issued without delivering is a `SALES_ORDER` dispatch job; dispatch shows its DN number and `b2b: true`, with nothing for the driver to collect (the money comes in by a cash receipt on the invoice). When the driver marks it delivered, stock and revenue move then, and the note becomes "Delivered — not invoiced".
- **Demo.** The demo accountant and supervisor come from the main staff list; fix-rb's dispatch demo reuses them, and the supervisor approves the driver's change. Load → remove restores all 103 tables exactly.
- **UI.** Dashboard and analytics-card arrows point the reading direction (← in Arabic), as does the driver change summary. The sidebar entry that opened the Dashboard under the name "Analytics" is now named Dashboard; the single "Analytics" entry opens fix-rc's `/analytics`.
