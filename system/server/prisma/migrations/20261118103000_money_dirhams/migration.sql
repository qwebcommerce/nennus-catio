-- NFR-03: money is stored as whole QAR dirhams (100 dirhams = 1 riyal) in INTEGER columns,
-- never as floating-point or fractional riyals. Every money column listed in
-- src/lib/moneyFields.js (MONEY_FIELDS) is converted with round(value * 100): values with more
-- than two decimals (old weight lines, 4-dp average unit costs) are rounded half away from zero
-- to the nearest dirham; nothing else changes. Defaults are scaled x100. CHECK constraints that
-- reference the columns are dropped first and recreated with the same meaning
-- (e.g. "amountPaid" <= amount still holds after both sides are scaled by 100).
-- Sale."paymentSplits" (JSON [{ method, amount }]) amounts are converted to dirhams too.
-- Non-money decimals (percentages, tax rate, weights, dimensions, coordinates, points ratio,
-- Coupon.value which is a percent or an amount by kind) are left as they are.
-- Prisma runs this file in one transaction: it applies completely or not at all.
--
-- ===================== MANUAL ROLLBACK (reverse SQL; run in one transaction) =====================
-- BEGIN;
-- ALTER TABLE "SupplierPayment" DROP CONSTRAINT IF EXISTS "SupplierPayment_amount_pos";
-- ALTER TABLE "SupplierBill" DROP CONSTRAINT IF EXISTS "SupplierBill_paid_le_amount";
-- ALTER TABLE "SupplierBill" DROP CONSTRAINT IF EXISTS "SupplierBill_amount_nonneg";
-- ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_amounts_nonneg";
-- ALTER TABLE "RefundItem" DROP CONSTRAINT IF EXISTS "RefundItem_amounts_nonneg";
-- ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_total_nonneg";
-- ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT IF EXISTS "PurchaseOrderLine_unitCost_nonneg";
-- ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_price_nonneg";
-- ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_price_nonneg";
-- ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_amounts_nonneg";
-- ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amount_positive";
-- ALTER TABLE "CashSession" DROP CONSTRAINT IF EXISTS "CashSession_float_nonneg";
-- ALTER TABLE "Organization"
--   ALTER COLUMN "homeVisitFee" DROP DEFAULT,
--   ALTER COLUMN "homeVisitFee" TYPE DECIMAL(65,30) USING ("homeVisitFee"::numeric / 100),
--   ALTER COLUMN "homeVisitFee" SET DEFAULT 0;
-- ALTER TABLE "OrganizationPlanPurchase"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "Expense"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "Employee"
--   ALTER COLUMN "defaultBaseSalary" TYPE DECIMAL(65,30) USING ("defaultBaseSalary"::numeric / 100);
-- ALTER TABLE "PayrollLine"
--   ALTER COLUMN "baseAmount" TYPE DECIMAL(65,30) USING ("baseAmount"::numeric / 100),
--   ALTER COLUMN "allowancesTotal" DROP DEFAULT,
--   ALTER COLUMN "allowancesTotal" TYPE DECIMAL(65,30) USING ("allowancesTotal"::numeric / 100),
--   ALTER COLUMN "allowancesTotal" SET DEFAULT 0,
--   ALTER COLUMN "deductionsTotal" DROP DEFAULT,
--   ALTER COLUMN "deductionsTotal" TYPE DECIMAL(65,30) USING ("deductionsTotal"::numeric / 100),
--   ALTER COLUMN "deductionsTotal" SET DEFAULT 0,
--   ALTER COLUMN "loanDeduction" DROP DEFAULT,
--   ALTER COLUMN "loanDeduction" TYPE DECIMAL(65,30) USING ("loanDeduction"::numeric / 100),
--   ALTER COLUMN "loanDeduction" SET DEFAULT 0,
--   ALTER COLUMN "netAmount" TYPE DECIMAL(65,30) USING ("netAmount"::numeric / 100);
-- ALTER TABLE "EmployeeLoan"
--   ALTER COLUMN "principal" TYPE DECIMAL(65,30) USING ("principal"::numeric / 100),
--   ALTER COLUMN "paidAmount" DROP DEFAULT,
--   ALTER COLUMN "paidAmount" TYPE DECIMAL(65,30) USING ("paidAmount"::numeric / 100),
--   ALTER COLUMN "paidAmount" SET DEFAULT 0;
-- ALTER TABLE "LoanRepayment"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "Customer"
--   ALTER COLUMN "lifetimeSpend" DROP DEFAULT,
--   ALTER COLUMN "lifetimeSpend" TYPE DECIMAL(65,30) USING ("lifetimeSpend"::numeric / 100),
--   ALTER COLUMN "lifetimeSpend" SET DEFAULT 0,
--   ALTER COLUMN "accountBalance" DROP DEFAULT,
--   ALTER COLUMN "accountBalance" TYPE DECIMAL(65,30) USING ("accountBalance"::numeric / 100),
--   ALTER COLUMN "accountBalance" SET DEFAULT 0,
--   ALTER COLUMN "creditLimit" TYPE DECIMAL(65,30) USING ("creditLimit"::numeric / 100);
-- ALTER TABLE "CustomerAccountLedger"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "LoyaltyProgramSettings"
--   ALTER COLUMN "earnEveryAmount" DROP DEFAULT,
--   ALTER COLUMN "earnEveryAmount" TYPE DECIMAL(65,30) USING ("earnEveryAmount"::numeric / 100),
--   ALTER COLUMN "earnEveryAmount" SET DEFAULT 10,
--   ALTER COLUMN "minOrderForEarn" DROP DEFAULT,
--   ALTER COLUMN "minOrderForEarn" TYPE DECIMAL(65,30) USING ("minOrderForEarn"::numeric / 100),
--   ALTER COLUMN "minOrderForEarn" SET DEFAULT 0;
-- ALTER TABLE "Coupon"
--   ALTER COLUMN "minOrderAmount" TYPE DECIMAL(65,30) USING ("minOrderAmount"::numeric / 100),
--   ALTER COLUMN "maxDiscountAmount" TYPE DECIMAL(65,30) USING ("maxDiscountAmount"::numeric / 100);
-- ALTER TABLE "JournalLine"
--   ALTER COLUMN "debit" DROP DEFAULT,
--   ALTER COLUMN "debit" TYPE DECIMAL(65,30) USING ("debit"::numeric / 100),
--   ALTER COLUMN "debit" SET DEFAULT 0,
--   ALTER COLUMN "credit" DROP DEFAULT,
--   ALTER COLUMN "credit" TYPE DECIMAL(65,30) USING ("credit"::numeric / 100),
--   ALTER COLUMN "credit" SET DEFAULT 0;
-- ALTER TABLE "CommissionEntry"
--   ALTER COLUMN "baseAmount" TYPE DECIMAL(65,30) USING ("baseAmount"::numeric / 100),
--   ALTER COLUMN "commissionAmount" TYPE DECIMAL(65,30) USING ("commissionAmount"::numeric / 100);
-- ALTER TABLE "GroomingService"
--   ALTER COLUMN "price" TYPE DECIMAL(65,30) USING ("price"::numeric / 100);
-- ALTER TABLE "Product"
--   ALTER COLUMN "price" TYPE DECIMAL(65,30) USING ("price"::numeric / 100),
--   ALTER COLUMN "wholesalePrice" TYPE DECIMAL(65,30) USING ("wholesalePrice"::numeric / 100),
--   ALTER COLUMN "cost" TYPE DECIMAL(65,30) USING ("cost"::numeric / 100),
--   ALTER COLUMN "houseDeliveryFee" DROP DEFAULT,
--   ALTER COLUMN "houseDeliveryFee" TYPE DECIMAL(65,30) USING ("houseDeliveryFee"::numeric / 100),
--   ALTER COLUMN "houseDeliveryFee" SET DEFAULT 0;
-- ALTER TABLE "Inventory"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100);
-- ALTER TABLE "Appointment"
--   ALTER COLUMN "homeFee" DROP DEFAULT,
--   ALTER COLUMN "homeFee" TYPE DECIMAL(65,30) USING ("homeFee"::numeric / 100),
--   ALTER COLUMN "homeFee" SET DEFAULT 0,
--   ALTER COLUMN "amount" DROP DEFAULT,
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100),
--   ALTER COLUMN "amount" SET DEFAULT 0,
--   ALTER COLUMN "amountPaid" DROP DEFAULT,
--   ALTER COLUMN "amountPaid" TYPE DECIMAL(65,30) USING ("amountPaid"::numeric / 100),
--   ALTER COLUMN "amountPaid" SET DEFAULT 0;
-- ALTER TABLE "Sale"
--   ALTER COLUMN "deliveryFee" DROP DEFAULT,
--   ALTER COLUMN "deliveryFee" TYPE DECIMAL(65,30) USING ("deliveryFee"::numeric / 100),
--   ALTER COLUMN "deliveryFee" SET DEFAULT 0,
--   ALTER COLUMN "promotionDiscount" DROP DEFAULT,
--   ALTER COLUMN "promotionDiscount" TYPE DECIMAL(65,30) USING ("promotionDiscount"::numeric / 100),
--   ALTER COLUMN "promotionDiscount" SET DEFAULT 0,
--   ALTER COLUMN "total" TYPE DECIMAL(65,30) USING ("total"::numeric / 100),
--   ALTER COLUMN "discountAmount" DROP DEFAULT,
--   ALTER COLUMN "discountAmount" TYPE DECIMAL(65,30) USING ("discountAmount"::numeric / 100),
--   ALTER COLUMN "discountAmount" SET DEFAULT 0,
--   ALTER COLUMN "taxAmount" DROP DEFAULT,
--   ALTER COLUMN "taxAmount" TYPE DECIMAL(65,30) USING ("taxAmount"::numeric / 100),
--   ALTER COLUMN "taxAmount" SET DEFAULT 0,
--   ALTER COLUMN "couponDiscountAmount" DROP DEFAULT,
--   ALTER COLUMN "couponDiscountAmount" TYPE DECIMAL(65,30) USING ("couponDiscountAmount"::numeric / 100),
--   ALTER COLUMN "couponDiscountAmount" SET DEFAULT 0,
--   ALTER COLUMN "loyaltyDiscountAmount" DROP DEFAULT,
--   ALTER COLUMN "loyaltyDiscountAmount" TYPE DECIMAL(65,30) USING ("loyaltyDiscountAmount"::numeric / 100),
--   ALTER COLUMN "loyaltyDiscountAmount" SET DEFAULT 0,
--   ALTER COLUMN "loyaltyEligibleBase" TYPE DECIMAL(65,30) USING ("loyaltyEligibleBase"::numeric / 100),
--   ALTER COLUMN "amountPaid" DROP DEFAULT,
--   ALTER COLUMN "amountPaid" TYPE DECIMAL(65,30) USING ("amountPaid"::numeric / 100),
--   ALTER COLUMN "amountPaid" SET DEFAULT 0,
--   ALTER COLUMN "amountDue" DROP DEFAULT,
--   ALTER COLUMN "amountDue" TYPE DECIMAL(65,30) USING ("amountDue"::numeric / 100),
--   ALTER COLUMN "amountDue" SET DEFAULT 0;
-- ALTER TABLE "HeldCart"
--   ALTER COLUMN "subtotal" DROP DEFAULT,
--   ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING ("subtotal"::numeric / 100),
--   ALTER COLUMN "subtotal" SET DEFAULT 0;
-- ALTER TABLE "CashSession"
--   ALTER COLUMN "openingFloat" DROP DEFAULT,
--   ALTER COLUMN "openingFloat" TYPE DECIMAL(65,30) USING ("openingFloat"::numeric / 100),
--   ALTER COLUMN "openingFloat" SET DEFAULT 0,
--   ALTER COLUMN "closingCountedCash" TYPE DECIMAL(65,30) USING ("closingCountedCash"::numeric / 100),
--   ALTER COLUMN "expectedCash" TYPE DECIMAL(65,30) USING ("expectedCash"::numeric / 100),
--   ALTER COLUMN "cashVariance" TYPE DECIMAL(65,30) USING ("cashVariance"::numeric / 100),
--   ALTER COLUMN "cardTotal" TYPE DECIMAL(65,30) USING ("cardTotal"::numeric / 100);
-- ALTER TABLE "Refund"
--   ALTER COLUMN "total" TYPE DECIMAL(65,30) USING ("total"::numeric / 100);
-- ALTER TABLE "RefundItem"
--   ALTER COLUMN "unitPrice" TYPE DECIMAL(65,30) USING ("unitPrice"::numeric / 100),
--   ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING ("subtotal"::numeric / 100),
--   ALTER COLUMN "costAmount" TYPE DECIMAL(65,30) USING ("costAmount"::numeric / 100);
-- ALTER TABLE "PurchaseItem"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100),
--   ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING ("subtotal"::numeric / 100);
-- ALTER TABLE "PurchaseDraftItem"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100);
-- ALTER TABLE "PromoDraftItem"
--   ALTER COLUMN "currentPrice" TYPE DECIMAL(65,30) USING ("currentPrice"::numeric / 100),
--   ALTER COLUMN "cost" TYPE DECIMAL(65,30) USING ("cost"::numeric / 100),
--   ALTER COLUMN "suggestedPrice" TYPE DECIMAL(65,30) USING ("suggestedPrice"::numeric / 100),
--   ALTER COLUMN "previousPrice" TYPE DECIMAL(65,30) USING ("previousPrice"::numeric / 100);
-- ALTER TABLE "SaleItem"
--   ALTER COLUMN "unitPrice" TYPE DECIMAL(65,30) USING ("unitPrice"::numeric / 100),
--   ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING ("subtotal"::numeric / 100),
--   ALTER COLUMN "discountAmount" DROP DEFAULT,
--   ALTER COLUMN "discountAmount" TYPE DECIMAL(65,30) USING ("discountAmount"::numeric / 100),
--   ALTER COLUMN "discountAmount" SET DEFAULT 0,
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100),
--   ALTER COLUMN "costAmount" TYPE DECIMAL(65,30) USING ("costAmount"::numeric / 100);
-- ALTER TABLE "InventoryLot"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100);
-- ALTER TABLE "ProductVariant"
--   ALTER COLUMN "price" TYPE DECIMAL(65,30) USING ("price"::numeric / 100);
-- ALTER TABLE "VariantStock"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100);
-- ALTER TABLE "PurchaseOrderLine"
--   ALTER COLUMN "unitCost" TYPE DECIMAL(65,30) USING ("unitCost"::numeric / 100);
-- ALTER TABLE "SupplierBill"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100),
--   ALTER COLUMN "amountPaid" DROP DEFAULT,
--   ALTER COLUMN "amountPaid" TYPE DECIMAL(65,30) USING ("amountPaid"::numeric / 100),
--   ALTER COLUMN "amountPaid" SET DEFAULT 0;
-- ALTER TABLE "SupplierPayment"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "DeliveryArea"
--   ALTER COLUMN "fee" DROP DEFAULT,
--   ALTER COLUMN "fee" TYPE DECIMAL(65,30) USING ("fee"::numeric / 100),
--   ALTER COLUMN "fee" SET DEFAULT 0;
-- ALTER TABLE "RelocationRequest"
--   ALTER COLUMN "quoteAmount" TYPE DECIMAL(65,30) USING ("quoteAmount"::numeric / 100),
--   ALTER COLUMN "amountPaid" DROP DEFAULT,
--   ALTER COLUMN "amountPaid" TYPE DECIMAL(65,30) USING ("amountPaid"::numeric / 100),
--   ALTER COLUMN "amountPaid" SET DEFAULT 0;
-- ALTER TABLE "Promotion"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100),
--   ALTER COLUMN "bundlePrice" TYPE DECIMAL(65,30) USING ("bundlePrice"::numeric / 100),
--   ALTER COLUMN "minOrderAmount" TYPE DECIMAL(65,30) USING ("minOrderAmount"::numeric / 100);
-- ALTER TABLE "Payment"
--   ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING ("amount"::numeric / 100);
-- ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_float_nonneg" CHECK ("openingFloat" >= 0);
-- ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK (amount > 0);
-- ALTER TABLE "Sale" ADD CONSTRAINT "Sale_amounts_nonneg" CHECK (total >= 0 AND "amountPaid" >= 0 AND "amountDue" >= 0 AND "discountAmount" >= 0);
-- ALTER TABLE "Product" ADD CONSTRAINT "Product_price_nonneg" CHECK (price >= 0);
-- ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonneg" CHECK (price >= 0);
-- ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_unitCost_nonneg" CHECK ("unitCost" >= 0);
-- ALTER TABLE "Refund" ADD CONSTRAINT "Refund_total_nonneg" CHECK (total >= 0);
-- ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_amounts_nonneg" CHECK (quantity > 0 AND subtotal >= 0);
-- ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_amounts_nonneg" CHECK (quantity > 0 AND subtotal >= 0 AND "unitPrice" >= 0);
-- ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_amount_nonneg" CHECK (amount >= 0 AND "amountPaid" >= 0);
-- ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_paid_le_amount" CHECK ("amountPaid" <= amount);
-- ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_amount_pos" CHECK (amount > 0) NOT VALID;
-- UPDATE "Sale" SET "paymentSplits" = (
--   SELECT jsonb_agg(CASE
--     WHEN jsonb_typeof(e) = 'object' AND (e->>'amount') ~ '^-?[0-9]+$'
--     THEN jsonb_set(e, '{amount}', to_jsonb(((e->>'amount')::numeric / 100)))
--     ELSE e END ORDER BY o)
--   FROM jsonb_array_elements("paymentSplits") WITH ORDINALITY AS x(e, o))
-- WHERE jsonb_typeof("paymentSplits") = 'array';
-- DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118103000_money_dirhams';
-- COMMIT;
-- (then deploy the previous application build, whose schema.prisma has these columns as Decimal)
-- ================================================================================================

