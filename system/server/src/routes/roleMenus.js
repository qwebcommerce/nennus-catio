import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  EDITABLE_ROLES,
  LEGACY_ROLES,
  ORG_PERMISSION_SELECT,
  ROLES,
  resolveModulePermissions,
  resolveRolePermissions,
} from "../lib/permissions.js";

/**
 * fix-rf: GET /api/role-menus — read-only, top admin only (docs/testing/menu-roles.md).
 * Every role's resolved module map (exactly resolveModulePermissions) plus active users per role,
 * for the admin's "Preview menu as role" and the "Who sees what" guide. It never changes anyone's
 * rights: the preview is navigation only.
 */
const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  // The top admin holds every right; a role preview is about the menu, so only ADMIN may ask.
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      error: "هذه الصفحة للمشرف الأعلى فقط",
      errorAr: "هذه الصفحة للمشرف الأعلى فقط",
      errorEn: "Only the top admin can see this",
      code: "ADMIN_ONLY",
    });
  }
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { id: true, ...ORG_PERMISSION_SELECT },
  });
  if (!org) return res.status(404).json({ error: "Organization not found", errorAr: "المؤسسة غير موجودة", errorEn: "Organization not found" });
  const counts = await prisma.user.groupBy({
    by: ["role"],
    where: { organizationId: org.id, active: true },
    _count: true,
  });
  res.json({
    roles: ROLES,
    editableRoles: EDITABLE_ROLES,
    legacyRoles: LEGACY_ROLES,
    userCounts: Object.fromEntries(ROLES.map((r) => [r, counts.find((c) => c.role === r)?._count || 0])),
    modules: Object.fromEntries(ROLES.map((r) => [r, resolveModulePermissions(org, r)])),
    permissions: Object.fromEntries(ROLES.map((r) => [r, resolveRolePermissions(org, r)])),
  });
});

export default router;
