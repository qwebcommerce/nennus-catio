CREATE TABLE "OrganizationPlanPurchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "reference" TEXT,
    "note" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationPlanPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationPlanPurchase_organizationId_purchasedAt_idx"
ON "OrganizationPlanPurchase"("organizationId", "purchasedAt");

ALTER TABLE "OrganizationPlanPurchase"
ADD CONSTRAINT "OrganizationPlanPurchase_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
