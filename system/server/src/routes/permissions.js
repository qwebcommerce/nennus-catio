import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import {
  DEFAULT_CASHIER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  normalizePermissionMap,
  orgPermissionMatrices,
} from "../lib/permissions.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

/** GET /api/permissions — matrices for Manager + Employee */
router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    plan: org.plan || "FREE",
    maxBranches: org.maxBranches ?? 3,
    matrices: orgPermissionMatrices(org),
    defaults: {
      MANAGER: { ...DEFAULT_MANAGER_PERMISSIONS },
      CASHIER: { ...DEFAULT_CASHIER_PERMISSIONS },
    },
  });
});

/**
 * PUT /api/permissions
 * body: { MANAGER?: {...}, CASHIER?: {...} }
 */
router.put("/", async (req, res) => {
  const body = req.body || {};
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const data = {};
  if (body.MANAGER != null) {
    data.managerPermissions = JSON.stringify(
      normalizePermissionMap(body.MANAGER, DEFAULT_MANAGER_PERMISSIONS)
    );
  }
  if (body.CASHIER != null) {
    data.cashierPermissions = JSON.stringify(
      normalizePermissionMap(body.CASHIER, DEFAULT_CASHIER_PERMISSIONS)
    );
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No permission updates provided" });
  }

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data,
  });

  await writeAudit({
    userId: req.user.sub,
    action: "PERMISSIONS_UPDATE",
    entityType: "Organization",
    entityId: org.id,
    branchId: req.user.branchId || null,
    summary: "Updated role permissions for Manager / Employee",
    meta: {
      updatedRoles: Object.keys(body).filter((k) => k === "MANAGER" || k === "CASHIER"),
    },
  });

  res.json({
    ok: true,
    matrices: orgPermissionMatrices(updated),
  });
});

export default router;
