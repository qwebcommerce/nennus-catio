-- Password reset, staff-only customer tags, and the cost reversed when goods are returned.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tags" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "resetExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_resetTokenHash_key" ON "Customer"("resetTokenHash");

ALTER TABLE "RefundItem" ADD COLUMN IF NOT EXISTS "costAmount" DECIMAL(65,30);
