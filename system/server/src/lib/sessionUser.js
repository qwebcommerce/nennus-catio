import { orgPermissionMatrices, resolveModulePermissions, resolveRolePermissions } from "./permissions.js";
import { findOrganizationOwnerId } from "./orgOwner.js";

/**
 * Build the session user object returned by login / register / me.
 */
export async function buildSessionUser(prisma, user, organization, branch) {
  const org = organization || user.organization;
  const br = branch !== undefined ? branch : user.branch;
  const branchCount = await prisma.branch.count({ where: { organizationId: org.id } });
  const userCount = await prisma.user.count({ where: { organizationId: org.id, active: true } });
  const ownerId = await findOrganizationOwnerId(prisma, org.id);
  const rolePermissions = resolveRolePermissions(org, user.role);
  const isOrgOwner = ownerId === user.id;

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
    /** Module rights (view/create/edit/delete/export/refund) — what the server enforces. */
    modules: resolveModulePermissions(org, user.role),
    /** Owner only — full matrices for Permissions editor */
    rolePermissionMatrices: isOrgOwner ? orgPermissionMatrices(org) : undefined,
    isSuperAdmin: user.role === "ADMIN",
    /** FR-09: roles, business settings and payment settings are reserved for the owner. */
    isOrgOwner,
  };
}
