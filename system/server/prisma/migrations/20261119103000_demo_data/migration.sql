-- Demo data (scripts/demo-data.mjs): every row the demo loader creates is listed here so that
-- `demo-data.mjs remove` deletes exactly those rows and nothing else. Additive table only.
CREATE TABLE IF NOT EXISTS "DemoRecord" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DemoRecord_entityType_entityId_key" ON "DemoRecord"("entityType", "entityId");
