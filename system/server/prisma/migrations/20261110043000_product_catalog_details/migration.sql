-- Catalog copy and dimensions for the public product form.
ALTER TABLE "Product" ADD COLUMN "shortTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN "shortTitleEn" TEXT;
ALTER TABLE "Product" ADD COLUMN "descriptionEn" TEXT;
ALTER TABLE "Product" ADD COLUMN "heightCm" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "widthCm" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "depthCm" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "features" TEXT;
ALTER TABLE "Product" ADD COLUMN "featuresEn" TEXT;
