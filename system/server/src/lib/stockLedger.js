import { d, divRound } from "./money.js";

/**
 * Every change to on-hand stock goes through here (FR-17 "movement only").
 * Each call locks the balance row (variant or product at a location), applies the
 * change and writes one StockMovement naming the location and the staff user.
 * Use inside a prisma.$transaction.
 */

function stockError(errorAr, errorEn, status = 400) {
  const err = new Error(errorAr);
  err.status = status;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  return err;
}

/**
 * Make sure the balance row exists, then lock it for this transaction.
 * @returns {Promise<{ id: string; quantity: number; unitCost: number | null; minStockLevel: number }>} unitCost in whole dirhams
 */
export async function lockStockRow(tx, { productId, variantId, branchId }) {
  if (variantId) {
    await tx.variantStock.upsert({
      where: { variantId_branchId: { variantId, branchId } },
      create: { variantId, branchId, quantity: 0 },
      update: {},
    });
    const rows = await tx.$queryRaw`
      SELECT id, quantity, "unitCost", "minStockLevel" FROM "VariantStock"
      WHERE "variantId" = ${variantId} AND "branchId" = ${branchId} FOR UPDATE`;
    return rows[0];
  }
  await tx.inventory.upsert({
    where: { productId_branchId: { productId, branchId } },
    create: { productId, branchId, quantity: 0 },
    update: {},
  });
  const rows = await tx.$queryRaw`
    SELECT id, quantity, "unitCost", "minStockLevel" FROM "Inventory"
    WHERE "productId" = ${productId} AND "branchId" = ${branchId} FOR UPDATE`;
  return rows[0];
}

/**
 * Add or remove stock and write the movement.
 * @param {object} tx Prisma transaction client
 * @param {{ orgId: string; userId?: string | null; productId: string; variantId?: string | null; branchId: string;
 *   delta: number; reason: "RECEIPT"|"TRANSFER"|"SALE"|"RETURN"|"ADJUSTMENT"|"HOLD_COMMIT"|"CANCEL"; note?: string | null;
 *   receiptUnitCost?: number | null; transferId?: string | null; vanReturnId?: string | null }} opts
 *   transferId / vanReturnId: the transfer or van return record the movement belongs to.
 *   receiptUnitCost: cost of the units coming in, in whole dirhams; the location unit cost becomes the
 *   weighted average, rounded half away from zero to a whole dirham (NFR-03).
 */
export async function moveStock(tx, opts) {
  const { orgId, userId = null, productId, variantId = null, branchId, reason, note = null } = opts;
  const delta = Math.trunc(Number(opts.delta));
  if (!Number.isFinite(delta)) throw stockError("كمية غير صالحة", "Invalid quantity");
  const row = await lockStockRow(tx, { productId, variantId, branchId });
  const oldQty = Number(row.quantity) || 0;
  const nextQty = oldQty + delta;
  if (nextQty < 0) {
    throw stockError("كمية غير كافية", "Not enough stock at this location");
  }
  const data = { quantity: nextQty };
  if (opts.receiptUnitCost != null && delta > 0) {
    const inCost = d(opts.receiptUnitCost);
    const oldCost = row.unitCost != null ? d(row.unitCost) : inCost;
    const base = Math.max(0, oldQty);
    data.unitCost = divRound(BigInt(base) * BigInt(oldCost) + BigInt(delta) * BigInt(inCost), base + delta);
  }
  if (variantId) {
    await tx.variantStock.update({ where: { id: row.id }, data });
  } else {
    await tx.inventory.update({ where: { id: row.id }, data });
  }
  if (delta !== 0) {
    await tx.stockMovement.create({
      data: {
        organizationId: orgId,
        productId,
        variantId: variantId || null,
        branchId,
        quantityDelta: delta,
        reason,
        note: note != null ? String(note).slice(0, 500) : null,
        userId,
        ...(opts.transferId ? { transferId: opts.transferId } : {}),
        ...(opts.vanReturnId ? { vanReturnId: opts.vanReturnId } : {}),
      },
    });
  }
  return { before: oldQty, after: nextQty, delta, unitCost: data.unitCost ?? row.unitCost };
}

/**
 * Staff adjustment or count: set the quantity to a counted number. Writes an
 * ADJUSTMENT movement for the difference (none when nothing changed).
 */
export async function setStockCount(tx, { orgId, userId, productId, variantId = null, branchId, quantity, note, unitCost = null }) {
  const target = Number(quantity);
  if (!Number.isInteger(target) || target < 0) {
    throw stockError("الكمية يجب أن تكون عدداً صحيحاً موجباً", "Quantity must be a whole number of zero or more");
  }
  const row = await lockStockRow(tx, { productId, variantId, branchId });
  const delta = target - (Number(row.quantity) || 0);
  if (delta === 0) return { before: target, after: target, delta: 0 };
  return moveStock(tx, {
    orgId,
    userId,
    productId,
    variantId,
    branchId,
    delta,
    reason: "ADJUSTMENT",
    note,
    receiptUnitCost: delta > 0 && unitCost != null ? unitCost : null,
  });
}
