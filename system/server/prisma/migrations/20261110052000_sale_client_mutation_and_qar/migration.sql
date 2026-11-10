-- Offline sale retries store an idempotency key on the sale and refund.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "clientMutationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_clientMutationId_key" ON "Sale"("clientMutationId");

ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "clientMutationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_clientMutationId_key" ON "Refund"("clientMutationId");

-- This store prices in Qatari riyal. Older rows were seeded as SAR.
UPDATE "OrganizationTaxSettings"
SET "currency" = 'QAR',
    "countryCode" = 'QA',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "currency" = 'SAR';
