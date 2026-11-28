-- Sales orders (installments, deliveries), bank transfer, complimentary goods, supplier
-- prepayments, freight bills (landed cost), payment proofs and PO attachments. Additive only.
-- ALTER TYPE ... ADD VALUE runs here without using the new value in this migration.

-- CreateEnum
CREATE TYPE "SupplierBillKind" AS ENUM ('GOODS', 'FREIGHT');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTLY_DELIVERED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "isBusiness" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CustomerAccountLedger" ADD COLUMN     "proofFileId" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "expectedDate" DATE,
ADD COLUMN     "paymentDueDate" DATE,
ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "freeReason" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "salesOrderId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "isFreight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "SupplierBill" ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "freightAllocation" JSONB,
ADD COLUMN     "freightCapitalised" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freightExpensed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" "SupplierBillKind" NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "proofFileId" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "proofFileId" TEXT,
ADD COLUMN     "reference" TEXT;

-- Sales order references NC-SO-000001 (nc_ref from migration 20261117103000).
CREATE SEQUENCE IF NOT EXISTS "nc_sales_order_ref_seq";

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT nc_ref('NC-SO-'::text, 'nc_sales_order_ref_seq'::regclass),
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "deliveryDate" DATE,
    "note" TEXT,
    "paymentTerms" TEXT,
    "paymentTermsDays" INTEGER,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "deliveredRevenue" INTEGER NOT NULL DEFAULT 0,
    "freeReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "quantityDelivered" INTEGER NOT NULL DEFAULT 0,
    "listPrice" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountShare" INTEGER NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderInstallment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "percent" DECIMAL(7,3),
    "amount" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesOrderInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofFileId" TEXT,
    "allocation" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "complimentaryCost" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderDeliveryLine" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "costAmount" INTEGER NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesOrderDeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrepayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountApplied" INTEGER NOT NULL DEFAULT 0,
    "method" "SupplierPayMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofFileId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPrepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrepaymentApplication" (
    "id" TEXT NOT NULL,
    "prepaymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPrepaymentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA,
    "storagePath" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_reference_key" ON "SalesOrder"("reference");

-- CreateIndex
CREATE INDEX "SalesOrder_organizationId_status_idx" ON "SalesOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_orderId_idx" ON "SalesOrderLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderInstallment_orderId_seq_key" ON "SalesOrderInstallment"("orderId", "seq");

-- CreateIndex
CREATE INDEX "SalesOrderPayment_orderId_idx" ON "SalesOrderPayment"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderDelivery_orderId_idx" ON "SalesOrderDelivery"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderDeliveryLine_deliveryId_idx" ON "SalesOrderDeliveryLine"("deliveryId");

-- CreateIndex
CREATE INDEX "SupplierPrepayment_organizationId_supplierId_idx" ON "SupplierPrepayment"("organizationId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPrepayment_purchaseOrderId_idx" ON "SupplierPrepayment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SupplierPrepaymentApplication_billId_idx" ON "SupplierPrepaymentApplication"("billId");

-- CreateIndex
CREATE INDEX "BusinessFile_organizationId_purpose_idx" ON "BusinessFile"("organizationId", "purpose");

-- CreateIndex
CREATE INDEX "BusinessFile_purchaseOrderId_idx" ON "BusinessFile"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBill" ADD CONSTRAINT "SupplierBill_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderInstallment" ADD CONSTRAINT "SalesOrderInstallment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderDelivery" ADD CONSTRAINT "SalesOrderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderDelivery" ADD CONSTRAINT "SalesOrderDelivery_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderDelivery" ADD CONSTRAINT "SalesOrderDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderDeliveryLine" ADD CONSTRAINT "SalesOrderDeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "SalesOrderDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderDeliveryLine" ADD CONSTRAINT "SalesOrderDeliveryLine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepayment" ADD CONSTRAINT "SupplierPrepayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepayment" ADD CONSTRAINT "SupplierPrepayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepayment" ADD CONSTRAINT "SupplierPrepayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepayment" ADD CONSTRAINT "SupplierPrepayment_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepayment" ADD CONSTRAINT "SupplierPrepayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepaymentApplication" ADD CONSTRAINT "SupplierPrepaymentApplication_prepaymentId_fkey" FOREIGN KEY ("prepaymentId") REFERENCES "SupplierPrepayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrepaymentApplication" ADD CONSTRAINT "SupplierPrepaymentApplication_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFile" ADD CONSTRAINT "BusinessFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFile" ADD CONSTRAINT "BusinessFile_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFile" ADD CONSTRAINT "BusinessFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NFR-13: sales orders are edited by staff; any write bumps the version (function from 20261118101000).
DROP TRIGGER IF EXISTS nc_version_salesorder ON "SalesOrder";
CREATE TRIGGER nc_version_salesorder BEFORE UPDATE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
