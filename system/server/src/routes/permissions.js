import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireOwner } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import {
  DEFAULT_CASHIER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  EDITABLE_ROLES,
  LEGACY_ROLES,
  MODULES,
  MODULE_ACTIONS,
  MODULE_ACTIONS_FOR,
  defaultModuleMap,
  orgPermissionMatrices,
  resolveModulePermissions,
} from "../lib/permissions.js";

const router = Router();
router.use(authMiddleware);
/** FR-09: roles and permissions are reserved for the organisation owner. */
router.use(requireOwner);

const perRole = (fn) => Object.fromEntries(EDITABLE_ROLES.map((role) => [role, fn(role)]));

function parseRoleModules(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return { ...raw };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** GET /api/permissions — the module map of every editable role (all roles but the top admin). */
router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found", errorAr: "المؤسسة غير موجودة", errorEn: "Organization not found" });
  const counts = await prisma.user.groupBy({
    by: ["role"],
    where: { organizationId: org.id, active: true },
    _count: true,
  });
  res.json({
    version: org.version,
    roles: EDITABLE_ROLES,
    legacyRoles: LEGACY_ROLES,
    /** Active users per role (the screen hides empty legacy roles). */
    userCounts: Object.fromEntries(counts.map((c) => [c.role, c._count])),
    matrices: orgPermissionMatrices(org),
    modules: perRole((role) => resolveModulePermissions(org, role)),
    moduleDefaults: perRole((role) => defaultModuleMap(role)),
    moduleKeys: MODULES,
    moduleActions: MODULE_ACTIONS,
    moduleActionsFor: MODULE_ACTIONS_FOR,
    defaults: {
      MANAGER: { ...DEFAULT_MANAGER_PERMISSIONS },
      CASHIER: { ...DEFAULT_CASHIER_PERMISSIONS },
    },
  });
});

/**
 * PUT /api/permissions
 * body: { version, modules: { SUPERVISOR?: {...}, SALES?: {...}, ... } }
 * Stored in Organization.roleModules (one JSON map keyed by role). MANAGER / CASHIER are also
 * written to their old columns so an older server reading them still agrees.
 */
router.put("/", async (req, res) => {
  const body = req.body || {};
  const version = requireVersion(req);
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found", errorAr: "المؤسسة غير موجودة", errorEn: "Organization not found" });
  assertVersion(org, version);

  const stored = parseRoleModules(org.roleModules);
  const data = {};
  const changed = [];
  const after = {};
  for (const role of EDITABLE_ROLES) {
    const input = body.modules?.[role];
    if (!input || typeof input !== "object") continue;
    const clean = resolveModulePermissions(org, role);
    for (const mod of MODULES) {
      for (const action of MODULE_ACTIONS) {
        if (typeof input?.[mod]?.[action] === "boolean") clean[mod][action] = input[mod][action];
      }
    }
    stored[role] = clean;
    after[role] = clean;
    if (role === "MANAGER") data.managerModules = JSON.stringify(clean);
    if (role === "CASHIER") data.cashierModules = JSON.stringify(clean);
    changed.push(role);
  }
  if (!changed.length) {
    return res.status(400).json({
      error: "لم تُرسل أي تغييرات على الصلاحيات",
      errorAr: "لم تُرسل أي تغييرات على الصلاحيات",
      errorEn: "No permission updates provided",
      code: "NO_CHANGES",
    });
  }
  data.roleModules = stored;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await versionedUpdate(tx, "organization", { id: org.id, version, data });
    await writeAudit(
      {
        userId: req.user.sub,
        action: "PERMISSIONS_UPDATE",
        entityType: "Organization",
        entityId: org.id,
        branchId: req.user.branchId || null,
        summary: `Updated role permissions: ${changed.join(", ")}`,
        meta: {
          updatedRoles: changed,
          before: Object.fromEntries(changed.map((r) => [r, resolveModulePermissions(org, r)])),
          after,
        },
      },
      tx
    );
    return row;
  });

  res.json({
    ok: true,
    version: updated.version,
    matrices: orgPermissionMatrices(updated),
    modules: perRole((role) => resolveModulePermissions(updated, role)),
  });
});

export default router;
