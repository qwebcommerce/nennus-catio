-- Shop, warehouse, and van locations, plus the till channel and van payment references.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocationKind') THEN
    CREATE TYPE "LocationKind" AS ENUM ('WAREHOUSE', 'SHOP', 'VAN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderChannel') THEN
    CREATE TYPE "OrderChannel" AS ENUM ('IN_STORE', 'VAN', 'WEBSITE');
  END IF;
END $$;

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "kind" "LocationKind" NOT NULL DEFAULT 'SHOP';
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "orderChannel" "OrderChannel" NOT NULL DEFAULT 'IN_STORE';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'FAWRAN';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYMENT_LINK';
