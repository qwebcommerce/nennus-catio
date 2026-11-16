import { orgPermissionMatrices, resolveRolePermissions } from "./permissions.js";

/**
 * Build the session user object returned by login / register / me.
 */
export async function buildSessionUser(prisma, user, organization, branch) {
  const org = organization || user.organization;
  const br = branch !== undefined ? branch : user.branch;
  const branchCount = await prisma.branch.count({ where: { organizationId: org.id } });
  const userCount = await prisma.user.count({ where: { organizationId: org.id } });
  const rolePermissions = resolveRolePermissions(org, user.role);
  const matrices = orgPermissionMatrices(org);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nameEn: user.nameEn ?? null,
    role: user.role,
    branchId: user.branchId,
    branchName: br?.name ?? null,
    branchNameEn: br?.nameEn ?? null,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    branchCount,
    userCount,
    permissions: rolePermissions,
    /** Super admin only — full matrices for Permissions editor */
    rolePermissionMatrices: user.role === "ADMIN" ? matrices : undefined,
    isSuperAdmin: user.role === "ADMIN",
  };
}
