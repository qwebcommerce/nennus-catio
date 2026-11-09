-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;
