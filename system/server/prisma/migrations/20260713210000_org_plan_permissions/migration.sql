-- Super-admin org plan limits + role permission matrices
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxBranches" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "managerPermissions" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cashierPermissions" TEXT;
