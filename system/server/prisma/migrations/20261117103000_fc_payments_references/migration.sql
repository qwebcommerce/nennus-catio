-- fc: payment records, payment review on bookings/relocation, human references, booking cancel cutoff.
-- Additive only.

-- Human references (NFR-22): NC-ORD-000123 / NC-GRM-000123 / NC-REL-000123
CREATE SEQUENCE IF NOT EXISTS "nc_order_ref_seq";
CREATE SEQUENCE IF NOT EXISTS "nc_booking_ref_seq";
CREATE SEQUENCE IF NOT EXISTS "nc_relocation_ref_seq";

CREATE OR REPLACE FUNCTION nc_ref(prefix text, seq regclass) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT prefix || lpad(n::text, greatest(6, length(n::text)), '0') FROM (SELECT nextval(seq) AS n) s
$$;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "bookingCancelHours" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "Sale" ADD COLUMN "paymentReviewReason" TEXT,
ADD COLUMN "reference" TEXT;

ALTER TABLE "Appointment" ADD COLUMN "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paymentReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentReviewReason" TEXT,
ADD COLUMN "reference" TEXT;

ALTER TABLE "RelocationRequest" ADD COLUMN "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "paymentReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentReviewReason" TEXT,
ADD COLUMN "reference" TEXT;

-- Backfill references in creation order, then make new rows draw from the sequence.
UPDATE "Sale" s SET "reference" = nc_ref('NC-ORD-', 'nc_order_ref_seq')
FROM (SELECT id FROM "Sale" ORDER BY "createdAt", id) o WHERE s.id = o.id;
UPDATE "Appointment" s SET "reference" = nc_ref('NC-GRM-', 'nc_booking_ref_seq')
FROM (SELECT id FROM "Appointment" ORDER BY "createdAt", id) o WHERE s.id = o.id;
UPDATE "RelocationRequest" s SET "reference" = nc_ref('NC-REL-', 'nc_relocation_ref_seq')
FROM (SELECT id FROM "RelocationRequest" ORDER BY "createdAt", id) o WHERE s.id = o.id;

ALTER TABLE "Sale" ALTER COLUMN "reference" SET DEFAULT nc_ref('NC-ORD-'::text, 'nc_order_ref_seq'::regclass);
ALTER TABLE "Appointment" ALTER COLUMN "reference" SET DEFAULT nc_ref('NC-GRM-'::text, 'nc_booking_ref_seq'::regclass);
ALTER TABLE "RelocationRequest" ALTER COLUMN "reference" SET DEFAULT nc_ref('NC-REL-'::text, 'nc_relocation_ref_seq'::regclass);

CREATE UNIQUE INDEX "Sale_reference_key" ON "Sale"("reference");
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");
CREATE UNIQUE INDEX "RelocationRequest_reference_key" ON "RelocationRequest"("reference");

-- Backfill: existing paid bookings / relocation requests get their captured amount.
UPDATE "Appointment" SET "amountPaid" = "amount", "paidAt" = "updatedAt"
WHERE "paymentReference" IS NOT NULL AND "gatewayPaymentId" IS NOT NULL
  AND "status" IN ('CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'DONE', 'NO_SHOW');
UPDATE "RelocationRequest" SET "amountPaid" = COALESCE("quoteAmount", 0)
WHERE "paidAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "appointmentId" TEXT,
    "relocationRequestId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "reference" TEXT,
    "gatewayPaymentId" TEXT,
    "gatewayRefundId" TEXT,
    "reviewReason" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    -- One payment parent: exactly one of order, booking, relocation quote.
    CONSTRAINT "Payment_one_parent" CHECK (num_nonnulls("saleId", "appointmentId", "relocationRequestId") = 1),
    CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "Payment_kind_valid" CHECK ("kind" IN ('PAYMENT', 'REFUND'))
);

CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");
CREATE INDEX "Payment_relocationRequestId_idx" ON "Payment"("relocationRequestId");
CREATE INDEX "Payment_organizationId_status_idx" ON "Payment"("organizationId", "status");
-- A gateway notification is recorded once per parent, so replays cannot double count.
CREATE UNIQUE INDEX "Payment_gateway_payment_once" ON "Payment"("gatewayPaymentId", "kind") WHERE "gatewayPaymentId" IS NOT NULL AND "kind" = 'PAYMENT';

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_relocationRequestId_fkey" FOREIGN KEY ("relocationRequestId") REFERENCES "RelocationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill Payment rows for money already captured before this table existed,
-- so refunds and replayed notifications see it. A gateway id is kept only once
-- (the first parent that quoted it) to respect the replay guard index.
INSERT INTO "Payment" ("id", "organizationId", "saleId", "kind", "method", "status", "amount", "gatewayPaymentId", "reference", "note", "createdAt")
SELECT 'bf_sale_' || x."id", x."organizationId", x."id", 'PAYMENT', 'ONLINE', 'CAPTURED', x."amountPaid",
       CASE WHEN x.rn = 1 AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."gatewayPaymentId" = x.gid AND p."kind" = 'PAYMENT') THEN x.gid END,
       x."gatewayPaymentId", 'backfill', COALESCE(x."paidAt", x."createdAt")
FROM (
  SELECT s.*, b."organizationId", NULLIF(s."paymentReference", '') AS gid,
         row_number() OVER (PARTITION BY NULLIF(s."paymentReference", '') ORDER BY s."createdAt", s."id") AS rn
  FROM "Sale" s JOIN "Branch" b ON b."id" = s."branchId"
  WHERE s."orderChannel" = 'WEBSITE' AND s."amountPaid" > 0
) x
WHERE NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."saleId" = x."id");

INSERT INTO "Payment" ("id", "organizationId", "appointmentId", "kind", "method", "status", "amount", "gatewayPaymentId", "reference", "note", "createdAt")
SELECT 'bf_apt_' || x."id", x."organizationId", x."id", 'PAYMENT', 'ONLINE', 'CAPTURED', x."amountPaid",
       CASE WHEN x.rn = 1 AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."gatewayPaymentId" = x.gid AND p."kind" = 'PAYMENT') THEN x.gid END,
       x."gatewayPaymentId", 'backfill', COALESCE(x."paidAt", x."createdAt")
FROM (
  SELECT a.*, NULLIF(a."paymentReference", '') AS gid,
         row_number() OVER (PARTITION BY NULLIF(a."paymentReference", '') ORDER BY a."createdAt", a."id") AS rn
  FROM "Appointment" a
  WHERE a."amountPaid" > 0
) x
WHERE NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."appointmentId" = x."id");

INSERT INTO "Payment" ("id", "organizationId", "relocationRequestId", "kind", "method", "status", "amount", "gatewayPaymentId", "note", "createdAt")
SELECT 'bf_rel_' || r."id", r."organizationId", r."id", 'PAYMENT', COALESCE(r."paymentMethod", 'CASH'), 'CAPTURED', r."amountPaid",
       CASE WHEN r."paymentMethod" = 'ONLINE' AND r."gatewayPaymentId" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."gatewayPaymentId" = r."gatewayPaymentId" AND p."kind" = 'PAYMENT')
            THEN r."gatewayPaymentId" END,
       'backfill', COALESCE(r."paidAt", r."createdAt")
FROM "RelocationRequest" r
WHERE r."amountPaid" > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."relocationRequestId" = r."id");
