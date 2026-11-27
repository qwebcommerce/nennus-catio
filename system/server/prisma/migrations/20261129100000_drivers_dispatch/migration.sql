-- fix-rb: drivers / van dashboard, dispatch (assigning orders to drivers), driver change requests,
-- vehicle type (delivery / grooming) and a delivery-area zone for grouping.

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('DELIVERY', 'GROOMING');

-- CreateEnum
CREATE TYPE "DispatchKind" AS ENUM ('WEB_ORDER', 'POS_DELIVERY', 'SALES_ORDER', 'GROOMING');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'DECLINED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchEventType" AS ENUM ('ASSIGNED', 'REASSIGNED', 'UNASSIGNED', 'SEEN', 'ACCEPTED', 'DECLINED', 'DELIVERED', 'CLOSED', 'CHANGE_REQUESTED', 'CHANGE_APPROVED', 'CHANGE_REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "DriverChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Roles (fix-ra adds the same values with IF NOT EXISTS, plus SALES and B2B)

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DRIVER';

-- AlterTable
ALTER TABLE "DeliveryArea" ADD COLUMN     "zone" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "type" "VehicleType" NOT NULL DEFAULT 'DELIVERY';

-- CreateTable
CREATE TABLE "DispatchJob" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "kind" "DispatchKind" NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "saleId" TEXT,
    "salesOrderId" TEXT,
    "appointmentId" TEXT,
    "vehicleId" TEXT,
    "driverUserId" TEXT,
    "address" TEXT,
    "areaId" TEXT,
    "deliveryDate" DATE,
    "timeNote" TEXT,
    "note" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "seenAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "DispatchEventType" NOT NULL,
    "userId" TEXT,
    "driverUserId" TEXT,
    "vehicleId" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverChangeRequest" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "DriverChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "reason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "applied" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DispatchJob_saleId_key" ON "DispatchJob"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchJob_salesOrderId_key" ON "DispatchJob"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchJob_appointmentId_key" ON "DispatchJob"("appointmentId");

-- CreateIndex
CREATE INDEX "DispatchJob_organizationId_status_idx" ON "DispatchJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DispatchJob_vehicleId_status_idx" ON "DispatchJob"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "DispatchEvent_jobId_createdAt_idx" ON "DispatchEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverChangeRequest_organizationId_status_idx" ON "DriverChangeRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DriverChangeRequest_jobId_idx" ON "DriverChangeRequest"("jobId");

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchEvent" ADD CONSTRAINT "DispatchEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchEvent" ADD CONSTRAINT "DispatchEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DispatchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchEvent" ADD CONSTRAINT "DispatchEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChangeRequest" ADD CONSTRAINT "DriverChangeRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChangeRequest" ADD CONSTRAINT "DriverChangeRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DispatchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChangeRequest" ADD CONSTRAINT "DriverChangeRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChangeRequest" ADD CONSTRAINT "DriverChangeRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NFR-13: editable records bump their version on every write.
DROP TRIGGER IF EXISTS nc_version_dispatchjob ON "DispatchJob";
CREATE TRIGGER nc_version_dispatchjob BEFORE UPDATE ON "DispatchJob" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_driverchangerequest ON "DriverChangeRequest";
CREATE TRIGGER nc_version_driverchangerequest BEFORE UPDATE ON "DriverChangeRequest" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
