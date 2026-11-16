-- Till refunds: method, cash session, link to the sale line.
ALTER TABLE "Refund" ADD COLUMN "cashSessionId" TEXT,
ADD COLUMN "method" "PaymentMethod";

ALTER TABLE "RefundItem" ADD COLUMN "saleItemId" TEXT,
ADD COLUMN "variantId" TEXT;

-- Cash-up: card total.
ALTER TABLE "CashSession" ADD COLUMN "cardTotal" DECIMAL(65,30);

CREATE INDEX "Refund_cashSessionId_idx" ON "Refund"("cashSessionId");
CREATE INDEX "RefundItem_saleItemId_idx" ON "RefundItem"("saleItemId");

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NFR-23: data rules in the database.
-- Each check is added NOT VALID (enforced for every new or changed row at once),
-- then validated against existing rows. If an old row breaks a rule, the check
-- stays enforced for new writes and a notice names it, so the deploy does not fail.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('VariantStock', 'VariantStock_quantity_nonneg', 'quantity >= 0'),
    ('VariantStock', 'VariantStock_minStockLevel_nonneg', '"minStockLevel" >= 0'),
    ('Inventory', 'Inventory_quantity_nonneg', 'quantity >= 0'),
    ('Inventory', 'Inventory_minStockLevel_nonneg', '"minStockLevel" >= 0'),
    ('PurchaseOrderLine', 'PurchaseOrderLine_quantity_pos', 'quantity > 0'),
    ('PurchaseOrderLine', 'PurchaseOrderLine_received_range', '"quantityReceived" >= 0 AND "quantityReceived" <= quantity'),
    ('PurchaseOrderLine', 'PurchaseOrderLine_unitCost_nonneg', '"unitCost" >= 0'),
    ('SupplierBill', 'SupplierBill_amount_nonneg', 'amount >= 0 AND "amountPaid" >= 0'),
    ('SupplierBill', 'SupplierBill_paid_le_amount', '"amountPaid" <= amount'),
    ('SupplierPayment', 'SupplierPayment_amount_pos', 'amount > 0'),
    ('Product', 'Product_price_nonneg', 'price >= 0'),
    ('ProductVariant', 'ProductVariant_price_nonneg', 'price >= 0'),
    ('Sale', 'Sale_amounts_nonneg', 'total >= 0 AND "amountPaid" >= 0 AND "amountDue" >= 0 AND "discountAmount" >= 0'),
    ('SaleItem', 'SaleItem_amounts_nonneg', 'quantity > 0 AND subtotal >= 0 AND "unitPrice" >= 0'),
    ('Refund', 'Refund_total_nonneg', 'total >= 0'),
    ('RefundItem', 'RefundItem_amounts_nonneg', 'quantity > 0 AND subtotal >= 0'),
    ('CashSession', 'CashSession_float_nonneg', '"openingFloat" >= 0')
  ) AS t(tbl, name, expr)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.name, c.expr);
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', c.tbl, c.name);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Existing rows in % break %; enforced for new rows only', c.tbl, c.name;
    END;
  END LOOP;
END $$;

-- Purchase order status: only these changes are allowed.
CREATE OR REPLACE FUNCTION purchase_order_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SENT', 'CANCELLED')) OR
    (OLD.status = 'SENT' AND NEW.status IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD.status = 'PARTIALLY_RECEIVED' AND NEW.status = 'RECEIVED')
  ) THEN
    RAISE EXCEPTION 'Purchase order status cannot change from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseOrder_status_guard"
  BEFORE UPDATE OF status ON "PurchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION purchase_order_status_guard();
