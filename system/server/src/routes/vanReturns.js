import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule, requireOwner } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { fmt, lineAmount, requireDirhams } from "../lib/money.js";
import { lockStockRow, moveStock } from "../lib/stockLedger.js";
import { stockRowKey, isDeadlockError, BUSY_RETRY } from "../lib/dbErrors.js";
import { readStockLines } from "../lib/inventoryTransfer.js";
import { requireActiveStaff, requireVehicle, staffAndVehicles, vehicleForBranch } from "../lib/staffPick.js";
import { normalizeImage } from "../lib/imageNormalize.js";
import {
  VAN_RETURN_PHOTOS_BUCKET,
  downloadObject,
  objectKey,
  removeObjects,
  storageEnabled,
  uploadObject,
} from "../lib/storage.js";
import { requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { qatarDayKey, qatarDayStart, qatarRange } from "../lib/qatarTime.js";

/**
 * Van returns: goods a van driver collects back from a customer. Not a till refund.
 *  - Recorded into the van (status IN_VAN): nothing is added to sellable stock.
 *  - Received at a warehouse (RECEIVED): GOOD lines go into that location's stock with a
 *    RETURN movement at the location's unit cost (else the product cost); DAMAGED lines become
 *    DamagedStock rows, never sellable, that only the owner can write off or sell cheaply.
 *  - Paid back to the customer (cash or bank), when recorded or later. Cash paid while the van's
 *    till session is open is linked to it, so the van cash-up expects less cash.
 * Accounting: see docs/testing/van-returns.md and lib/financeData.js.
 */
const router = Router();
router.use(authMiddleware);
router.use(requireModule("returns", "view"));

const PERSON = { select: { id: true, name: true, nameEn: true } };
const PLACE = { select: { id: true, name: true, nameEn: true, kind: true } };
const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
const PAY_METHODS = ["CASH", "BANK"];
const SALE_METHODS = ["CASH", "CARD", "BANK"];

function vrError(errorAr, errorEn, status = 400, code) {
  const err = new Error(errorAr);
  err.status = status;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  if (code) err.code = code;
  return err;
}

const NOT_FOUND = () => vrError("المرتجع غير موجود", "Van return not found", 404);

/**
 * Staff whose own location is a van only work with that van (record, see, pay).
 * Returns the van id they are tied to, or null for everyone else.
 */
async function ownVan(req) {
  if (req.user.role === "ADMIN" || !req.user.branchId) return null;
  if (req._ownVan !== undefined) return req._ownVan;
  const branch = await prisma.branch.findFirst({ where: { id: req.user.branchId, organizationId: req.user.organizationId }, select: { id: true, kind: true } });
  req._ownVan = branch?.kind === "VAN" ? branch.id : null;
  return req._ownVan;
}

async function assertVanAllowed(req, vanBranchId) {
  const own = await ownVan(req);
  if (own && own !== vanBranchId) throw vrError("هذا المرتجع لسيارة أخرى", "This return belongs to another van", 403, "FORBIDDEN");
}

async function scopedWhere(req, extra = {}) {
  const own = await ownVan(req);
  return { organizationId: req.user.organizationId, ...(own ? { vanBranchId: own } : {}), ...extra };
}

/** Photo from the request (base64 or data URL) → checked and re-encoded WebP (no metadata). */
async function readPhoto(raw) {
  const text = String(raw?.dataBase64 || raw?.data || raw || "");
  const b64 = text.includes(",") && text.startsWith("data:") ? text.slice(text.indexOf(",") + 1) : text;
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length) return null;
  if (bytes.length > PHOTO_MAX_BYTES) throw vrError("الصورة أكبر من 6 ميغابايت", "The photo must be 6 MB or smaller");
  return normalizeImage(bytes);
}

function moneyOut(row) {
  return row == null ? null : fmt(row);
}

function returnSummary(row) {
  return {
    id: row.id,
    version: row.version,
    reference: row.reference,
    status: row.status,
    vanBranch: row.vanBranch,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicleName,
    vehiclePlate: row.vehiclePlate,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    collectedBy: row.collectedBy,
    createdBy: row.createdBy,
    collectedAt: row.collectedAt,
    amountOwed: moneyOut(row.amountOwed),
    note: row.note,
    paymentStatus: row.paymentStatus,
    paidMethod: row.paidMethod,
    paidReference: row.paidReference,
    paidBy: row.paidBy,
    paidAt: row.paidAt,
    cashSessionId: row.cashSessionId,
    receivedBranch: row.receivedBranch,
    receivedAt: row.receivedAt,
    broughtBackBy: row.broughtBackBy,
    receivedBy: row.receivedBy,
    createdAt: row.createdAt,
    lineCount: row._count?.lines ?? row.lines?.length ?? 0,
    damagedCount: row.lines ? row.lines.filter((l) => l.condition === "DAMAGED").length : undefined,
  };
}

