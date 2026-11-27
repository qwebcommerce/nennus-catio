# Drivers, van dashboard and dispatch (fix-rb)

What was added on 29 November 2026: a driver / van dashboard, assigning orders to drivers, driver
edits that need approval, and delivery vs grooming vans. How each part works, the permissions,
the rules per order type, and how it was tested. The last section lists what the role work
(fix-ra) must reconcile when the branches are merged.

## Data (migration `20261129100000_drivers_dispatch`)

- `Vehicle.type`: `DELIVERY` (default) or `GROOMING`. Editable on the Vehicles screen (PATCH
  `/api/vehicles/:id` with `version`, audited `VEHICLE_EDIT`). The type cannot change while the
  van has open assigned jobs.
- `DeliveryArea.zone` (optional): groups areas on the assignment screen. If it is empty, the
  grouping uses the area's city, then the area name. Set it in Catalogue setup → delivery areas.
- `DispatchJob`: one per order or booking (unique `saleId` / `salesOrderId` / `appointmentId`).
  Holds the kind (`WEB_ORDER`, `POS_DELIVERY`, `SALES_ORDER`, `GROOMING`), the status
  (`UNASSIGNED`, `ASSIGNED`, `ACCEPTED`, `DECLINED`, `DELIVERED`, `CANCELLED`), the van (vehicle)
  and driver, the address, area, date, time note and note, who assigned it and when, and when it
  was seen, accepted, declined (with the reason) and delivered. `version` plus the NFR-13 trigger.
- `DispatchEvent`: the assignment history. One row per assign, reassign, unassign, seen, accept,
  decline, delivered, booking closed, change requested / approved / rejected, and dispatcher edit.
  Each row records who, when, the driver and van it concerns, a note and details.
- `DriverChangeRequest`: a driver's edit (`changes`), a snapshot of the order as the driver saw it
  (`before`), the status (`PENDING`, `APPROVED`, `REJECTED`), who decided, when, the reason, and
  what approval changed (`applied`). Rejected requests are kept. `version` plus the trigger.
- `Role` gains `SUPERVISOR`, `ACCOUNTANT` and `DRIVER` (`ADD VALUE IF NOT EXISTS`).

A job is made the first time an order is assigned or edited on the assignment screen. Until
then the order is an assignable candidate, read from its own tables.

## Which orders can be assigned

| Kind | Comes from | Assignable while |
|---|---|---|
| Website order | `Sale` with channel WEBSITE and fulfilment DELIVERY | CONFIRMED, PREPARING or OUT_FOR_DELIVERY |
| Till delivery | shop-till `Sale` marked **For delivery** (or paid "on delivery"), last 30 days | not cancelled |
| Sales order | `SalesOrder` | CONFIRMED or PARTLY_DELIVERED |
| Home grooming | `Appointment` with visit kind HOME | BOOKED / CONFIRMED / CHECKED_IN / IN_PROGRESS, from yesterday on |

**Till "For delivery".** On the shop till (not on a van till), tick *For delivery*, then enter the
address (required), the area, the date and the time window. A customer must be chosen. The sale is
paid or recorded now as usual: the same stock, cash and receivable rules apply. It is saved with
`fulfillment = DELIVERY` and the area, date and window, and then appears on the assignment screen.

**Staff home visits.** The staff booking API now also accepts `visitKind: "HOME"`, an address and
an area, so a home visit can be booked from the desk and then assigned to a grooming van.

Delivery orders go only to delivery vans, and home grooming only to grooming vans. The server
refuses the wrong type.

## Assignment screen (`/dispatch`, module `dispatch`)

- Lists unassigned orders (including ones a driver declined, with the reason), assigned orders,
  or all open orders. Orders are grouped by zone, and you can filter by type.
- Shows the vans with their type, their staff and their workload (assigned, accepted, delivered
  today).
- Tick orders (or a whole zone), choose a driver or a van, and press **Assign to driver**.
  **Unassign** sends orders back to the list. Each order's details show its history and let a
  dispatcher set the area, address, time and note (for example, to give a sales order a zone).
- API: `GET /api/dispatch/queue?show=&kind=`, `GET /api/dispatch/summary`,
  `GET|PATCH /api/dispatch/items/:key` (key `KIND:orderId`), `POST /api/dispatch/assign`
  `{ items: [{ key, version? }], driverUserId | vehicleId, note? }`, `POST /api/dispatch/unassign`.
- Rights: `dispatch.view` to see the screen, `dispatch.create` to assign, `dispatch.edit` to
  reassign a job already on a van, unassign, or edit the delivery details.
