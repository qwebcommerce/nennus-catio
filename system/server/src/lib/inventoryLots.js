/**
 * FEFO helpers for inventory lots (earliest expiry first).
 */

export function sortLotsForFefo(a, b) {
  const ad = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  const ar = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
  const br = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
  return ar - br;
}

async function resolveInventoryId(tx, { productId, branchId }) {
  const inv = await tx.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
    select: { id: true },
  });
  return inv?.id ?? null;
}

/**
 * Consume qty from branch lots (FEFO). Throws if lots cannot cover.
 * @returns {Promise<Array<{ lotId: string, quantity: number, expiryDate: Date|null, unitCost: unknown, receivedAt: Date }>>}
 */
export async function consumeLotsFefo(tx, { orgId, branchId, productId, quantity }) {
  let needed = Math.max(0, Math.floor(Number(quantity) || 0));
  if (needed <= 0) return [];

  const lots = await tx.inventoryLot.findMany({
    where: {
      organizationId: orgId,
      branchId,
      productId,
      quantityOnHand: { gt: 0 },
    },
    select: {
      id: true,
      quantityOnHand: true,
      expiryDate: true,
      receivedAt: true,
      unitCost: true,
    },
  });
  const ordered = [...lots].sort(sortLotsForFefo);
  const taken = [];
  for (const lot of ordered) {
    if (needed <= 0) break;
    const take = Math.min(needed, Number(lot.quantityOnHand || 0));
    if (take <= 0) continue;
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { quantityOnHand: { decrement: take } },
    });
    taken.push({
      lotId: lot.id,
      quantity: take,
      expiryDate: lot.expiryDate ?? null,
      unitCost: lot.unitCost ?? null,
      receivedAt: lot.receivedAt,
    });
    needed -= take;
  }
  if (needed > 0) {
    const err = new Error("كميات الدفعات غير كافية للمخزون المطلوب");
    err.status = 400;
    err.errorAr = err.message;
    err.errorEn = "Lot quantities are insufficient for the requested stock";
    throw err;
  }
  return taken;
}

/**
 * Move qty between branches: FEFO out of source, create matching lots on destination.
 * If source has inventory but no lots, creates a destination adjustment lot only
 * (and does not invent source lots).
 */
export async function moveLotsBetweenBranches(
  tx,
  { orgId, fromBranchId, toBranchId, productId, quantity },
) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;

  const destInventoryId = await resolveInventoryId(tx, {
    productId,
    branchId: toBranchId,
  });

  const lotSum = await tx.inventoryLot.aggregate({
    where: {
      organizationId: orgId,
      branchId: fromBranchId,
      productId,
      quantityOnHand: { gt: 0 },
    },
    _sum: { quantityOnHand: true },
  });
  const availableLots = Number(lotSum._sum.quantityOnHand || 0);

  if (availableLots <= 0) {
    await tx.inventoryLot.create({
      data: {
        organizationId: orgId,
        productId,
        branchId: toBranchId,
        inventoryId: destInventoryId,
        receivedAt: new Date(),
        expiryDate: null,
        quantityReceived: qty,
        quantityOnHand: qty,
        unitCost: null,
        note: "transfer-no-source-lot",
      },
    });
    return;
  }

  const moveQty = Math.min(qty, availableLots);
  const taken = await consumeLotsFefo(tx, {
    orgId,
    branchId: fromBranchId,
    productId,
    quantity: moveQty,
  });

  for (const t of taken) {
    await tx.inventoryLot.create({
      data: {
        organizationId: orgId,
        productId,
        branchId: toBranchId,
        inventoryId: destInventoryId,
        receivedAt: new Date(),
        expiryDate: t.expiryDate,
        quantityReceived: t.quantity,
        quantityOnHand: t.quantity,
        unitCost: t.unitCost,
        note: `transfer-from:${t.lotId}`,
      },
    });
  }

  const remainder = qty - moveQty;
  if (remainder > 0) {
    await tx.inventoryLot.create({
      data: {
        organizationId: orgId,
        productId,
        branchId: toBranchId,
        inventoryId: destInventoryId,
        receivedAt: new Date(),
        expiryDate: null,
        quantityReceived: remainder,
        quantityOnHand: remainder,
        unitCost: null,
        note: "transfer-unlotted-remainder",
      },
    });
  }
}

/**
 * If on-hand lots cannot cover quantity, create an unlotted cover lot so
 * aggregate inventory and lot totals stay aligned (legacy / drifted stock).
 */
export async function ensureLotsCoverQuantity(
  tx,
  { orgId, branchId, productId, quantity, note = "unlotted-cover" },
) {
  const needed = Math.max(0, Math.floor(Number(quantity) || 0));
  if (needed <= 0) return;
  const lotSum = await tx.inventoryLot.aggregate({
    where: {
      organizationId: orgId,
      branchId,
      productId,
      quantityOnHand: { gt: 0 },
    },
    _sum: { quantityOnHand: true },
  });
  const available = Number(lotSum._sum.quantityOnHand || 0);
  const gap = needed - available;
  if (gap <= 0) return;
  const inventoryId = await resolveInventoryId(tx, { productId, branchId });
  await tx.inventoryLot.create({
    data: {
      organizationId: orgId,
      productId,
      branchId,
      inventoryId,
      receivedAt: new Date(),
      expiryDate: null,
      quantityReceived: gap,
      quantityOnHand: gap,
      unitCost: null,
      note,
    },
  });
}

/**
 * Align lot on-hand sum with a reconciled inventory quantity.
 */
export async function syncLotsToTargetQuantity(tx, { orgId, branchId, productId, targetQty }) {
  const target = Math.max(0, Math.floor(Number(targetQty) || 0));
  const agg = await tx.inventoryLot.aggregate({
    where: {
      organizationId: orgId,
      branchId,
      productId,
      quantityOnHand: { gt: 0 },
    },
    _sum: { quantityOnHand: true },
  });
  const current = Number(agg._sum.quantityOnHand || 0);
  if (current === target) return;
  if (current > target) {
    await consumeLotsFefo(tx, {
      orgId,
      branchId,
      productId,
      quantity: current - target,
    });
    return;
  }
  const add = target - current;
  const inventoryId = await resolveInventoryId(tx, { productId, branchId });
  await tx.inventoryLot.create({
    data: {
      organizationId: orgId,
      productId,
      branchId,
      inventoryId,
      receivedAt: new Date(),
      expiryDate: null,
      quantityReceived: add,
      quantityOnHand: add,
      unitCost: null,
      note: "stock-count-adjust",
    },
  });
}