const SUMMARY_INCLUDE = {
  vanBranch: PLACE,
  receivedBranch: PLACE,
  collectedBy: PERSON,
  createdBy: PERSON,
  paidBy: PERSON,
  broughtBackBy: PERSON,
  receivedBy: PERSON,
  lines: { select: { condition: true } },
};

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  lines: {
    include: {
      product: { select: { id: true, name: true, nameEn: true, sellBy: true } },
      variant: { select: { id: true, label: true, labelEn: true } },
      damagedStock: { select: { id: true, status: true } },
    },
    orderBy: { id: "asc" },
  },
};

function lineOut(line, { withCost = false } = {}) {
  return {
    id: line.id,
    product: line.product,
    variant: line.variant,
    unit: line.unit,
    enteredQty: Number(line.enteredQty),
    piecesPerCarton: line.piecesPerCarton,
    baseQty: line.baseQty,
    condition: line.condition,
    photoId: line.photoId,
    photoUrl: line.photoId ? `/api/van-returns/photos/${line.photoId}` : null,
    damagedStock: line.damagedStock || null,
    ...(withCost ? { unitCost: moneyOut(line.unitCost), costAmount: moneyOut(line.costAmount) } : {}),
  };
}

/** Staff, vehicles, vans and receiving locations for the forms. */
router.get("/options", async (req, res) => {
  const orgId = req.user.organizationId;
  const own = await ownVan(req);
  const [{ staff, vehicles }, branches] = await Promise.all([
    staffAndVehicles(orgId),
    prisma.branch.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, nameEn: true, kind: true }, orderBy: { createdAt: "asc" } }),
  ]);
  res.json({
    staff,
    vehicles: own ? vehicles.filter((v) => v.branchId === own) : vehicles,
    vans: branches.filter((b) => b.kind === "VAN" && (!own || b.id === own)),
    locations: branches.filter((b) => b.kind !== "VAN"),
    ownVanId: own,
  });
});