ALTER TABLE "CashSession" DROP CONSTRAINT IF EXISTS "CashSession_float_nonneg";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amount_positive";
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_amounts_nonneg";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_price_nonneg";
ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_price_nonneg";
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT IF EXISTS "PurchaseOrderLine_unitCost_nonneg";
ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_total_nonneg";
ALTER TABLE "RefundItem" DROP CONSTRAINT IF EXISTS "RefundItem_amounts_nonneg";
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_amounts_nonneg";
ALTER TABLE "SupplierBill" DROP CONSTRAINT IF EXISTS "SupplierBill_amount_nonneg";
ALTER TABLE "SupplierBill" DROP CONSTRAINT IF EXISTS "SupplierBill_paid_le_amount";
ALTER TABLE "SupplierPayment" DROP CONSTRAINT IF EXISTS "SupplierPayment_amount_pos";

ALTER TABLE "Organization"
  ALTER COLUMN "homeVisitFee" DROP DEFAULT,
  ALTER COLUMN "homeVisitFee" TYPE INTEGER USING round("homeVisitFee" * 100)::integer,
  ALTER COLUMN "homeVisitFee" SET DEFAULT 0;
ALTER TABLE "OrganizationPlanPurchase"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;
ALTER TABLE "Expense"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;
ALTER TABLE "Employee"
  ALTER COLUMN "defaultBaseSalary" TYPE INTEGER USING round("defaultBaseSalary" * 100)::integer;
