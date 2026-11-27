-- fix-rd: payment confirmation. Enum values first (a value added in a transaction cannot be used
-- in that same transaction). IF NOT EXISTS: another branch may add the same value.
DO $$ BEGIN
  CREATE TYPE "PaymentConfirmStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE "DispatchEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_COLLECTED';