/** Customer search for the return form (name or phone). */
router.get("/customers", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = await prisma.customer.findMany({
    where: {
      organizationId: req.user.organizationId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  res.json(rows);
});

/** Vehicles this user may open a dashboard for (staff of a van: that van only). */
router.get("/vehicles", async (req, res) => {
  const own = await ownVan(req);
  const rows = await prisma.vehicle.findMany({
    where: { organizationId: req.user.organizationId, ...(own ? { branchId: own } : {}) },
    include: { branch: PLACE },
    orderBy: { name: "asc" },
  });
  res.json(rows.map((v) => ({ id: v.id, name: v.name, plate: v.plate, isActive: v.isActive, branchId: v.branchId, branch: v.branch })));
});

/** Vehicle dashboard: van, stock in the van, recent transfers, returns, payments, damaged stock. */
router.get("/vehicles/:id/dashboard", async (req, res) => {
  const orgId = req.user.organizationId;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: String(req.params.id), organizationId: orgId }, include: { branch: PLACE } });
  if (!vehicle) throw vrError("المركبة غير موجودة", "Vehicle not found", 404);
  const own = await ownVan(req);
  if (own && vehicle.branchId !== own) throw vrError("هذه المركبة لسيارة أخرى", "This vehicle belongs to another van", 403, "FORBIDDEN");
  const vanId = vehicle.branchId;
  const canSeeTransfers = await hasModule(req, "warehouses", "view");

  const [inv, vstock, transfers, returns, damaged] = await Promise.all([
    vanId
      ? prisma.inventory.findMany({ where: { branchId: vanId, quantity: { gt: 0 } }, select: { quantity: true, product: { select: { id: true, name: true, nameEn: true, sellBy: true } } } })
      : [],
    vanId
      ? prisma.variantStock.findMany({ where: { branchId: vanId, quantity: { gt: 0 } }, select: { quantity: true, variant: { select: { id: true, label: true, labelEn: true, product: { select: { id: true, name: true, nameEn: true, sellBy: true } } } } } })
      : [],
    canSeeTransfers
      ? prisma.stockTransfer.findMany({
        where: { organizationId: orgId, OR: [{ vehicleId: vehicle.id }, ...(vanId ? [{ fromBranchId: vanId }, { toBranchId: vanId }] : [])] },
        include: { fromBranch: PLACE, toBranch: PLACE, transferredBy: PERSON, _count: { select: { lines: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
      })
      : [],
    prisma.vanReturn.findMany({
      where: { organizationId: orgId, OR: [{ vehicleId: vehicle.id }, ...(vanId ? [{ vanBranchId: vanId }] : [])] },
      include: SUMMARY_INCLUDE,
      orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.damagedStock.findMany({
      where: { organizationId: orgId, vanReturn: { OR: [{ vehicleId: vehicle.id }, ...(vanId ? [{ vanBranchId: vanId }] : [])] } },
      include: DAMAGED_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const stock = [
    ...inv.map((r) => ({ productId: r.product.id, variantId: null, name: r.product.name, nameEn: r.product.nameEn, sellBy: r.product.sellBy, quantity: r.quantity })),
    ...vstock.map((r) => ({
      productId: r.variant.product.id, variantId: r.variant.id,
      name: `${r.variant.product.name} (${r.variant.label})`, nameEn: `${r.variant.product.nameEn || r.variant.product.name} (${r.variant.labelEn || r.variant.label})`,
      sellBy: r.variant.product.sellBy, quantity: r.quantity,
    })),
  ].sort((a, b) => String(a.nameEn).localeCompare(String(b.nameEn)));
  const unpaid = returns.filter((r) => r.paymentStatus === "UNPAID" && r.amountOwed > 0);
  const paid = returns.filter((r) => r.paymentStatus === "PAID");
  const sumOwed = (list) => list.reduce((a, r) => a + r.amountOwed, 0);
  res.json({
    vehicle: { id: vehicle.id, name: vehicle.name, plate: vehicle.plate, isActive: vehicle.isActive, version: vehicle.version, branch: vehicle.branch },
    stock: {
      lines: stock.length,
      pieces: stock.filter((s) => s.sellBy !== "WEIGHT").reduce((a, s) => a + s.quantity, 0),
      grams: stock.filter((s) => s.sellBy === "WEIGHT").reduce((a, s) => a + s.quantity, 0),
      items: stock,
    },
    transfers: canSeeTransfers
      ? transfers.map((t) => ({ id: t.id, reference: t.reference, createdAt: t.createdAt, fromBranch: t.fromBranch, toBranch: t.toBranch, transferredBy: t.transferredBy, vehiclePlate: t.vehiclePlate, itemCount: t._count.lines, direction: vanId && t.toBranchId === vanId ? "IN" : vanId && t.fromBranchId === vanId ? "OUT" : "" }))
      : null,
    returns: returns.map(returnSummary),
    counts: {
      inVan: returns.filter((r) => r.status === "IN_VAN").length,
      received: returns.filter((r) => r.status === "RECEIVED").length,
      all: returns.length,
    },
    payments: {
      unpaidCount: unpaid.length,
      unpaidTotal: fmt(sumOwed(unpaid)),
      paidCount: paid.length,
      paidTotal: fmt(sumOwed(paid)),
      paidCash: fmt(sumOwed(paid.filter((r) => r.paidMethod === "CASH"))),
      paidBank: fmt(sumOwed(paid.filter((r) => r.paidMethod === "BANK"))),
    },
    damaged: damaged.map(damagedOut),
  });
});

// ------------------------------------------------------------------ damaged stock

const DAMAGED_INCLUDE = {
  branch: PLACE,
  product: { select: { id: true, name: true, nameEn: true, sellBy: true } },
  variant: { select: { id: true, label: true, labelEn: true } },
  resolvedBy: PERSON,
  vanReturn: { select: { id: true, reference: true, vanBranchId: true, vehiclePlate: true, customerName: true } },
};

function damagedOut(row) {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    branch: row.branch,
    product: row.product,
    variant: row.variant,
    quantity: row.quantity,
    unitCost: moneyOut(row.unitCost),
    costAmount: moneyOut(row.costAmount),
    saleAmount: moneyOut(row.saleAmount),
    saleMethod: row.saleMethod,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolveNote: row.resolveNote,
    photoUrl: row.photoId ? `/api/van-returns/photos/${row.photoId}` : null,
    vanReturn: row.vanReturn,
    createdAt: row.createdAt,
  };
}

/** Damaged stock (kept out of sale). ?status=HELD|WRITTEN_OFF|SOLD */
router.get("/damaged", async (req, res) => {
  const own = await ownVan(req);
  const status = ["HELD", "WRITTEN_OFF", "SOLD"].includes(String(req.query.status || "").toUpperCase()) ? String(req.query.status).toUpperCase() : null;
  const rows = await prisma.damagedStock.findMany({
    where: { organizationId: req.user.organizationId, ...(status ? { status } : {}), ...(own ? { vanReturn: { vanBranchId: own } } : {}) },
    include: DAMAGED_INCLUDE,
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
  res.json(rows.map(damagedOut));
});

async function loadHeldDamaged(req) {
  const row = await prisma.damagedStock.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: { vanReturn: { select: { reference: true } } } });
  if (!row) throw vrError("البند التالف غير موجود", "Damaged stock not found", 404);
  return row;
}

/** Owner only: write the damaged goods off (a loss at cost). */
router.post("/damaged/:id/write-off", requireOwner, async (req, res) => {
  const version = requireVersion(req);
  const row = await loadHeldDamaged(req);
  if (row.status !== "HELD") throw vrError("تمت معالجة هذا البند من قبل", "This damaged stock was already dealt with", 409, "ALREADY_RESOLVED");
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await versionedUpdate(tx, "damagedStock", {
      id: row.id, version, where: { status: "HELD" },
      data: { status: "WRITTEN_OFF", resolvedAt: new Date(), resolvedByUserId: req.user.sub, resolveNote: note },
      include: DAMAGED_INCLUDE,
    });
    await writeAudit({
      userId: req.user.sub, action: "DAMAGED_STOCK_WRITE_OFF", entityType: "DamagedStock", entityId: row.id, branchId: row.branchId,
      summary: `Write off damaged ${row.quantity} of ${row.productId} from ${row.vanReturn?.reference || row.vanReturnId} at cost ${fmt(row.costAmount)}`,
      meta: { vanReturnId: row.vanReturnId, quantity: row.quantity, costAmount: fmt(row.costAmount), note },
    }, tx);
    return updated;
  });
  res.json(damagedOut(saved));
});

/** Owner only: sell the damaged goods at a reduced price (money in). */
router.post("/damaged/:id/sell", requireOwner, async (req, res) => {
  const version = requireVersion(req);
  const row = await loadHeldDamaged(req);
  if (row.status !== "HELD") throw vrError("تمت معالجة هذا البند من قبل", "This damaged stock was already dealt with", 409, "ALREADY_RESOLVED");
  const amount = requireDirhams(req.body?.amount, { allowZero: false }, "sale amount");
  const method = String(req.body?.method || "").toUpperCase();
  if (!SALE_METHODS.includes(method)) throw vrError("اختر طريقة الدفع: نقداً أو بطاقة أو تحويل بنكي", "Choose how it was paid: cash, card or bank transfer");
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await versionedUpdate(tx, "damagedStock", {
      id: row.id, version, where: { status: "HELD" },
      data: { status: "SOLD", saleAmount: amount, saleMethod: method, resolvedAt: new Date(), resolvedByUserId: req.user.sub, resolveNote: note },
      include: DAMAGED_INCLUDE,
    });
    await writeAudit({
      userId: req.user.sub, action: "DAMAGED_STOCK_SELL", entityType: "DamagedStock", entityId: row.id, branchId: row.branchId,
      summary: `Sold damaged ${row.quantity} of ${row.productId} from ${row.vanReturn?.reference || row.vanReturnId} for ${fmt(amount)} (${method})`,
      meta: { vanReturnId: row.vanReturnId, quantity: row.quantity, costAmount: fmt(row.costAmount), saleAmount: fmt(amount), method, note },
    }, tx);
    return updated;
  });
  res.json(damagedOut(saved));
});

// ------------------------------------------------------------------ photos

/** Evidence photo (private): staff who may see van returns; van staff only their van's. */
router.get("/photos/:id", async (req, res) => {
  const photo = await prisma.vanReturnPhoto.findFirst({
    where: { id: String(req.params.id), organizationId: req.user.organizationId },
    include: { vanReturn: { select: { vanBranchId: true } } },
  });
  if (!photo) throw vrError("الصورة غير موجودة", "Photo not found", 404);
  await assertVanAllowed(req, photo.vanReturn.vanBranchId);
  let bytes = photo.content ? Buffer.from(photo.content) : null;
  if (!bytes && photo.storagePath) bytes = await downloadObject(VAN_RETURN_PHOTOS_BUCKET, photo.storagePath);
  if (!bytes) throw vrError("الصورة غير موجودة", "Photo not found", 404);
  res.setHeader("Content-Type", photo.mime || "image/webp");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.send(bytes);
});

// ------------------------------------------------------------------ list / detail

/** GET /api/van-returns?status=&paymentStatus=&vanBranchId=&vehicleId=&from=&to= */
router.get("/", async (req, res) => {
  const q = req.query;
  const extra = {};
  if (["IN_VAN", "RECEIVED"].includes(String(q.status || "").toUpperCase())) extra.status = String(q.status).toUpperCase();
  if (["UNPAID", "PAID"].includes(String(q.paymentStatus || "").toUpperCase())) extra.paymentStatus = String(q.paymentStatus).toUpperCase();
  if (q.vanBranchId) extra.vanBranchId = String(q.vanBranchId);
  if (q.vehicleId) extra.vehicleId = String(q.vehicleId);
  if (q.from || q.to) {
    const dates = qatarRange(q, { defaultFrom: new Date(0) });
    if (!dates) throw vrError("تاريخ غير صالح", "Invalid dates");
    extra.collectedAt = { gte: dates.from, lt: dates.to };
  }
  const where = await scopedWhere(req, extra);
  if (extra.vanBranchId && where.vanBranchId !== extra.vanBranchId) where.vanBranchId = "__none__";
  const rows = await prisma.vanReturn.findMany({ where, include: SUMMARY_INCLUDE, orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 500 });
  res.json(rows.map(returnSummary));
});

router.get("/:id", async (req, res) => {
  const row = await prisma.vanReturn.findFirst({ where: await scopedWhere(req, { id: String(req.params.id) }), include: DETAIL_INCLUDE });
  if (!row) throw NOT_FOUND();
  const withCost = await hasModule(req, "finance", "view");
  res.json({ ...returnSummary(row), lines: row.lines.map((l) => lineOut(l, { withCost })) });
});

// ------------------------------------------------------------------ record

function collectedAtFrom(raw) {
  if (raw == null || String(raw).trim() === "") return new Date();
  const text = String(raw).trim();
  let at;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    // A past Qatar day is dated at noon; today keeps the time now.
    at = text === qatarDayKey(new Date()) ? new Date() : new Date(qatarDayStart(text).getTime() + 12 * 3600 * 1000);
  } else at = new Date(text);
  if (Number.isNaN(at.getTime())) throw vrError("تاريخ غير صالح", "Invalid dates");
  if (at.getTime() > Date.now() + 5 * 60 * 1000) throw vrError("لا يمكن أن يكون تاريخ الاستلام في المستقبل", "The return date cannot be in the future");
  return at;
}

/** Cash paid while the van's till session is open goes against that session (cash-up). */
async function openSessionFor(db, vanBranchId) {
  const session = await db.cashSession.findFirst({ where: { branchId: vanBranchId, closedAt: null }, select: { id: true } });
  return session?.id || null;
}

function paymentFields(raw) {
  const method = String(raw?.method || "").toUpperCase();
  if (!PAY_METHODS.includes(method)) throw vrError("اختر طريقة الدفع: نقداً أو تحويل بنكي", "Choose how the customer was paid: cash or bank transfer");
  const reference = raw?.reference != null && String(raw.reference).trim() ? String(raw.reference).trim().slice(0, 120) : null;
  return { method, reference };
}

/**
 * POST /api/van-returns
 * { vanBranchId, vehicleId?, customerId? | customerName?, customerPhone?, collectedByUserId?, collectedAt?,
 *   amountOwed (QAR), note?, lines: [{ productId, variantId?, unit, quantity, condition: GOOD|DAMAGED, photo?: { dataBase64 } }],
 *   payment?: { method: CASH|BANK, reference? } }
 * A DAMAGED line needs a photo. Nothing is added to sellable stock until the return is received.
 */
router.post("/", requireModule("returns", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const body = req.body || {};
  const vanBranchId = String(body.vanBranchId || "");
  const van = vanBranchId ? await prisma.branch.findFirst({ where: { id: vanBranchId, organizationId: orgId }, select: { id: true, kind: true, isActive: true } }) : null;
  if (!van || van.kind !== "VAN" || van.isActive === false) throw vrError("اختر سيارة بيع نشطة", "Choose an active van");
  await assertVanAllowed(req, van.id);

  let vehicle = null;
  if (body.vehicleId === undefined) vehicle = await vehicleForBranch(prisma, orgId, van.id);
  else if (body.vehicleId) vehicle = await requireVehicle(prisma, orgId, body.vehicleId);

  let customer = null;
  if (body.customerId) {
    customer = await prisma.customer.findFirst({ where: { id: String(body.customerId), organizationId: orgId }, select: { id: true, name: true, phone: true } });
    if (!customer) throw vrError("العميل غير موجود", "Customer not found", 404);
  }
  const customerName = String(body.customerName || customer?.name || "").trim().slice(0, 160) || null;
  const customerPhone = String(body.customerPhone || customer?.phone || "").trim().slice(0, 40) || null;
  if (!customer && !customerName && !customerPhone) throw vrError("اختر العميل أو اكتب اسمه أو هاتفه", "Choose the customer or type a name or phone");

  const collector = await requireActiveStaff(prisma, orgId, body.collectedByUserId || req.user.sub);
  const collectedAt = collectedAtFrom(body.collectedAt);
  const amountOwed = body.amountOwed == null || String(body.amountOwed).trim() === "" ? 0 : requireDirhams(body.amountOwed, { allowZero: true }, "amount owed");
  const note = body.note != null && String(body.note).trim() ? String(body.note).trim().slice(0, 500) : null;
  const payment = body.payment && body.payment.method ? paymentFields(body.payment) : null;
  if (payment && amountOwed <= 0) throw vrError("لا يوجد مبلغ مستحق للعميل", "Nothing is owed to the customer");

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines = await readStockLines(prisma, orgId, rawLines, {
    mergeKey: () => null,
    extra: (raw) => ({ condition: String(raw?.condition || "").toUpperCase(), photoRaw: raw?.photo || null }),
  });
  for (const line of lines) {
    if (!["GOOD", "DAMAGED"].includes(line.condition)) throw vrError(`اختر الحالة (سليم أو تالف): ${line.names.ar}`, `Choose the condition (good or damaged): ${line.names.en}`);
    if (line.product.takesStock === false) throw vrError(`هذا المنتج لا يُحفظ في المخزون: ${line.names.ar}`, `This product does not keep stock: ${line.names.en}`);
    if (line.condition === "DAMAGED" && !line.photoRaw) throw vrError(`البند التالف يحتاج صورة: ${line.names.ar}`, `A damaged line needs a photo: ${line.names.en}`, 400, "PHOTO_REQUIRED");
  }
  // Photos: checked and re-encoded before anything is saved.
  for (const line of lines) {
    line.photo = line.photoRaw ? await readPhoto(line.photoRaw) : null;
    if (line.condition === "DAMAGED" && !line.photo) throw vrError(`البند التالف يحتاج صورة: ${line.names.ar}`, `A damaged line needs a photo: ${line.names.en}`, 400, "PHOTO_REQUIRED");
  }
  const written = [];
  try {
    if (storageEnabled()) {
      for (const line of lines) {
        if (!line.photo) continue;
        const key = objectKey(orgId, "webp");
        await uploadObject(VAN_RETURN_PHOTOS_BUCKET, key, line.photo.buffer, "image/webp");
        written.push(key);
        line.photo.storagePath = key;
      }
    }
    const created = await prisma.$transaction(async (tx) => {
      const cashSessionId = payment?.method === "CASH" ? await openSessionFor(tx, van.id) : null;
      const row = await tx.vanReturn.create({
        data: {
          organizationId: orgId,
          vanBranchId: van.id,
          vehicleId: vehicle?.id || null,
          vehicleName: vehicle?.name || null,
          vehiclePlate: vehicle?.plate || null,
          customerId: customer?.id || null,
          customerName,
          customerPhone,
          collectedByUserId: collector.id,
          createdByUserId: req.user.sub,
          collectedAt,
          amountOwed,
          note,
          ...(payment
            ? { paymentStatus: "PAID", paidMethod: payment.method, paidReference: payment.reference, paidByUserId: req.user.sub, paidAt: new Date(), cashSessionId }
            : {}),
        },
      });
      for (const line of lines) {
        let photoId = null;
        if (line.photo) {
          const photo = await tx.vanReturnPhoto.create({
            data: {
              organizationId: orgId,
              vanReturnId: row.id,
              mime: "image/webp",
              size: line.photo.buffer.length,
              width: line.photo.width,
              height: line.photo.height,
              ...(line.photo.storagePath ? { storagePath: line.photo.storagePath } : { content: line.photo.buffer }),
            },
          });
          photoId = photo.id;
        }
        await tx.vanReturnLine.create({
          data: {
            vanReturnId: row.id,
            productId: line.productId,
            variantId: line.variantId,
            unit: line.unit,
            enteredQty: line.enteredQty,
            piecesPerCarton: line.piecesPerCarton,
            baseQty: line.baseQty,
            condition: line.condition,
            photoId,
          },
        });
      }
      await writeAudit({
        userId: req.user.sub, action: "VAN_RETURN_CREATE", entityType: "VanReturn", entityId: row.id, branchId: van.id,
        summary: `Van return ${row.reference}: ${lines.length} lines, owed ${fmt(amountOwed)}${payment ? `, paid ${payment.method}` : ""}`,
        meta: {
          customerId: customer?.id || null, customerName, collectedByUserId: collector.id, vehiclePlate: vehicle?.plate || null,
          lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, unit: l.unit, enteredQty: l.enteredQty, baseQty: l.baseQty, condition: l.condition })),
          payment: payment ? { ...payment, cashSessionId } : null,
        },
      }, tx);
      return row;
    });
    const full = await prisma.vanReturn.findUnique({ where: { id: created.id }, include: DETAIL_INCLUDE });
    res.status(201).json({ ...returnSummary(full), lines: full.lines.map((l) => lineOut(l)) });
  } catch (e) {
    await removeObjects(VAN_RETURN_PHOTOS_BUCKET, written);
    throw e;
  }
});

