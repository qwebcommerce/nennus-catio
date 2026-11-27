-- fix-rd: client decision on who does what with van returns and customers. The new role defaults
-- live in lib/permissions.js; this applies the same decision to maps already stored per role
-- (roles_data copied the old cashier map, which let drivers record returns, to DRIVER):
--   DRIVER: may not record returns (returns.create off), moves returns in their own van to the
--           warehouse (returns.edit on), may add customers (customers.create on), never pays
--           customers back (returns.refund off);
--   SALES:  records returns into any van and pays customers back (returns view/create/refund on);
--   ACCOUNTANT: sees returns and pays customers back (returns view/refund on);
--   SUPERVISOR / MANAGER / CASHIER: returns.refund follows what they could do before
--           (paying back needed returns.create or returns.edit).
-- Only keys that are already stored are touched; roles without a stored map use the defaults.
CREATE OR REPLACE FUNCTION nc_tmp_set_right(maps jsonb, role text, mod text, action text, val boolean) RETURNS jsonb AS $$
BEGIN
  IF maps IS NULL OR maps -> role IS NULL OR jsonb_typeof(maps -> role) <> 'object' THEN RETURN maps; END IF;
  IF maps -> role -> mod IS NULL OR jsonb_typeof(maps -> role -> mod) <> 'object' THEN
    maps := jsonb_set(maps, ARRAY[role, mod], '{}'::jsonb, true);
  END IF;
  RETURN jsonb_set(maps, ARRAY[role, mod, action], to_jsonb(val), true);
END;
$$ LANGUAGE plpgsql;

UPDATE "Organization" SET "roleModules" =
  nc_tmp_set_right(nc_tmp_set_right(nc_tmp_set_right(nc_tmp_set_right("roleModules",
    'DRIVER', 'returns', 'create', false),
    'DRIVER', 'returns', 'edit', true),
    'DRIVER', 'returns', 'refund', false),
    'DRIVER', 'customers', 'create', true)
WHERE "roleModules" ? 'DRIVER';

UPDATE "Organization" SET "roleModules" =
  nc_tmp_set_right(nc_tmp_set_right(nc_tmp_set_right("roleModules",
    'SALES', 'returns', 'view', true),
    'SALES', 'returns', 'create', true),
    'SALES', 'returns', 'refund', true)
WHERE "roleModules" ? 'SALES';

UPDATE "Organization" SET "roleModules" =
  nc_tmp_set_right(nc_tmp_set_right("roleModules",
    'ACCOUNTANT', 'returns', 'view', true),
    'ACCOUNTANT', 'returns', 'refund', true)
WHERE "roleModules" ? 'ACCOUNTANT';

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['SUPERVISOR', 'MANAGER', 'CASHIER'] LOOP
    UPDATE "Organization" o SET "roleModules" = nc_tmp_set_right(o."roleModules", r, 'returns', 'refund',
        COALESCE((o."roleModules" #>> ARRAY[r, 'returns', 'create'])::boolean, false)
        OR COALESCE((o."roleModules" #>> ARRAY[r, 'returns', 'edit'])::boolean, false))
    WHERE o."roleModules" ? r AND o."roleModules" #> ARRAY[r, 'returns'] IS NOT NULL;
  END LOOP;
END $$;

DROP FUNCTION nc_tmp_set_right(jsonb, text, text, text, boolean);
