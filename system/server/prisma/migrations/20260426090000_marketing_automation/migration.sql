-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('INACTIVE_CUSTOMERS', 'MISSED_APPOINTMENTS');

-- CreateEnum
CREATE TYPE "AutomationChannel" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "channel" "AutomationChannel" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "cooldownDays" INTEGER NOT NULL DEFAULT 14,
    "criteriaJson" JSONB,
    "messageTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "runId" TEXT,
    "customerId" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "channel" "AutomationChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SENT',
    "message" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_active_trigger_idx" ON "AutomationRule"("organizationId", "active", "trigger");

-- CreateIndex
CREATE INDEX "AutomationRun_organizationId_startedAt_idx" ON "AutomationRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_startedAt_idx" ON "AutomationRun"("ruleId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationLog_organizationId_createdAt_idx" ON "AutomationLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationLog_ruleId_customerId_createdAt_idx" ON "AutomationLog"("ruleId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
