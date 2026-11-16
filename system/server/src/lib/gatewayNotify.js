import { Prisma } from "./prisma-client-bundle.js";
import { prisma } from "./prisma.js";
import { needsReview, settleGatewayPayment } from "./payments.js";
import { commitSaleHolds, releaseSaleHolds } from "./webOrder.js";
import { mailCustomer, mailStaff } from "./mailer.js";
import { claimSlot } from "./groomingSlots.js";
import { publicBase } from "./publicUrl.js";

/** Custom1 we send to SkipCash for each kind of parent (see the create calls). */
export function gatewayCustom(parentKind, id) {
  if (parentKind === "appointment") return `booking:${id}`;
  if (parentKind === "relocation") return `relocation:${id}`;
  return id;
}

function laterOf(confirmAt) {
  const now = new Date();
  return confirmAt instanceof Date && !Number.isNaN(confirmAt.getTime()) && confirmAt < now ? confirmAt : now;
}

/**
 * Applies one gateway payment result to its order, booking or relocation request. This is the
 * single confirm path for the signed webhook AND for the server's own status lookup (FR-76):
 * amount / currency / lateness checks and REVIEW rules come from settleGatewayPayment, the
 * parent moves only through guarded conditional updates, and a payment id already recorded is
 * a replay (unique index), so webhook and lookup together confirm exactly once.
 *
 * body: { PaymentId, Amount, Currency, StatusId, TransactionId, Custom1 }.
 * confirmAt: the moment the payment was made, used only for the hold-expiry check. The webhook
 * uses "now"; a lookup may pass the gateway's own payment time (never later than now).
 * @returns {Promise<{ outcome: string, reason?: string, parentKind?: string, parentId?: string }>}
 */
