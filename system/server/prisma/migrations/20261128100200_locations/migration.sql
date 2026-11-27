-- fix-ra: more location kinds and one main location per organisation. Additive only.
ALTER TYPE "LocationKind" ADD VALUE IF NOT EXISTS 'FACTORY';
ALTER TYPE "LocationKind" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false;

-- Main location: the website location if it is set, else the oldest shop, else the oldest
-- non-van location, else the oldest location.
UPDATE "Branch" b SET "isMain" = true
FROM (
  SELECT DISTINCT ON (br."organizationId") br.id
  FROM "Branch" br
  JOIN "Organization" o ON o.id = br."organizationId"
  WHERE NOT EXISTS (SELECT 1 FROM "Branch" m WHERE m."organizationId" = br."organizationId" AND m."isMain")
  ORDER BY br."organizationId",
    (br.id = o."websiteBranchId") DESC,
    (br.kind = 'SHOP') DESC,
    (br.kind <> 'VAN') DESC,
    br."createdAt" ASC, br.id ASC
) pick
WHERE b.id = pick.id;

-- At most one main location per organisation. A trigger (not a partial index, which the Prisma
-- schema cannot describe); the API changes the main location under a lock on the organisation row.
CREATE OR REPLACE FUNCTION nc_branch_one_main() RETURNS trigger AS $$
BEGIN
  IF NEW."isMain" AND EXISTS (
    SELECT 1 FROM "Branch" WHERE "organizationId" = NEW."organizationId" AND "isMain" AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Only one main location per organisation' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS nc_branch_one_main ON "Branch";
CREATE TRIGGER nc_branch_one_main BEFORE INSERT OR UPDATE OF "isMain" ON "Branch"
  FOR EACH ROW EXECUTE FUNCTION nc_branch_one_main();
