-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('RETAIL', 'WHOLESALE');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "channel" "SaleChannel" NOT NULL DEFAULT 'RETAIL';
