-- CreateEnum
CREATE TYPE "LoyaltyEarnBase" AS ENUM ('PER_ORDER_TOTAL', 'LIFETIME_SPEND');

-- CreateEnum
CREATE TYPE "LoyaltyAwardTiming" AS ENUM ('ON_PAYMENT', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "LoyaltyAwardStatus" AS ENUM ('NONE', 'PENDING', 'AWARDED');

-- CreateEnum
CREATE TYPE "LoyaltyLedgerType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'REVERSE');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CouponChannel" AS ENUM ('RETAIL', 'WHOLESALE', 'BOTH');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ON_DELIVERY';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "lifetimeSpend" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoyaltyProgramSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "earnBase" "LoyaltyEarnBase" NOT NULL DEFAULT 'PER_ORDER_TOTAL',
    "earnEveryAmount" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "earnPoints" INTEGER NOT NULL DEFAULT 1,
    "minOrderForEarn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "excludeWholesale" BOOLEAN NOT NULL DEFAULT true,
    "awardTiming" "LoyaltyAwardTiming" NOT NULL DEFAULT 'ON_PAYMENT',
    "redemptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "redeemPointsPerCurrency" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "maxRedemptionPercentOfInvoice" INTEGER NOT NULL DEFAULT 50,
    "allowCouponWithPoints" BOOLEAN NOT NULL DEFAULT true,
    "guestPhoneRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyProgramSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(65,30) NOT NULL,
    "minOrderAmount" DECIMAL(65,30),
    "maxDiscountAmount" DECIMAL(65,30),
    "maxUsesTotal" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channel" "CouponChannel" NOT NULL DEFAULT 'BOTH',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" "LoyaltyLedgerType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgramSettings_organizationId_key" ON "LoyaltyProgramSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_organizationId_code_key" ON "Coupon"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Coupon_organizationId_active_idx" ON "Coupon"("organizationId", "active");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_organizationId_customerId_idx" ON "LoyaltyLedger"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_saleId_idx" ON "LoyaltyLedger"("saleId");

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "couponId" TEXT,
ADD COLUMN "couponDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyPointsEarned" INTEGER,
ADD COLUMN "loyaltyAwardStatus" "LoyaltyAwardStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "loyaltyEligibleBase" DECIMAL(65,30);

-- AddForeignKey
ALTER TABLE "LoyaltyProgramSettings" ADD CONSTRAINT "LoyaltyProgramSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
