import { prisma } from "./prisma.js";
import { d, fmt, toDirhams } from "./money.js";
import { writeAudit } from "./auditLog.js";
import { moveStock } from "./stockLedger.js";

/** Allowed purchase order status changes (NFR-23). The database trigger enforces the same list. */
export const PO_TRANSITIONS = Object.freeze({
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
});

export function canMovePurchaseOrder(from, to) {
  return from === to ? from === "PARTIALLY_RECEIVED" : (PO_TRANSITIONS[from] || []).includes(to);
}

function poError(message, status = 400, errorAr) {
  const err = new Error(message);
  err.status = status;
  err.errorEn = message;
  err.errorAr = errorAr || message;
  return err;
}

/**
 * Receive goods on a purchase order (FR-96..98), inside a transaction.
 * The order row is locked first, then the lines are read again, so two receipts of the
 * same order run one after the other and the second sees what the first took.
 * Each received line writes a RECEIPT movement into the order's location and updates
 * the location's weighted unit cost; one supplier bill is raised for the cost received.
 *
 * @param {object} tx
 * @param {{ orgId: string; userId: string; orderId: string; requested?: Map<string, number> | null }} opts
 *   requested: line id -> quantity; lines left out receive nothing. Null receives all that is still on order.
 */
export async function receivePurchaseOrderTx(tx, { orgId, userId, orderId, requested = null }) {
  const locked = await tx.$queryRaw`
    SELECT id FROM "PurchaseOrder" WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
  if (!locked.length) throw poError("Order not found", 404, "أمر الشراء غير موجود");
  const order = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
    include: { lines: { orderBy: { id: "asc" } }, branch: { select: { isActive: true } } },
  });
  if (!["SENT", "PARTIALLY_RECEIVED"].includes(order.status)) {
    throw poError("Send the order before receiving goods", 400, "أرسل أمر الشراء قبل الاستلام");
  }
  if (order.branch?.isActive === false) {
    throw poError("Goods cannot be received into an inactive location", 400, "لا يمكن الاستلام في موقع غير نشط");
  }
  for (const id of requested?.keys() || []) {
    if (!order.lines.some((line) => line.id === id)) throw poError("A line is not on this order", 400, "السطر غير موجود في الأمر");
  }

  let receivedCost = 0; // whole dirhams
  let anyLeft = false;
  const received = [];
  for (const line of order.lines) {
    const remaining = line.quantity - line.quantityReceived;
    // With a list of lines, a line left out receives nothing; with none, everything still on order.
    const qty = requested ? (requested.has(line.id) ? requested.get(line.id) : 0) : remaining;
    if (!Number.isInteger(qty) || qty < 0 || qty > remaining) {
      throw poError(
        "A receipt cannot take more than the quantity still on order",
        400,
        "لا يمكن استلام أكثر من الكمية المتبقية في الأمر",
      );
    }
    if (qty === 0) {
      if (remaining > 0) anyLeft = true;
      continue;
    }
    receivedCost += d(line.unitCost) * qty;
    await moveStock(tx, {
      orgId,
      userId,
      productId: line.productId,
      variantId: line.variantId,
      branchId: order.branchId,
      delta: qty,
      reason: "RECEIPT",
      note: order.id,
      receiptUnitCost: d(line.unitCost),
    });
    // Guarded update: the line must still hold what we read under the lock.
    const updated = await tx.purchaseOrderLine.updateMany({
      where: { id: line.id, quantityReceived: line.quantityReceived },
      data: { quantityReceived: line.quantityReceived + qty },
    });
    if (updated.count !== 1) throw poError("The order changed while receiving. Try again.", 409);
    if (line.quantityReceived + qty < line.quantity) anyLeft = true;
    received.push({ lineId: line.id, productId: line.productId, variantId: line.variantId, quantity: qty });
  }
  if (!received.length) throw poError("Enter a quantity to receive", 400, "أدخل كمية للاستلام");

  const bill = await tx.supplierBill.create({
    data: {
      organizationId: orgId,
      supplierId: order.supplierId,
      purchaseOrderId: order.id,
      amount: receivedCost,
    },
  });
  const nextStatus = anyLeft ? "PARTIALLY_RECEIVED" : "RECEIVED";
  if (!canMovePurchaseOrder(order.status, nextStatus)) {
    throw poError(`Order cannot move from ${order.status} to ${nextStatus}`);
  }
  await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: nextStatus } });
  return { orderId: order.id, status: nextStatus, bill, received };
}

/**
 * Quick receive without a prepared order (POST /api/purchases/receive, Purchases page).
 * It goes through the purchase order receipt: an order is raised as sent and received in
 * full in the same transaction, so the goods get a RECEIPT movement, the location unit
 * cost and a supplier bill like any other receipt. A Purchase row is still written for the
 * page's history list.
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

  const branch = await prisma.branch.findFirst({
    where: { id: String(bid), organizationId: orgId },
    select: { id: true, isActive: true },
  });
  if (!branch) {
    const err = new Error("فرع غير صالح");
    err.status = 400;
    throw err;
  }
  if (branch.isActive === false) {
    throw poError("Goods cannot be received into an inactive location", 400, "لا يمكن الاستلام في موقع غير نشط");
  }

  // A receipt raises a supplier bill, so it needs the supplier.
  const supplier =
    supplierId != null && String(supplierId).trim()
      ? await prisma.supplier.findFirst({
          where: { id: String(supplierId), organizationId: orgId, isActive: true },
        })
      : null;
  if (!supplier) {
    throw poError(
      "Choose an active supplier: the receipt raises a supplier bill",
      400,
      "اختر مورداً نشطاً — الاستلام يُنشئ فاتورة مورد",
    );
  }

  const applyCost = Boolean(updateProductCost);
  let total = 0;
  const lineData = [];

  for (const line of items) {
    const productId = String(line?.productId || "");
    const qty = Number(line?.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw poError("Each line needs a whole quantity above zero", 400, "الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
    }
    const uc = toDirhams(line?.unitCost);
    if (uc == null) throw poError("Invalid unit cost (at most 2 decimals)", 400, "تكلفة الوحدة غير صالحة");
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: orgId },
      include: { variants: { select: { id: true } } },
    });
    if (!product) throw poError(`Product not found: ${productId}`, 400, `منتج غير موجود: ${productId}`);
    const variantId = line?.variantId ? String(line.variantId) : null;
    if (variantId && !product.variants.some((v) => v.id === variantId)) {
      throw poError(`Variant is not on ${product.nameEn || product.name}`, 400, `الحجم غير تابع لـ ${product.name}`);
    }
    if (!variantId && product.variants.length) {
      throw poError(`Choose a variant for ${product.nameEn || product.name}`, 400, `اختر الحجم لـ ${product.name}`);
    }
    const unitCost = uc;
    const subtotal = unitCost * qty;
    total += subtotal;
    lineData.push({ productId, variantId, quantity: qty, unitCost, subtotal });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          supplierId: supplier.id,
          branchId: bid,
          userId,
          status: "SENT",
          note: note != null && String(note).trim() ? String(note).trim() : "Quick receive",
          lines: {
            create: lineData.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitCost: l.unitCost,
            })),
          },
        },
      });
      const receipt = await receivePurchaseOrderTx(tx, { orgId, userId, orderId: order.id, requested: null });
      if (applyCost) {
        for (const l of lineData) {
          await tx.product.updateMany({
            where: { id: l.productId, organizationId: orgId },
            data: { cost: l.unitCost },
          });
        }
      }
      const purchase = await tx.purchase.create({
        data: {
          supplierId: supplier.id,
          branchId: bid,
          userId,
          note: note != null && String(note).trim() ? String(note).trim() : null,
          items: {
            create: lineData.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              subtotal: l.subtotal,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          branch: true,
          supplier: true,
          user: { select: { name: true } },
        },
      });
      return { purchase, orderId: order.id, bill: receipt.bill };
    },
    { maxWait: 15000, timeout: 60000 },
  );

  await writeAudit({
    userId,
    action: "PURCHASE_RECEIVE",
    entityType: "PurchaseOrder",
    entityId: result.orderId,
    branchId: bid,
    summary: `Quick receive ${lineData.length} lines, bill ${fmt(result.bill.amount)}`,
    meta: { purchaseId: result.purchase.id, billId: result.bill.id },
  });

  return { purchase: { ...result.purchase, purchaseOrderId: result.orderId, bill: result.bill }, branchId: bid, lineData };
}
