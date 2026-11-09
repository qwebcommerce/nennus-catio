import { prisma } from "./prisma.js";
import { moveLotsBetweenBranches } from "./inventoryLots.js";
import { writeAudit } from "./auditLog.js";
import { scheduleInventoryWebhook } from "./inventoryWebhook.js";

/**
 * Immediate multi-line stock transfer between two org branches.
 * Shared by /api/inventory/transfer and Module 6 balancer execute.
 */
export async function executeInventoryTransfer({
  orgId,
  userId,
  fromBranchId,
  toBranchId,
  items,
}) {
  const from = String(fromBranchId || "");
  const to = String(toBranchId || "");
  if (!from || !to || from === to) {
    const err = new Error("Invalid source/destination branch");
    err.status = 400;
    err.errorAr = "فرع المصدر والوجهة غير صالحين";
    err.errorEn = "Invalid source/destination branch";
    throw err;
  }
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("No lines");
    err.status = 400;
    err.errorAr = "لا توجد بنود";
    err.errorEn = "No transfer lines";
    throw err;
  }

  const byProduct = new Map();
  for (const line of items) {
    const productId = String(line.productId || "");
    if (!productId) continue;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    byProduct.set(productId, (byProduct.get(productId) || 0) + qty);
  }
  const prep = [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty }));
  if (!prep.length) {
    const err = new Error("No lines");
    err.status = 400;
    err.errorAr = "لا توجد بنود";
    err.errorEn = "No transfer lines";
    throw err;
  }

  for (const { productId, qty } of prep) {
    const pr = await prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
    });
    if (!pr) {
      const err = new Error(`Product not found: ${productId}`);
      err.status = 400;
      err.errorAr = `منتج غير موجود: ${productId}`;
      err.errorEn = `Product not found: ${productId}`;
      throw err;
    }
    const src = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId: from } },
    });
    if (!src || src.quantity < qty) {
      const err = new Error(`Insufficient qty: ${pr.name}`);
      err.status = 400;
      err.errorAr = `كمية غير كافية: ${pr.name}`;
      err.errorEn = `Insufficient quantity: ${pr.name}`;
      throw err;
    }
  }

  await prisma.$transaction(
    async (tx) => {
      for (const { productId, qty } of prep) {
        const src = await tx.inventory.findUnique({
          where: { productId_branchId: { productId, branchId: from } },
        });
        if (!src || src.quantity < qty) {
          const p = await tx.product.findFirst({ where: { id: productId } });
          const err = new Error(`كمية غير كافية: ${p?.name || productId}`);
          err.status = 400;
          err.errorAr = err.message;
          err.errorEn = `Insufficient quantity: ${p?.name || productId}`;
          throw err;
        }
        await tx.inventory.update({
          where: { productId_branchId: { productId, branchId: from } },
          data: { quantity: { decrement: qty } },
        });
        await tx.inventory.upsert({
          where: { productId_branchId: { productId, branchId: to } },
          create: {
            productId,
            branchId: to,
            quantity: qty,
            minStockLevel: 5,
          },
          update: { quantity: { increment: qty } },
        });
        await moveLotsBetweenBranches(tx, {
          orgId,
          fromBranchId: from,
          toBranchId: to,
          productId,
          quantity: qty,
        });
      }
    },
    { maxWait: 15000, timeout: 60000 },
  );

  await writeAudit({
    userId,
    action: "INVENTORY_TRANSFER",
    entityType: "Branch",
    entityId: `${from}->${to}`,
    branchId: from,
    summary: `Transfer ${prep.length} products to branch ${to}`,
  });
  scheduleInventoryWebhook(orgId, {
    event: "inventory.transfer",
    meta: { fromBranchId: from, toBranchId: to, lineCount: prep.length },
    lines: prep.flatMap(({ productId, qty }) => [
      { branchId: from, productId, quantityDelta: -qty },
      { branchId: to, productId, quantityDelta: qty },
    ]),
  });

  return { ok: true, fromBranchId: from, toBranchId: to, lineCount: prep.length, items: prep };
}
