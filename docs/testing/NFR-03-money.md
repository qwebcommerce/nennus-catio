# NFR-03 — money in whole dirhams: test notes

Money is stored as integer QAR dirhams (100 dirhams = 1 riyal) since migration
`20261118103000_money_dirhams`. The API still takes and returns riyals: Decimal-shaped
fields come back as strings with two decimals ("12.50"), fields that were numbers stay numbers.

What changed for tests and tools that read the database directly:

- Every money column (see `MONEY_FIELDS` in `system/server/src/lib/moneyFields.js`) holds
  dirhams. SQL that reads or writes them must divide or multiply by 100
  (`select total/100.0 from "Sale"`, `insert ... amount = 10000` for 100.00 QAR).
- `Sale."paymentSplits"` rows hold `amount` in dirhams.
- Exports (CSV, XLSX, PDF) show money with two decimals ("-500.00", not "-500").
- Amount inputs with more than two decimals ("1.005", or float artefacts such as
  0.30000000000000004) are refused with 400 `AMOUNT_INVALID` (or the route's own message),
  never rounded. Split payments must add up to the bill exactly.

Rounding rule for derived amounts: half away from zero to a whole dirham (weight lines,
percentages, part refunds, average unit costs). Spread amounts (order discounts, bundle
discounts, a sale's paid amount over its lines) use largest remainder so the parts add up
exactly; the refund that closes a sale line takes exactly what is left on it.

Migration on existing data: values with more than two decimals are rounded half away from
zero (on the test copy: 45 rows — 4-dp average unit costs and costs of goods, and one
3-dp product price). Check a production copy first with:

```sql
-- rows that will be rounded, and any value too large for an integer column
select count(*) from "SaleItem" where "costAmount" * 100 <> round("costAmount" * 100);
select max(abs(total)) from "Sale";  -- must stay below 21,474,836.47
```