ALTER TABLE "PayrollLine"
  ALTER COLUMN "baseAmount" TYPE INTEGER USING round("baseAmount" * 100)::integer,
  ALTER COLUMN "allowancesTotal" DROP DEFAULT,
  ALTER COLUMN "allowancesTotal" TYPE INTEGER USING round("allowancesTotal" * 100)::integer,
  ALTER COLUMN "allowancesTotal" SET DEFAULT 0,
  ALTER COLUMN "deductionsTotal" DROP DEFAULT,
  ALTER COLUMN "deductionsTotal" TYPE INTEGER USING round("deductionsTotal" * 100)::integer,
  ALTER COLUMN "deductionsTotal" SET DEFAULT 0,
  ALTER COLUMN "loanDeduction" DROP DEFAULT,
  ALTER COLUMN "loanDeduction" TYPE INTEGER USING round("loanDeduction" * 100)::integer,
  ALTER COLUMN "loanDeduction" SET DEFAULT 0,
  ALTER COLUMN "netAmount" TYPE INTEGER USING round("netAmount" * 100)::integer;
ALTER TABLE "EmployeeLoan"
  ALTER COLUMN "principal" TYPE INTEGER USING round("principal" * 100)::integer,
  ALTER COLUMN "paidAmount" DROP DEFAULT,
  ALTER COLUMN "paidAmount" TYPE INTEGER USING round("paidAmount" * 100)::integer,
  ALTER COLUMN "paidAmount" SET DEFAULT 0;
