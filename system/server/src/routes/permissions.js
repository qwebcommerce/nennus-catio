import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireOwner } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import {
  DEFAULT_CASHIER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  MODULES,
  MODULE_ACTIONS,
  defaultModuleMap,
  orgPermissionMatrices,
  resolveModulePermissions,
} from "../lib/permissions.js";

const router = Router();
router.use(authMiddleware);
/** FR-09: roles and permissions are reserved for the organisation owner. */
router.use(requireOwner);

/** GET /api/permissions — matrices for Manager + Employee */
router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    matrices: orgPermissionMatrices(org),
    modules: {
      MANAGER: resolveModulePermissions(org, "MANAGER"),
      CASHIER: resolveModulePermissions(org, "CASHIER"),
    },
    moduleDefaults: {
      MANAGER: defaultModuleMap("MANAGER"),
      CASHIER: defaultModuleMap("CASHIER"),
    },
    moduleKeys: MODULES,
    moduleActions: MODULE_ACTIONS,
    defaults: {
      MANAGER: { ...DEFAULT_MANAGER_PERMISSIONS },
      CASHIER: { ...DEFAULT_CASHIER_PERMISSIONS },
    },
  });
});

/**
 * PUT /api/permissions
 * body: { modules: { MANAGER?: {...}, CASHIER?: {...} } }
 */
router.put("/", async (req, res) => {
  const body = req.body || {};
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  // Legacy key maps are derived from the module matrix; only `modules` is stored.
  const data = {};
  const changed = [];
  for (const role of ["MANAGER", "CASHIER"]) {
    const input = body.modules?.[role];
    if (!input || typeof input !== "object") continue;
    const clean = resolveModulePermissions(
      { managerModules: org.managerModules, cashierModules: org.cashierModules },
      role
    );
    for (const mod of MODULES) {
      for (const action of MODULE_ACTIONS) {
        if (typeof input?.[mod]?.[action] === "boolean") clean[mod][action] = input[mod][action];
      }
    }
    data[role === "MANAGER" ? "managerModules" : "cashierModules"] = JSON.stringify(clean);
    changed.push(role);
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No permission updates provided" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({ where: { id: org.id }, data });
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
          before: {
            MANAGER: resolveModulePermissions(org, "MANAGER"),
            CASHIER: resolveModulePermissions(org, "CASHIER"),
          },
          after: Object.fromEntries(changed.map((r) => [r, JSON.parse(data[r === "MANAGER" ? "managerModules" : "cashierModules"])])),
        },
      },
      tx
    );
    return row;
  });

  res.json({
    ok: true,
    matrices: orgPermissionMatrices(updated),
    modules: {
      MANAGER: resolveModulePermissions(updated, "MANAGER"),
      CASHIER: resolveModulePermissions(updated, "CASHIER"),
    },
  });
});

export default router;
