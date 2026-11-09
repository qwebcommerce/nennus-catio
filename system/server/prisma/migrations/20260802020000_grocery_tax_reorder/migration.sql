-- GCC tax settings + sale tax percent snapshot
CREATE TABLE IF NOT EXISTS "OrganizationTaxSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'QA',
  "currency" TEXT NOT NULL DEFAULT 'QAR',
  "standardRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationTaxSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationTaxSettings_organizationId_key"
  ON "OrganizationTaxSettings"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationTaxSettings_organizationId_fkey'
  ) THEN
    ALTER TABLE "OrganizationTaxSettings"
      ADD CONSTRAINT "OrganizationTaxSettings_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "taxPercent" DECIMAL(65,30);

-- Seed tax packs from existing org country (onboarding KYC)
INSERT INTO "OrganizationTaxSettings" ("id", "organizationId", "countryCode", "currency", "standardRate", "pricesIncludeTax", "enabled", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  o."id",
  CASE UPPER(COALESCE(o."country", 'QA'))
    WHEN 'SA' THEN 'SA'
    WHEN 'AE' THEN 'AE'
    WHEN 'KW' THEN 'KW'
    WHEN 'BH' THEN 'BH'
    WHEN 'OM' THEN 'OM'
    ELSE 'QA'
  END,
  CASE UPPER(COALESCE(o."country", 'QA'))
    WHEN 'SA' THEN 'SAR'
    WHEN 'AE' THEN 'AED'
    WHEN 'KW' THEN 'KWD'
    WHEN 'BH' THEN 'BHD'
    WHEN 'OM' THEN 'OMR'
    ELSE 'QAR'
  END,
  CASE UPPER(COALESCE(o."country", 'QA'))
    WHEN 'SA' THEN 15
    WHEN 'AE' THEN 5
    WHEN 'BH' THEN 10
    WHEN 'OM' THEN 5
    ELSE 0
  END,
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrganizationTaxSettings" t WHERE t."organizationId" = o."id"
);
