/**
 * Recording a sales-order delivery — the ONE delivery path, shared by /api/sales-orders/:id/deliveries,
 * the B2B delivery notes (routes/b2b.js) and the driver's "Mark delivered" (routes/driver.js, fix-rb).
 * deliverOrderLines runs inside the caller's transaction:
 * - locks the order, checks each line's quantity left to deliver;
 * - refuses (409 SO_STOCK_SHORT) rather than take stock below zero at the order's location;
 * - moves stock out (SALE movement linked to the order) in a fixed row order (no deadlocks);
 * - recognises revenue and cost at delivery (free lines: cost as complimentary);
 * - writes the SalesOrderDelivery, the order's delivered revenue and status, and the audit row.
 * `wanted`: Map lineId → quantity. All amounts whole dirhams.
 */
import { prisma } from "./prisma.js";
import { writeAudit } from "./auditLog.js";
import { d, fmt, lineAmount } from "./money.js";
import { fail, optText } from "./bizError.js";
import { moveStock } from "./stockLedger.js";
import { stockRowKey } from "./dbErrors.js";
import { heldQuantity } from "./webOrder.js";
import { deliveryRevenue, loadOrder, lockOrder, settledStatus } from "./salesOrders.js";

export async function deliverOrderLines(tx, { orgId, userId, orderId, wanted, note = null }) {
  await lockOrder(tx, orgId, orderId);
  const order = await tx.salesOrder.findUnique({
    where: { id: orderId },
    include: { lines: { include: { product: { select: { name: true, nameEn: true, sellBy: true, cost: true } }, variant: { select: { label: true } } } } },
  });
  if (!["CONFIRMED", "PARTLY_DELIVERED"].includes(order.status)) {
    throw fail(400, "SO_NOT_DELIVERABLE", "يمكن التسليم من طلب مؤكد لم يُسلَّم بالكامل", "Deliver from a confirmed order that is not fully delivered");
  }
  const picks = [];
  for (const [lineId, qty] of wanted) {
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw fail(400, "SO_LINE_NOT_FOUND", "السطر غير موجود في الطلب", "A line is not on this order");
    if (qty > line.quantity - line.quantityDelivered) {
      throw fail(400, "SO_DELIVERY_TOO_MUCH", "لا يمكن تسليم أكثر من الكمية المتبقية", "A delivery cannot be more than the quantity still to deliver");
    }
    picks.push({ line, qty, branchId: order.branchId, productId: line.productId, variantId: line.variantId });
  }
  // Stock rows in one fixed order (as the till does) so concurrent writers cannot deadlock.
  picks.sort((a, b) => stockRowKey(a).localeCompare(stockRowKey(b)));
  const short = [];
  for (const p of picks) {
    const row = p.variantId
      ? await tx.variantStock.findUnique({ where: { variantId_branchId: { variantId: p.variantId, branchId: p.branchId } } })
      : await tx.inventory.findUnique({ where: { productId_branchId: { productId: p.productId, branchId: p.branchId } } });
    const held = await heldQuantity(tx, p);
    const available = (row?.quantity || 0) - held;
    if (available < p.qty) short.push({ lineId: p.line.id, product: p.line.product.nameEn || p.line.product.name, needed: p.qty, available: Math.max(0, available) });
  }
  if (short.length) {
    throw fail(409, "SO_STOCK_SHORT", "المخزون في موقع الطلب لا يكفي لهذا التسليم", "Not enough stock at the order's location for this delivery", { short });
  }
  let revenue = 0;
  let cost = 0;
  let complimentaryCost = 0;
  const deliveryLines = [];
  for (const p of picks) {
    const moved = await moveStock(tx, {
      orgId,
      userId: userId,
      productId: p.productId,
      variantId: p.variantId,
      branchId: p.branchId,
      delta: -p.qty,
      reason: "SALE",
      note: `Sales order ${order.reference}`,
      salesOrderId: order.id,
    });
    const unitCost = moved.unitCost != null ? d(moved.unitCost) : !p.variantId && p.line.product.cost != null ? d(p.line.product.cost) : 0;
    const costAmount = lineAmount(unitCost, p.qty, p.line.product.sellBy);
    const lineRevenue = deliveryRevenue(p.line, p.line.quantityDelivered, p.qty);
    revenue += lineRevenue;
    if (p.line.isFree) complimentaryCost += costAmount;
    else cost += costAmount;
    const updated = await tx.salesOrderLine.updateMany({
      where: { id: p.line.id, quantityDelivered: p.line.quantityDelivered },
      data: { quantityDelivered: p.line.quantityDelivered + p.qty },
    });
    if (updated.count !== 1) throw fail(409, "TRY_AGAIN", "تغيّر الطلب أثناء التسليم. حاول مرة أخرى.", "The order changed while delivering. Try again.");
    p.line.quantityDelivered += p.qty;
    deliveryLines.push({ lineId: p.line.id, quantity: p.qty, revenue: lineRevenue, unitCost, costAmount, isFree: p.line.isFree });
  }
  const created = await tx.salesOrderDelivery.create({
    data: {
      orderId: order.id,
      branchId: order.branchId,
      userId: userId,
      note: note,
      revenue,
      cost,
      complimentaryCost,
      lines: { create: deliveryLines },
    },
  });
  const status = settledStatus(order, order.lines);
  await tx.salesOrder.update({
    where: { id: order.id },
    data: { deliveredRevenue: d(order.deliveredRevenue) + revenue, status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) },
  });
  await writeAudit({
    userId: userId,
    action: "SALES_ORDER_DELIVERY",
    entityType: "SalesOrder",
    entityId: order.id,
    branchId: order.branchId,
    summary: `${order.reference}: delivered ${deliveryLines.length} line(s), revenue ${fmt(revenue)}, cost ${fmt(cost)}, complimentary ${fmt(complimentaryCost)}`,
    meta: { deliveryId: created.id, lines: deliveryLines.map((l) => ({ lineId: l.lineId, quantity: l.quantity })) },
  }, tx);
  return created;
}

