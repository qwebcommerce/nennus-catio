-- Idempotent migration (safe if objects already exist from a partial run)

-- AlterTable
ALTER TABLE "PurchaseItem"
ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InventoryLot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "inventoryId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiryDate" TIMESTAMP(3),
  "quantityReceived" INTEGER NOT NULL,
  "quantityOnHand" INTEGER NOT NULL,
  "unitCost" DECIMAL(65,30),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SaleItemLot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "inventoryLotId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleItemLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryLot_organizationId_branchId_productId_expiryDate_idx"
  ON "InventoryLot"("organizationId", "branchId", "productId", "expiryDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryLot_organizationId_branchId_productId_quantityOnHand_idx"
  ON "InventoryLot"("organizationId", "branchId", "productId", "quantityOnHand");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItemLot_organizationId_saleItemId_idx"
  ON "SaleItemLot"("organizationId", "saleItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItemLot_inventoryLotId_idx"
  ON "SaleItemLot"("inventoryLotId");

-- AddForeignKey (only if constraint missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLot_organizationId_fkey'
  ) THEN
    ALTER TABLE "InventoryLot"
    ADD CONSTRAINT "InventoryLot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLot_productId_fkey'
  ) THEN
    ALTER TABLE "InventoryLot"
    ADD CONSTRAINT "InventoryLot_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLot_branchId_fkey'
  ) THEN
    ALTER TABLE "InventoryLot"
    ADD CONSTRAINT "InventoryLot_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLot_inventoryId_fkey'
  ) THEN
    ALTER TABLE "InventoryLot"
    ADD CONSTRAINT "InventoryLot_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleItemLot_organizationId_fkey'
  ) THEN
    ALTER TABLE "SaleItemLot"
    ADD CONSTRAINT "SaleItemLot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleItemLot_saleItemId_fkey'
  ) THEN
    ALTER TABLE "SaleItemLot"
    ADD CONSTRAINT "SaleItemLot_saleItemId_fkey"
    FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleItemLot_inventoryLotId_fkey'
  ) THEN
    ALTER TABLE "SaleItemLot"
    ADD CONSTRAINT "SaleItemLot_inventoryLotId_fkey"
    FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
