-- Promotions, business profile, finance costs, credit approval, and vehicles.

DO $$ BEGIN
  CREATE TYPE "PromotionKind" AS ENUM ('PERCENT', 'FIXED', 'PRODUCT', 'CATEGORY', 'BUNDLE', 'BOGO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PromoChannel" AS ENUM ('ALL', 'TILL', 'WEBSITE', 'GROOMING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "publicEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "publicAddress" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "hoursText" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "hoursTextEn" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "alertOrder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "alertBooking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "alertRelocation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "alertLowStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "managerModules" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cashierModules" TEXT;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(65,30);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ar';

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "promotionDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(65,30);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "costAmount" DECIMAL(65,30);

ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "gatewayRefundId" TEXT;

CREATE TABLE IF NOT EXISTS "Promotion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT,
  "kind" "PromotionKind" NOT NULL,
  "code" TEXT,
  "percent" DECIMAL(65,30),
  "amount" DECIMAL(65,30),
  "productId" TEXT,
  "categoryId" TEXT,
  "buyQty" INTEGER,
  "getQty" INTEGER,
  "bundleProductIds" JSONB,
  "bundlePrice" DECIMAL(65,30),
  "minOrderAmount" DECIMAL(65,30),
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "channel" "PromoChannel" NOT NULL DEFAULT 'ALL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Promotion_organizationId_active_idx" ON "Promotion"("organizationId", "active");
DO $$ BEGIN
  ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "branchId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_branchId_key" ON "Vehicle"("branchId");
CREATE INDEX IF NOT EXISTS "Vehicle_organizationId_isActive_idx" ON "Vehicle"("organizationId", "isActive");
DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
