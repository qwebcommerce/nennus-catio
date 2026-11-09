-- Cafe/restaurant order fields + product/line modifiers
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "modifiers" JSONB;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "tableNumber" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "orderNote" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "modifiers" JSONB;