- Every assign, reassign and unassign writes a `DispatchEvent` and an audit row
  (`DISPATCH_ASSIGN`, `DISPATCH_REASSIGN`, `DISPATCH_UNASSIGN`; the branch is the van).

Google Maps and automatic assignment by location are not built. The address and area are stored
on the job, ready for them.

## Driver dashboard (`/driver`, module `driver`)

The driver is linked to the van through their location: `user.branchId` is a van location, and
the van's vehicle is attached to that location. A user with role DRIVER is sent from
`/dashboard` to `/driver`. The DRIVER menu shows only *My van*, the till and the cash drawer
(when those rights are on). Sales-van employees (CASHIER on a van) have the dashboard as well.
The owner can open any van with *Driver view* on the Vehicles screen (`/driver?vehicleId=`).
Everyone else gets only their own van; another van's data is refused with 403 `DRIVER_OTHER_VAN`.

The dashboard is built for a 390 px phone first. Its tabs:

- **Orders** (or **Bookings** on a grooming van). New assignments are marked *New*, with a count.
  The menu badge and the page poll every 20–30 s, and a toast appears when a new order arrives.
  Opening the list marks the new orders seen; each one is logged as a `SEEN` event.
  - *Accept* or *Decline* (a reason is required; a declined order goes back to the dispatch list).
  - *Request an edit*: see the approvals section below.
  - *Mark delivered*, through the order's own path:
    - **Sales order:** a normal sales-order delivery of everything still to deliver. The code
      moved unchanged into `lib/salesOrderDelivery.js` and is used by both the sales-order screen
      and the driver. Stock leaves the order's location, and revenue and cost are recognised as
      before.
    - **Website order:** the order steps through PREPARING → OUT_FOR_DELIVERY → DELIVERED with the
      existing status change (moved unchanged into `lib/webOrderStatus.js`). Each step is audited
      and the customer is emailed.
    - **Till delivery:** only the job is marked delivered, because the sale was already paid or
      recorded at the till.
  - Grooming van: *Start*, *Done* and *No-show* use the booking's own status steps
    (`APPOINTMENT_NEXT`, exported from `routes/appointments.js`). *Done* from an upcoming booking
    passes through IN_PROGRESS. Each step is audited (`BOOKING_UPDATE`) and the customer is emailed.
    Payment for a home visit is taken on the van till, as for any grooming sale. No new payment
    path was added.
- **Stock**: the van's stock, with product pictures.
- **Transfers**: transfers into and out of the van.
- **Returns & damaged**: the existing van-return form and list and the damaged-stock list, reused
  from `VehicleDashboard.jsx`.
- **Pending payments**: money to collect on the driver's orders (cash-on-delivery till sales,
  sales-order balances, unpaid home visits) and money owed to customers on van returns. This tab
  only shows the amounts. Money is still collected through the existing paths.
- **Sales**: the van till's sales for the last 30 days.
- **Delivered**: jobs delivered in the last 30 days.

API: `GET /api/driver/overview`, `GET /api/driver/notifications`, `POST /api/driver/seen`,
`GET /api/driver/jobs/:id`, `POST /api/driver/jobs/:id/accept|decline|deliver|booking-status|change-requests`.
Every write takes the job `version` (NFR-13: 428 without it, 409 when it is stale).

Delivery vans see only delivery jobs, and grooming vans see only their bookings.

## Driver edits need approval (`/driver-approvals`, module `driverApprovals`)

A driver's edit is never applied at once. It becomes a `DriverChangeRequest`, and the order
shows *Edit waiting for approval*. Only one request per order can be pending, and the order
cannot be delivered or declined while one is pending.

What can be edited, by order type:

