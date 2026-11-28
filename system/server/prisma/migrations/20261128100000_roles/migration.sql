-- fix-ra: new staff roles and a per-role permission map. Additive only.
-- Enum values are added in their own migration: a new value cannot be used in the transaction
-- that adds it (the data move is 20261128100100_roles_data).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'B2B';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DRIVER';

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "roleModules" JSONB;
