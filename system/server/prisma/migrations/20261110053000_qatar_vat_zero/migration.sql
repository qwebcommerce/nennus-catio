-- Qatar has no VAT. Keep the stored rate at 0 for QAR organizations.
UPDATE "OrganizationTaxSettings"
SET "standardRate" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "currency" = 'QAR' OR "countryCode" = 'QA';