ALTER TABLE "LoanRepayment"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;
ALTER TABLE "Customer"
  ALTER COLUMN "lifetimeSpend" DROP DEFAULT,
  ALTER COLUMN "lifetimeSpend" TYPE INTEGER USING round("lifetimeSpend" * 100)::integer,
  ALTER COLUMN "lifetimeSpend" SET DEFAULT 0,
  ALTER COLUMN "accountBalance" DROP DEFAULT,
  ALTER COLUMN "accountBalance" TYPE INTEGER USING round("accountBalance" * 100)::integer,
  ALTER COLUMN "accountBalance" SET DEFAULT 0,
  ALTER COLUMN "creditLimit" TYPE INTEGER USING round("creditLimit" * 100)::integer;
ALTER TABLE "CustomerAccountLedger"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;
ALTER TABLE "LoyaltyProgramSettings"
  ALTER COLUMN "earnEveryAmount" DROP DEFAULT,
  ALTER COLUMN "earnEveryAmount" TYPE INTEGER USING round("earnEveryAmount" * 100)::integer,
  ALTER COLUMN "earnEveryAmount" SET DEFAULT 1000,
  ALTER COLUMN "minOrderForEarn" DROP DEFAULT,
  ALTER COLUMN "minOrderForEarn" TYPE INTEGER USING round("minOrderForEarn" * 100)::integer,
  ALTER COLUMN "minOrderForEarn" SET DEFAULT 0;
