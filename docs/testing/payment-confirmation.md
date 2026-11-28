# Payment confirmation, driver collections, van returns by sales (fix-rd)

What was added on 1 December 2026 to match the client's notes:

- the sales lady records van returns, and they show up in the driver's van; the driver moves them
  into the warehouse from their dashboard;
- drivers add new customers;
- drivers record the money they collect on delivery;
- the accountant confirms cash receipts and pending payments, and (owner decision) **money counts
  in finance only after the accountant confirms it**.

## What needs confirmation

Money collected outside the till drawer flow:

| Money | Row | Queue key |
|---|---|---|
| B2B cash receipt (on an invoice) | `B2bReceipt` + its `SalesOrderPayment` rows | `B2B_RECEIPT:id` |
| Sales-order installment payment | `SalesOrderPayment` (no receipt) | `SO_PAYMENT:id` |
| Customer account (credit) collection | `CustomerAccountLedger` entry `PAYMENT` | `ACCOUNT_PAYMENT:id` |
| Cash on delivery collected by a driver | one of the three above, with `dispatchJobId` | as above, shown as *Driver collection* |

Till sales at the POS are **not** included: they count at once, as before.

Van-return pay-outs to customers (money **out**) are **not** put through confirmation. Reasons:
the return holds one payment only (one proof file, one cash-session link), so a rejected pay-out
would have to overwrite its evidence; and paying back is already limited to sales / the accountant
(`returns.refund`, below), with a proof required for bank transfers. If the owner wants it, it needs
a pay-out table per return first (listed under *Open*).

## Statuses

`PaymentConfirmStatus`: `PENDING_CONFIRMATION` → `CONFIRMED` (who, when) or `REJECTED` (who, when,
reason). Each row also records who **collected** it (`collectedByUserId`; B2B receipts already had
`collectedById`) and who recorded it (`userId` / `createdByUserId`).

New `SalesOrderPayment` and `B2bReceipt` rows start `PENDING_CONFIRMATION` (column default).
`CustomerAccountLedger` defaults to `CONFIRMED`, because sale credits and adjustments need no
confirmation; collections are written `PENDING_CONFIRMATION` explicitly.

## Who can confirm

New permission module **`paymentConfirm`**: *view* = the queue, *edit* = confirm / reject.
Defaults: Top admin, Supervisor (and legacy Manager) all; **Accountant view + edit**; Sales, B2B
staff, Driver, Cashier none.

**Rule: whoever collected or recorded a payment cannot confirm or reject it** (403
`PAYMENT_SELF_CONFIRM`), except the top admin. A second accountant, the supervisor or the admin
decides instead. Every decision takes the row `version` (428 without, 409 stale) and is audited
(`PAYMENT_CONFIRM` / `PAYMENT_REJECT`, with amount, method, collector, reason and, for cash, the
till session it was in). Deciding twice → 409 `PAYMENT_ALREADY_DECIDED`; a rejection needs a reason.

## Finance rule: money counts only after confirmation

Only `CONFIRMED` rows are counted in:

- Finance money in (sales-order payments, account collections, by method, bank transfers), the
  profit export and every export built on the finance summary;
- `SalesOrder.amountPaid`, installment `amountPaid` and the order status (`COMPLETED` needs the
  money confirmed); `B2bInvoice.amountPaid` and the invoice / note status (Part paid, Paid);
  `Customer.accountBalance`; the sales-orders and B2B exports' *Paid* column;
- pending payments' *Paid*, and the balances / *Owed*.

Analytics "paid in" (grooming) and the transactions history are revenue figures (till sales,
deliveries, grooming payments); recorded or confirmed collections never appear in them, and the API
test checks they do not change when payments are recorded, confirmed or rejected.

A payment is dated on the day the money was received (`paidAt`, or the ledger date), not on the
day it was confirmed: once confirmed it shows in money in on its own day. Revenue recognition does
not change (sales orders at delivery, till at sale).

**Awaiting confirmation is visible, not counted.** Recorded amounts are kept in
`SalesOrder.amountPending`, `B2bInvoice.amountPending` and `Customer.accountPending` and shown as
*Received, awaiting confirmation*:

- Finance (`paymentConfirmation.awaiting / rejected` in the summary, lines on the Finance screen and
  in the profit export);
- pending payments (`awaiting` per row, `totals.awaitingToUs`, an *Awaiting* column and card; the
  CSV has the column) — so a month end shows open vs awaiting vs confirmed. As-of dates replay
  confirmations and rejections by their dates;
- B2B pending per customer, the invoice detail, sales-order payments, customer ledger (badges).

## Overpayment, allocation, rejection

- **Pending amounts count against the balance**, so the same debt cannot be collected twice:
  sales orders (`total − amountPaid − amountPending`, 400 `SO_OVERPAY`), B2B invoices (400
  `B2B_OVERPAY`), account collections (400 `ACCOUNT_AWAITING_CONFIRMATION` when the whole balance is
  already awaiting; otherwise the collection is capped at the open amount, as before), driver
  collections (400 `DRIVER_COLLECT_OVERPAY`).
