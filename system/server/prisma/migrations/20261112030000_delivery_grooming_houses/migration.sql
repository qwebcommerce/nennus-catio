-- Delivery seats by day, grooming bookings, pet houses, and relocation.

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';

DO $$ BEGIN
  CREATE TYPE "VisitKind" AS ENUM ('SHOP', 'HOME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "RelocationStatus" AS ENUM ('SUBMITTED', 'DOCUMENTS_REQUESTED', 'DOCUMENTS_RECEIVED', 'UNDER_REVIEW', 'QUOTE_SENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "homeVisitFee" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPetHouse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "houseDeliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "takesStock" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "DeliveryArea" ADD COLUMN IF NOT EXISTS "city" TEXT;

ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "lat" DECIMAL(65,30);
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "lng" DECIMAL(65,30);

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryDate" DATE;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryLat" DECIMAL(65,30);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deliveryLng" DECIMAL(65,30);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "fleetwizReference" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "fleetwizStatus" TEXT;

ALTER TABLE "GroomingService" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "GroomingService" ADD COLUMN IF NOT EXISTS "included" TEXT;
ALTER TABLE "GroomingService" ADD COLUMN IF NOT EXISTS "includedEn" TEXT;

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "breed" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "ageText" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "visitKind" "VisitKind" NOT NULL DEFAULT 'SHOP';
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "areaId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "homeFee" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "gatewayPaymentId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_areaId_fkey"
    FOREIGN KEY ("areaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "GroomingSchedule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroomingSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GroomingSchedule_organizationId_weekday_idx" ON "GroomingSchedule"("organizationId", "weekday");
DO $$ BEGIN
  ALTER TABLE "GroomingSchedule" ADD CONSTRAINT "GroomingSchedule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "GroomingPackagePet" (
  "serviceId" TEXT NOT NULL,
  "petTypeId" TEXT NOT NULL,
  CONSTRAINT "GroomingPackagePet_pkey" PRIMARY KEY ("serviceId", "petTypeId")
);
DO $$ BEGIN
  ALTER TABLE "GroomingPackagePet" ADD CONSTRAINT "GroomingPackagePet_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "GroomingService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GroomingPackagePet" ADD CONSTRAINT "GroomingPackagePet_petTypeId_fkey"
    FOREIGN KEY ("petTypeId") REFERENCES "CatalogPetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RelocationRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "petSummary" TEXT,
  "status" "RelocationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "quoteAmount" DECIMAL(65,30),
  "quoteNote" TEXT,
  "staffNotes" TEXT,
  "history" JSONB,
  "paymentMethod" TEXT,
  "gatewayPaymentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RelocationRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RelocationRequest_organizationId_status_idx" ON "RelocationRequest"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "RelocationRequest_customerId_idx" ON "RelocationRequest"("customerId");
DO $$ BEGIN
  ALTER TABLE "RelocationRequest" ADD CONSTRAINT "RelocationRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RelocationRequest" ADD CONSTRAINT "RelocationRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RelocationPet" (
  "requestId" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  CONSTRAINT "RelocationPet_pkey" PRIMARY KEY ("requestId", "petId")
);
DO $$ BEGIN
  ALTER TABLE "RelocationPet" ADD CONSTRAINT "RelocationPet_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "RelocationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RelocationPet" ADD CONSTRAINT "RelocationPet_petId_fkey"
    FOREIGN KEY ("petId") REFERENCES "CustomerPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RelocationDocument" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RelocationDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RelocationDocument_requestId_idx" ON "RelocationDocument"("requestId");
DO $$ BEGIN
  ALTER TABLE "RelocationDocument" ADD CONSTRAINT "RelocationDocument_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "RelocationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
