import { prisma } from "./prisma.js";
import { lookupExpiredPayments } from "./paymentLookup.js";

/**
 * Releases expired holds and cancels unpaid orders / bookings whose hold lapsed. A pending
 * gateway payment is looked up once first (FR-76, lib/paymentLookup.js) so a customer who paid
 * but whose notification was lost is confirmed rather than released; parents whose lookup is
 * still to come (or in flight on another instance) are left for the next sweep.
 */
export async function sweepExpiredHolds() {
  let deferred = { saleIds: [], appointmentIds: [] };
  try {
    deferred = await lookupExpiredPayments();
  } catch (e) {
    console.error("[sweep] payment lookup failed:", e?.message || e);
  }
  const now = new Date();
  const keepSales = deferred.saleIds.length ? { saleId: { notIn: deferred.saleIds } } : {};
  await prisma.stockHold.updateMany({
    where: { status: "HELD", expiresAt: { lt: now }, ...keepSales },
    data: { status: "RELEASED", releasedAt: now },
  });
  await prisma.sale.updateMany({
    where: { webStatus: "PENDING_PAYMENT", holdExpiresAt: { lt: now }, ...(deferred.saleIds.length ? { id: { notIn: deferred.saleIds } } : {}) },
    data: { webStatus: "CANCELLED" },
  });
  await prisma.appointment.updateMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now }, ...(deferred.appointmentIds.length ? { id: { notIn: deferred.appointmentIds } } : {}) },
    data: { status: "CANCELLED" },
  });
}