- **Installment allocation happens at confirmation** (oldest first, stored on the payment), so
  installments and paid / part-paid statuses only ever show confirmed money.
- **A rejection frees the amount**: it leaves `amountPending` / `accountPending` and can be collected
  again. A rejected payment never reaches `amountPaid`.
- An order or invoice with a payment awaiting confirmation cannot be cancelled and its plan cannot
  change; a driver's edit cannot bring the total below paid + awaiting. A rejected B2B receipt does
  not block cancelling the invoice.

## Cash drawer (decision)

**Physical cash in a drawer is a drawer fact.** The cash-up keeps counting cash collected into an
open till session (account collections and sales-order / B2B cash at that location) while it waits
for confirmation; finance money in waits for the confirmation. So the cash-up stays honest (the
cash is in the drawer) and finance stays consistent (only confirmed money).

- Rejected **while the session is open** → the amount leaves the expected cash (the cash is handed
  back or was never there).
- Rejected **after the cash-up closed** → that closed cash-up is not changed (stored expected cash
  and variance, and the recomputed figures, stay as counted). The audit row carries
  `rejectedAfterCashUpClosed: true` and the session; the queue shows whether a receipt was in an open
  or closed session. The accountant settles the physical cash outside the cash-up.
- Bank transfers never count as drawer cash (unchanged). A driver's cash is at the van's location;
  it is in the van's cash-up only if the van's till session is open at that moment.

## Driver: record payment collected

On an order of the driver's own van (assigned, accepted or delivered): **Record payment collected**
— amount (default: what is left to collect), method cash or bank transfer (**proof file required**
for bank transfer, 400 `PROOF_REQUIRED`), reference, note.
`POST /api/driver/jobs/:id/collect { version, amount, method, reference?, proofFileId?, note? }`
(module `driver.create`; another van → 403). It creates, `PENDING_CONFIRMATION`:

| Order | Record |
|---|---|
| Sales order | a sales-order payment at the van's location, collected by the driver |
| B2B delivery note on an open invoice | a cash receipt on the invoice for that note only (`onlyOrderId`), collected by the driver |
| B2B note not invoiced yet | refused (400 `DRIVER_COLLECT_B2B_NOT_INVOICED`): collected later with a receipt on the invoice |
| Till "for delivery" sale on account / part paid | a customer account collection linked to the sale |
| Till sale paid on delivery | the sale's debt is first put on the customer's account (sale credit, once), then the collection as above |
| Website order | refused: paid online, nothing to collect |
| Home grooming | refused: paid on the van till |

Logged as a `PAYMENT_COLLECTED` dispatch event and audited (`DRIVER_COLLECT`). The driver
dashboard shows *to collect* (open, after awaiting amounts) and *awaiting confirmation*.
Drivers may upload proofs (`driver.create` added to the proof uploaders).

## Accountant queue

`/payment-confirmations` (sidebar *Payment confirmations* with the waiting count; Dashboard card).
Rows: amount, kind, method, proof link (signed), collected by, recorded by, customer, order /
invoice / receipt reference, date, location and cash session, decision. Filters: status (default
awaiting; confirmed, rejected, all), kind, method, collector, dates, search (reference, customer,
invoice). Confirm, or reject with a reason. Own payments show "someone else confirms it".

API: `GET /api/payment-confirmations?status=&kind=&method=&collectedById=&from=&to=&q=&via=driver`,
`GET /api/payment-confirmations/count`, `GET /api/payment-confirmations/:key`,
`POST /api/payment-confirmations/:key/confirm { version }`,
`POST /api/payment-confirmations/:key/reject { version, reason }`. Proof files of collected payments
are readable with `paymentConfirm.view`.

## Van returns: recorded by sales, moved by the driver

| Right (`returns`) | Means | Defaults |
|---|---|---|
| view | see returns, dashboards, photos | Supervisor, Sales, Accountant, Driver, Cashier |
| create | record a return into a van | Supervisor, **Sales**, Cashier (legacy, unchanged); **not Driver** |
| edit | **move to warehouse** (receive) | Supervisor, **Driver (own van only)** |
| refund | pay the customer back | Supervisor, **Sales, Accountant**, Cashier (legacy keeps paying); **not Driver** |

Why `edit` for the move: it is what *receive* always needed, so the vehicle dashboard, the van-bound
scope and the existing receive logic stay one path; paying back moved to its own action (`refund`)
so giving drivers `edit` does not let them pay customers.

- **Sales record the return** from *Van returns* (`/van-returns`, sidebar, needs only returns
  view/create — no vehicle admin rights) or from a vehicle dashboard; they can pick **any van**.
  *Collected by* defaults to the van's driver (an active Driver on that van location). The damaged
  photo rule is unchanged (400 `PHOTO_REQUIRED`).
- **The driver sees the returns in their van** on the driver dashboard (*Returns & damaged*): status,
  lines and damaged photos open at once. **Move to warehouse**: the driver picks the receiving
  location (default: the first warehouse, else the main location) and the existing receive logic
  runs: good lines → RETURN stock movements, damaged lines → damaged stock (HELD), *brought back by*
  and *received by* = the driver (a posted `broughtBackByUserId` is ignored for van staff).
