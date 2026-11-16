-- FR-76: server-side gateway payment lookups.
CREATE TABLE "GatewayLookup" (
    "id" TEXT NOT NULL,
    "parentKind" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "statusId" INTEGER,
    "outcome" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GatewayLookup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GatewayLookup_gatewayPaymentId_idx" ON "GatewayLookup"("gatewayPaymentId");
CREATE INDEX "GatewayLookup_parentKind_parentId_idx" ON "GatewayLookup"("parentKind", "parentId");
-- The expiry sweep looks each pending gateway payment up once, across all instances.
CREATE UNIQUE INDEX "GatewayLookup_sweep_once" ON "GatewayLookup"("gatewayPaymentId") WHERE "source" = 'sweep';