export async function heldQuantity(db, { branchId, productId, variantId }) {
  const sum = await db.stockHold.aggregate({
    where: {
      branchId,
      productId,
      variantId: variantId || null,
      status: "HELD",
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  });
  return Number(sum._sum.quantity || 0);
}

async function addStock(tx, hold, delta) {
  if (hold.variantId) {
    await tx.variantStock.upsert({
      where: { variantId_branchId: { variantId: hold.variantId, branchId: hold.branchId } },
      create: {
        variantId: hold.variantId,
        branchId: hold.branchId,
        quantity: Math.max(0, delta),
      },
      update: { quantity: { increment: delta } },
    });
    return;
  }
  await tx.inventory.upsert({
    where: { productId_branchId: { productId: hold.productId, branchId: hold.branchId } },
    create: {
      productId: hold.productId,
      branchId: hold.branchId,
      quantity: Math.max(0, delta),
      minStockLevel: 5,
    },
    update: { quantity: { increment: delta } },
  });
}

function statusError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * Locks the stock balance row for one product/variant at a location and returns what is
 * still free for a new hold: on hand minus live holds. Must run inside a transaction.
 * Two checkouts for the same unit serialise on this row lock (FR-36, NFR-06).
 */
export async function lockedAvailable(tx, { branchId, productId, variantId }) {
  const rows = variantId
    ? await tx.$queryRaw`SELECT quantity FROM "VariantStock" WHERE "variantId" = ${variantId} AND "branchId" = ${branchId} FOR UPDATE`
    : await tx.$queryRaw`SELECT quantity FROM "Inventory" WHERE "productId" = ${productId} AND "branchId" = ${branchId} FOR UPDATE`;
  const onHand = rows.length ? Number(rows[0].quantity) : 0;
  const held = await heldQuantity(tx, { branchId, productId, variantId });
  return onHand - held;
}

/**
 * Checks and reserves stock for website lines inside the hold transaction.
 * lines: [{ productId, variantId, units, label }] (stock-taking lines only).
 */
export async function assertStockForHolds(tx, branchId, lines) {
  const need = new Map();
  for (const line of lines) {
    const key = `${line.productId}|${line.variantId || ""}`;
    const row = need.get(key) || { productId: line.productId, variantId: line.variantId || null, units: 0, label: line.label };
    row.units += line.units;
    need.set(key, row);
  }
  // Fixed lock order so two carts with the same products cannot deadlock.
  const keys = [...need.keys()].sort();
  for (const key of keys) {
    const row = need.get(key);
    const free = await lockedAvailable(tx, { branchId, productId: row.productId, variantId: row.variantId });
    if (free < row.units) throw statusError(`Not enough stock for ${row.label}`, 400, "OUT_OF_STOCK");
  }
}

async function takeStock(tx, { organizationId, productId, variantId, branchId, quantity, note }) {
  const updated = variantId
    ? await tx.variantStock.updateMany({
        where: { variantId, branchId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      })
    : await tx.inventory.updateMany({
        where: { productId, branchId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
  if (updated.count !== 1) throw statusError("Stock changed before payment completed", 409, "STOCK_CHANGED");
  await tx.stockMovement.create({
    data: { organizationId, productId, variantId, branchId, quantityDelta: -quantity, reason: "HOLD_COMMIT", note },
  });
}

/**
 * Commits each HELD hold of the sale exactly once. The HELD -> COMMITTED change is a guarded
 * conditional update, so a replayed webhook, a second instance or the expiry sweep cannot
 * take the stock twice (Hold once, NFR-07). If a hold was already released (expired and
 * swept) the payment is late and this throws HOLD_RELEASED so the caller rolls back.
 */
export async function commitSaleHolds(tx, sale) {
  const holds = await tx.stockHold.findMany({ where: { saleId: sale.id, status: { in: ["HELD", "RELEASED"] } } });
  for (const hold of holds) {
    const claimed = await tx.stockHold.updateMany({
      where: { id: hold.id, status: "HELD" },
      data: { status: "COMMITTED" },
    });
    if (claimed.count !== 1) {
      const now = await tx.stockHold.findUnique({ where: { id: hold.id }, select: { status: true } });
      if (now?.status === "RELEASED") throw statusError("The hold was released before the payment arrived", 409, "HOLD_RELEASED");
      continue;
    }
    const product = await tx.product.findUnique({
      where: { id: hold.productId },
      select: { takesStock: true },
    });
    if (!hold.quantity || product?.takesStock === false) continue;
    await takeStock(tx, { ...hold, note: sale.id });
  }
}

/**
 * Staff accepted a payment whose holds were released (late payment). Re-claims each
 * released hold (guarded RELEASED -> COMMITTED) and takes the stock, never below zero.
 * A later cancel then restores it through restoreCommittedHolds as usual.
 */
export async function recommitReleasedHolds(tx, sale) {
  const holds = await tx.stockHold.findMany({ where: { saleId: sale.id, status: { in: ["HELD", "RELEASED"] } } });
  for (const hold of holds) {
    const claimed = await tx.stockHold.updateMany({
      where: { id: hold.id, status: hold.status },
      data: { status: "COMMITTED", releasedAt: null },
    });
    if (claimed.count !== 1) continue;
    const product = await tx.product.findUnique({ where: { id: hold.productId }, select: { takesStock: true } });
    if (!hold.quantity || product?.takesStock === false) continue;
    await takeStock(tx, { ...hold, note: sale.id });
  }
}

export async function releaseSaleHolds(tx, saleId) {
  const now = new Date();
  await tx.stockHold.updateMany({
    where: { saleId, status: "HELD" },
    data: { status: "RELEASED", releasedAt: now },
  });
}

/** Puts committed stock back exactly once per hold (guarded COMMITTED -> RELEASED). */
export async function restoreCommittedHolds(tx, saleId) {
  const holds = await tx.stockHold.findMany({ where: { saleId, status: "COMMITTED" } });
  const now = new Date();
  for (const hold of holds) {
    const claimed = await tx.stockHold.updateMany({
      where: { id: hold.id, status: "COMMITTED" },
      data: { status: "RELEASED", releasedAt: now },
    });
    if (claimed.count !== 1) continue;
    const product = await tx.product.findUnique({
      where: { id: hold.productId },
      select: { takesStock: true },
    });
    if (hold.quantity && product?.takesStock !== false) {
      await addStock(tx, hold, hold.quantity);
      await tx.stockMovement.create({
        data: {
          organizationId: hold.organizationId,
          productId: hold.productId,
          variantId: hold.variantId,
          branchId: hold.branchId,
          quantityDelta: hold.quantity,
          reason: "CANCEL",
          note: saleId,
        },
      });
    }
  }
}
