/**
 * Organization owner = first ADMIN created for the org (bootstrap super admin).
 * That account is immutable: no PATCH / DELETE by anyone including themselves.
 */
export async function findOrganizationOwnerId(prisma, organizationId) {
  const owner = await prisma.user.findFirst({
    where: { organizationId, role: "ADMIN" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return owner?.id ?? null;
}

export async function isOrganizationOwner(prisma, organizationId, userId) {
  if (!userId) return false;
  const ownerId = await findOrganizationOwnerId(prisma, organizationId);
  return ownerId != null && ownerId === userId;
}
