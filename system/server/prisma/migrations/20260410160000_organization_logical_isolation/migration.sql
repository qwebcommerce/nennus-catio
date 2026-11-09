-- عزل منطقي: جدول Organization + organizationId على الجداول ذات الصلة
-- معرّف ثابت للبيانات الموجودة مسبقاً (مؤسسة افتراضية واحدة)

CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT 'seed-org-default', 'Default', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Organization" WHERE "id" = 'seed-org-default');

-- Branch
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Branch" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Branch" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX IF EXISTS "Branch_supabaseId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_organizationId_supabaseId_key" ON "Branch"("organizationId", "supabaseId");
ALTER TABLE "Branch" DROP CONSTRAINT IF EXISTS "Branch_organizationId_fkey";
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User: إزالة فريد البريد العام، إضافة (organizationId, email)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "User" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_organizationId_email_key" ON "User"("organizationId", "email");
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_organizationId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Brand / Category
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Brand" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Brand" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX IF EXISTS "Brand_supabaseId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Brand_organizationId_supabaseId_key" ON "Brand"("organizationId", "supabaseId");
ALTER TABLE "Brand" DROP CONSTRAINT IF EXISTS "Brand_organizationId_fkey";
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Category" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX IF EXISTS "Category_supabaseId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Category_organizationId_supabaseId_key" ON "Category"("organizationId", "supabaseId");
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_organizationId_fkey";
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customer / Supplier
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Customer" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_organizationId_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Supplier" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Supplier" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_organizationId_fkey";
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Product" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "organizationId" SET NOT NULL;
DROP INDEX IF EXISTS "Product_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_organizationId_externalId_key" ON "Product"("organizationId", "externalId");
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_organizationId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SyncSettings: صف واحد لكل مؤسسة
ALTER TABLE "SyncSettings" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "SyncSettings" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
ALTER TABLE "SyncSettings" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "SyncSettings_organizationId_key" ON "SyncSettings"("organizationId");
ALTER TABLE "SyncSettings" DROP CONSTRAINT IF EXISTS "SyncSettings_organizationId_fkey";
ALTER TABLE "SyncSettings" ADD CONSTRAINT "SyncSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OfflineInventoryReceipt (قد تكون مضافة يدوياً)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OfflineInventoryReceipt') THEN
    ALTER TABLE "OfflineInventoryReceipt" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
    UPDATE "OfflineInventoryReceipt" SET "organizationId" = 'seed-org-default' WHERE "organizationId" IS NULL;
    ALTER TABLE "OfflineInventoryReceipt" ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "OfflineInventoryReceipt" DROP CONSTRAINT IF EXISTS "OfflineInventoryReceipt_organizationId_fkey";
    ALTER TABLE "OfflineInventoryReceipt" ADD CONSTRAINT "OfflineInventoryReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
