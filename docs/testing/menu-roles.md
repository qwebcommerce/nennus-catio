# Menu workspaces, role menus and "Who sees what" (fix-rf)

The staff sidebar was one long "Inventory" section plus loose links injected at the top
(dispatch, driver approvals, payment confirmations, van returns). It is now built from **one data
definition**, `client/src/lib/menuDefinition.js`, which also drives each role's landing page and the
**Who sees what** page (`/permissions/guide`).
Routes and route guards are unchanged; only the menu moved. No schema change, no migration.

## The definition

`MENU_SECTIONS` is a list of workspaces; each item has `to`, a label key (`menu.item.*`), an icon,
a visibility rule `show`, optionally `route` (the route guard, when it differs from the menu rule),
`badge`, `end` (exact match) and `testId`. Rules are data:

| Rule | Meaning |
| --- | --- |
| *(none)* | always |
| `{ perm: "pos" }` | legacy key, `can("pos")` (derived from the module map, `LEGACY_TO_MODULE`) |
| `{ mod: "finance.view" }` | module right, `canModule("finance", "view")` |
| `{ any: [...] }` / `{ all: [...] }` / `{ not: r }` | combinations |
| `{ roles: ["ADMIN"] }` / `{ owner: true }` / `{ van: true }` | role, business owner, driver or user whose location is a van |

Other exports: `ROLE_MENUS` (roles with a short flat menu: `DRIVER: ["driver", "pos", "cash"]`),
`ROLE_HOMES` (landing page per role), `visibleMenu(ctx)`, `homePath(ctx)`, `sectionForPath`,
`accessMatrix(roleMaps)` (the guide), `userContext(user, ownBranchKind)` (the signed-in user, same
checks as `AuthContext.can/canModule`) and `roleContext(role, moduleMap)` (guide).

Data-testids kept: `nav-driver`, `nav-dispatch`, `nav-approvals`, `nav-confirmations`,
`nav-van-returns` and their `-badge`s. Every other link is `nav-<id>` with `data-nav-id`; sections
have `data-section`, `nav-section-btn-<id>` and `nav-section-badge-<id>`.

## Workspace map

| Workspace | Items (route — rule) |
| --- | --- |
| **Overview** | Dashboard `/dashboard` — everyone except a flat-menu role; Analytics `/analytics` — Finance view; Reports & expenses `/reports` — `reports`; Sales history `/sales` — `pos` or `reports`; Notifications `/alerts` — everyone (badge) |
| **Selling** | Till `/pos` — `pos`; B2B / Wholesale `/pos/b2b` — B2B view; Sales orders `/sales-orders` — Sales orders view; Website orders `/online-orders` — **Website orders view** (was products view, see below); Till refunds `/returns` — `refunds`; Cash drawer `/cash` — `cashSession`; Promotions & coupons `/promotions` (coupons are a tab, `/promotions/coupons/*`) — Promotions view |
| **Deliveries & vans** | My van `/driver` — Driver view and a van user (badge: new assignments); Dispatch `/dispatch` — Dispatch view; Driver edit approvals `/driver-approvals` — Driver approvals view (badge); Van returns desk `/van-returns` — Returns view and (create or **refund**); Vehicles & van dashboards `/vehicles` (`/vehicles/:id` under it) — Delivery create or Returns view |
| **Stock** | Products — `productsView`; Categories — `catalogEdit`; Stock transfer `/transfer` (with its Transfer history tab) — `transfer`; Transfers log `/transfer/history` — Locations view, Returns view and *no* `transfer`; Stock count — `stockCount`; Damaged stock `/damaged-stock` — Returns view |
| **Purchasing** | Suppliers & purchases `/purchases`, Purchase orders `/purchase-orders` — `purchases` |
| **Money** | Finance — Finance view; Payment confirmations — Payment confirmation view (badge); Customer accounts (credit) `/customer-accounts` — `receivables`. Pending payments have no screen of their own: they are panels on Finance, Sales orders, Purchase orders, Customer accounts and the Dashboard. |
| **Customers & services** | Customers — `customers`; Grooming desk (appointments) `/appointments` — Grooming view; Grooming setup (packages & hours) `/admin/grooming` — Grooming view; Relocation `/admin/relocation` — Relocation view |
| **Setup & admin** | Users — top admin; Permissions — business owner (the API is owner-only); Who sees what `/permissions/guide` — top admin; Locations `/branches` — top admin; Pet types & delivery areas `/pet-types` (delivery areas and windows live there) — `catalogEdit`; Audit log — `audit`; Settings — everyone |

