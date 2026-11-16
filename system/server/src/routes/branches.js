import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("warehouses", "view"));
router.use((req, res, next) => requireModule("warehouses", req.method === "GET" ? "view" : "edit")(req, res, next));

const LOCATION_KINDS = new Set(["WAREHOUSE", "SHOP", "VAN"]);

function locationKind(value, fallback = "SHOP") {
  const kind = String(value || "").trim().toUpperCase();
  return LOCATION_KINDS.has(kind) ? kind : fallback;
}

router.get("/", async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(branches);
});

router.post("/", requireModule("warehouses", "create"), async (req, res) => {
  const { name, nameEn, address, kind, isActive } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Branch name is required", code: "BRANCH_NAME_REQUIRED" });

  const b = await prisma.branch.create({
    data: {
      organizationId: req.user.organizationId,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      address: address?.trim() || null,
      kind: locationKind(kind),
      isActive: isActive === false ? false : true,
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_CREATE",
    entityType: "Branch",
    entityId: b.id,
    branchId: b.id,
    summary: `Created branch "${b.name}"`,
    meta: { name: b.name },
  });
  res.status(201).json(b);
});

router.patch("/:id", requireModule("warehouses", "edit"), async (req, res) => {
  const { name, nameEn, address, kind, isActive } = req.body || {};
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });
  const data = {
    ...(name != null && { name: String(name).trim() }),
    ...(nameEn !== undefined && { nameEn: nameEn?.trim() || null }),
    ...(address !== undefined && { address: address?.trim() || null }),
    ...(kind !== undefined && { kind: locationKind(kind, existing.kind || "SHOP") }),
    ...(isActive !== undefined && { isActive: isActive !== false }),
  };
  const b = await prisma.branch.update({
    where: { id: existing.id },
    data,
  });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_UPDATE",
    entityType: "Branch",
    entityId: b.id,
    branchId: b.id,
    summary: `Updated branch "${b.name}"`,
    meta: { changes: Object.keys(data) },
  });
  res.json(b);
});

router.delete("/:id", requireModule("warehouses", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });

  const branchCount = await prisma.branch.count({ where: { organizationId: orgId } });
  if (branchCount <= 1) {
    return res.status(400).json({
      error: "Cannot delete the only branch in the organization",
      code: "LAST_BRANCH",
    });
  }

  const [sales, users, cashSessions, refunds, purchases, auditRows] = await Promise.all([
    prisma.sale.count({ where: { branchId: existing.id } }),
    prisma.user.count({ where: { branchId: existing.id } }),
    prisma.cashSession.count({ where: { branchId: existing.id } }),
    prisma.refund.count({ where: { branchId: existing.id } }),
    prisma.purchase.count({ where: { branchId: existing.id } }),
    // Audit rows are immutable (NFR-16), so a branch they point at cannot be removed.
    prisma.auditLog.count({ where: { branchId: existing.id } }),
  ]);

  const blockers = [];
  if (sales) blockers.push(`${sales} sale(s)`);
  if (users) blockers.push(`${users} linked user(s)`);
  if (cashSessions) blockers.push(`${cashSessions} cash session(s)`);
  if (refunds) blockers.push(`${refunds} refund(s)`);
  if (purchases) blockers.push(`${purchases} purchase(s)`);
  if (auditRows) blockers.push(`${auditRows} audit record(s)`);

  if (blockers.length) {
    return res.status(400).json({
      error: `Cannot delete branch while related data exists: ${blockers.join(", ")}. Move users or choose a branch with no transactions.`,
      code: "BRANCH_HAS_DATA",
      blockers: { sales, users, cashSessions, refunds, purchases, auditRows },
    });
  }

  await prisma.branch.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_DELETE",
    entityType: "Branch",
    entityId: existing.id,
    summary: `Deleted branch "${existing.name}"`,
    meta: { name: existing.name },
  });
  res.status(204).send();
});

export default router;