ALTER TABLE "Coupon"
  ALTER COLUMN "minOrderAmount" TYPE INTEGER USING round("minOrderAmount" * 100)::integer,
  ALTER COLUMN "maxDiscountAmount" TYPE INTEGER USING round("maxDiscountAmount" * 100)::integer;
ALTER TABLE "JournalLine"
  ALTER COLUMN "debit" DROP DEFAULT,
  ALTER COLUMN "debit" TYPE INTEGER USING round("debit" * 100)::integer,
  ALTER COLUMN "debit" SET DEFAULT 0,
  ALTER COLUMN "credit" DROP DEFAULT,
  ALTER COLUMN "credit" TYPE INTEGER USING round("credit" * 100)::integer,
  ALTER COLUMN "credit" SET DEFAULT 0;
ALTER TABLE "CommissionEntry"
  ALTER COLUMN "baseAmount" TYPE INTEGER USING round("baseAmount" * 100)::integer,
  ALTER COLUMN "commissionAmount" TYPE INTEGER USING round("commissionAmount" * 100)::integer;
ALTER TABLE "GroomingService"
  ALTER COLUMN "price" TYPE INTEGER USING round("price" * 100)::integer;
ALTER TABLE "Product"
  ALTER COLUMN "price" TYPE INTEGER USING round("price" * 100)::integer,
  ALTER COLUMN "wholesalePrice" TYPE INTEGER USING round("wholesalePrice" * 100)::integer,
  ALTER COLUMN "cost" TYPE INTEGER USING round("cost" * 100)::integer,
  ALTER COLUMN "houseDeliveryFee" DROP DEFAULT,
  ALTER COLUMN "houseDeliveryFee" TYPE INTEGER USING round("houseDeliveryFee" * 100)::integer,
  ALTER COLUMN "houseDeliveryFee" SET DEFAULT 0;
