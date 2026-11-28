# Generated grooming coupons (fix-re)

The client asked for "generating coupons from the system for packages". The owner chose:

- coupons for **grooming packages** only;
- a **discount**: a percentage or a QAR amount;
- no free vouchers and no prepaid gift vouchers.

Staff generate a **batch** of unique codes and hand them out (printed sheet or CSV). Customers
type a code when they book on the website, and staff type it at the desk booking.

The old `Coupon` model (a shared code with usage counts) is still in the schema, but no route uses
it. It was **not** revived: the till's "coupon" field is the shared `Promotion.code`, as before.

## Data (migration `20261202100000_grooming_coupons`, additive)

| Model | What |
|---|---|
| `CouponBatch` | Name (Arabic and English), prefix, `discountType` PERCENT / AMOUNT, `percent` (whole 1–100) or `amount` (dirhams), `allPackages` or the packages in `CouponBatchPackage`, `validFrom` / `validUntil`, `codeCount`, `usesPerCode`, `onePerCustomer`, `minAmount`, `channel` WEBSITE / DESK / BOTH, `releaseOnPaidCancel`, `active`, `version` |
| `CouponBatchPackage` | The batch ↔ grooming package (`GroomingService`) link |
| `CouponCode` | `code` as printed, `codeKey` (upper case, letters and digits only), `maxUses` (copied from the batch), `usedCount`, `active`, `version`. **Unique on (`organizationId`, `codeKey`)**. A CHECK keeps `usedCount ≥ 0` |
| `CouponRedemption` | One use: batch, code, `appointmentId` (unique), customer, `channel` WEBSITE / DESK, `status` HELD / COMMITTED / RELEASED, `grossAmount`, `discount`, `customerKey` (unique, see below), staff user, and the committed, released and reason fields |
| `Appointment` | Adds `couponCodeId`, `couponCode` (the printed code) and `couponDiscount`. `amount` is already **net** of the discount |
| `Payment` | Adds `couponCode` and `couponDiscount` on the gateway payment of a coupon booking (the amount is net) |

Money is whole dirhams (NFR-03). The API speaks riyals. Batches and codes are versioned
(NFR-13 trigger). The money fields are registered in `lib/moneyFields.js`.

## Codes

- The format is `PREFIX-XXXX-XXXX`, or `XXXX-XXXX` without a prefix. The prefix is upper-cased letters and digits, at most 10 characters.
- The 8 random symbols come from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`: 32 symbols, with no 0, O, 1 or I. That gives 40 bits per code.
- Symbols are drawn with `crypto.randomInt`.
- A batch can have 1 to 1000 codes. They are inserted with `createMany … skipDuplicates`. If a code collides with an existing code in the organisation, it is drawn again. The DB unique index is the guarantee.
- Entry is **case-insensitive**. Dashes and spaces are ignored: `groom 7kq4x9pm` matches `GROOM-7KQ4-X9PM`.

## Rules

### Discount and rounding

The coupon discounts the **package price only**, never the home-visit fee.

- **Percent:** price × percent / 100, rounded **half away from zero to a whole dirham** (`lib/money.js` `percentOf`). For example, 15% of 99.99 = 14.9985 → 15.00, so the customer pays 84.99.
- **Amount:** a batch amount above the price of the cheapest chosen package is refused when the batch is generated (for "all packages", the cheapest active package). At booking, the discount is still capped at the package price.
- The discounted price is never below 0.
- A 100% coupon, or an amount equal to the price, gives a free booking. On the website it is confirmed at once, with no gateway.
- The booking `amount` is gross − discount. This is what SkipCash is charged and what the webhook checks.

### Stacking (decision)

**A coupon replaces any automatic grooming promotion. They are never combined, and the system does not pick "the better one".**

- With a valid coupon, no automatic `GROOMING` promotion is applied, even if the promotion would give more.
- This is the recommended rule, and it is simple to explain: a code means exactly the printed discount.
- At the desk there were no automatic promotions before, and there are none now.

### Validation

A code is checked server-side at quote time and again at booking. The checks run in this order, and each failure has its own bilingual code:

| Check | Code |
|---|---|
| the code exists in the organisation | `COUPON_INVALID` |
| the batch and the code are enabled | `COUPON_DISABLED` |
| it is valid now, by Qatar day: from the start of `validFrom`'s day | `COUPON_NOT_STARTED` |
| it is valid now, by Qatar day: until the end of `validUntil`'s day (stored as the next day 00:00 Qatar = 21:00 UTC, exclusive) | `COUPON_EXPIRED` |
| the package matches | `COUPON_WRONG_PACKAGE` (`COUPON_NEEDS_PACKAGE` at the desk without a package) |
| the channel: a website-only code at the desk / a desk-only code on the website | `COUPON_WEBSITE_ONLY` / `COUPON_DESK_ONLY` |
| the minimum: package + home fee ≥ `minAmount` | `COUPON_MIN_AMOUNT` |
| uses are left | `COUPON_USED` |
| one use per customer | `COUPON_CUSTOMER_USED` (desk with no customer chosen: `COUPON_CUSTOMER_REQUIRED`) |

On the website, a typed code that is neither a coupon nor a promotion code is now refused with `COUPON_INVALID`. Before, it was silently ignored.

### Concurrency

A use is claimed **inside the booking transaction**, so a failed slot rolls the use back:

```sql
UPDATE "CouponCode" SET "usedCount" = "usedCount" + 1
WHERE id = $1 AND active AND "usedCount" < "maxUses"
  AND EXISTS (SELECT 1 FROM "CouponBatch" b WHERE b.id = "batchId" AND b.active)
