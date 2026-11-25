import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { qatarRange } from "../lib/qatarTime.js";
import { staffAndVehicles } from "../lib/staffPick.js";
import { unitsFor, cartonSize } from "../lib/stockUnits.js";

/**
 * Transfer history (records made by POST /api/inventory/transfer), barcode lookup for the
 * transfer screen and the staff / vehicle pickers. No money here: values stay in the books.
 * Transfers made before transfer records existed have no record and are not listed.
 */
const router = Router();
router.use(authMiddleware);
router.use(requireModule("warehouses", "view"));

const INVALID_DATES = { error: "تاريخ غير صالح", errorAr: "تاريخ غير صالح", errorEn: "Invalid dates" };
const PERSON = { select: { id: true, name: true, nameEn: true } };
const PLACE = { select: { id: true, name: true, nameEn: true, kind: true } };

/** Staff tied to one location only see transfers into or out of it (as when making one). */
function scopeWhere(req) {
  if (req.user.role === "ADMIN" || !req.user.branchId) return null;
  return { OR: [{ fromBranchId: req.user.branchId }, { toBranchId: req.user.branchId }] };
}

router.get("/options", async (req, res) => {
  res.json(await staffAndVehicles(req.user.organizationId));
});

/** Scanner / typed code → product and variant (barcode or SKU, exact). */
router.get("/lookup", async (req, res) => {
  const code = String(req.query.code || "").trim();
  const orgId = req.user.organizationId;
  const notFound = () => res.status(404).json({ error: `لا يوجد منتج بهذا الرمز: ${code}`, errorAr: `لا يوجد منتج بهذا الرمز: ${code}`, errorEn: `No product with this code: ${code}`, code: "NOT_FOUND" });
  if (!code) return notFound();
  const select = { id: true, name: true, nameEn: true, sellBy: true, piecesPerCarton: true, isActive: true, variants: { select: { id: true, label: true, labelEn: true, piecesPerCarton: true, isActive: true } } };
  const variant = await prisma.productVariant.findFirst({
    where: { organizationId: orgId, OR: [{ barcode: code }, { sku: code }], product: { isActive: true } },
    select: { id: true, productId: true },
  });
  const product = variant
    ? await prisma.product.findUnique({ where: { id: variant.productId }, select })
    : await prisma.product.findFirst({ where: { organizationId: orgId, isActive: true, OR: [{ barcode: code }, { sku: code }] }, select });
  if (!product) return notFound();
  const v = variant ? product.variants.find((x) => x.id === variant.id) : null;
  res.json({
    productId: product.id,
    variantId: v?.id || null,
    product: { id: product.id, name: product.name, nameEn: product.nameEn, sellBy: product.sellBy, piecesPerCarton: product.piecesPerCarton },
    variant: v ? { id: v.id, label: v.label, labelEn: v.labelEn, piecesPerCarton: v.piecesPerCarton } : null,
    needsVariant: !v && product.variants.length > 0,
    units: unitsFor(product, v),
    piecesPerCarton: cartonSize(product, v),
  });
});

/**
 * GET /api/transfers?from=&to=&fromBranchId=&toBranchId=&branchId=&vehicleId=&staffId=&productId=
 * Dates are Qatar days, inclusive. staffId matches transferred by, authorised by or created by.
 * branchId matches either end.
 */
router.get("/", async (req, res) => {
  const q = req.query;
  const hasDates = q.from || q.to;
  const dates = hasDates ? qatarRange(q, { defaultFrom: new Date(0) }) : null;
  if (hasDates && !dates) return res.status(400).json(INVALID_DATES);
  const and = [{ organizationId: req.user.organizationId }];
  if (dates) and.push({ createdAt: { gte: dates.from, lt: dates.to } });
  if (q.fromBranchId) and.push({ fromBranchId: String(q.fromBranchId) });
  if (q.toBranchId) and.push({ toBranchId: String(q.toBranchId) });
  if (q.branchId) and.push({ OR: [{ fromBranchId: String(q.branchId) }, { toBranchId: String(q.branchId) }] });
  if (q.vehicleId) and.push({ vehicleId: String(q.vehicleId) });
  if (q.staffId) {
    const id = String(q.staffId);
    and.push({ OR: [{ transferredByUserId: id }, { authorisedByUserId: id }, { createdByUserId: id }] });
  }
  if (q.productId) and.push({ lines: { some: { productId: String(q.productId) } } });
  const scope = scopeWhere(req);
  if (scope) and.push(scope);
  const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
  const rows = await prisma.stockTransfer.findMany({
    where: { AND: and },
    include: {
      fromBranch: PLACE,
      toBranch: PLACE,
      transferredBy: PERSON,
      authorisedBy: PERSON,
      createdBy: PERSON,
      _count: { select: { lines: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  res.json({
    rows: rows.slice(0, limit).map((row) => ({
      id: row.id,
      reference: row.reference,
      createdAt: row.createdAt,
      fromBranch: row.fromBranch,
      toBranch: row.toBranch,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
      vehiclePlate: row.vehiclePlate,
      transferredBy: row.transferredBy,
      authorisedBy: row.authorisedBy,
      createdBy: row.createdBy,
      note: row.note,
      itemCount: row._count.lines,
    })),
    truncated: rows.length > limit,
  });
});

/** One transfer with every line: unit and quantity entered, stock units, stock before → after at both ends. */
router.get("/:id", async (req, res) => {
  const scope = scopeWhere(req);
  const row = await prisma.stockTransfer.findFirst({
    where: { id: String(req.params.id), organizationId: req.user.organizationId, ...(scope || {}) },
    include: {
      fromBranch: PLACE,
      toBranch: PLACE,
      transferredBy: PERSON,
      authorisedBy: PERSON,
      createdBy: PERSON,
      lines: {
        include: {
          product: { select: { id: true, name: true, nameEn: true, sellBy: true, sku: true, barcode: true } },
          variant: { select: { id: true, label: true, labelEn: true, sku: true, barcode: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!row) return res.status(404).json({ error: "التحويل غير موجود", errorAr: "التحويل غير موجود", errorEn: "Transfer not found" });
  res.json({
    id: row.id,
    reference: row.reference,
    createdAt: row.createdAt,
    fromBranch: row.fromBranch,
    toBranch: row.toBranch,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicleName,
    vehiclePlate: row.vehiclePlate,
    transferredBy: row.transferredBy,
    authorisedBy: row.authorisedBy,
    createdBy: row.createdBy,
    note: row.note,
    lines: row.lines.map((line) => ({
      id: line.id,
      product: line.product,
      variant: line.variant,
      unit: line.unit,
      enteredQty: Number(line.enteredQty),
      piecesPerCarton: line.piecesPerCarton,
      baseQty: line.baseQty,
      fromBefore: line.fromBefore,
      fromAfter: line.fromAfter,
      toBefore: line.toBefore,
      toAfter: line.toAfter,
    })),
  });
});

export default router;
