import { prisma } from "./prisma.js";
import { fmt } from "./money.js";
import { writeAudit } from "./auditLog.js";

/**
 * Immediate multi-line stock transfer between two org branches.
 * Used by /api/inventory/transfer.
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

  const grouped = new Map();
  for (const line of items) {
    const productId = String(line.productId || "");
    const variantId = line.variantId ? String(line.variantId) : "";
    if (!productId) continue;
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      const err = new Error("Invalid quantity");
      err.status = 400;
      err.errorAr = "الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر";
      err.errorEn = "Each line needs a whole quantity above zero";
      throw err;
    }
    const key = `${productId}:${variantId}`;
    const prev = grouped.get(key) || { productId, variantId, qty: 0 };
    prev.qty += qty;
    grouped.set(key, prev);
  }
  // FR-89: an inactive location cannot send or receive stock.
  const ends = await prisma.branch.findMany({
    where: { id: { in: [from, to] }, organizationId: orgId },
    select: { id: true, isActive: true },
  });
  if (ends.length !== 2 || ends.some((b) => b.isActive === false)) {
    const err = new Error("Inactive location");
    err.status = 400;
    err.errorAr = "لا يمكن التحويل من موقع غير نشط أو إليه";
    err.errorEn = "Stock cannot move into or out of an inactive location";
    throw err;
  }

  const prep = [...grouped.values()];
  if (!prep.length) {
    const err = new Error("No lines");
    err.status = 400;
    err.errorAr = "لا توجد بنود";
    err.errorEn = "No transfer lines";
    throw err;
  }

  for (const line of prep) {
    const pr = await prisma.product.findFirst({
      where: { id: line.productId, organizationId: orgId },
      include: { variants: { select: { id: true } } },
    });
    if (!pr) {
      const err = new Error(`Product not found: ${line.productId}`);
      err.status = 400;
      err.errorAr = `منتج غير موجود: ${line.productId}`;
      err.errorEn = `Product not found: ${line.productId}`;
      throw err;
    }
    if (pr.variants.length && !line.variantId) {
      const err = new Error(`Choose a variant for ${pr.name}`);
      err.status = 400;
      err.errorAr = `اختر الحجم لـ ${pr.name}`;
      err.errorEn = `Choose a variant for ${pr.name}`;
      throw err;
    }
    if (line.variantId && !pr.variants.some((variant) => variant.id === line.variantId)) {
      const err = new Error(`Variant is not on ${pr.name}`);
      err.status = 400;
      err.errorAr = `الحجم غير تابع لـ ${pr.name}`;
      err.errorEn = `Variant is not on ${pr.name}`;
      throw err;
    }
    if (line.variantId) {
      const src = await prisma.variantStock.findUnique({
        where: { variantId_branchId: { variantId: line.variantId, branchId: from } },
      });
      if (!src || src.quantity < line.qty) {
        const err = new Error(`Insufficient qty: ${pr.name}`);
        err.status = 400;
        err.errorAr = `كمية غير كافية: ${pr.name}`;
        err.errorEn = `Insufficient quantity: ${pr.name}`;
        throw err;
      }
      line.unitCost = src.unitCost;
    } else {
      const src = await prisma.inventory.findUnique({
        where: { productId_branchId: { productId: line.productId, branchId: from } },
      });
      if (!src || src.quantity < line.qty) {
        const err = new Error(`Insufficient qty: ${pr.name}`);
        err.status = 400;
        err.errorAr = `كمية غير كافية: ${pr.name}`;
        err.errorEn = `Insufficient quantity: ${pr.name}`;
        throw err;
      }
      line.unitCost = src.unitCost;
    }
  }

  await prisma.$transaction(
    async (tx) => {
      for (const line of prep) {
        const { productId, variantId, qty } = line;
        if (variantId) {
          const moved = await tx.variantStock.updateMany({
            where: { variantId, branchId: from, quantity: { gte: qty } },
            data: { quantity: { decrement: qty } },
          });
          if (moved.count !== 1) {
            const err = new Error("كمية غير كافية");
            err.status = 400;
            throw err;
          }
          await tx.variantStock.upsert({
            where: { variantId_branchId: { variantId, branchId: to } },
            create: {
              variantId,
              branchId: to,
              quantity: qty,
              minStockLevel: 5,
              unitCost: line.unitCost ?? null,
            },
            update: { quantity: { increment: qty } },
          });
        } else {
          const moved = await tx.inventory.updateMany({
            where: { productId, branchId: from, quantity: { gte: qty } },
            data: { quantity: { decrement: qty } },
          });
          if (moved.count !== 1) {
            const p = await tx.product.findFirst({ where: { id: productId } });
            const err = new Error(`كمية غير كافية: ${p?.name || productId}`);
            err.status = 400;
            throw err;
          }
          await tx.inventory.upsert({
            where: { productId_branchId: { productId, branchId: to } },
            create: { productId, branchId: to, quantity: qty, minStockLevel: 5, unitCost: line.unitCost ?? null },
            update: { quantity: { increment: qty } },
          });
        }
        await tx.stockMovement.create({
          data: {
            organizationId: orgId,
            productId,
            ...(variantId ? { variantId } : {}),
            branchId: from,
            quantityDelta: -qty,
            reason: "TRANSFER",
            note: to,
            userId,
          },
        });
        await tx.stockMovement.create({
          data: {
            organizationId: orgId,
            productId,
            ...(variantId ? { variantId } : {}),
            branchId: to,
            quantityDelta: qty,
            reason: "TRANSFER",
            note: from,
            userId,
          },
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

  // unitCost is whole dirhams inside; the response shows riyals like the Decimal column did (NFR-03).
  return {
    ok: true,
    fromBranchId: from,
    toBranchId: to,
    lineCount: prep.length,
    items: prep.map((line) => (line.unitCost !== undefined ? { ...line, unitCost: fmt(line.unitCost) } : line)),
  };
}
