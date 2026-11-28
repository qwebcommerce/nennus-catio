import { prisma } from "./prisma.js";
import { fmt, lineAmount } from "./money.js";
import { lockStockRow, moveStock } from "./stockLedger.js";
import { writeAudit } from "./auditLog.js";
import { stockRowKey } from "./dbErrors.js";
import { lineNames, toBaseQuantity } from "./stockUnits.js";
import { optionalActiveStaff, requireActiveStaff, requireVehicle, vehicleForBranch } from "./staffPick.js";

function transferError(errorAr, errorEn, status = 400) {
  const err = new Error(errorAr);
  err.status = status;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  return err;
}

/**
 * Reads the entered lines: product / variant checked against the organisation, the unit
 * converted to stock units (pieces, or grams for weight goods). Lines for the same merge key
 * (product, variant and unit by default) are added together. Shared with van returns
 * (`extra` copies per-line fields, `mergeKey` decides what may be merged).
 */
export async function readStockLines(db, orgId, items, { mergeKey = (line) => `${line.productId}:${line.variantId || ""}:${line.unit}`, extra } = {}) {
  if (!Array.isArray(items) || !items.length) throw transferError("لا توجد بنود", "Add at least one item");
  const productIds = [...new Set(items.map((line) => String(line?.productId || "")).filter(Boolean))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, organizationId: orgId },
    select: {
      id: true, name: true, nameEn: true, sellBy: true, cost: true, piecesPerCarton: true, takesStock: true,
      variants: { select: { id: true, label: true, labelEn: true, piecesPerCarton: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const merged = new Map();
  let index = 0;
  for (const raw of items) {
    index += 1;
    const productId = String(raw?.productId || "");
    if (!productId) continue;
    const product = byId.get(productId);
    if (!product) throw transferError(`منتج غير موجود: ${productId}`, `Product not found: ${productId}`);
    const variantId = raw?.variantId ? String(raw.variantId) : null;
    if (product.variants.length && !variantId) {
      throw transferError(`اختر الحجم لـ ${product.name}`, `Choose a variant for ${product.nameEn || product.name}`);
    }
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : null;
    if (variantId && !variant) {
      throw transferError(`الحجم غير تابع لـ ${product.name}`, `Variant is not on ${product.nameEn || product.name}`);
    }
    const names = lineNames(product, variant);
    const conv = toBaseQuantity({ product, variant, unit: raw?.unit, quantity: raw?.quantity, label: names.en });
    const line = { index, productId, variantId, product, variant, names, ...conv, ...(extra ? extra(raw, product) : {}) };
    const key = mergeKey(line);
    const prev = key != null ? merged.get(key) : null;
    if (prev) {
      prev.baseQty += line.baseQty;
      prev.enteredQty = line.unit === "KG" ? (prev.baseQty / 1000).toFixed(3) : String(Number(prev.enteredQty) + Number(line.enteredQty));
    } else merged.set(key ?? `#${index}`, line);
  }
  const lines = [...merged.values()];
  if (!lines.length) throw transferError("لا توجد بنود", "Add at least one item");
  return lines;
}

/**
 * One-step stock transfer between two locations (stock moves when it is saved) with a
 * transfer record: reference, who moved and authorised it, the vehicle (name and plate kept as
 * they were), each line in the unit entered and in stock units, the value moved at source cost,
 * and stock before / after at both ends. Used by POST /api/inventory/transfer.
 *
 * Items: { productId, variantId?, unit?: "PIECE"|"CARTON"|"KG", quantity }. Without `unit`,
 * quantity is in stock units (pieces, or grams for weight goods) as before.
 * vehicleId: undefined → the van's vehicle when one end is a van; null / "" → none.
 */
export async function executeInventoryTransfer({
  orgId,
  userId,
  fromBranchId,
  toBranchId,
  items,
  transferredByUserId,
  authorisedByUserId,
  vehicleId,
  note,
}) {
  const from = String(fromBranchId || "");
  const to = String(toBranchId || "");
  if (!from || !to || from === to) {
    throw transferError("فرع المصدر والوجهة غير صالحين", "Invalid source/destination branch");
  }
  // FR-89: an inactive location cannot send or receive stock.
  const ends = await prisma.branch.findMany({
    where: { id: { in: [from, to] }, organizationId: orgId },
    select: { id: true, isActive: true, kind: true },
  });
  if (ends.length !== 2 || ends.some((b) => b.isActive === false)) {
    throw transferError("لا يمكن التحويل من موقع غير نشط أو إليه", "Stock cannot move into or out of an inactive location");
  }
  const fromBranch = ends.find((b) => b.id === from);
  const toBranch = ends.find((b) => b.id === to);

  const lines = await readStockLines(prisma, orgId, items);
  for (const line of lines) {
    if (line.product.takesStock === false) {
      throw transferError(`هذا المنتج لا يُحفظ في المخزون: ${line.names.ar}`, `This product does not keep stock: ${line.names.en}`);
    }
  }

  const mover = await requireActiveStaff(prisma, orgId, transferredByUserId || userId);
  const authoriser = await optionalActiveStaff(prisma, orgId, authorisedByUserId);
  let vehicle = null;
  if (vehicleId === undefined) {
    vehicle = (toBranch.kind === "VAN" ? await vehicleForBranch(prisma, orgId, to) : null) || (fromBranch.kind === "VAN" ? await vehicleForBranch(prisma, orgId, from) : null);
  } else if (vehicleId) {
    vehicle = await requireVehicle(prisma, orgId, vehicleId);
  }
  const cleanNote = note != null && String(note).trim() ? String(note).trim().slice(0, 500) : null;

  const record = await prisma.$transaction(async (tx) => {
    // Lock every balance row (both ends) in one fixed order, like the till and the web checkout,
    // so a transfer and a sale touching the same rows cannot deadlock.
    const need = new Map();
    for (const line of lines) {
      const key = `${line.productId}|${line.variantId || ""}`;
      need.set(key, { productId: line.productId, variantId: line.variantId, qty: (need.get(key)?.qty || 0) + line.baseQty, names: line.names });
    }
    const rows = [];
    for (const item of need.values()) {
      rows.push({ productId: item.productId, variantId: item.variantId, branchId: from });
      rows.push({ productId: item.productId, variantId: item.variantId, branchId: to });
    }
    rows.sort((a, b) => stockRowKey(a).localeCompare(stockRowKey(b)));
    const locked = new Map();
    for (const row of rows) locked.set(stockRowKey(row), await lockStockRow(tx, row));
    for (const item of need.values()) {
      const src = locked.get(stockRowKey({ ...item, branchId: from }));
      if ((Number(src?.quantity) || 0) < item.qty) {
        throw transferError(`كمية غير كافية: ${item.names.ar}`, `Insufficient quantity: ${item.names.en}`);
      }
    }

    const transfer = await tx.stockTransfer.create({
      data: {
        organizationId: orgId,
        fromBranchId: from,
        toBranchId: to,
        createdByUserId: userId,
        transferredByUserId: mover.id,
        authorisedByUserId: authoriser?.id || null,
        vehicleId: vehicle?.id || null,
        vehicleName: vehicle?.name || null,
        vehiclePlate: vehicle?.plate || null,
        note: cleanNote,
      },
    });

    const out = [];
    for (const line of lines) {
      const src = locked.get(stockRowKey({ productId: line.productId, variantId: line.variantId, branchId: from }));
      const unitCost = src?.unitCost != null ? Number(src.unitCost) : null;
      const moved = await moveStock(tx, {
        orgId, userId, productId: line.productId, variantId: line.variantId, branchId: from,
        delta: -line.baseQty, reason: "TRANSFER", note: to, transferId: transfer.id,
      });
      // Destination unit cost becomes the weighted average of what is there and what arrives.
      const arrived = await moveStock(tx, {
        orgId, userId, productId: line.productId, variantId: line.variantId, branchId: to,
        delta: line.baseQty, reason: "TRANSFER", note: from, transferId: transfer.id, receiptUnitCost: unitCost,
      });
      out.push({
        transferId: transfer.id,
        productId: line.productId,
        variantId: line.variantId,
        unit: line.unit,
        enteredQty: line.enteredQty,
        piecesPerCarton: line.piecesPerCarton,
        baseQty: line.baseQty,
        unitCost,
        // Weight goods: grams × cost per kg / 1000 (lineAmount), rounded to a whole dirham.
        lineValue: unitCost != null ? lineAmount(unitCost, line.baseQty, line.product.sellBy) : 0,
        fromBefore: moved.before,
        fromAfter: moved.after,
        toBefore: arrived.before,
        toAfter: arrived.after,
      });
    }
    await tx.stockTransferLine.createMany({ data: out });
    await writeAudit({
      userId,
      action: "INVENTORY_TRANSFER",
      entityType: "StockTransfer",
      entityId: transfer.id,
      branchId: from,
      summary: `Transfer ${transfer.reference || transfer.id}: ${out.length} lines ${from} -> ${to}`,
      meta: {
        reference: transfer.reference,
        fromBranchId: from,
        toBranchId: to,
        transferredByUserId: mover.id,
        authorisedByUserId: authoriser?.id || null,
        vehicleId: vehicle?.id || null,
        vehiclePlate: vehicle?.plate || null,
        lines: out.map((l) => ({ productId: l.productId, variantId: l.variantId, unit: l.unit, enteredQty: l.enteredQty, baseQty: l.baseQty })),
      },
    }, tx);
    return { transfer, out };
  });

  // unitCost is whole dirhams inside; the response shows riyals (NFR-03).
  return {
    ok: true,
    id: record.transfer.id,
    reference: record.transfer.reference,
    fromBranchId: from,
    toBranchId: to,
    lineCount: record.out.length,
    transferredByUserId: mover.id,
    authorisedByUserId: authoriser?.id || null,
    vehicleId: vehicle?.id || null,
    vehicleName: vehicle?.name || null,
    vehiclePlate: vehicle?.plate || null,
    items: record.out.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      unit: l.unit,
      enteredQty: Number(l.enteredQty),
      quantity: l.baseQty,
      unitCost: l.unitCost != null ? fmt(l.unitCost) : null,
    })),
  };
}