// ------------------------------------------------------------------ pay

/** Mark the money owed as paid back (cash or bank). Body: { version, method, reference? } */
router.post("/:id/pay", requireModule("returns", ["create", "edit"]), async (req, res) => {
  const version = requireVersion(req);
  const row = await prisma.vanReturn.findFirst({ where: await scopedWhere(req, { id: String(req.params.id) }) });
  if (!row) throw NOT_FOUND();
  if (row.paymentStatus === "PAID") throw vrError("تم دفع هذا المرتجع من قبل", "This return was already paid", 409, "ALREADY_PAID");
  if (row.amountOwed <= 0) throw vrError("لا يوجد مبلغ مستحق للعميل", "Nothing is owed to the customer");
  const payment = paymentFields(req.body);
  const saved = await prisma.$transaction(async (tx) => {
    const cashSessionId = payment.method === "CASH" ? await openSessionFor(tx, row.vanBranchId) : null;
    const updated = await versionedUpdate(tx, "vanReturn", {
      id: row.id, version, where: { paymentStatus: "UNPAID" },
      data: { paymentStatus: "PAID", paidMethod: payment.method, paidReference: payment.reference, paidByUserId: req.user.sub, paidAt: new Date(), cashSessionId },
      include: DETAIL_INCLUDE,
    });
    await writeAudit({
      userId: req.user.sub, action: "VAN_RETURN_PAY", entityType: "VanReturn", entityId: row.id, branchId: row.vanBranchId,
      summary: `Van return ${row.reference} paid ${fmt(row.amountOwed)} by ${payment.method}`,
      meta: { ...payment, amount: fmt(row.amountOwed), cashSessionId },
    }, tx);
    return updated;
  });
  res.json({ ...returnSummary(saved), lines: saved.lines.map((l) => lineOut(l)) });
});

