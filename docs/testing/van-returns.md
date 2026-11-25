# Transfer records and van returns

What was added on 25 November 2026, how the money is booked, the screens, the permissions, and how it was tested.

## Stock transfers

Transfers stay one step: stock moves when the transfer is saved. Every transfer now also saves a
**transfer record** (`StockTransfer` and `StockTransferLine`, migration
`20261125100000_transfer_records_van_returns`). It holds:

- a reference (`TR-000123`);
- from and to location;
- who recorded it (the logged-in user);
- who **transferred** it (active staff, default: the user) and who **authorised** it (optional);
- the **vehicle**, with its name and plate copied onto the record. The vehicle defaults to the van's
  vehicle when one end is a van. A later plate change does not rewrite history;
- a note and the time;
- for each line: product, variant, the unit and quantity entered, the quantity in stock units
  (pieces, or grams for weight goods), the source unit cost, the line value, and stock before → after
  at both ends.

The `StockMovement` TRANSFER rows point at the record (`transferId`). Transfers made before this
change have no record and are not shown in the history.

**Units.** Products and variants have an optional *pieces per carton* (a whole number, 2 or more).
It can be set in the product form and in the Excel sheet ("Pieces per carton" column). A variant
without its own value uses the product's. A line can be entered in these units:

- **Piece.** Shown as "Bag" for pack-size variants.
- **Carton.** Only offered when pieces per carton is set. Converted to pieces.
- **kg.** Only for weight goods. Allows up to 3 decimals and is stored as grams.

The screen shows the conversion next to the line, for example "2 cartons = 24 pcs" or
"2.5 kg = 2500 g".

**Values.** Values are not shown on the transfer screens. In the books:

- the destination unit cost is still the weighted average of what was there and what arrived;
- the line value is stock units × source cost;
- for weight goods the line value is grams × cost per kg / 1000, rounded to a whole dirham.

A transfer does not change total stock value. The source location loses exactly what the
destination gains, as long as the destination had no older stock at another cost.

## Van returns

A van return records goods that a van driver collects back from a customer. It is **not** a till
refund. The data is in `VanReturn`, `VanReturnLine`, `VanReturnPhoto`, `VanReturnPaymentProof` and
`DamagedStock`.

**1. Record (status `IN_VAN`).** Each return holds:

- the van, with the vehicle name and plate copied onto it;
- the customer: an existing customer, or a typed name or phone;
- who collected it (default: the user) and the date;
- lines in piece, carton or kg, each marked **Good** or **Damaged**;
- the amount owed to the customer (QAR, can be 0) and a note.

A damaged line needs a photo; the server refuses the return without one (400 `PHOTO_REQUIRED`).
Photos must be real JPEG, PNG or WebP bytes, at most 6 MB. They are re-encoded to WebP with the
metadata removed. They are stored privately: in the Supabase bucket `van-return-photos`, or in the
database when storage is off. They are served only through `GET /api/van-returns/photos/:id`, which
checks the user's permission. **Nothing is added to sellable stock while the return is in the van.**

**2. Receive at the warehouse (status `RECEIVED`).** This is done from the vehicle dashboard. Staff
choose the receiving location (default: the first warehouse) and who brought the goods back; the
person receiving is recorded too. Then:

- **Good lines** go into that location's sellable stock as `RETURN` stock movements, linked to the
  return (`vanReturnId`). They are valued at the location's unit cost, or the product cost if the
  location has none.
- **Damaged lines** become `DamagedStock` rows (status `HELD`) at that location. Each row keeps the
  quantity, cost and photo. Damaged stock is never added to sellable stock.

**3. Damaged stock.** Only the business owner can act on it (`requireOwner`). The owner can:

- **write it off**, which records a loss at cost; or
- **sell it at a reduced price**, recording the amount and the method (cash, card or bank).

Both actions are audited and use the record version, so a stale save gets 409.

**4. Paying the customer back.** A return is **Unpaid** or **Paid**. It can be marked paid when it
is recorded or later. Paid records the method (**Cash** or **Bank transfer**), an optional reference,
who paid and when.

- **Bank transfer needs a proof file** (owner decision). The file must be a JPEG, PNG, WebP or PDF,
  checked by its bytes. Without it the server returns a bilingual 400 `PROOF_REQUIRED`.
- Images are re-encoded to WebP; PDFs are kept as sent. Proofs are stored privately (bucket
  `van-return-proofs`, or the database). They are downloaded through
  `GET /api/van-returns/:id/proof`, with the same permission and van checks as the return.
- For cash, a proof is optional.
- **Cash** paid while the van's till session is open is linked to that session. The van cash-up then
  subtracts it from the expected cash (shown on the Funds screen as "Van returns paid in cash"). This
  works the same way as till refunds.

Every action (record, pay, receive, write-off, sale) writes an audit row with the location.

## Accounting

All van-return amounts are booked on the **Van** channel, at the van's location.

| Event | P&L | Money in / out | Stock value |
|---|---|---|---|
| Recorded (in the van) | nothing | nothing | nothing |
| Received | the amount owed is a **Van refund** ("of which van returns"), dated when received; the cost of **every** returned line (good and damaged) comes **off cost of goods** | – | good lines join the location's stock at cost; damaged lines are counted as held damaged stock at cost (marked "damaged") |
| Paid to the customer | – | **money out** by method: "Van returns paid in cash" / "… by bank transfer", dated when paid | – |
| Damaged written off | its cost goes **back into cost of goods** and is shown as "Damaged stock written off" | – | leaves stock value |
| Damaged sold cheaply | the amount is **Van revenue**, and its cost goes back into cost of goods | **money in** by method | leaves stock value |

