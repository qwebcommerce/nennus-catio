-- Analytics and reports (fix-rc): expense payee / receipt number, website registration date,
-- and indexes for the date-range analytics and the transactions history.

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "payee" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "reference" TEXT;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMP(3);
-- Existing website accounts: the record's creation is the best known registration time.
UPDATE "Customer" SET "registeredAt" = "createdAt" WHERE "passwordHash" IS NOT NULL AND "registeredAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Customer_organizationId_registeredAt_idx" ON "Customer"("organizationId", "registeredAt");
CREATE INDEX IF NOT EXISTS "Sale_branchId_createdAt_idx" ON "Sale"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX IF NOT EXISTS "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "Refund_branchId_createdAt_idx" ON "Refund"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesOrderDelivery_deliveredAt_idx" ON "SalesOrderDelivery"("deliveredAt");
CREATE INDEX IF NOT EXISTS "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");
