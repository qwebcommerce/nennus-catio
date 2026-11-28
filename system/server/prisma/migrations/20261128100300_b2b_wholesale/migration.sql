-- fix-ra: B2B / Wholesale (delivery note -> invoice -> cash receipt) on the sales-orders engine.
-- Additive only.
CREATE SEQUENCE IF NOT EXISTS "nc_b2b_dn_ref_seq";
CREATE SEQUENCE IF NOT EXISTS "nc_b2b_invoice_ref_seq";
CREATE SEQUENCE IF NOT EXISTS "nc_b2b_receipt_ref_seq";

-- CreateEnum
CREATE TYPE "SalesOrderType" AS ENUM ('STANDARD', 'B2B');

-- CreateEnum
CREATE TYPE "B2bInvoiceStatus" AS ENUM ('ISSUED', 'PART_PAID', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "dnReference" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "orderType" "SalesOrderType" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "SalesOrderPayment" ADD COLUMN     "receiptId" TEXT;

-- CreateTable
CREATE TABLE "B2bInvoice" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT nc_ref('INV-'::text, 'nc_b2b_invoice_ref_seq'::regclass),
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "paymentTermsDays" INTEGER,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" "B2bInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "note" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT nc_ref('RC-'::text, 'nc_b2b_receipt_ref_seq'::regclass),
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "bankReference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofFileId" TEXT,
    "collectedById" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "B2bInvoice_reference_key" ON "B2bInvoice"("reference");

-- CreateIndex
CREATE INDEX "B2bInvoice_organizationId_status_idx" ON "B2bInvoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "B2bInvoice_customerId_idx" ON "B2bInvoice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "B2bReceipt_reference_key" ON "B2bReceipt"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "B2bReceipt_proofFileId_key" ON "B2bReceipt"("proofFileId");

-- CreateIndex
CREATE INDEX "B2bReceipt_organizationId_paidAt_idx" ON "B2bReceipt"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX "B2bReceipt_invoiceId_idx" ON "B2bReceipt"("invoiceId");

-- CreateIndex
CREATE INDEX "B2bReceipt_customerId_idx" ON "B2bReceipt"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_dnReference_key" ON "SalesOrder"("dnReference");

-- CreateIndex
CREATE INDEX "SalesOrder_invoiceId_idx" ON "SalesOrder"("invoiceId");

-- AddForeignKey
ALTER TABLE "B2bInvoice" ADD CONSTRAINT "B2bInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bInvoice" ADD CONSTRAINT "B2bInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bInvoice" ADD CONSTRAINT "B2bInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "B2bInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BusinessFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "B2bInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "B2bReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NFR-13: the invoice version moves on every write.
DROP TRIGGER IF EXISTS nc_version_b2binvoice ON "B2bInvoice";
CREATE TRIGGER nc_version_b2binvoice BEFORE UPDATE ON "B2bInvoice" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