| Order type | Lines (quantity, remove) | Address / time / note | Date |
|---|---|---|---|
| Sales order, nothing delivered yet (CONFIRMED) | yes | yes | yes (also the order's delivery date) |
| Sales order, partly delivered | no | yes | yes |
| Website order (paid online) | no: the amount paid would change | yes | no: window seats were booked |
| Till delivery (paid / recorded at the till) | no: that needs a till refund | yes | no |
| Home grooming | no driver edits; the booking's own status steps only | | |

Address, time and note changes are stored on the delivery job. The order record itself is not
changed, so invoices and receipts stay as issued.

**Approve** needs `driverApprovals.edit` (SUPERVISOR, ACCOUNTANT, MANAGER and ADMIN by default; not
SALES or DRIVER). On approval, sales-order lines are applied in one transaction with the
sales-order rules:

- the same unit prices;
- the order discount spread again over the remaining lines (`priceOrder`);
- the order total changes. Installments follow: any increase goes on the last installment, and any
  decrease comes off the unpaid part of the last installments, which are removed when they reach
  zero;
- the order version goes up by one, and the edit is audited as `SALES_ORDER_EDIT`;
- no stock moves, because a sales order takes stock at delivery.

Approval is refused when:

- the new total would fall below what has been paid (`DRIVER_CHANGE_BELOW_PAID`). Reject the
  request instead;
- the order changed since the driver asked (`DRIVER_CHANGE_STALE`);
- something has been delivered (`DRIVER_CHANGE_SO_DELIVERED`).

**Reject** needs a reason. The request is kept with that reason and with who rejected it.

The dashboard shows approvers a card with the number of requests waiting, and dispatchers a card
with unassigned, assigned, accepted and delivered-today counts. The menu shows a badge with the
waiting count. Every request, approval and rejection is logged as a `DispatchEvent` and audited
(`DRIVER_CHANGE_REQUEST`, `DRIVER_CHANGE_APPROVE`, `DRIVER_CHANGE_REJECT`).

## Permissions (defaults)

| Module | Actions | ADMIN / MANAGER | SUPERVISOR | ACCOUNTANT | SALES (fix-ra) | CASHIER | DRIVER |
|---|---|---|---|---|---|---|---|
| dispatch | view, create, edit | all | all | view | all | – | – |
| driver | view, create | all | – | – | – | view, create (van staff) | view, create |
| driverApprovals | view, edit | all | view, edit | view, edit | – | – | – |

DRIVER also gets `pos` view/create (the van till), `returns` view/create, `products.view` and
`customers.view`. Everything else is off. The Permissions screen lists the three new modules for
MANAGER and CASHIER. The owner can, for example, give the till employees (who act as sales staff
here) `dispatch`, as the browser test does.

`GET /api/branches` is also open to users with `driver.view`, `dispatch.view` or
`driverApprovals.view`. The location list (the till location and van names) is needed by every
screen. Writes still need the warehouse rights.

## Finance

Dispatch adds no money paths. Assigning, accepting, declining, seen marks, change requests and
rejections change no sale, payment, stock or order row (the API test compares checksums of 12
tables before and after them). Money and stock move only through:

- the sales-order delivery path (revenue at delivery);
- the sales-order re-pricing on an approved edit;
- the website status change;
- the till.

## Demo data

`scripts/demo/dispatch.mjs`, wired into `demo-data.mjs`:

- **Vans:** two more delivery vans and three grooming vans with DRIVER users. With the two sales
  vans, that makes 4 delivery and 3 grooming vans.
- **Zones and orders:**
  - the demo delivery areas get zones;
  - two sales orders, one accepted on van 1 and one accepted on van 3;
  - two till deliveries, one delivered by van 1 and one assigned to van 4.
- **Change requests:** one pending (van 1, sales order A) and one approved (van 3, sales order B,
  approved by the accountant, or by the owner when the plan's user limit stops the accountant
  account).
- **Grooming:** two home grooming visits assigned to grooming vans; one is closed DONE.
- **User limit:** if the plan's user limit stops a staff account, the owner does that work.

Load → remove was checked on a fresh seeded database: all 101 tables are identical (row count and
checksum). A failed load also rolled back exactly.

## Tests (scratchpad `tests/fix-rb/`)

- `api-test.mjs`: **155/155**. Covers:
  - permissions: role defaults, refusals for driver, cashier, accountant and supervisor, a driver
    with no van, and the SALES defaults;
  - the till for-delivery sale (validation, stored fields, stock);
  - grouping by zone (area zone, city fallback, no zone);
  - assign, reassign and unassign, each with events and audit rows;
  - wrong van type refused;
  - notifications and unseen count, with seen events;
  - isolation: another van's job, dashboard and vehicle dashboard are refused; the owner can view
    any van;
  - accept and decline (with reason, version 428/409, events and audit);
  - change requests:
    - sales-order re-pricing approved by the SUPERVISOR: total, lines, installments, version,
      no stock movement, job fields, audit;
    - an increase approved by the ACCOUNTANT;
    - below-paid refusal;
    - rejection with a reason, which is kept;
    - website-order limits (no lines or date); address and time changes, one rejected and one
      approved;
    - refused for cashier (the SALES stand-in) and driver;
    - grooming: no edits;
  - delivery:
    - sales order: normal delivery, revenue and stock;
    - website order: the status steps, audited;
    - till delivery;
  - pending payments;
  - the grooming van closing DONE and no-show, and refused for a delivery driver;
  - van stock, transfers, van till sale and van return shown on the dashboard;
  - vehicle type edit (428/409/400/403);
  - finance unchanged except through the normal paths.
- `ui-test.cjs` (Playwright): **106/106**. Covers:
  - 1280 EN: a till sale for delivery; sales staff assigning by zone (multi-select, driver list
    with workload, grooming van offered only for bookings); the history;
  - 390 EN: driver login → dashboard → New marks → accept → edit request;
  - 1280 AR: the supervisor's dashboard count → approve;
  - 390 AR: the driver delivers (sales order DELIVERED, stock moved);
  - 390 EN + AR: the grooming van closes a booking;
  - dispatch, approvals, driver (every tab) and vehicles at 1280/390 × EN/AR: no sideways scroll,
    right-to-left in Arabic, no failed API calls;
  - vehicle type edit; the driver is refused on other screens.
- Regression:
  - business-day test: **323/323**, unchanged;
  - fix-so API: **150/150**;
  - fix-so UI: **116/116**;
  - fix-so/vr API: **125/125**;
  - fix-so/vr browser: **76/76**;
  - demo load → remove identical;
  - client build, `node --check`, `npm run check:errors`.

## Merge notes for fix-ra (roles)

These are the points the merge must reconcile:

1. **Enum `Role`.** This branch adds `SUPERVISOR`, `ACCOUNTANT` and `DRIVER` in
   `20261129100000_drivers_dispatch` with `ADD VALUE IF NOT EXISTS`, so either migration order
   works. In `schema.prisma`, keep one copy of each value (fix-ra also adds `SALES` and `B2B`).
2. **`MODULES` / `MODULE_ACTIONS_FOR`.** Keep the fix-rb entries `dispatch`, `driver` and
   `driverApprovals` with their action lists.
3. **`defaultModuleMap`.** The block between `fix-rb ... BEGIN` and `END` holds the defaults for
   DRIVER, SUPERVISOR and ACCOUNTANT, plus a separate SALES line (`dispatch` view/create/edit).
   When fix-ra adds its per-role blocks, merge these rights into them:
   - SUPERVISOR: dispatch all, driverApprovals view/edit;
   - ACCOUNTANT: dispatch.view, driverApprovals view/edit;
   - SALES: dispatch all, **no** driverApprovals;
   - DRIVER: driver view/create, pos view/create, returns view/create, products.view,
     customers.view.

   Also keep `driver.view`/`driver.create` in the CASHIER block (sales-van staff). If CASHIER
   becomes SALES, give SALES staff whose location is a van the same rights, or give DRIVER to the
   van staff.
4. **Role storage.** On this branch, `resolveModulePermissions` returns the **defaults only** for
   DRIVER, SUPERVISOR and ACCOUNTANT, because there is no stored matrix for them yet. Replace that
   early return with fix-ra's general per-role storage, and the Permissions screen will then edit
   them. If MANAGER/CASHIER are migrated to SUPERVISOR/SALES, carry over any stored overrides of
   the three new modules.
5. **`routes/users.js` `ROLES` and `Users.jsx`.** This branch adds the three roles in marked
   lines. fix-ra owns the full list.
6. **`GET /api/branches`.** This branch opens it to `driver.view`, `dispatch.view` and
   `driverApprovals.view`. If fix-ra gives the new roles another way to read locations, keep one
   of the two.
7. **Dashboard.** `Dashboard.jsx` skips the till summary for users without `pos.view` (supervisor,
   accountant) and shows `DispatchDashboardCards` above it. fix-rc (analytics) may restructure
   this page; keep the one-line card include.
8. **Sales orders.** The delivery handler body moved unchanged into `lib/salesOrderDelivery.js`
   (`deliverSalesOrder`), and the route calls it. fix-ra's delivery-note → invoice → cash-receipt
   work on sales orders should change the delivery in that lib function, so the driver's "Mark
   delivered" follows it. If fix-ra turns deliveries into delivery notes, a B2B delivery note is
   assignable as a `SALES_ORDER` job (keyed by the order). Revisit `sourceFacts` and `eligible` in
   `lib/dispatch.js` if delivery notes get their own table.
9. **Website status change.** The status-change body moved unchanged into `lib/webOrderStatus.js`.

## Not done / open

- There is no new way to collect cash-on-delivery money from the driver dashboard. Pending
  payments only shows the amounts, and collection uses the existing paths.
- Driver address, time and note edits are stored on the job, not written back to the sale or the
  booking.
- No Google Maps or automatic assignment (out of scope; the data is ready).
