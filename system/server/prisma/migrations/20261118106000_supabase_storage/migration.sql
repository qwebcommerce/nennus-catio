-- Supabase Storage for product images and relocation documents (agreement 8.1 / 8.3). Additive only.
ALTER TABLE "ProductImage" ADD COLUMN "storagePath" TEXT;

ALTER TABLE "RelocationDocument" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "RelocationDocument" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "RelocationDocument" ADD COLUMN "size" INTEGER;
-- A document is always somewhere: in the database or in the bucket.
ALTER TABLE "RelocationDocument" ADD CONSTRAINT "RelocationDocument_content_or_storage"
  CHECK ("content" IS NOT NULL OR "storagePath" IS NOT NULL);

CREATE TABLE "RelocationUpload" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelocationUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RelocationUpload_storagePath_key" ON "RelocationUpload"("storagePath");
CREATE INDEX "RelocationUpload_customerId_idx" ON "RelocationUpload"("customerId");
CREATE INDEX "RelocationUpload_createdAt_idx" ON "RelocationUpload"("createdAt");