ALTER TABLE "Inventory"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer;
ALTER TABLE "Appointment"
  ALTER COLUMN "homeFee" DROP DEFAULT,
  ALTER COLUMN "homeFee" TYPE INTEGER USING round("homeFee" * 100)::integer,
  ALTER COLUMN "homeFee" SET DEFAULT 0,
  ALTER COLUMN "amount" DROP DEFAULT,
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer,
  ALTER COLUMN "amount" SET DEFAULT 0,
  ALTER COLUMN "amountPaid" DROP DEFAULT,
  ALTER COLUMN "amountPaid" TYPE INTEGER USING round("amountPaid" * 100)::integer,
  ALTER COLUMN "amountPaid" SET DEFAULT 0;
ALTER TABLE "Sale"
  ALTER COLUMN "deliveryFee" DROP DEFAULT,
  ALTER COLUMN "deliveryFee" TYPE INTEGER USING round("deliveryFee" * 100)::integer,
  ALTER COLUMN "deliveryFee" SET DEFAULT 0,
  ALTER COLUMN "promotionDiscount" DROP DEFAULT,
  ALTER COLUMN "promotionDiscount" TYPE INTEGER USING round("promotionDiscount" * 100)::integer,
  ALTER COLUMN "promotionDiscount" SET DEFAULT 0,
  ALTER COLUMN "total" TYPE INTEGER USING round("total" * 100)::integer,
  ALTER COLUMN "discountAmount" DROP DEFAULT,
  ALTER COLUMN "discountAmount" TYPE INTEGER USING round("discountAmount" * 100)::integer,
  ALTER COLUMN "discountAmount" SET DEFAULT 0,
  ALTER COLUMN "taxAmount" DROP DEFAULT,
  ALTER COLUMN "taxAmount" TYPE INTEGER USING round("taxAmount" * 100)::integer,
  ALTER COLUMN "taxAmount" SET DEFAULT 0,
  ALTER COLUMN "couponDiscountAmount" DROP DEFAULT,
  ALTER COLUMN "couponDiscountAmount" TYPE INTEGER USING round("couponDiscountAmount" * 100)::integer,
  ALTER COLUMN "couponDiscountAmount" SET DEFAULT 0,
  ALTER COLUMN "loyaltyDiscountAmount" DROP DEFAULT,
  ALTER COLUMN "loyaltyDiscountAmount" TYPE INTEGER USING round("loyaltyDiscountAmount" * 100)::integer,
  ALTER COLUMN "loyaltyDiscountAmount" SET DEFAULT 0,
  ALTER COLUMN "loyaltyEligibleBase" TYPE INTEGER USING round("loyaltyEligibleBase" * 100)::integer,
  ALTER COLUMN "amountPaid" DROP DEFAULT,
  ALTER COLUMN "amountPaid" TYPE INTEGER USING round("amountPaid" * 100)::integer,
  ALTER COLUMN "amountPaid" SET DEFAULT 0,
  ALTER COLUMN "amountDue" DROP DEFAULT,
  ALTER COLUMN "amountDue" TYPE INTEGER USING round("amountDue" * 100)::integer,
  ALTER COLUMN "amountDue" SET DEFAULT 0;