```

- One row updated means the use is taken. Zero rows means `COUPON_USED` (or `COUPON_DISABLED`).
- **One use per customer:** the live use carries `customerKey = "<batch>:<customer>"` under a unique index. A second parallel booking by the same customer fails with `COUPON_CUSTOMER_USED`.
- A release sets `customerKey` to null, so the customer can use the batch again.

### Hold, commit, release

| Event | Use |
|---|---|
| Website booking waiting for payment | **HELD**. The code's use is taken |
| Gateway "paid" (webhook or the server's lookup) for the held booking | **COMMITTED** (in the confirm transaction). The payment row gets `couponCode` / `couponDiscount` |
| Desk booking | **COMMITTED** at once (staff book with the customer) |
| Booking cancelled **before any payment**: hold expired (sweep), gateway failed or cancelled, staff cancel, review refunded, desk booking cancelled | **RELEASED**, exactly once |
| **Paid** booking cancelled (customer or staff) | **kept** (not given back), unless the batch option *Give the use back when a paid booking is cancelled* (`releaseOnPaidCancel`) is on |
| NO_SHOW / DONE | kept |
| Late payment after the hold ended, kept by staff (resolve → accept) | the released use is taken again and COMMITTED. This happens even if the code was used meanwhile; see *Open* |

"Exactly once":

- A release moves the use with a guarded `updateMany(status = current → RELEASED)`.
- Only a move that happened decrements the code (`… AND "usedCount" > 0`).
- The hold sweep (`lib/webOrder.js` `sweepExpiredHolds` → `sweepCouponUses`) re-checks every live use whose booking is cancelled. Running it many times, or in parallel, releases once.
- The release is also called directly on each cancel path: `routes/appointments.js`, `routes/groomingShop.js` and `lib/gatewayNotify.js`.

### Bookkeeping

- **Revenue** is the discounted price.
  - Website: the gateway `Payment` is the net amount, and Finance grooming money in / analytics *paid* sum these rows. So they are net of coupons with no change to `financeData.js`.
  - `Appointment.amount` is net too, so analytics *value done* is net.
- **Desk bookings now carry their price.** A desk booking with a package stores `amount` = package price − coupon discount. Before, it stayed 0.
  - This makes analytics *value done* count desk bookings. That is a small behaviour change, and the regression suites were re-run.
  - Desk grooming money is still not recorded in the system (there is no desk payment step), as before.
- **Finance → Summary** has `couponDiscounts`: the total, the number of uses and a split by batch. It counts the committed uses whose commit time is in the range (a website use commits with its payment, a desk use with the booking). It is empty for a non-grooming channel filter.
  - The Finance screen shows it as an information line under grooming money in. It is not added to money in.
- The batch view and list report these figures:
  - **used** = committed uses;
  - **held** = held uses;
  - **remaining** = uses left on enabled codes of a live batch;
  - **expired** = codes with uses left when the batch has ended;
  - **discount given** = sum of the committed discounts;
  - **booking value** = net value of the bookings behind committed uses, excluding cancelled bookings;
  - **money taken** = grooming payments less refunds on those bookings.
- Audit: `COUPON_BATCH_CREATE`, `COUPON_BATCH_UPDATE`, `COUPON_CODE_UPDATE`, `COUPON_BATCH_EXPORT`, `COUPON_REDEEM` (desk).

## Endpoints

| Method | Path | Right | |
|---|---|---|---|
| GET | `/api/coupons` | promotions view | batches with stats, and totals |
| GET | `/api/coupons/packages` | promotions view | packages to choose from |
| POST | `/api/coupons` | promotions **create** | generate a batch: `{ name, nameEn, prefix, packageIds[] \| allPackages, discountType, percent \| amount, validFrom, validUntil (YYYY-MM-DD Qatar), codeCount, usesPerCode, onePerCustomer, minAmount, channel, releaseOnPaidCancel }` |
| GET | `/api/coupons/:id` | promotions view | batch, stats and every code with its status (UNUSED, PART_USED, HELD, USED, EXPIRED, DISABLED) and uses (customer, booking, when, channel, discount) |
| PATCH | `/api/coupons/:id` | promotions **edit** | `{ active, version }`: disable or enable a batch |
| PATCH | `/api/coupons/codes/:codeId` | promotions **edit** | `{ active, version }`: disable or enable a code |
| GET | `/api/coupons/:id/export` | promotions **export** | CSV (BOM): one line per code, or per use |
| POST | `/api/shop/grooming/quote` | public | `{ packageId, visitKind, code, email? }` → price, home fee, gross, discount, total, coupon / promotion |
| POST | `/api/shop/grooming/book` | public | as before, plus `couponCode` (or the old `code` field: a coupon if it matches one, else a promotion code) |
| POST | `/api/appointments/coupon-quote` | grooming create | desk price check `{ serviceId, couponCode, customerId? }` |
| POST | `/api/appointments` | grooming create | as before, plus `couponCode` |

Default rights are unchanged:

- Supervisors and the top admin have every `promotions` action.
- Sales, accountants, B2B staff and drivers have no `promotions` right. The admin can give a role *view only* (or export) on the Permissions screen. This was tested.
- Desk redemption needs `grooming` create, as booking does.

## Screens

- **Promotions → Grooming coupons** (`/promotions/coupons`; the *Offers* | *Grooming coupons* tabs are on both pages):
  - the new-batch form;
  - batch cards with codes / used / held / remaining / expired, discount and booking value.
- **Batch** (`/promotions/coupons/:id`):
  - figures, disable or enable the batch, Export CSV, Printable sheet;
  - every code, filtered by status or searched, with its uses and disable / enable per code.
- **Printable sheet** (`/promotions/coupons/:id/print`):
  - cards (code, discount, package, valid until, where to use it, single use) or a list;
  - unused codes only by default;
  - *Print* prints only the sheet.
- **Website booking** (`/shop/grooming/:packageId`):
  - a "Coupon or offer code" field with *Apply*, which shows the discounted total before payment and the reason when a code is refused;
  - the customer's booking page shows the coupon line.
- **Desk** (`Appointments.jsx`):
  - a coupon field with *Check coupon* (price − discount = total), sent with the booking;
  - the day list shows each booking's amount and coupon.
- **Finance**: the "Grooming coupon discounts given (info)" line.
- The till's *today's grooming* panel is read-only and takes no grooming payment, so there is nothing to redeem there.

Everything is in English and Arabic (`i18n/translationsRe.js`), and right-to-left layout works. The screens were checked at 390 px with no sideways scroll.

## Demo (`scripts/demo/coupons.mjs`)

**Grooming coupons – November** (`GROOM-…`):

- 20 codes, 15% off the cat packages, website and desk;
- 3 codes used on paid website bookings (2 of them done);
- 1 code used at the desk;
- 1 code held by a website booking that is waiting for payment. The live server's sweep gives it back when the hold ends.

**Summer grooming** (`SUMMER-…`):

- 10 codes, 20.00 QAR off the dog basic package, website only;
- the batch ended last month.

Load followed by remove restores every table exactly: the row count and checksum of each of the 107 tables match. A batch that is not demo data survives.

## Tests (scratchpad `tests/fix-re/`)

- `re-api-test.cjs` (API):
  - generation (count, uniqueness, format, prefix, 1000 codes, DB uniqueness) and the refusals;
  - the dirham maths;
  - every validation reason, bilingual, including the Qatar-day boundary;
  - website booking with SkipCash charged the discounted amount, the webhook confirming without review, the use committed, and the full amount flagged as a mismatch;
  - stacking;
  - hold expiry releasing once (with parallel sweeps), and a late payment kept;
  - gateway failure, staff cancel, paid cancel, and the batch give-back option;
  - desk bookings;
  - concurrency: 10 parallel website bookings → 1; 10 parallel desk bookings → 1; a 3-use code → 3; one customer with 5 parallel codes → 1;
  - one use per customer;
  - disable / enable, with 428 / 409 for a missing or stale version;
  - batch stats and CSV;
  - permissions: view / create / edit / export refusals;
  - Finance and analytics against DB sums;
  - invariants.
- `re-ui-test.cjs` (browser, 1280 / 390 px, English / Arabic):
  - generate a batch from the Promotions tab;
  - the codes, disable / enable, CSV;
  - the printable sheet (cards and list, print);
  - website booking with a coupon through the mock gateway (English 1280 and Arabic 390);
  - desk booking with a coupon;
  - the codes shown as used (website / desk) in the batch view, and the Finance line;
  - layout for every coupon screen at the four sizes;
  - a view-only role.
- Results:

| Suite | Result |
|---|---|
| coupons API (`re-api-test.cjs`) | 165/165 |
| coupons browser (`re-ui-test.cjs`) | 109/109 |
| business day | 323/323 |
| fix-rd API / UI | 164/164, 104/104 |
| fix-ra API / UI | 202/202, 131/131 |
| fix-so API / UI | 150/150, 116/116 |
| fix-so/vr API / browser | 125/125, 76/76 |
| fix-rb API / UI | 155/155, 106/106 |
| fix-rc API / browser (with demo data) | 213/213, 129/129 (one Arabic expenses-history check read 0 rows on the first run; it passed on the re-run) |

- Other checks:
  - demo load → remove: all 107 tables identical (row count + checksum);
  - client build, `node --check` on every server file and `npm run check:errors`: all pass;
  - `prisma migrate diff` shows no new drift.

## Open

- **Late payment after the hold ended:** when staff keep the payment, the use is committed again **even if the single-use code was taken meanwhile**. The customer paid the discounted price, so the count shows it, and the code can end up at 2/1. The alternative (refuse to keep the payment) seemed worse; the owner may decide otherwise.
- **Desk payment:** grooming booked at the desk is still not paid in the system, so desk coupon bookings show the amount due but no money taken. When a desk / till payment step for grooming is added, it should record the payment net of `couponDiscount`.
- **Packages added later:** a batch for "all packages" covers packages added later. The amount check at generation time uses the cheapest package at that moment; the discount is still capped at the price at booking.
- **Brute force:** codes have 40 random bits and the API rate limit applies (500 requests per minute per IP). There is no separate lock-out on wrong codes.
- **Analytics and dashboard:** no coupon figure was added there. Finance has the coupon-discount line, and the batch list has the per-batch report.
