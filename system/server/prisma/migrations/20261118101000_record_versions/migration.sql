-- NFR-13 stale edits: every editable record carries a version (existing rows backfilled to 1).

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Subcategory" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CatalogSku" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GroomingService" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GroomingSchedule" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CatalogPetType" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DeliveryArea" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DeliveryWindow" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CustomerPet" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RelocationRequest" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Any write that does not move the version itself (stock ledger, webhooks, sweeps, raw SQL)
-- still bumps it, so a form loaded before that write is refused on save.
CREATE OR REPLACE FUNCTION nc_bump_record_version() RETURNS trigger AS $$
BEGIN
  IF NEW."version" IS NOT DISTINCT FROM OLD."version" THEN
    NEW."version" := OLD."version" + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nc_version_organization ON "Organization";
CREATE TRIGGER nc_version_organization BEFORE UPDATE ON "Organization" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_expense ON "Expense";
CREATE TRIGGER nc_version_expense BEFORE UPDATE ON "Expense" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_customer ON "Customer";
CREATE TRIGGER nc_version_customer BEFORE UPDATE ON "Customer" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_category ON "Category";
CREATE TRIGGER nc_version_category BEFORE UPDATE ON "Category" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_subcategory ON "Subcategory";
CREATE TRIGGER nc_version_subcategory BEFORE UPDATE ON "Subcategory" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_catalogsku ON "CatalogSku";
CREATE TRIGGER nc_version_catalogsku BEFORE UPDATE ON "CatalogSku" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_branch ON "Branch";
CREATE TRIGGER nc_version_branch BEFORE UPDATE ON "Branch" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_supplier ON "Supplier";
CREATE TRIGGER nc_version_supplier BEFORE UPDATE ON "Supplier" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_groomingservice ON "GroomingService";
CREATE TRIGGER nc_version_groomingservice BEFORE UPDATE ON "GroomingService" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_groomingschedule ON "GroomingSchedule";
CREATE TRIGGER nc_version_groomingschedule BEFORE UPDATE ON "GroomingSchedule" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_user ON "User";
CREATE TRIGGER nc_version_user BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_product ON "Product";
CREATE TRIGGER nc_version_product BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_productvariant ON "ProductVariant";
CREATE TRIGGER nc_version_productvariant BEFORE UPDATE ON "ProductVariant" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_appointment ON "Appointment";
CREATE TRIGGER nc_version_appointment BEFORE UPDATE ON "Appointment" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_catalogpettype ON "CatalogPetType";
CREATE TRIGGER nc_version_catalogpettype BEFORE UPDATE ON "CatalogPetType" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_purchaseorder ON "PurchaseOrder";
CREATE TRIGGER nc_version_purchaseorder BEFORE UPDATE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_deliveryarea ON "DeliveryArea";
CREATE TRIGGER nc_version_deliveryarea BEFORE UPDATE ON "DeliveryArea" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_deliverywindow ON "DeliveryWindow";
CREATE TRIGGER nc_version_deliverywindow BEFORE UPDATE ON "DeliveryWindow" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_customerpet ON "CustomerPet";
CREATE TRIGGER nc_version_customerpet BEFORE UPDATE ON "CustomerPet" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_customeraddress ON "CustomerAddress";
CREATE TRIGGER nc_version_customeraddress BEFORE UPDATE ON "CustomerAddress" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_relocationrequest ON "RelocationRequest";
CREATE TRIGGER nc_version_relocationrequest BEFORE UPDATE ON "RelocationRequest" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_promotion ON "Promotion";
CREATE TRIGGER nc_version_promotion BEFORE UPDATE ON "Promotion" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
DROP TRIGGER IF EXISTS nc_version_vehicle ON "Vehicle";
CREATE TRIGGER nc_version_vehicle BEFORE UPDATE ON "Vehicle" FOR EACH ROW EXECUTE FUNCTION nc_bump_record_version();