- Another van's driver → **403** (server); drivers creating a return → 403; drivers paying back → 403.
- A data migration (`20261201100200_returns_rights`) applies the same decision to maps already stored
  per role (the old cashier map, copied to DRIVER by fix-ra, let drivers record returns).

## Drivers add customers

*New customer* on the driver dashboard: name, phone, optional address / area (saved together in the
address), notes. `DRIVER` gets `customers.create`. Phone numbers are handled as on the customers
route (not unique; e-mail duplicates refused). The new customer can be picked in returns and orders.
Every new customer is audited (`CUSTOMER_CREATE`, with the creating user and role).

## Data (migrations, additive)

| Migration | What |
|---|---|
| `20261201100000_payment_confirm_enums` | enum `PaymentConfirmStatus`; `DispatchEventType.PAYMENT_COLLECTED` |
| `20261201100100_payment_confirmation` | on `SalesOrderPayment`, `B2bReceipt`, `CustomerAccountLedger`: `version` (+ NFR-13 trigger), `confirmStatus`, `confirmedAt/By`, `rejectedAt/By`, `rejectReason`, `dispatchJobId`, `collectedByUserId` (payments, ledger); `SalesOrder.amountPending`, `B2bInvoice.amountPending`, `Customer.accountPending`. **Backfill:** every existing row `CONFIRMED`, `confirmedAt = createdAt`, `confirmedBy` empty (shown as "migrated"), so history does not change |
| `20261201100200_returns_rights` | stored role maps: the van-return / customer rights above |

## Demo

Van returns are recorded by the sales user, moved to the warehouse by the van drivers and paid back by
sales. Sales-order payments (recorded by the owner) are confirmed by the accountant, B2B receipts
(recorded by the accountant) by the supervisor; one duplicate sales-order payment is rejected.
Awaiting confirmation: a B2B cash receipt collected by van driver 1, van 1's cash on delivery for a
till sale paid on delivery, and a customer account collection by bank transfer.
Load → remove restores all 103 tables exactly.

## Tests (scratchpad `tests/fix-rd/`)

- `api-test.cjs` **164/164**: permission defaults per role; sales record into any van, driver sees,
  moves (stock, RETURN movement, damaged stock, brought back / received by), other van 403, driver
  create / pay 403; driver adds a customer (audit, phone duplicate, opening balance refused); driver
  collections (proof required, 428, overpay incl. pending, SO / till paid-on-delivery / B2B invoice,
  event + audit, other van 403); queue access (Sales / Driver / B2B 403), filters, proof link, count;
  self-confirm / self-reject refused; 428 / 409; confirm effects (allocation, amountPaid, COMPLETED,
  invoice PART_PAID); reject (reason, freed, collect again); finance / exports / history / analytics
  against DB sums with the status filter; pending payments awaiting (and after confirmation);
  overpayment on SO / B2B / accounts; cash-up open vs closed rejection.
- `migration-test-rd.sh` **14/14**: backfill, defaults, stored-map rights move, enum, trigger.
- `ui-test.cjs` **104/104** (Playwright): 1280 EN sales record a return → 390 EN driver moves it;
  390 AR driver adds a customer; 390 EN driver records a bank collection with proof → 1280 AR
  accountant confirms in the queue (badge, card, proof) → Finance shows it; reject flow; queue, desk,
  driver tabs at 1280 / 390 × EN / AR (no sideways scroll, RTL, no failed calls).
- Regression (copies in `tests/fix-rd/`): business day 323/323 (unchanged); fix-ra API 202/202, UI
  131/131, migration 12/12; fix-rb API 155/155, UI 106/106; fix-rc API 213/213, browser 129/129;
  fix-so API 150/150, UI 116/116; fix-so/vr API 125/125, browser 76/76; demo load → remove identical;
  client build, `node --check`, `npm run check:errors`.

Adaptations (only where the confirmation rule changes the expectation):
- fix-so API: after the 500 / 220 / 720 / 120 sales-order payments and the 20.00 account collection,
  the top admin confirms them before checking installments, status and money in; fix-so UI: the
  screen payment is confirmed before checking *Paid 180.00*.
- fix-ra API: the three B2B receipts are confirmed before the invoice status / balance / COMPLETED /
  finance checks; the DRIVER defaults check now expects no `returns.create`, `returns.edit` and
  `customers.create`. fix-ra UI: after the first receipt the balance is 387.00 with 100.00 awaiting
  (was 287.00); both receipts are confirmed and the invoice reopened before *Paid*.
- fix-rb API: the admin's sales-order payments are confirmed; the van return is recorded by the
  (legacy cashier) sales user instead of the driver.

## Open

- Van-return pay-outs are not confirmed (see above).
- A driver's collection on a B2B note that is not invoiced yet is refused (the note's money comes in
  on the invoice).
- `customers.create` lets any role with it set *credit approved* on a new customer (pre-existing
  behaviour of the customers route, not changed here).
