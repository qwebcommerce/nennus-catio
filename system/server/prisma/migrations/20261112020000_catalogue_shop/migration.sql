-- Catalogue variants, purchase orders, customer accounts, and the website shop.

DO $$ BEGIN
  CREATE TYPE "SellBy" AS ENUM ('PIECE', 'WEIGHT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SupplierBillStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SupplierPayMethod" AS ENUM ('CASH', 'BANK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "WebOrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'DELIVERED', 'COLLECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FulfillmentKind" AS ENUM ('DELIVERY', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "StockMoveReason" AS ENUM ('RECEIPT', 'TRANSFER', 'SALE', 'RETURN', 'ADJUSTMENT', 'HOLD_COMMIT', 'CANCEL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "HoldStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "websiteBranchId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "holdMinutes" INTEGER NOT NULL DEFAULT 20;
CREATE INDEX IF NOT EXISTS "Organization_websiteBranchId_idx" ON "Organization"("websiteBranchId");
DO $$ BEGIN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_websiteBranchId_fkey"
    FOREIGN KEY ("websiteBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "verifyTokenHash" TEXT;

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gallery" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sellBy" "SellBy" NOT NULL DEFAULT 'PIECE';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "preferredSupplierId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_preferredSupplierId_fkey"
    FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(65,30);

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "webStatus" "WebOrderStatus";
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "fulfillment" "FulfillmentKind";
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryAreaId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryWindowId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "gatewayPaymentId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3);

ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

CREATE TABLE IF NOT EXISTS "CatalogPetType" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogPetType_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CatalogPetType_organizationId_isActive_idx" ON "CatalogPetType"("organizationId", "isActive");
DO $$ BEGIN
  ALTER TABLE "CatalogPetType" ADD CONSTRAINT "CatalogPetType_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductPetType" (
  "productId" TEXT NOT NULL,
  "petTypeId" TEXT NOT NULL,
  CONSTRAINT "ProductPetType_pkey" PRIMARY KEY ("productId", "petTypeId")
);
DO $$ BEGIN
  ALTER TABLE "ProductPetType" ADD CONSTRAINT "ProductPetType_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductPetType" ADD CONSTRAINT "ProductPetType_petTypeId_fkey"
    FOREIGN KEY ("petTypeId") REFERENCES "CatalogPetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT,
  "barcode" TEXT,
  "label" TEXT NOT NULL,
  "labelEn" TEXT,
  "price" DECIMAL(65,30) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "packWeight" DECIMAL(65,30),
  "preferredSupplierId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_organizationId_sku_key" ON "ProductVariant"("organizationId", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_organizationId_barcode_key" ON "ProductVariant"("organizationId", "barcode");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_preferredSupplierId_fkey"
    FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "VariantStock" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(65,30),
  "minStockLevel" INTEGER NOT NULL DEFAULT 5,
  CONSTRAINT "VariantStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VariantStock_variantId_branchId_key" ON "VariantStock"("variantId", "branchId");
CREATE INDEX IF NOT EXISTS "VariantStock_branchId_idx" ON "VariantStock"("branchId");
DO $$ BEGIN
  ALTER TABLE "VariantStock" ADD CONSTRAINT "VariantStock_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VariantStock" ADD CONSTRAINT "VariantStock_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PurchaseOrder_organizationId_status_idx" ON "PurchaseOrder"("organizationId", "status");
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");
DO $$ BEGIN
  ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DeliveryArea" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT,
  "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "DeliveryArea" ADD CONSTRAINT "DeliveryArea_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DeliveryWindow" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "labelEn" TEXT,
  "weekday" INTEGER,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 4,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryWindow_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_deliveryWindowId_fkey" FOREIGN KEY ("deliveryWindowId") REFERENCES "DeliveryWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SupplierBill" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" "SupplierBillStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierBill_organizationId_supplierId_status_idx" ON "SupplierBill"("organizationId", "supplierId", "status");
DO $$ BEGIN
  ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SupplierPayment" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "method" "SupplierPayMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "note" TEXT,
  CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "branchId" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "reason" "StockMoveReason" NOT NULL,
  "note" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockMovement_organizationId_branchId_createdAt_idx" ON "StockMovement"("organizationId", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_productId_idx" ON "StockMovement"("productId");
DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockHold" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "branchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "windowId" TEXT,
  "status" "HoldStatus" NOT NULL DEFAULT 'HELD',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockHold_saleId_status_idx" ON "StockHold"("saleId", "status");
CREATE INDEX IF NOT EXISTS "StockHold_branchId_productId_status_idx" ON "StockHold"("branchId", "productId", "status");
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "DeliveryWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CustomerPet" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "petTypeId" TEXT,
  "name" TEXT NOT NULL,
  "breed" TEXT,
  "ageText" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerPet_customerId_idx" ON "CustomerPet"("customerId");
DO $$ BEGIN
  ALTER TABLE "CustomerPet" ADD CONSTRAINT "CustomerPet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerPet" ADD CONSTRAINT "CustomerPet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerPet" ADD CONSTRAINT "CustomerPet_petTypeId_fkey" FOREIGN KEY ("petTypeId") REFERENCES "CatalogPetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CustomerAddress" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT,
  "line1" TEXT NOT NULL,
  "area" TEXT,
  "city" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");
DO $$ BEGIN
  ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Customer"
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY "organizationId", lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "Customer_org_email_lower_key"
      ON "Customer" ("organizationId", lower(btrim("email")))
      WHERE "email" IS NOT NULL AND btrim("email") <> '';
  END IF;
END $$;
