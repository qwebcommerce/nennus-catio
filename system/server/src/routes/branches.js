import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);
// fix-rb: drivers, dispatchers and approvers (no warehouse right) still need the location list
// (till location, van names). Writes keep the warehouse rights.
router.use(async (req, res, next) => {
  try {
    if (req.method === "GET") {
      for (const [mod, action] of [["driver", "view"], ["dispatch", "view"], ["driverApprovals", "view"]]) {
        if (await hasModule(req, mod, action)) {
          req._branchListOk = true;
          return next();
        }
      }
    }
    return requireModule("warehouses", "view")(req, res, next);
  } catch (e) {
    next(e);
  }
});
router.use((req, res, next) => (req.method === "GET" && req._branchListOk ? next() : requireModule("warehouses", req.method === "GET" ? "view" : "edit")(req, res, next)));

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
    // The actor's location, not the new one: a location's own create/edit record must not
    // make it undeletable (audit rows are immutable and block the delete below).
    branchId: req.user.branchId || null,
    summary: `Created branch "${b.name}"`,
    meta: { name: b.name },
  });
  res.status(201).json(b);
});

router.patch("/:id", requireModule("warehouses", "edit"), async (req, res) => {
  const { name, nameEn, address, kind, isActive } = req.body || {};
  const version = requireVersion(req);
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });
  assertVersion(existing, version);
  const data = {
    ...(name != null && { name: String(name).trim() }),
    ...(nameEn !== undefined && { nameEn: nameEn?.trim() || null }),
    ...(address !== undefined && { address: address?.trim() || null }),
    ...(kind !== undefined && { kind: locationKind(kind, existing.kind || "SHOP") }),
    ...(isActive !== undefined && { isActive: isActive !== false }),
  };
  const b = await versionedUpdate(prisma, "branch", { id: existing.id, version, data });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_UPDATE",
    entityType: "Branch",
    entityId: b.id,
    // The actor's location, not the new one: a location's own create/edit record must not
    // make it undeletable (audit rows are immutable and block the delete below).
    branchId: req.user.branchId || null,
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

  const [sales, users, cashSessions, refunds, purchases, auditRows, stockMoves, purchaseOrders, holds, stockRows, variantStockRows] = await Promise.all([
    prisma.sale.count({ where: { branchId: existing.id } }),
    prisma.user.count({ where: { branchId: existing.id } }),
    prisma.cashSession.count({ where: { branchId: existing.id } }),
    prisma.refund.count({ where: { branchId: existing.id } }),
    prisma.purchase.count({ where: { branchId: existing.id } }),
    // Audit rows are immutable (NFR-16), so a branch they point at cannot be removed.
    prisma.auditLog.count({ where: { branchId: existing.id } }),
    // Stock history and stock on hand would otherwise fail the delete (500) or be cascaded away.
    prisma.stockMovement.count({ where: { branchId: existing.id } }),
    prisma.purchaseOrder.count({ where: { branchId: existing.id } }),
    prisma.stockHold.count({ where: { branchId: existing.id } }),
    prisma.inventory.count({ where: { branchId: existing.id, quantity: { not: 0 } } }),
    prisma.variantStock.count({ where: { branchId: existing.id, quantity: { not: 0 } } }),
  ]);

  const blockers = [];
  if (sales) blockers.push(`${sales} sale(s)`);
  if (users) blockers.push(`${users} linked user(s)`);
  if (cashSessions) blockers.push(`${cashSessions} cash session(s)`);
  if (refunds) blockers.push(`${refunds} refund(s)`);
  if (purchases) blockers.push(`${purchases} purchase(s)`);
  if (auditRows) blockers.push(`${auditRows} audit record(s)`);
  if (stockMoves) blockers.push(`${stockMoves} stock movement(s)`);
  if (purchaseOrders) blockers.push(`${purchaseOrders} purchase order(s)`);
  if (holds) blockers.push(`${holds} stock hold(s)`);
  if (stockRows + variantStockRows) blockers.push(`${stockRows + variantStockRows} item(s) in stock`);

  if (blockers.length) {
    return res.status(400).json({
      error: `Cannot delete branch while related data exists: ${blockers.join(", ")}. Move users or choose a branch with no transactions.`,
      code: "BRANCH_HAS_DATA",
      blockers: { sales, users, cashSessions, refunds, purchases, auditRows, stockMoves, purchaseOrders, holds, stock: stockRows + variantStockRows },
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
