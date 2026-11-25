# Sales orders, payments, free goods, prepayments and freight

Migration `20261126100000_sales_orders_payments` (additive). Money is whole dirhams in the database, riyals in the API.

## Screens

| Screen | Where | What |
|---|---|---|
| Sales orders | `/sales-orders` (Inventory menu) | List (status, overdue, search, CSV); editor (customer, selling location, lines, manager price, free lines, order discount, delivery date, terms, plan of up to 4 installments by % or amount); detail (confirm / cancel, installments with overdue flags, record a payment with method, reference, date and proof, record a full or partial delivery, deliveries, printable invoice). Tabs: Pending payments and Pending stock. |
| Till | `/pos` | **Bank transfer** method with an optional reference. Managers and the owner see a **Free** box on each cart line, **Whole invoice free** and a required reason. Receipts print free lines as "Free". |
| Purchase orders | `/purchase-orders` | Expected date and payment terms on new orders. Each order has a **Payments and documents** panel: paid vs received, quotation / invoice attachments (several, signed download), prepayments (proof required for bank), freight bills. Supplier bills show due date, overdue, freight kind, reference and proof. Tabs: Pending stock, Pending payments (owed by us), Supplier balances. |
| Purchases | `/purchases` | Supplier form: **Freight company** flag and default payment terms (days). |
| Customers | `/customers` | **Business customer** flag and company name. |
| Customer accounts | `/customer-accounts` (tab Pending payments), `/customer-accounts/:id` (payment by bank transfer with reference and proof; the ledger shows method, reference and proof). |
| Finance | `/finance` | P&L adds the B2B / sales orders channel, **Complimentary** and **Freight on goods already sold**; money in shows sales-order payments and bank transfers; money out shows supplier prepayments. Tabs: Pending payments, Pending stock, Supplier balances. New exports: salesorders, pending, pendingstock, supplierbalances (CSV / XLSX / PDF). |
| Dashboard | `/dashboard` | Pending payments card: owed to us, overdue, due this week, owed by us, incoming / outgoing stock lines. Shown with Finance → view. |
| Products | `/products` | Tabs: Pending stock, Pending payments. |
| Funds | `/cash` | The cash-up adds sales-order cash; bank transfers are shown and are not drawer cash. |

## Permissions

New modules, set on the Permissions screen like the others:

- `salesOrders`: view, create (orders, payments, deliveries), edit (change a line's price from the catalogue price), delete (cancel), export. Managers have all by default; cashiers have none.
- `complimentary`: create = give goods free (till lines, whole invoice, sales-order lines). Managers by default; cashiers not. The screen shows only this action. A cashier gets a bilingual 403 `FREE_GOODS_FORBIDDEN`.

Pending payments also list unpaid van returns (money owed back to customers, `docs/testing/van-returns.md`) under owed by us. Pending payments and supplier balances need Finance → view (balances also Purchasing → view). Pending stock needs Warehouses, Purchasing or Sales orders → view. File downloads re-check the right for what the file belongs to: Purchasing for PO attachments and supplier, freight and prepayment proofs, Sales orders for installment proofs, and Finance for customer-account proofs.

## Accounting rules

- **Revenue recognition (sales orders):** revenue and cost are recognised **at delivery**, when the stock leaves the selling location (SALE movement linked to the order). A paid line brings its net value, after its share of the order discount, in proportion to the quantity delivered. The total is exact once the line is fully delivered. Cash is counted in money in when a payment is recorded, by method. An order may be paid before delivery or delivered before payment. It becomes COMPLETED when it is fully delivered and fully paid.
- **Installments:** up to 4; they must add up exactly to the order total. With percents, the last installment takes the rounding remainder. A payment is spread over the installments oldest first. Paying more than the balance is refused. An installment is overdue when its due date has passed and it is not fully paid.
- **Stock:** sales orders do not reserve stock (the hold mechanism is tied to website sales). The detail shows a shortage warning. A delivery is refused (409 `SO_STOCK_SHORT`) rather than taking stock below zero.
- **Complimentary:** free lines have subtotal 0 (no revenue) and keep their cost. That cost is reported as **Complimentary**, its own P&L line, not in cost of goods. Gross profit = revenue − refunds − cost of goods − complimentary − freight on goods already sold. Free lines get no offers and cannot be refunded. A reason is required, and the sale writes a `SALE_COMPLIMENTARY` audit row (sales orders keep the reason in the order audit).
- **Bank transfer:** method `BANK_TRANSFER`. It is grouped with "bank" in money in / out and also shown separately. It is never drawer cash.
- **Prepayments:** a payment to a supplier against a purchase order before the goods arrive. It is a `SupplierPrepayment`, not a `SupplierPayment`. It is applied to the order's goods bills, either at once to an open bill or to the bill raised by the next receipt (`SupplierPrepaymentApplication`). The bill's paid amount includes it, while money out counts the prepayment once, on its own date. A prepayment cannot exceed the unpaid order value. Supplier balance = bills − bill payments − prepayments; a negative balance is a credit.
- **Freight (landed cost):** a freight bill is a `SupplierBill` of kind FREIGHT from a supplier marked as a freight company, linked to a sent purchase order. It has its own balance, due date, reference and document. Its amount is spread over the order lines by line value (exact, largest remainder). Each receipt adds the share for the quantity received to the incoming unit cost, and the weighted average works as before (per kg for weight goods). A freight bill added after receipt adds its share to the unit cost of stock still on hand at the order's location, up to the received quantity. Any share for goods already sold is reported as **Freight on goods already sold** (`freightExpensed`). This is an approximation, because weighted-average stock does not track individual receipts.
- **Bill due dates:** at receipt, the bill is due on the order's due date, or after the order's terms, or after the supplier's default terms, or on the receipt day.

## Proof of payment (owner decision)

A proof file (JPEG, PNG, WebP or PDF, checked by its bytes, at most 10 MB, metadata removed) is **required for every bank transfer**. That covers `BANK_TRANSFER` and supplier `BANK` on supplier-bill payments, freight-bill payments, PO prepayments, sales-order installments and customer-account payments. Without it the server answers 400 `PROOF_REQUIRED` in both languages. Proof is optional for cash, card and other methods. Each proof can be attached to one payment only. Till sales by bank transfer take only an optional reference, with no proof. Files are stored in the private Supabase bucket `business-documents` when it is configured, and in the database otherwise, and are downloaded through a 5-minute signed link bound to the user.

## Tests (fix-so)

The scripts are in the session scratchpad, `tests/fix-so/`: `api-test.cjs` (150 checks), `ui-test.cjs` (116 browser checks, including 1280 / 390 in English and Arabic), and `business-day.cjs` (323/323; two steps adapted: the customer form now has two checkboxes, and a bank bill payment uploads a proof). The demo was loaded, checked with status and removed, and every table was restored exactly (row count + checksum).
