-- CreateEnum (idempotent: يتجنب 42710 إذا وُجد النوع من محاولة سابقة أو تعديل يدوي)
DO $$ BEGIN
  CREATE TYPE "CustomerLedgerEntryType" AS ENUM ('SALE_CREDIT', 'PAYMENT', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum PaymentMethod
DO $$ BEGIN
  ALTER TYPE "PaymentMethod" ADD VALUE 'ON_ACCOUNT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "accountBalance" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "amountDue" DECIMAL(65,30) NOT NULL DEFAULT 0;
UPDATE "Sale" SET "amountPaid" = "total", "amountDue" = 0;

-- CreateTable (idempotent: جدول قد يكون أُنشئ قبل فشل تسجيل الترحيل)
CREATE TABLE IF NOT EXISTS "CustomerAccountLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryType" "CustomerLedgerEntryType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "saleId" TEXT,
    "paymentMethod" "PaymentMethod",
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccountLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerAccountLedger_organizationId_customerId_idx" ON "CustomerAccountLedger"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerAccountLedger_saleId_idx" ON "CustomerAccountLedger"("saleId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