Grouping decisions: Sales history sits in Overview (it is a look-back screen used by tills and
managers alike); Promotions in Selling (offers and coupons are used at the till and on the website);
Pet types with Setup because the same screen holds the delivery areas; Customer accounts in Money
(credit balances are the accountant's work). Every route in `App.jsx` is a menu item or a child of
one (`/vehicles/:id`, `/transfer/history/:id`, `/customer-accounts/:id`, `/promotions/coupons/*`),
except the footer's Change password and the `/print-settings` redirect; the browser test checks this.

Behaviour: a section with no visible item is hidden; the section holding the current route opens
by itself (on a route outside the menu the first section is open); a closed section shows the sum of
its items' badges; the menu works in Arabic (RTL) and on phones (drawer, closes on navigation).

## Menu per role (default permissions)

| Role | Menu | Lands on |
| --- | --- | --- |
| Top admin | everything above | Dashboard |
| Supervisor | everything except Users, Permissions, Who sees what, Locations | Dashboard |
| Sales | Overview: Dashboard, Sales history, Notifications · Selling: Till, Sales orders, Website orders, Till refunds, Cash drawer · Deliveries: Dispatch, Van returns desk, Vehicles · Stock: Products, Transfers log, Damaged stock · Customers & services: Customers, Grooming desk, Grooming setup · Setup: Settings | Till |
| Accountant | Overview: Dashboard, Analytics, Reports, Sales history, Notifications · Selling: B2B / Wholesale, Sales orders · Deliveries: Dispatch, Driver edit approvals, Van returns desk, Vehicles · Stock: Products, Transfers log, Damaged stock · Purchasing: both · Money: Finance, Payment confirmations, Customer accounts · Customers · Settings | Payment confirmations |
| B2B staff | Overview: Dashboard, Notifications · Selling: B2B / Wholesale, Sales orders · Deliveries: Dispatch · Stock: Products · Customers · Settings | B2B / Wholesale |
| Driver (delivery or grooming van) | My van, Till, Cash drawer (flat, no sections). A grooming-van driver's My van shows bookings. | My van |
| Manager (legacy) | as Supervisor | Dashboard |
| Cashier (legacy) | Dashboard, Sales history, Notifications, Till, Website orders, Till refunds, Cash drawer, Van returns desk, Vehicles, Products, Transfers log, Damaged stock, Customers, Grooming desk, Grooming setup, Settings (+ My van when their location is a van) | Till |

The driver's other rights (products and customers for the till, van returns, transfers, damaged
stock, their sales) are reached inside My van; the guide marks them "allowed, not in the menu".

## Landing pages

`ROLE_HOMES`: the first item of the list the user can see, else the first visible item.
DRIVER → My van; SALES / CASHIER → Till, else Dashboard; ACCOUNTANT → Payment confirmations, else
Finance, else Dashboard; B2B → B2B / Wholesale, else Sales orders, else Dashboard; others →
Dashboard. Used after signing in, when a signed-in user opens `/login`, and for unknown paths.
`/dashboard` still opens the Dashboard for everyone whose menu has it (a driver is sent to My van).
**Deep links:** a signed-out user opening a staff URL is sent to the login page, which now returns to
that URL after signing in (before, everyone went to `/dashboard`).

## Preview menu as role (removed)

An admin "Preview menu as role" picker was built and then removed at the owner's request (28 Nov 2026):
to see a role's access, sign in as a user with that role, or open **Who sees what**.

## Who sees what (`/permissions/guide`)

Top admin; linked from the Permissions screen and the Setup & admin menu. Generated from the menu
definition and the live role maps — never hand-written, so it follows permission edits:

- one card per role: plain-language description (`menu.role.*`), active users or "Nobody holds this
  role", "legacy role" mark (Manager, Cashier), home page, and the role's menu as a list;
- a matrix roles × workspaces/screens: ✓ in the menu, ○ allowed but not in the menu (opened from
  another screen), – no access;
- Print button (print view shows the guide only), English and Arabic, no sideways scroll at 390 px.

## Sweep: mismatches found and fixed (menu definition only)

Before the change (old sidebar vs route guards and APIs):

1. **Website orders** was shown with Products → view, but the route and `/api/online-orders` need
   Website orders → view: Accountant and B2B staff saw the link and got "You can't open this
   screen". Now `orders.view`.
2. **Van returns desk** needed Returns → create, so the Accountant (Returns view + refund: pays
   customers back on that screen) could not reach it. Now Returns view and (create or refund).
3. **Damaged stock** had no menu entry (only links from Stock count / van dashboards). Now in Stock.
4. **Transfer history** was only reachable through the Transfer screen, which needs Locations → edit:
   Sales and Accountant (who follow van stock) could not reach it. Now "Transfers log" for staff with
   Returns view who cannot transfer.
5. Coupons, delivery areas, `/vehicles/:id`, `/payment-confirmations`, `/van-returns`, `/pos/b2b`,
   `/analytics` all have a clear place now (see the map).

After the change, signing in as every role and opening every menu link gives no "no access" card
and no 401/403 (browser test), and no screen a role may open is missing from its menu (exceptions:
the top admin's My van without a van; Transfers log for roles holding only the location-list right).

Not changed (reported, permission defaults left alone):

- Every role has Locations → view only to read the location list, which also opens
  `/transfer/history` (route guard) for B2B staff and drivers. Harmless (read only) but wider than
  intended; a dedicated right would be cleaner.
- Supervisor has Team → view (the API lists users) but `/users` is a top-admin route; consistent
  with "creating staff is owner-only", so the menu follows the route.
- Grooming setup opens with Grooming → view (Sales sees it read-only); kept as the existing check.

## Tests (`SCRATCH/tests/fix-rf/`)

- `menu-api-test.mjs` — 64/64: admin-only (owner and second admin 200; every other role 403
  bilingual; signed out 401; no write methods), maps equal `resolveModulePermissions` and the
  role's own session, follows a permission edit and restores, read never changes the organisation,
  landing per role.
- `menu-ui-test.cjs` — 208/208 (1280 / 390, English / Arabic): static route coverage of `App.jsx`;
  for Top admin, Supervisor, Sales, Accountant, B2B, Driver (delivery van) and Driver (grooming van):
  sign in through the form, landing page, menu = definition, no empty sections, landing section open,
  every visible link opens without a no-access card or 401/403, nothing reachable is missing; phone
  drawer per role in Arabic (RTL, no sideways scroll, closes on navigation); section auto-open and
  manual open/close; badges (confirmations, approvals, driver unseen, notifications, section sum);
  no guide for a supervisor (the preview checks were removed with the preview); guide = real menus and landing pages, matrix ✓ = real menus, legacy and
  nobody marks, print, EN/AR, follows a permission change. Menu screenshots per role:
  `menu-shots/menu-<ROLE>-1280-en.png`, guide: `menu-shots/guide-*.png`.
- Regression on fresh DBs (copies of the latest fix-re suites): business-day 323/323; fix-rd API
  164/164, UI 104/104; fix-ra API 202/202, UI 131/131; fix-so API 150/150, UI 116/116; fix-so/vr API
  125/125, browser 76/76; fix-rb API 155/155, UI 106/106; fix-rc API 213/213, browser 129/129; fix-re
  API 165/165, UI 109/109. One adaptation: `rd-ui-test.cjs` clicks `nav-van-returns` and
  `nav-confirmations` from the Dashboard, where those links now sit in closed workspaces; a helper
  `openNav` opens the link's section first. (The first rd UI run had one timing failure on the driver
  dashboard's photo thumbnail, unrelated to the menu; the re-run passed 104/104.) Client build,
  `node --check` on all server files and `npm run check:errors` pass.