ALTER TABLE "HeldCart"
  ALTER COLUMN "subtotal" DROP DEFAULT,
  ALTER COLUMN "subtotal" TYPE INTEGER USING round("subtotal" * 100)::integer,
  ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "CashSession"
  ALTER COLUMN "openingFloat" DROP DEFAULT,
  ALTER COLUMN "openingFloat" TYPE INTEGER USING round("openingFloat" * 100)::integer,
  ALTER COLUMN "openingFloat" SET DEFAULT 0,
  ALTER COLUMN "closingCountedCash" TYPE INTEGER USING round("closingCountedCash" * 100)::integer,
  ALTER COLUMN "expectedCash" TYPE INTEGER USING round("expectedCash" * 100)::integer,
  ALTER COLUMN "cashVariance" TYPE INTEGER USING round("cashVariance" * 100)::integer,
  ALTER COLUMN "cardTotal" TYPE INTEGER USING round("cardTotal" * 100)::integer;
ALTER TABLE "Refund"
  ALTER COLUMN "total" TYPE INTEGER USING round("total" * 100)::integer;
ALTER TABLE "RefundItem"
  ALTER COLUMN "unitPrice" TYPE INTEGER USING round("unitPrice" * 100)::integer,
  ALTER COLUMN "subtotal" TYPE INTEGER USING round("subtotal" * 100)::integer,
  ALTER COLUMN "costAmount" TYPE INTEGER USING round("costAmount" * 100)::integer;
ALTER TABLE "PurchaseItem"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer,
  ALTER COLUMN "subtotal" TYPE INTEGER USING round("subtotal" * 100)::integer;
