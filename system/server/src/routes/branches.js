import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { LOCATION_KINDS } from "../lib/locationKinds.js";
import { fail } from "../lib/bizError.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("warehouses", "view"));
router.use((req, res, next) => requireModule("warehouses", req.method === "GET" ? "view" : "edit")(req, res, next));

/**
 * Locations are unlimited (no plan cap): stores, vans, warehouses, factories, other places.
 * One of them is the main location (the showroom / store); see POST /:id/main.
 */
function locationKind(value, fallback = "SHOP") {
  const kind = String(value || "").trim().toUpperCase();
  return LOCATION_KINDS.includes(kind) ? kind : fallback;
}

function nameField(value, max = 120) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw fail(400, "BRANCH_NAME_TOO_LONG", "اسم الموقع طويل جداً (120 حرفاً كحد أقصى)", "The location name is too long (at most 120 characters)");
  return text;
}

/** Lock the organisation row so two main-location changes cannot interleave. */
async function lockOrg(tx, orgId) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
}

router.get("/", async (req, res) => {
  // Main location first, then by name: every list and picker shows it at the top.
  const branches = await prisma.branch.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
  });
  res.json(branches);
});

router.post("/", requireModule("warehouses", "create"), async (req, res) => {
  const { name, nameEn, address, kind, isActive } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Branch name is required", errorAr: "اسم الفرع مطلوب", errorEn: "Branch name is required", code: "BRANCH_NAME_REQUIRED" });
  const orgId = req.user.organizationId;
  const data = {
    organizationId: orgId,
    name: nameField(name),
    nameEn: nameField(nameEn) || null,
    address: address?.trim() || null,
    kind: locationKind(kind),
    isActive: isActive === false ? false : true,
  };
  const b = await prisma.$transaction(async (tx) => {
    await lockOrg(tx, orgId);
    // The first location (or the first after none was main) becomes the main one, unless it is a van.
    const hasMain = await tx.branch.count({ where: { organizationId: orgId, isMain: true } });
    return tx.branch.create({ data: { ...data, isMain: !hasMain && data.kind !== "VAN" && data.isActive } });
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
    ...(name != null && { name: nameField(name) }),
    ...(nameEn !== undefined && { nameEn: nameField(nameEn) || null }),
    ...(address !== undefined && { address: address?.trim() || null }),
    ...(kind !== undefined && { kind: locationKind(kind, existing.kind || "SHOP") }),
    ...(isActive !== undefined && { isActive: isActive !== false }),
  };
  if (data.name === "") throw fail(400, "BRANCH_NAME_REQUIRED", "اسم الفرع مطلوب", "Branch name is required");
  if (existing.isMain && data.kind === "VAN") {
    throw fail(400, "MAIN_LOCATION_VAN", "الموقع الرئيسي لا يمكن أن يكون سيارة", "The main location cannot be a van");
  }
  if (existing.isMain && data.isActive === false) {
    throw fail(400, "MAIN_LOCATION_INACTIVE", "لا يمكن إيقاف الموقع الرئيسي — اختر موقعاً رئيسياً آخر أولاً", "The main location cannot be deactivated. Choose another main location first.");
  }
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

/**
 * POST /api/branches/:id/main { version } — make this the main location (showroom / store).
 * Exactly one per organisation; the previous main location is cleared in the same transaction.
 * NFR-13: the version of the location being made main is required.
 */
router.post("/:id/main", requireModule("warehouses", "edit"), async (req, res) => {
  const orgId = req.user.organizationId;
  const version = requireVersion(req);
  const existing = await prisma.branch.findFirst({ where: { id: req.params.id, organizationId: orgId } });
  if (!existing) return res.status(404).json({ error: "Branch not found", errorAr: "الفرع غير موجود", errorEn: "Branch not found", code: "NOT_FOUND" });
  assertVersion(existing, version);
  if (existing.kind === "VAN") throw fail(400, "MAIN_LOCATION_VAN", "الموقع الرئيسي لا يمكن أن يكون سيارة", "The main location cannot be a van");
  if (existing.isActive === false) throw fail(400, "MAIN_LOCATION_INACTIVE_PICK", "اختر موقعاً نشطاً كموقع رئيسي", "Choose an active location as the main location");
  const previous = await prisma.branch.findFirst({ where: { organizationId: orgId, isMain: true }, select: { id: true, name: true } });
  const b = await prisma.$transaction(async (tx) => {
    await lockOrg(tx, orgId);
    await tx.branch.updateMany({ where: { organizationId: orgId, isMain: true, id: { not: existing.id } }, data: { isMain: false, version: { increment: 1 } } });
    const row = await versionedUpdate(tx, "branch", { id: existing.id, version, data: { isMain: true } });
    await writeAudit({
      userId: req.user.sub,
      action: "BRANCH_SET_MAIN",
      entityType: "Branch",
      entityId: existing.id,
      branchId: req.user.branchId || null,
      summary: `Main location: "${existing.name}"${previous && previous.id !== existing.id ? ` (was "${previous.name}")` : ""}`,
      meta: { from: previous?.id || null, to: existing.id },
    }, tx);
    return row;
  });
  res.json(b);
});

router.delete("/:id", requireModule("warehouses", "delete"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });

  if (existing.isMain) {
    return res.status(400).json({
      error: "لا يمكن حذف الموقع الرئيسي — اختر موقعاً رئيسياً آخر أولاً",
      errorAr: "لا يمكن حذف الموقع الرئيسي — اختر موقعاً رئيسياً آخر أولاً",
      errorEn: "The main location cannot be deleted. Choose another main location first.",
      code: "MAIN_LOCATION",
    });
  }
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