Why it is booked this way:

- The revenue is reduced when the goods come back into the business, which is the same moment the
  cost of goods is reversed.
- The cash leaves on the day it is paid. The P&L and the cash book can therefore differ for a few
  days when payment and receipt are not on the same day, just as they do for supplier bills.
- Damaged goods keep their value (the cost reversed at receipt) until the owner decides what to do.
  A write-off then turns that value into a loss; a reduced-price sale turns it into revenue and cost
  of goods. This keeps P&L, stock value and money out consistent at every step.

The finance summary, the transactions list (van returns as `REFUND` rows, damaged sales as `SALE`
rows) and the profit export (CSV / Excel / PDF) all include these lines. Transaction totals equal
the P&L revenue and refunds.

## Screens

- **Transfer** (`/transfer`): has two tabs, **Transfer** and **Transfer history**, under the same
  sidebar entry. To add items:
  - scan a barcode: a USB or Bluetooth scanner types the code and presses Enter. Scanning the same
    code again adds 1;
  - or search and pick a product and variant, then press **Add items**.

  Each line has a unit and a quantity. You also choose who transferred it, who authorised it, the
  vehicle and a note.
- **Transfer history** (`/transfer/history`):
  - filters for date range (Qatar days), from and to location, vehicle, staff member (transferred,
    authorised or recorded) and product;
  - the filters are kept in the address, so a filtered list can be shared;
  - each row shows the reference, time, from → to, vehicle and plate, transferred by, authorised by
    and the number of items;
  - opening a transfer (`/transfer/history/:id`) shows each line in the entered unit and in stock
    units, with stock before → after at both ends;
  - no money is shown.
- **Vehicles → Vehicle dashboard** (`/vehicles/:id`):
  - the van and its plate;
  - stock in the van;
  - recent transfers in and out, with a link to the filtered history;
  - returns, in three tabs: in the van, received, all;
  - payment totals: paid and unpaid, cash and bank;
  - actions: **New return**, **Receive at warehouse**, **Mark paid** (with proof upload for bank);
  - damaged stock from this vehicle.

  It works at phone width (390 px), in English and Arabic.
- **Damaged stock** (`/damaged-stock`): linked from the dashboard and from the Count screen. Only
  the owner sees the write-off and sale actions.
- **Products**: *Pieces per carton* for the product and for each variant, plus the variant barcode.
- **Finance** and **Funds**: the new lines described above.

## Permissions

There is a new module, **`returns`** ("Van returns"), on the Permissions screen:

| Right | Allows | Manager default | Employee (cashier) default |
|---|---|---|---|
| view | see returns, vehicle dashboards, photos, proofs, damaged stock | ✓ | ✓ |
| create | record a return, mark it paid | ✓ | ✓ |
| edit | receive it at the warehouse (and mark paid) | ✓ | – |

- Van drivers are employees (cashier role) assigned to a van location. Staff whose own location is a
  van only see, record and pay returns for **that** van, and only open that van's dashboard and
  vehicle list.
- Writing off or selling damaged stock is **owner only**.
- Transfer history needs warehouses → view, and is limited to the user's own location if they have
  one. Making a transfer still needs warehouses → edit.

## API

- `POST /api/inventory/transfer`
  - body: `transferredByUserId`, `authorisedByUserId`, `vehicleId`, `note`, and
    `items[].unit` / `quantity`;
  - the old body, with quantities in stock units and no `unit`, still works.
- `GET /api/transfers`, `GET /api/transfers/:id`, `GET /api/transfers/lookup?code=`,
  `GET /api/transfers/options`.
- `GET|POST /api/van-returns`, `GET /api/van-returns/:id`, `POST /api/van-returns/:id/pay`,
  `POST /api/van-returns/:id/receive`, `GET /api/van-returns/:id/proof`,
  `GET /api/van-returns/photos/:id`.
- `GET /api/van-returns/vehicles`, `GET /api/van-returns/vehicles/:id/dashboard`,
  `GET /api/van-returns/options`, `GET /api/van-returns/customers?q=`.
- `GET /api/van-returns/damaged`, `POST /api/van-returns/damaged/:id/write-off`,
  `POST /api/van-returns/damaged/:id/sell` (owner only).

Edits (`pay`, `receive`, `write-off`, `sell`) need the record `version`. Without it the server
returns 428; with an older version it returns 409 `STALE_EDIT`.

## Tests

- **API tests (125 checks):**
  - every unit, barcode lookup, and the staff and vehicle on the record;
  - values for weight goods, and stock value per location before and after;
  - each history filter, and stock before / after;
  - returns: the refusal without a photo, a fake image, the other van's driver, receiving (good stock
    up with a RETURN movement; damaged not sellable), paying in cash with the cash-up effect, paying
    by bank with and without a proof;
  - write-off and sale refused for a manager and a cashier;
  - stale edits (409) and edits without a version (428);
  - finance P&L, money in / out, stock value and transactions before and after.
- **Browser tests (Playwright, 76 checks)** at 1280 px and 390 px, in English and Arabic:
  - the Transfer tabs: scan, manual pick, carton and kg;
  - history filters and opening a transfer;
  - on the dashboard: recording a return with a damaged photo, receiving it, and marking it paid by
    bank (refused until a proof is attached);
  - the damaged stock page;
  - no page errors and no sideways scroll.
- **Demo data** loads van returns and transfer records with staff and vehicles; load → remove still
  restores every table exactly.
