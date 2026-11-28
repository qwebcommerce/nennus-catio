-- fix-rd: money collected outside the till drawer (B2B cash receipts, sales-order installments,
-- customer account collections, a driver's cash-on-delivery) waits for the accountant:
-- PENDING_CONFIRMATION -> CONFIRMED (by, at) or REJECTED (by, at, reason). Finance counts only
-- CONFIRMED money. Existing rows are backfilled CONFIRMED (confirmedAt = createdAt, confirmedBy
-- empty = "migrated"), so history does not change. Additive only.

-- Sales-order payments: new rows start PENDING (the column default changes after the backfill).
ALTER TABLE "SalesOrderPayment"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "confirmStatus" "PaymentConfirmStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "collectedByUserId" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectReason" TEXT,
  ADD COLUMN "dispatchJobId" TEXT;
UPDATE "SalesOrderPayment" p SET "confirmedAt" = p."createdAt",
  "collectedByUserId" = COALESCE((SELECT r."collectedById" FROM "B2bReceipt" r WHERE r.id = p."receiptId"), p."userId");
ALTER TABLE "SalesOrderPayment" ALTER COLUMN "confirmStatus" SET DEFAULT 'PENDING_CONFIRMATION';

-- B2B cash receipts: same.
ALTER TABLE "B2bReceipt"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "confirmStatus" "PaymentConfirmStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectReason" TEXT,
  ADD COLUMN "dispatchJobId" TEXT;
UPDATE "B2bReceipt" SET "confirmedAt" = "createdAt";
ALTER TABLE "B2bReceipt" ALTER COLUMN "confirmStatus" SET DEFAULT 'PENDING_CONFIRMATION';

-- Customer account ledger: only PAYMENT entries are confirmed; the default stays CONFIRMED
-- (sale credits and adjustments need no confirmation), collections set PENDING explicitly.
ALTER TABLE "CustomerAccountLedger"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "confirmStatus" "PaymentConfirmStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "collectedByUserId" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectReason" TEXT,
  ADD COLUMN "dispatchJobId" TEXT;
UPDATE "CustomerAccountLedger" SET "confirmedAt" = "createdAt",
  "collectedByUserId" = CASE WHEN "entryType" = 'PAYMENT' THEN "createdByUserId" ELSE NULL END;

-- Pending (not yet confirmed) amounts, kept next to the confirmed ones.
ALTER TABLE "SalesOrder" ADD COLUMN "amountPending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "B2bInvoice" ADD COLUMN "amountPending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "accountPending" INTEGER NOT NULL DEFAULT 0;

-- Foreign keys and indexes.
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "B2bReceipt" ADD CONSTRAINT "B2bReceipt_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountLedger" ADD CONSTRAINT "CustomerAccountLedger_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SalesOrderPayment_confirmStatus_idx" ON "SalesOrderPayment"("confirmStatus");
CREATE INDEX IF NOT EXISTS "B2bReceipt_organizationId_confirmStatus_idx" ON "B2bReceipt"("organizationId", "confirmStatus");
CREATE INDEX IF NOT EXISTS "CustomerAccountLedger_organizationId_confirmStatus_idx" ON "CustomerAccountLedger"("organizationId", "confirmStatus");

-- NFR-13: confirm / reject are versioned edits.
DROP TRIGGER IF EXISTS nc_version_salesorderpayment ON "SalesOrderPayment";
CREATE TRIGGER nc_version_salesorderpayment BEFORE UPDATE ON "SalesOrderPayment" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_b2breceipt ON "B2bReceipt";
CREATE TRIGGER nc_version_b2breceipt BEFORE UPDATE ON "B2bReceipt" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_customeraccountledger ON "CustomerAccountLedger";
CREATE TRIGGER nc_version_customeraccountledger BEFORE UPDATE ON "CustomerAccountLedger" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
