import { Prisma } from "./prisma-client-bundle.js";
import { prisma } from "./prisma.js";
import { findBranchInOrg } from "./orgScope.js";
import { writeAudit } from "./auditLog.js";
import { scheduleInventoryWebhook } from "./inventoryWebhook.js";

/**
 * Core purchase receive — used by /api/purchases and intelligence draft convert.
 * @returns {Promise<{ purchase: object }>}
 */
export async function executeReceivePurchase({
  orgId,
  userId,
  userRole,
  userBranchId,
  branchId,
  supplierId,
  note,
  items,
  updateProductCost = false,
}) {
  const bid = branchId || userBranchId;
  if (!bid) {
    const err = new Error("يجب اختيار الفرع");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("لا توجد بنود");
    err.status = 400;
    throw err;
  }
  if (userRole !== "ADMIN" && userBranchId && userBranchId !== bid) {
    const err = new Error("لا يمكن الاستلام لفرع آخر");
    err.status = 403;
    throw err;
  }

  const branchOk = await findBranchInOrg(prisma, orgId, bid);
  if (!branchOk) {
    const err = new Error("فرع غير صالح");
    err.status = 400;
    throw err;
  }

  let supId = null;
  if (supplierId != null && String(supplierId).trim()) {
    const s = await prisma.supplier.findFirst({
      where: { id: String(supplierId), organizationId: orgId },
    });
    if (!s) {
      const err = new Error("مورد غير موجود");
      err.status = 400;
      throw err;
    }
    supId = s.id;
  }

  const applyCost = Boolean(updateProductCost);
  let total = new Prisma.Decimal(0);
  const lineData = [];

  for (const line of items) {
    const productId = line.productId;
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const uc = Number(line.unitCost);
    if (Number.isNaN(uc) || uc < 0) throw new Error("تكلفة الوحدة غير صالحة");
    let expiryDate = null;
    if (line.expiryDate != null && String(line.expiryDate).trim()) {
      const d = new Date(String(line.expiryDate));
      if (Number.isNaN(d.getTime())) throw new Error("تاريخ انتهاء غير صالح");
      expiryDate = d;
    }
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
    });
    if (!product) throw new Error(`منتج غير موجود: ${productId}`);
    const unitCost = new Prisma.Decimal(uc.toFixed(2));
    const subtotal = unitCost.mul(qty);
    total = total.add(subtotal);
    lineData.push({ productId, quantity: qty, unitCost, subtotal, expiryDate });
  }

  const afterPurchase = [];
  for (const l of lineData) {
    afterPurchase.push(
      prisma.inventory.upsert({
        where: {
          productId_branchId: { productId: l.productId, branchId: bid },
        },
        create: {
          productId: l.productId,
          branchId: bid,
          quantity: l.quantity,
          minStockLevel: 5,
        },
        update: {
          quantity: { increment: l.quantity },
        },
      }),
    );
    if (applyCost) {
      afterPurchase.push(
        prisma.product.updateMany({
          where: { id: l.productId, organizationId: orgId },
          data: { cost: l.unitCost },
        }),
      );
    }
    afterPurchase.push(
      prisma.inventoryLot.create({
        data: {
          organizationId: orgId,
          productId: l.productId,
          branchId: bid,
          receivedAt: new Date(),
          expiryDate: l.expiryDate ?? null,
          quantityReceived: l.quantity,
          quantityOnHand: l.quantity,
          unitCost: l.unitCost,
        },
      }),
    );
  }

  const purchaseResults = await prisma.$transaction([
    prisma.purchase.create({
      data: {
        supplierId: supId,
        branchId: bid,
        userId,
        note: note != null && String(note).trim() ? String(note).trim() : null,
        items: {
          create: lineData.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            subtotal: l.subtotal,
            expiryDate: l.expiryDate ?? null,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        branch: true,
        supplier: true,
        user: { select: { name: true } },
      },
    }),
    ...afterPurchase,
  ]);

  const purchase = purchaseResults[0];

  await writeAudit({
    userId,
    action: "PURCHASE_RECEIVE",
    entityType: "Purchase",
    entityId: purchase.id,
    branchId: bid,
    summary: `Purchase lines ${purchase.items?.length}`,
  });

  scheduleInventoryWebhook(orgId, {
    event: "purchase.received",
    meta: { purchaseId: purchase.id, branchId: bid },
    lines: lineData.map((l) => ({
      branchId: bid,
      productId: l.productId,
      quantityDelta: l.quantity,
    })),
  });

  return { purchase, branchId: bid, lineData };
}
