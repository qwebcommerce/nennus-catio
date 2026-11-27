-- fix-re: generated grooming coupons (docs/testing/coupons.md). Batches of unique codes for
-- grooming packages (percent or QAR amount), each use recorded as a CouponRedemption
-- (HELD -> COMMITTED, or RELEASED). Appointment and Payment keep the code and the discount.
-- Additive only.

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "CouponBatchChannel" AS ENUM ('WEBSITE', 'DESK', 'BOTH');

-- CreateEnum
CREATE TYPE "CouponUseChannel" AS ENUM ('WEBSITE', 'DESK');

-- CreateEnum
CREATE TYPE "CouponUseStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponCodeId" TEXT,
ADD COLUMN     "couponDiscount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CouponBatch" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "prefix" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "percent" INTEGER,
    "amount" INTEGER,
    "allPackages" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "codeCount" INTEGER NOT NULL,
    "usesPerCode" INTEGER NOT NULL DEFAULT 1,
    "onePerCustomer" BOOLEAN NOT NULL DEFAULT false,
    "minAmount" INTEGER,
    "channel" "CouponBatchChannel" NOT NULL DEFAULT 'BOTH',
    "releaseOnPaidCancel" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "CouponBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponBatchPackage" (
    "batchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

CONSTRAINT "CouponBatchPackage_pkey" PRIMARY KEY ("batchId","serviceId")
);

-- CreateTable
CREATE TABLE "CouponCode" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeKey" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "CouponCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "CouponUseChannel" NOT NULL,
    "status" "CouponUseStatus" NOT NULL DEFAULT 'HELD',
    "grossAmount" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "customerKey" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,

CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponBatch_organizationId_createdAt_idx" ON "CouponBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CouponBatchPackage_serviceId_idx" ON "CouponBatchPackage"("serviceId");

-- CreateIndex
CREATE INDEX "CouponCode_batchId_idx" ON "CouponCode"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponCode_organizationId_codeKey_key" ON "CouponCode"("organizationId", "codeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_appointmentId_key" ON "CouponRedemption"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_customerKey_key" ON "CouponRedemption"("customerKey");

-- CreateIndex
CREATE INDEX "CouponRedemption_batchId_status_idx" ON "CouponRedemption"("batchId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_codeId_idx" ON "CouponRedemption"("codeId");

-- CreateIndex
CREATE INDEX "CouponRedemption_organizationId_createdAt_idx" ON "CouponRedemption"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_couponCodeId_fkey" FOREIGN KEY ("couponCodeId") REFERENCES "CouponCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponBatch" ADD CONSTRAINT "CouponBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponBatchPackage" ADD CONSTRAINT "CouponBatchPackage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CouponBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponBatchPackage" ADD CONSTRAINT "CouponBatchPackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GroomingService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CouponBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CouponBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "CouponCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A use can never be given back below zero (release is guarded too).
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_usedCount_check" CHECK ("usedCount" >= 0);

-- NFR-13: batches and codes are versioned edits (disable / enable).
DROP TRIGGER IF EXISTS nc_version_couponbatch ON "CouponBatch";
CREATE TRIGGER nc_version_couponbatch BEFORE UPDATE ON "CouponBatch" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_couponcode ON "CouponCode";
CREATE TRIGGER nc_version_couponcode BEFORE UPDATE ON "CouponCode" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
