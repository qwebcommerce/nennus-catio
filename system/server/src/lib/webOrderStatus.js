/**
 * Website order status change (moved here unchanged from routes/onlineOrders.js so the driver
 * dashboard (fix-rb) marks a website delivery delivered through the same path): allowed steps only,
 * guarded transition, holds restored on cancel, audit row and the customer e-mail.
 */
import { prisma } from "./prisma.js";
import { restoreCommittedHolds } from "./webOrder.js";
import { d } from "./money.js";
import { writeAudit } from "./auditLog.js";
import { mailCustomer } from "./mailer.js";

export const WEB_NEXT = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  // FR-38 / FR-39: staff can still cancel once the order has left or is waiting at the counter.
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  READY_FOR_PICKUP: ["COLLECTED", "CANCELLED"],
};
const NEXT = WEB_NEXT;

export async function changeWebOrderStatus({ orgId, saleId, next, userId }) {
  const sale = await prisma.$transaction(async (tx) => {
    const row = await tx.sale.findFirst({
      where: { id: saleId, orderChannel: "WEBSITE", branch: { organizationId: orgId } },
    });
    if (!row?.webStatus) {
      const err = new Error("Order not found");
      err.status = 404;
      throw err;
    }
    const allowed = NEXT[row.webStatus] || [];
    if (!allowed.includes(next)) {
      const err = new Error("That status change is not allowed");
      err.status = 400;
      throw err;
    }
    if (next === "OUT_FOR_DELIVERY" && row.fulfillment !== "DELIVERY") {
      const err = new Error("Pickup orders become ready for pickup");
      err.status = 400;
      throw err;
    }
    if (next === "READY_FOR_PICKUP" && row.fulfillment !== "PICKUP") {
      const err = new Error("Delivery orders go out for delivery");
      err.status = 400;
      throw err;
    }
    // Guarded transition: of several parallel changes (or instances) only one applies.
    const moved = await tx.sale.updateMany({
      where: { id: row.id, webStatus: row.webStatus },
      data: {
        webStatus: next,
        ...(next === "CANCELLED" ? { invoiceStatus: "CANCELLED" } : {}),
        ...(next === "CANCELLED" && d(row.amountPaid) > 0 ? { paymentReview: true, paymentReviewReason: "REFUND_DUE" } : {}),
      },
    });
    if (!moved.count) {
      const err = new Error("The order changed. Refresh and try again.");
      err.status = 409;
      throw err;
    }
    if (next === "CANCELLED") await restoreCommittedHolds(tx, row.id);
    return tx.sale.findUnique({ where: { id: row.id } });
  });
  await writeAudit({
    userId: userId,
    action: "ORDER_STATUS",
    entityType: "Sale",
    entityId: sale.id,
    summary: sale.webStatus,
  });
  if (sale.customerId) {
    const buyer = await prisma.customer.findUnique({ where: { id: sale.customerId } });
    await mailCustomer(buyer, "order", { reference: sale.reference || sale.invoiceNumber || sale.id.slice(-8).toUpperCase(), status: sale.webStatus });
  }
  return sale;
}
