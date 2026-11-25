import { prisma } from "./prisma.js";

/** Staff and vehicles picked on transfers and van returns. */

function pickError(errorAr, errorEn) {
  const err = new Error(errorAr);
  err.status = 400;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  return err;
}

/** An active staff member of the organisation, or a 400. */
export async function requireActiveStaff(db, orgId, userId) {
  const id = String(userId || "");
  const user = id
    ? await db.user.findFirst({ where: { id, organizationId: orgId, active: true }, select: { id: true, name: true, nameEn: true, role: true, branchId: true } })
    : null;
  if (!user) throw pickError("اختر موظفاً نشطاً", "Choose an active staff member");
  return user;
}

/** Optional staff field: undefined / "" / null → null, else must be active staff. */
export async function optionalActiveStaff(db, orgId, userId) {
  if (userId === undefined || userId === null || String(userId).trim() === "") return null;
  return requireActiveStaff(db, orgId, userId);
}

/** The active vehicle attached to a van location, or null. */
export async function vehicleForBranch(db, orgId, branchId) {
  if (!branchId) return null;
  return db.vehicle.findFirst({ where: { organizationId: orgId, branchId: String(branchId), isActive: true } });
}

/** A vehicle of the organisation (active), or a 400. */
export async function requireVehicle(db, orgId, vehicleId) {
  const row = await db.vehicle.findFirst({ where: { id: String(vehicleId || ""), organizationId: orgId, isActive: true } });
  if (!row) throw pickError("اختر مركبة نشطة", "Choose an active vehicle");
  return row;
}

/** Active staff (for pickers) and vehicles with their van. */
export async function staffAndVehicles(orgId) {
  const [staff, vehicles] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      select: { id: true, name: true, nameEn: true, role: true, branchId: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, plate: true, branchId: true, isActive: true, branch: { select: { id: true, name: true, nameEn: true, kind: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { staff, vehicles };
}
