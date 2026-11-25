-- Transfer records (StockTransfer + lines, linked StockMovement rows), pieces per carton,
-- van returns (VanReturn, lines, photos) and damaged stock kept out of sale. Additive only.

-- Human references: TR-000123 (transfers), VR-000123 (van returns). nc_ref() comes from 20261117103000.
CREATE SEQUENCE IF NOT EXISTS "nc_transfer_ref_seq";
CREATE SEQUENCE IF NOT EXISTS "nc_van_return_ref_seq";

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('PIECE', 'CARTON', 'KG');

-- CreateEnum
CREATE TYPE "VanReturnStatus" AS ENUM ('IN_VAN', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "VanReturnPayStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "ReturnMoneyMethod" AS ENUM ('CASH', 'BANK', 'CARD');

-- CreateEnum
CREATE TYPE "DamagedStockStatus" AS ENUM ('HELD', 'WRITTEN_OFF', 'SOLD');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "piecesPerCarton" INTEGER;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "piecesPerCarton" INTEGER;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "transferId" TEXT,
ADD COLUMN     "vanReturnId" TEXT;

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT DEFAULT nc_ref('TR-'::text, 'nc_transfer_ref_seq'::regclass),
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "transferredByUserId" TEXT,
    "authorisedByUserId" TEXT,
    "vehicleId" TEXT,
    "vehicleName" TEXT,
    "vehiclePlate" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "unit" "StockUnit" NOT NULL,
    "enteredQty" DECIMAL(12,3) NOT NULL,
    "piecesPerCarton" INTEGER,
    "baseQty" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "lineValue" INTEGER NOT NULL DEFAULT 0,
    "fromBefore" INTEGER NOT NULL,
    "fromAfter" INTEGER NOT NULL,
    "toBefore" INTEGER NOT NULL,
    "toAfter" INTEGER NOT NULL,

CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanReturn" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT DEFAULT nc_ref('VR-'::text, 'nc_van_return_ref_seq'::regclass),
    "status" "VanReturnStatus" NOT NULL DEFAULT 'IN_VAN',
    "vanBranchId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleName" TEXT,
    "vehiclePlate" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "collectedByUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountOwed" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "paymentStatus" "VanReturnPayStatus" NOT NULL DEFAULT 'UNPAID',
    "paidMethod" "ReturnMoneyMethod",
    "paidReference" TEXT,
    "paidByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cashSessionId" TEXT,
    "receivedBranchId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "broughtBackByUserId" TEXT,
    "receivedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "VanReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanReturnLine" (
    "id" TEXT NOT NULL,
    "vanReturnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "unit" "StockUnit" NOT NULL,
    "enteredQty" DECIMAL(12,3) NOT NULL,
    "piecesPerCarton" INTEGER,
    "baseQty" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "photoId" TEXT,
    "unitCost" INTEGER,
    "costAmount" INTEGER,

CONSTRAINT "VanReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanReturnPhoto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vanReturnId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "content" BYTEA,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "VanReturnPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamagedStock" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "vanReturnId" TEXT NOT NULL,
    "vanReturnLineId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "costAmount" INTEGER NOT NULL DEFAULT 0,
    "photoId" TEXT,
    "status" "DamagedStockStatus" NOT NULL DEFAULT 'HELD',
    "saleAmount" INTEGER,
    "saleMethod" "ReturnMoneyMethod",
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "DamagedStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_reference_key" ON "StockTransfer"("reference");

-- CreateIndex
CREATE INDEX "StockTransfer_organizationId_createdAt_idx" ON "StockTransfer"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_fromBranchId_idx" ON "StockTransfer"("fromBranchId");

-- CreateIndex
CREATE INDEX "StockTransfer_toBranchId_idx" ON "StockTransfer"("toBranchId");

-- CreateIndex
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");

-- CreateIndex
CREATE INDEX "StockTransferLine_productId_idx" ON "StockTransferLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "VanReturn_reference_key" ON "VanReturn"("reference");

-- CreateIndex
CREATE INDEX "VanReturn_organizationId_status_idx" ON "VanReturn"("organizationId", "status");

-- CreateIndex
CREATE INDEX "VanReturn_vanBranchId_createdAt_idx" ON "VanReturn"("vanBranchId", "createdAt");

-- CreateIndex
CREATE INDEX "VanReturn_receivedAt_idx" ON "VanReturn"("receivedAt");

-- CreateIndex
CREATE INDEX "VanReturn_paidAt_idx" ON "VanReturn"("paidAt");

-- CreateIndex
CREATE INDEX "VanReturn_cashSessionId_idx" ON "VanReturn"("cashSessionId");

-- CreateIndex
CREATE INDEX "VanReturnLine_vanReturnId_idx" ON "VanReturnLine"("vanReturnId");

-- CreateIndex
CREATE INDEX "VanReturnLine_productId_idx" ON "VanReturnLine"("productId");

-- CreateIndex
CREATE INDEX "VanReturnPhoto_vanReturnId_idx" ON "VanReturnPhoto"("vanReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "DamagedStock_vanReturnLineId_key" ON "DamagedStock"("vanReturnLineId");

-- CreateIndex
CREATE INDEX "DamagedStock_organizationId_status_idx" ON "DamagedStock"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DamagedStock_branchId_idx" ON "DamagedStock"("branchId");

-- CreateIndex
CREATE INDEX "DamagedStock_resolvedAt_idx" ON "DamagedStock"("resolvedAt");

-- CreateIndex
CREATE INDEX "StockMovement_transferId_idx" ON "StockMovement"("transferId");

-- CreateIndex
CREATE INDEX "StockMovement_vanReturnId_idx" ON "StockMovement"("vanReturnId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_vanReturnId_fkey" FOREIGN KEY ("vanReturnId") REFERENCES "VanReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_transferredByUserId_fkey" FOREIGN KEY ("transferredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_authorisedByUserId_fkey" FOREIGN KEY ("authorisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_vanBranchId_fkey" FOREIGN KEY ("vanBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_receivedBranchId_fkey" FOREIGN KEY ("receivedBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_broughtBackByUserId_fkey" FOREIGN KEY ("broughtBackByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturn" ADD CONSTRAINT "VanReturn_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnLine" ADD CONSTRAINT "VanReturnLine_vanReturnId_fkey" FOREIGN KEY ("vanReturnId") REFERENCES "VanReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnLine" ADD CONSTRAINT "VanReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnLine" ADD CONSTRAINT "VanReturnLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnLine" ADD CONSTRAINT "VanReturnLine_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "VanReturnPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnPhoto" ADD CONSTRAINT "VanReturnPhoto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnPhoto" ADD CONSTRAINT "VanReturnPhoto_vanReturnId_fkey" FOREIGN KEY ("vanReturnId") REFERENCES "VanReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_vanReturnId_fkey" FOREIGN KEY ("vanReturnId") REFERENCES "VanReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_vanReturnLineId_fkey" FOREIGN KEY ("vanReturnLineId") REFERENCES "VanReturnLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "VanReturnPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NFR-13: editable records bump their version on any write (function from 20261118101000).
DROP TRIGGER IF EXISTS nc_version_vanreturn ON "VanReturn";
CREATE TRIGGER nc_version_vanreturn BEFORE UPDATE ON "VanReturn" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_damagedstock ON "DamagedStock";
CREATE TRIGGER nc_version_damagedstock BEFORE UPDATE ON "DamagedStock" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();

-- Pieces per carton is a whole number of 2 or more when set.
ALTER TABLE "Product" ADD CONSTRAINT "Product_piecesPerCarton_check" CHECK ("piecesPerCarton" IS NULL OR "piecesPerCarton" >= 2);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_piecesPerCarton_check" CHECK ("piecesPerCarton" IS NULL OR "piecesPerCarton" >= 2);
