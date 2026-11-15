import { prisma } from "./prisma.js";

export async function sweepExpiredHolds() {
  const now = new Date();
  await prisma.stockHold.updateMany({
    where: { status: "HELD", expiresAt: { lt: now } },
    data: { status: "RELEASED", releasedAt: now },
  });
  await prisma.sale.updateMany({
    where: { webStatus: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    data: { webStatus: "CANCELLED" },
  });
  await prisma.appointment.updateMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
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

export async function commitSaleHolds(tx, sale) {
  const holds = await tx.stockHold.findMany({ where: { saleId: sale.id, status: "HELD" } });
  for (const hold of holds) {
    const product = await tx.product.findUnique({
      where: { id: hold.productId },
      select: { takesStock: true },
    });
    if (!hold.quantity || product?.takesStock === false) {
      await tx.stockHold.update({ where: { id: hold.id }, data: { status: "COMMITTED" } });
      continue;
    }
    if (hold.variantId) {
      const updated = await tx.variantStock.updateMany({
        where: {
          variantId: hold.variantId,
          branchId: hold.branchId,
          quantity: { gte: hold.quantity },
        },
        data: { quantity: { decrement: hold.quantity } },
      });
      if (updated.count !== 1) {
        const err = new Error("Stock changed before payment completed");
        err.status = 409;
        throw err;
      }
    } else {
      const updated = await tx.inventory.updateMany({
        where: {
          productId: hold.productId,
          branchId: hold.branchId,
          quantity: { gte: hold.quantity },
        },
        data: { quantity: { decrement: hold.quantity } },
      });
      if (updated.count !== 1) {
        const err = new Error("Stock changed before payment completed");
        err.status = 409;
        throw err;
      }
    }
    await tx.stockMovement.create({
      data: {
        organizationId: hold.organizationId,
        productId: hold.productId,
        variantId: hold.variantId,
        branchId: hold.branchId,
        quantityDelta: -hold.quantity,
        reason: "HOLD_COMMIT",
        note: sale.id,
      },
    });
    await tx.stockHold.update({
      where: { id: hold.id },
      data: { status: "COMMITTED" },
    });
  }
}

export async function releaseSaleHolds(tx, saleId) {
  const now = new Date();
  await tx.stockHold.updateMany({
    where: { saleId, status: "HELD" },
    data: { status: "RELEASED", releasedAt: now },
  });
}

export async function restoreCommittedHolds(tx, saleId) {
  const holds = await tx.stockHold.findMany({ where: { saleId, status: "COMMITTED" } });
  const now = new Date();
  for (const hold of holds) {
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
    await tx.stockHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", releasedAt: now },
    });
  }
}
