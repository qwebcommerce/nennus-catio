-- Organization onboarding + KYC fields + Stripe billing
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "profileDocsDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "paymentDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "addressText" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "crNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "ownerFullName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "ownerIdNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "ownerPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "taxNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "iban" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "authorizedPersonName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "selectedPlanInterval" TEXT;

-- Existing organizations (seed / already live) skip onboarding gates
UPDATE "Organization"
SET
  "profileDocsDone" = true,
  "paymentDone" = true
WHERE "profileDocsDone" = false OR "paymentDone" = false;

CREATE TABLE IF NOT EXISTS "OrganizationDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationDocument_organizationId_docType_key"
  ON "OrganizationDocument"("organizationId", "docType");

CREATE INDEX IF NOT EXISTS "OrganizationDocument_organizationId_idx"
  ON "OrganizationDocument"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationDocument_organizationId_fkey'
  ) THEN
    ALTER TABLE "OrganizationDocument"
      ADD CONSTRAINT "OrganizationDocument_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
