-- AlterTable
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "associateCanAcceptPayment" BOOLEAN NOT NULL DEFAULT true;