ALTER TABLE "PurchaseDraftItem"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer;
ALTER TABLE "PromoDraftItem"
  ALTER COLUMN "currentPrice" TYPE INTEGER USING round("currentPrice" * 100)::integer,
  ALTER COLUMN "cost" TYPE INTEGER USING round("cost" * 100)::integer,
  ALTER COLUMN "suggestedPrice" TYPE INTEGER USING round("suggestedPrice" * 100)::integer,
  ALTER COLUMN "previousPrice" TYPE INTEGER USING round("previousPrice" * 100)::integer;
ALTER TABLE "SaleItem"
  ALTER COLUMN "unitPrice" TYPE INTEGER USING round("unitPrice" * 100)::integer,
  ALTER COLUMN "subtotal" TYPE INTEGER USING round("subtotal" * 100)::integer,
  ALTER COLUMN "discountAmount" DROP DEFAULT,
  ALTER COLUMN "discountAmount" TYPE INTEGER USING round("discountAmount" * 100)::integer,
  ALTER COLUMN "discountAmount" SET DEFAULT 0,
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer,
  ALTER COLUMN "costAmount" TYPE INTEGER USING round("costAmount" * 100)::integer;
ALTER TABLE "InventoryLot"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer;
ALTER TABLE "ProductVariant"
  ALTER COLUMN "price" TYPE INTEGER USING round("price" * 100)::integer;
ALTER TABLE "VariantStock"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer;
ALTER TABLE "PurchaseOrderLine"
  ALTER COLUMN "unitCost" TYPE INTEGER USING round("unitCost" * 100)::integer;
ALTER TABLE "SupplierBill"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer,
  ALTER COLUMN "amountPaid" DROP DEFAULT,
  ALTER COLUMN "amountPaid" TYPE INTEGER USING round("amountPaid" * 100)::integer,
  ALTER COLUMN "amountPaid" SET DEFAULT 0;
ALTER TABLE "SupplierPayment"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;
ALTER TABLE "DeliveryArea"
  ALTER COLUMN "fee" DROP DEFAULT,
  ALTER COLUMN "fee" TYPE INTEGER USING round("fee" * 100)::integer,
  ALTER COLUMN "fee" SET DEFAULT 0;
ALTER TABLE "RelocationRequest"
  ALTER COLUMN "quoteAmount" TYPE INTEGER USING round("quoteAmount" * 100)::integer,
  ALTER COLUMN "amountPaid" DROP DEFAULT,
  ALTER COLUMN "amountPaid" TYPE INTEGER USING round("amountPaid" * 100)::integer,
  ALTER COLUMN "amountPaid" SET DEFAULT 0;
ALTER TABLE "Promotion"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer,
  ALTER COLUMN "bundlePrice" TYPE INTEGER USING round("bundlePrice" * 100)::integer,
  ALTER COLUMN "minOrderAmount" TYPE INTEGER USING round("minOrderAmount" * 100)::integer;
ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount" * 100)::integer;

ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_float_nonneg" CHECK ("openingFloat" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK (amount > 0);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_amounts_nonneg" CHECK (total >= 0 AND "amountPaid" >= 0 AND "amountDue" >= 0 AND "discountAmount" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_nonneg" CHECK (price >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonneg" CHECK (price >= 0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_unitCost_nonneg" CHECK ("unitCost" >= 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_total_nonneg" CHECK (total >= 0);
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_amounts_nonneg" CHECK (quantity > 0 AND subtotal >= 0);
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_amounts_nonneg" CHECK (quantity > 0 AND subtotal >= 0 AND "unitPrice" >= 0);
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_amount_nonneg" CHECK (amount >= 0 AND "amountPaid" >= 0);
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_paid_le_amount" CHECK ("amountPaid" <= amount);
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_amount_pos" CHECK (amount > 0) NOT VALID;

UPDATE "Sale" SET "paymentSplits" = (
  SELECT jsonb_agg(CASE
    WHEN jsonb_typeof(e) = 'object' AND (e->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN jsonb_set(e, '{amount}', to_jsonb(round((e->>'amount')::numeric * 100)::integer))
    ELSE e END ORDER BY o)
  FROM jsonb_array_elements("paymentSplits") WITH ORDINALITY AS x(e, o))
WHERE jsonb_typeof("paymentSplits") = 'array';