export async function applyGatewayResult(body, { req = null, confirmAt = null } = {}) {
  const custom = String(body.Custom1 || "").trim();
  const statusId = Number(body.StatusId);
  const paymentRef = String(body.PaymentId || "");
  const at = laterOf(confirmAt);
  if (custom.startsWith("till:")) return { outcome: "ignored" };

  if (custom.startsWith("booking:")) {
    const booking = await prisma.appointment.findFirst({ where: { id: custom.slice(8) } });
    if (!booking) return { outcome: "unknown" };
    const ids = { parentKind: "appointment", parentId: booking.id };
    if (statusId === 2) {
      // FR-51, FR-76, FR-79: amount must match and the hold must still be live; otherwise staff review.
      const result = await settleGatewayPayment({
        ...ids,
        organizationId: booking.organizationId,
        body,
        expected: Number(booking.amount),
        confirm: async (tx, paid) => {
          const now = new Date();
          const moved = await tx.appointment.updateMany({
            where: { id: booking.id, status: "PENDING_PAYMENT", holdExpiresAt: { gt: at } },
            data: { status: "CONFIRMED", amountPaid: paid, paidAt: now, paymentReference: paymentRef || booking.paymentReference },
          });
          if (!moved.count) {
            const current = await tx.appointment.findUnique({ where: { id: booking.id }, select: { status: true } });
            throw needsReview(["PENDING_PAYMENT", "CANCELLED"].includes(current?.status) ? "LATE_PAYMENT" : "DUPLICATE_PAYMENT");
          }
          if (booking.holdExpiresAt && booking.holdExpiresAt <= now) {
            // Judged on the gateway's payment time after the hold lapsed: the slot must still be free.
            try {
              await claimSlot(tx, { organizationId: booking.organizationId, startAt: booking.startAt, endAt: booking.endAt, excludeId: booking.id, grid: null });
            } catch {
              throw needsReview("LATE_PAYMENT");
            }
          }
        },
      });
      const buyer = booking.customerId ? await prisma.customer.findUnique({ where: { id: booking.customerId } }) : null;
      const ref = booking.reference || booking.id.slice(-8).toUpperCase();
      if (result.outcome === "confirmed") {
        await mailCustomer(buyer, "booking", { reference: ref, status: "CONFIRMED", startAt: booking.startAt });
        await mailStaff(booking.organizationId, "alertBooking", { reference: ref });
      } else if (result.outcome === "review") {
        await mailStaff(booking.organizationId, "alertBooking", `Grooming booking ${ref} has a payment that needs review (${result.reason}).`);
      }
      return { ...ids, ...result };
    }
    if ([3, 4, 5].includes(statusId)) {
      const moved = await prisma.appointment.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
      return { ...ids, outcome: moved.count ? "cancelled" : "unchanged" };
    }
    return { ...ids, outcome: "pending" };
  }

  if (custom.startsWith("relocation:")) {
    const request = await prisma.relocationRequest.findFirst({ where: { id: custom.slice(11) } });
    if (!request) return { outcome: "unknown" };
    const ids = { parentKind: "relocation", parentId: request.id };
    if (statusId !== 2) return { ...ids, outcome: [3, 4, 5].includes(statusId) ? "unchanged" : "pending" };
    const expected = Number(request.quoteAmount || 0);
    const result = await settleGatewayPayment({
      ...ids,
      organizationId: request.organizationId,
      body,
      expected,
      confirm: async (tx, paid) => {
        const now = new Date();
        const moved = await tx.relocationRequest.updateMany({
          where: { id: request.id, status: "QUOTE_SENT", quoteAmount: new Prisma.Decimal(expected.toFixed(2)) },
          data: { status: "PAID", paymentMethod: "ONLINE", paidAt: now, amountPaid: paid },
        });
        if (!moved.count) {
          const current = await tx.relocationRequest.findUnique({ where: { id: request.id }, select: { status: true } });
          if (current?.status === "QUOTE_SENT") throw needsReview("AMOUNT_MISMATCH");
          throw needsReview(["PAID", "IN_PROGRESS", "COMPLETED"].includes(current?.status) ? "DUPLICATE_PAYMENT" : "LATE_PAYMENT");
        }
        const fresh = await tx.relocationRequest.findUnique({ where: { id: request.id }, select: { history: true } });
        const history = Array.isArray(fresh?.history) ? fresh.history : [];
        await tx.relocationRequest.update({
          where: { id: request.id },
          data: { history: [...history, { at: now.toISOString(), status: "PAID", note: "ONLINE" }] },
        });
      },
    });
    if (result.outcome === "confirmed") {
      const buyer = await prisma.customer.findUnique({ where: { id: request.customerId } });
      await mailCustomer(buyer, "relocation", { reference: request.reference || request.id.slice(-8).toUpperCase(), status: "PAID" });
    } else if (result.outcome === "review") {
      await mailStaff(request.organizationId, "alertRelocation", `Relocation ${request.reference || request.id} has a payment that needs review (${result.reason}).`);
    }
    return { ...ids, ...result };
  }

  const sale = custom ? await prisma.sale.findFirst({ where: { id: custom, orderChannel: "WEBSITE" } }) : null;
  if (!sale) return { outcome: "unknown" };
  const ids = { parentKind: "sale", parentId: sale.id };
  if (statusId === 2) {
    const org = await prisma.branch.findUnique({ where: { id: sale.branchId }, select: { organizationId: true } });
    const result = await settleGatewayPayment({
      ...ids,
      organizationId: org.organizationId,
      body,
      expected: Number(sale.total),
      confirm: async (tx) => {
        const now = new Date();
        // Guarded: only a live, unpaid order confirms; a late payment goes to staff (FR-79).
        const moved = await tx.sale.updateMany({
          where: { id: sale.id, webStatus: "PENDING_PAYMENT", holdExpiresAt: { gt: at } },
          data: {
            webStatus: "CONFIRMED",
            amountPaid: sale.total,
            amountDue: 0,
            invoiceStatus: "PAID",
            paidAt: now,
            paymentReference: paymentRef || sale.paymentReference || "",
          },
        });
        if (!moved.count) {
          const current = await tx.sale.findUnique({ where: { id: sale.id }, select: { webStatus: true } });
          throw needsReview(["PENDING_PAYMENT", "CANCELLED"].includes(current?.webStatus) ? "LATE_PAYMENT" : "DUPLICATE_PAYMENT");
        }
        await commitSaleHolds(tx, sale);
      },
    });
    const buyer = sale.customerId ? await prisma.customer.findUnique({ where: { id: sale.customerId } }) : null;
    const ref = sale.reference || sale.invoiceNumber || sale.id.slice(-8).toUpperCase();
    if (result.outcome === "confirmed") {
      await mailCustomer(buyer, "order", { reference: ref, status: "CONFIRMED", link: `${publicBase(req)}/shop/orders/${sale.id}` });
      await mailStaff(org.organizationId, "alertOrder", { reference: ref });
    } else if (result.outcome === "review") {
      await mailStaff(org.organizationId, "alertOrder", `Website order ${ref} has a payment that needs review (${result.reason}).`);
    }
    return { ...ids, ...result };
  }
  if ([3, 4, 5].includes(statusId)) {
    const cancelled = await prisma.$transaction(async (tx) => {
      const moved = await tx.sale.updateMany({
        where: { id: sale.id, webStatus: "PENDING_PAYMENT" },
        data: { webStatus: "CANCELLED" },
      });
      if (moved.count) await releaseSaleHolds(tx, sale.id);
      return moved.count;
    });
    return { ...ids, outcome: cancelled ? "cancelled" : "unchanged" };
  }
  return { ...ids, outcome: "pending" };
}
