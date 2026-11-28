# Printable documents and "paid / delivered" statuses (fix-rg)

No schema change, no migration. Money is whole dirhams in the database and riyals in the API.

## What the owner asked for

1. Printable documents for purchase orders and sales orders: purchase order, status sheet / goods
   received note, supplier payment voucher, sales-order invoice, payment receipt and delivery note.
2. "Paid but not delivered" and "delivered but not paid" made visible on every order, with list
   filters, and verified end to end.

## Documents

| Document | Where | Endpoint | Right |
|---|---|---|---|
| Purchase order (to send to the supplier) | Purchase orders → order card → **Print purchase order** | `GET /api/documents/purchase-orders/:id` | `purchasing.view` |
| Status sheet / goods received note | order card → **Status sheet / goods received** (sent orders) | same | `purchasing.view` |
| Supplier payment voucher (bill payment `PV-…`, freight payment `FV-…`, prepayment `PP-…`) | **Voucher** next to each prepayment and freight payment (Payments and documents panel) and each payment in the supplier-bills payment history | `GET /api/documents/supplier-vouchers/payment/:id`, `…/prepayment/:id` | `purchasing.view` |
| Sales-order invoice (existing, extended) | Sales order → **View printable invoice** | `GET /api/sales-orders/:id` | `salesOrders.view` |
| Payment receipt `NC-SO-000123-R2` (per installment payment) | Sales order → Payments → **Receipt** | `GET /api/documents/sales-orders/:id/receipts/:paymentId` | `salesOrders.view` |
| Delivery note `NC-SO-000123-D1` (per delivery) | Sales order → Deliveries → **Delivery note** | `GET /api/documents/sales-orders/:id/deliveries/:deliveryId` | `salesOrders.view` |
| Business header (name, address, phone, e-mail, CR, VAT, logo) | top of every document, B2B prints too | `GET /api/documents/business` | any of `purchasing` / `salesOrders` / `b2b` view |

Content:

- **Purchase order**: business header and logo (`/brand/logo.png`; there is no per-business logo
  setting — the "print settings" screen only holds paper sizes), supplier name, phone, e-mail,
  address, *freight company* flag, freight line (billed separately by … / no freight bill), deliver-to
  location, PO reference (`PO` + last 6 characters of the id, as in pending stock and pending
  payments; purchase orders have no reference column), order date, expected delivery, payment terms
  (order terms, else the supplier's: *Net N days from receipt* / *Due on receipt*), payment due date
  (or *after receipt, per terms*), prepared by; lines with item name in the UI language (tick *Names in
  both languages* for "Arabic / English"), SKU, quantity with unit (weight goods in kg, cost per kg),
  unit cost, line total; subtotal, total; note; signature block (prepared by, authorised by,
  signature, stamp).
- **Status sheet / goods received**: status, the payment / receipt badges and a boxed warning when
  one side is ahead ("Note: 500.00 QAR paid to the supplier for goods not received yet" / "70.00 of
  goods received and not paid yet"); per line ordered, received so far, outstanding; each receipt with
  date, value and lines; money: order value, value received, billed, prepaid / deposit, paid, balance
  to pay; goods bills with their payments (voucher numbers), prepayments, freight bills with status and
  payments; received-by / signature / date.
- **Voucher**: voucher number, amount, paid to, method, reference, date and time, paid by, linked
  purchase order, bill (kind, reference, date, amount, balance after this payment) or, for a
  prepayment, how much is already applied; *Proof of payment attached (file name)* or *No proof
  attached*; signature lines (paid by, authorised by, received by supplier).
- **Invoice** (kept, extended): business header, delivered and *to deliver* per line, paid,
  balance, *awaiting confirmation* amount with the rule, and the status badges.
- **Payment receipt**: amount, received from, order, method, reference, date, collected by,
  recorded by, proof attached; confirmation: *Awaiting accountant confirmation — not counted as paid
  until confirmed* / *Confirmed by X, date* / *Rejected: reason — does not reduce the balance*;
  order total, **remaining balance after this payment** (this and earlier non-rejected payments) and,
  while anything is unconfirmed, the confirmed balance now and the amount awaiting.
- **Delivery note**: customer (company, contact, phone, address), order, selling location, date,
  delivered by; per line ordered, delivered now, delivered to date, outstanding after this delivery;
  signature lines for the customer.

B2B delivery notes: the sales-order screen shows *This is a B2B delivery note — its documents are on
the B2B / Wholesale tab* with a link, and no receipt / delivery-note buttons; the document endpoints
answer 400 `DOC_USE_B2B`. The B2B delivery note, invoice and cash receipt prints now use the same
business header (`PrintHeader` → `DocHeader`); nothing else in them changed.

Receipts on a purchase order are rebuilt from existing rows (no new table): each receipt raised one
goods bill in the same transaction, right after its RECEIPT stock movements (note = order id), so a
movement belongs to the first goods bill created at or after it.

### Printing

`window.print()` (the browser's *Save as PDF* gives a PDF). No server PDF: the export helper
(`lib/pdfTable.js`) builds tables only, so a bespoke PDF would not be cheap. One document is open at a
time per screen. While it is open, its ancestors carry `rg-print-path` and the body `rg-doc-open`;
the print CSS removes everything else with `display: none` (no blank pages left by hidden content),
the document starts at the top of the page, A4 named page (`@page rg-a4`, 10 mm margins), at most
190 mm wide and 100 % of a narrower (phone) page; rows, totals and signatures do not split. Works in
RTL; phone numbers stay left-to-right. Translations: `client/src/i18n/translationsRg.js`.

## Payment and delivery shown as two statuses

`lib/orderStatus.js`, on every sales order (`soView`: `paymentState`, `deliveryState`, `awaiting`,
`paidAhead`, `deliveredUnpaid`, `deliveredValue`, `situation`) and purchase order (`statusPair` on the
list):

- Payment: **Unpaid / Partly paid / Paid** — sales orders count only confirmed money; money awaiting
  the accountant is a separate badge (*40.00 awaiting confirmation*) and never makes an order Paid.
  Purchase orders: bill payments + prepayments against the order value.
- Delivery: **Not delivered / Partly delivered / Delivered** (*received* on purchase orders).
- Situation (open orders): **Paid, not delivered** when the money paid is more than the value
  delivered; **Delivered, not paid** when the value delivered is more than the money paid; *In step*
  (partly paid and delivered, neither ahead); *Nothing paid or delivered yet*; *Paid and delivered*.
  Value delivered = revenue recognised at delivery (net of the order discount) for sales orders, value
  received at unit cost for purchase orders. So a 30 % deposit with nothing delivered is "Paid, not
  delivered" (30 % held for goods not delivered), a full delivery with half paid is "Delivered, not
  paid"; the badge shows the amount ("Delivered but not paid: 165.50").

Badges: Sales orders list and detail (and the invoice / receipt), Purchase orders cards and the
status sheet. Filters (both lists): *Situation*, *Payment status* (+ *Awaiting confirmation* on sales
orders), *Delivery / Receipt status*; API `?situation=PAID_NOT_DELIVERED|DELIVERED_NOT_PAID|PARTIAL|OPEN|SETTLED&payment=UNPAID|PART_PAID|PAID|AWAITING&delivery=NOT_DELIVERED|PART_DELIVERED|DELIVERED`
(unknown values ignored; combine with the existing status / overdue / search). Pending stock rows
now carry `paid`, `awaiting` (sales orders) and `situation`, shown as badges in the Paid column.

## Verification of the four combinations (real API calls, `tests/fix-rg/api-test.cjs`)

| Case | Order screens | Pending stock | Pending payments | Finance | Result |
|---|---|---|---|---|---|
| PO prepaid in full, nothing received | Paid / Not received / Paid, not received (500.00) | incoming 10 pcs, Paid | nothing owed by us; supplier balance −500.00 (credit) | prepayment in money out (bank) once | already right |
| PO received, unpaid | Unpaid / Received / Received, not paid (240.00) | no incoming line | supplier bill owed 240.00 | — | already right |
| PO partial mix (two receipts incl. weight goods, part payment, freight) | Partly paid / Partly received / Received, not paid (70.00) | rest incoming | bills owed | bill and freight payments in money out | already right |
| SO paid in full, undelivered | while awaiting: Unpaid + 178.00 awaiting, *not* paid-not-delivered; once confirmed: Paid / Not delivered / Paid, not delivered | outgoing 2 pcs, Paid | nothing owed | money in = confirmed only; no revenue until delivery | already right |
| SO delivered, unpaid | Unpaid / Delivered / Delivered, not paid (76.50) | nothing outgoing | owed 76.50 | revenue at delivery | already right |
| SO partial mix (2 payments, one rejected, 2 deliveries, then 40.00 awaiting) | Partly paid / Partly delivered / Delivered, not paid; awaiting 40.00 | outgoing Part paid, awaiting 40.00 | owed 191.00, awaiting 40.00 | rejected and awaiting not in money in | already right |
| B2B note delivered and invoiced, no receipt | Unpaid / Delivered / Delivered, not paid | — | row with DN and INV numbers, owed 51.00; B2B pending lists the invoice | revenue at delivery | already right |

Finance and pending totals were checked against database sums (confirmed / awaiting / rejected
sales-order payments, prepayments, supplier payments, sales-order revenue, open sales-order balances,
open supplier bills).

### Fixed

- Sales-order detail: the *Record payment* form used the balance, not what can still be collected.
  With a payment awaiting confirmation it pre-filled an amount the server then refused (400
  `SO_OVERPAY`), and it stayed open when the whole balance was already awaiting. It now uses
  `openToCollect` (default amount and maximum).
- Sales-order detail: *Cancel order* was offered while a payment was awaiting confirmation (the server
  refuses it); now hidden then.
- Pending stock did not show money awaiting confirmation or which side is ahead; it does now.

Nothing wrong was found in the server flows of the four combinations.

## Demo data

Already there: PO received not paid (care restock, partly received), PO received part paid (weekly
restock, imported treats with a deposit), SO paid not delivered (SO2), SO delivered not paid (SO3),
partial mix (SO4), B2B note invoiced unpaid. Added (`scripts/demo/documents.mjs`): a purchase order
paid in full in advance by bank transfer with proof, nothing received (expected in 5 days), and a sales
order paid in full whose payment awaits the accountant (shown as awaiting, not paid). Load → status →
remove restores every table exactly (row count + checksum).

## Tests (scratchpad `tests/fix-rg/`)

- `rg/api-test.cjs` — **105/105**: the combinations above with badges' source fields, pending lists,
  supplier balance, finance and pending totals against DB sums; PO and SO filters (each situation,
  payment, delivery, awaiting, combined with search, unknown value ignored); every document's content
  (references, amounts, receipts per line incl. grams, voucher balance after, receipt balance after
  while awaiting / confirmed / rejected, delivery note per delivery); collector cannot confirm;
  permissions (legacy cashier 403, B2B staff header only, accountant PO 200, sales SO 200 / PO 403),
  400 / 404 cases.
- `rg/ui-test.cjs` — **255/255** (Playwright, 1280 and 390, English and Arabic): open each document
  (PO, status sheet paid-not-received and goods received, prepayment and freight vouchers, SO invoice,
  receipt awaiting and confirmed, delivery note) and check reference, amounts and statuses; print
  emulation (`emulateMedia print`): no text outside the document, document at the top, no extra page
  height, no sideways overflow at 390 and at A4 (794 px, ≤ 190 mm); badges and filters on both lists;
  pending stock badges; B2B print with the shared header. Screenshots for the owner:
  `tests/fix-rg/rg/documents/` (`<document>-<en|ar>-<1280-screen|390-screen|390-print|A4-print>.png`).
- Regression (copies in `tests/fix-rg/`, from fix-re): see the report.

## Open

- No per-business logo upload: documents use the app logo (`/brand/logo.png`) and the organisation's
  name / legal name / address / phone / e-mail / CR / VAT from the business profile.
- Purchase orders have no stored reference number; `PO` + 6 characters of the id is used everywhere.
- Supplier payments need no accountant confirmation (unchanged), so purchase orders have no
  *awaiting* state.
