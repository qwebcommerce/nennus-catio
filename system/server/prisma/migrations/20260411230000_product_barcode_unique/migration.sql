-- Unique barcode per organization (NULL allowed multiple times per PG/SQLite rules)
CREATE UNIQUE INDEX "Product_organizationId_barcode_key" ON "Product"("organizationId", "barcode");
