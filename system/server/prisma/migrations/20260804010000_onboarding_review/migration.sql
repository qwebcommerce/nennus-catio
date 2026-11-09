-- Platform onboarding review workflow
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "onboardingReviewStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "onboardingReviewedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "onboardingReviewedBy" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "onboardingReviewNote" TEXT;

CREATE INDEX IF NOT EXISTS "Organization_onboardingReviewStatus_createdAt_idx"
  ON "Organization"("onboardingReviewStatus", "createdAt");

-- Existing live orgs are treated as approved
UPDATE "Organization"
SET "onboardingReviewStatus" = 'APPROVED'
WHERE "profileDocsDone" = true AND "paymentDone" = true
  AND ("onboardingReviewStatus" IS NULL OR "onboardingReviewStatus" = 'NOT_SUBMITTED');

UPDATE "Organization"
SET "onboardingReviewStatus" = 'APPROVED'
WHERE "onboardingReviewStatus" = 'NOT_SUBMITTED'
  AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '1 day';
