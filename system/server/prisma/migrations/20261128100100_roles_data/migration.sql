-- fix-ra: copy the stored manager / cashier module maps into the per-role map, then move
-- existing staff to the new roles. People keep exactly the rights they had:
--   MANAGER -> SUPERVISOR (the manager map is copied to SUPERVISOR),
--   CASHIER at a van -> DRIVER, other CASHIER -> SALES (the cashier map is copied to both).
-- The old columns stay (read as a fallback) and the old keys are kept in roleModules.
UPDATE "Organization" o SET "roleModules" =
  COALESCE(o."roleModules", '{}'::jsonb)
  || CASE WHEN o."managerModules" IS NOT NULL AND o."managerModules" ~ '^\s*\{'
       THEN jsonb_build_object('MANAGER', o."managerModules"::jsonb, 'SUPERVISOR', o."managerModules"::jsonb)
       ELSE '{}'::jsonb END
  || CASE WHEN o."cashierModules" IS NOT NULL AND o."cashierModules" ~ '^\s*\{'
       THEN jsonb_build_object('CASHIER', o."cashierModules"::jsonb, 'SALES', o."cashierModules"::jsonb, 'DRIVER', o."cashierModules"::jsonb)
       ELSE '{}'::jsonb END
WHERE o."managerModules" IS NOT NULL OR o."cashierModules" IS NOT NULL;

UPDATE "User" SET "role" = 'SUPERVISOR' WHERE "role" = 'MANAGER';
UPDATE "User" u SET "role" = 'DRIVER'
  WHERE u."role" = 'CASHIER' AND EXISTS (SELECT 1 FROM "Branch" b WHERE b.id = u."branchId" AND b.kind = 'VAN');
UPDATE "User" SET "role" = 'SALES' WHERE "role" = 'CASHIER';