const TX = { maxWait: 10000, timeout: 30000 };

/**
 * A delivery from a request: `lines` [{ lineId, quantity }] or empty for everything still to deliver.
 * Runs in `db` when given (a caller's transaction, e.g. the driver dashboard), else in its own.
 * A B2B delivery note delivered this way follows the B2B flow: stock and revenue now, then invoice
 * and cash receipt from the B2B tab. Returns the SalesOrderDelivery row.
 */
export async function deliverSalesOrder({ orgId, userId, orderId, lines, note }, db = null) {
  const asked = Array.isArray(lines) ? lines : [];
  const existing = await loadOrder(db || prisma, orgId, orderId);
  if (!["CONFIRMED", "PARTLY_DELIVERED"].includes(existing.status)) {
    throw fail(400, "SO_NOT_DELIVERABLE", "يمكن التسليم من طلب مؤكد لم يُسلَّم بالكامل", "Deliver from a confirmed order that is not fully delivered");
  }
  const wanted = new Map();
  if (asked.length) {
    for (const row of asked) {
      const qty = Number(row?.quantity);
      if (!Number.isInteger(qty) || qty < 0) throw fail(400, "SO_QUANTITY_INVALID", "كمية غير صالحة (عدد صحيح أكبر من صفر، أو غرامات للوزن)", "Enter a whole quantity above zero (grams for weight goods)");
      if (qty > 0) wanted.set(String(row?.lineId || ""), qty);
    }
  } else {
    for (const l of existing.lines) if (l.quantity > l.quantityDelivered) wanted.set(l.id, l.quantity - l.quantityDelivered);
  }
  if (!wanted.size) throw fail(400, "SO_DELIVERY_EMPTY", "أدخل كمية للتسليم", "Enter a quantity to deliver");
  const noteText = existing.orderType === "B2B" && !note ? `Delivery note ${existing.dnReference}` : optText(note, 500);
  const run = (tx) => deliverOrderLines(tx, { orgId, userId, orderId: existing.id, wanted, note: noteText });
  return db ? run(db) : prisma.$transaction(run, TX);
}