// ------------------------------------------------------------------ receive

/**
 * Convert into a warehouse return. Body: { version, branchId? (default: first warehouse), broughtBackByUserId? }
 * GOOD lines → RETURN movement into that location at its unit cost (else product cost).
 * DAMAGED lines → DamagedStock (HELD), never sellable.
 */
router.post("/:id/receive", requireModule("returns", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const orgId = req.user.organizationId;
  const row = await prisma.vanReturn.findFirst({
    where: await scopedWhere(req, { id: String(req.params.id) }),
    include: { lines: { include: { product: { select: { id: true, name: true, nameEn: true, sellBy: true, cost: true } } } } },
  });
  if (!row) throw NOT_FOUND();
  if (row.status !== "IN_VAN") throw vrError("تم استلام هذا المرتجع من قبل", "This return was already received", 409, "ALREADY_RECEIVED");
  let branch;
  if (req.body?.branchId) {
    branch = await prisma.branch.findFirst({ where: { id: String(req.body.branchId), organizationId: orgId }, select: { id: true, kind: true, isActive: true } });
  } else {
    branch = await prisma.branch.findFirst({ where: { organizationId: orgId, kind: "WAREHOUSE", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, isActive: true } });
  }
  if (!branch || branch.isActive === false || branch.kind === "VAN") throw vrError("اختر المستودع أو الموقع المستلم", "Choose the warehouse or location receiving it");
  const broughtBack = await requireActiveStaff(prisma, orgId, req.body?.broughtBackByUserId || row.collectedByUserId);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const updated = await versionedUpdate(tx, "vanReturn", {
        id: row.id, version, where: { status: "IN_VAN" },
        data: { status: "RECEIVED", receivedBranchId: branch.id, receivedAt: new Date(), broughtBackByUserId: broughtBack.id, receivedByUserId: req.user.sub },
      });
      // Lock the receiving balance rows in the shared fixed order (no deadlock with the till).
      const keys = new Map();
      for (const line of row.lines) {
        const key = stockRowKey({ productId: line.productId, variantId: line.variantId, branchId: branch.id });
        if (!keys.has(key) && line.condition === "GOOD") keys.set(key, { productId: line.productId, variantId: line.variantId, branchId: branch.id });
      }
      const locked = new Map();
      for (const key of [...keys.keys()].sort()) locked.set(key, await lockStockRow(tx, keys.get(key)));
      const costAt = async (line) => {
        const key = stockRowKey({ productId: line.productId, variantId: line.variantId, branchId: branch.id });
        let cost = locked.get(key)?.unitCost;
        if (cost == null && !locked.has(key)) {
          const found = line.variantId
            ? await tx.variantStock.findUnique({ where: { variantId_branchId: { variantId: line.variantId, branchId: branch.id } }, select: { unitCost: true } })
            : await tx.inventory.findUnique({ where: { productId_branchId: { productId: line.productId, branchId: branch.id } }, select: { unitCost: true } });
          cost = found?.unitCost;
        }
        if (cost == null) cost = line.product.cost;
        return cost == null ? null : Number(cost);
      };
      const moved = [];
      for (const line of row.lines) {
        const unitCost = await costAt(line);
        // Weight goods: grams × cost per kg / 1000.
        const costAmount = unitCost != null ? lineAmount(unitCost, line.baseQty, line.product.sellBy) : 0;
        await tx.vanReturnLine.update({ where: { id: line.id }, data: { unitCost, costAmount } });
        if (line.condition === "GOOD") {
          const r = await moveStock(tx, {
            orgId, userId: req.user.sub, productId: line.productId, variantId: line.variantId, branchId: branch.id,
            delta: line.baseQty, reason: "RETURN", note: `Van return ${row.reference}`, vanReturnId: row.id, receiptUnitCost: unitCost,
          });
          moved.push({ lineId: line.id, before: r.before, after: r.after });
        } else {
          await tx.damagedStock.create({
            data: {
              organizationId: orgId, vanReturnId: row.id, vanReturnLineId: line.id, branchId: branch.id,
              productId: line.productId, variantId: line.variantId, quantity: line.baseQty, unitCost, costAmount, photoId: line.photoId,
            },
          });
        }
      }
      await writeAudit({
        userId: req.user.sub, action: "VAN_RETURN_RECEIVE", entityType: "VanReturn", entityId: row.id, branchId: branch.id,
        summary: `Van return ${row.reference} received: ${row.lines.filter((l) => l.condition === "GOOD").length} good, ${row.lines.filter((l) => l.condition === "DAMAGED").length} damaged`,
        meta: { vanBranchId: row.vanBranchId, receivedBranchId: branch.id, broughtBackByUserId: broughtBack.id, moved },
      }, tx);
      return updated;
    });
    const full = await prisma.vanReturn.findUnique({ where: { id: saved.id }, include: DETAIL_INCLUDE });
    res.json({ ...returnSummary(full), lines: full.lines.map((l) => lineOut(l)) });
  } catch (e) {
    if (isDeadlockError(e)) return res.status(409).json(BUSY_RETRY);
    throw e;
  }
});

export default router;
