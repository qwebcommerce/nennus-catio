/**
 * fix-rg: the two statuses of an order, shown side by side — payment and delivery — and the
 * "situation" that says which side is ahead (docs/testing/printable-documents.md).
 *
 * Payment:  UNPAID / PART_PAID / PAID. Sales orders count only money the accountant confirmed;
 *           money awaiting confirmation is reported separately (`awaiting`), never as paid.
 * Delivery: NOT_DELIVERED / PART_DELIVERED / DELIVERED (for purchase orders: received).
 * Situation (open orders only):
 *   PAID_NOT_DELIVERED  money paid is more than the value delivered (customer / we paid ahead);
 *   DELIVERED_NOT_PAID  value delivered is more than the money paid (goods out / in, money owed);
 *   OPEN                nothing paid and nothing delivered yet;
 *   PARTIAL             partly paid and partly delivered, in step (neither side ahead);
 *   SETTLED             fully paid and fully delivered.
 * Value delivered: sales orders = revenue recognised at delivery (net of the order discount, so it
 * reaches the order total when fully delivered); purchase orders = value received at unit cost.
 * All amounts are whole dirhams (NFR-03).
 */
import { d } from "./money.js";

export const PAYMENT_STATES = ["UNPAID", "PART_PAID", "PAID"];
export const DELIVERY_STATES = ["NOT_DELIVERED", "PART_DELIVERED", "DELIVERED"];
export const SITUATIONS = ["PAID_NOT_DELIVERED", "DELIVERED_NOT_PAID", "OPEN", "PARTIAL", "SETTLED"];

function deliveryOf(lines, doneKey) {
  const list = lines || [];
  if (!list.length) return "NOT_DELIVERED";
  if (list.every((l) => l[doneKey] >= l.quantity)) return "DELIVERED";
  return list.some((l) => l[doneKey] > 0) ? "PART_DELIVERED" : "NOT_DELIVERED";
}

function paymentOf(paid, total) {
  if (total <= 0 || paid >= total) return "PAID";
  return paid > 0 ? "PART_PAID" : "UNPAID";
}

function situationOf({ open, payment, delivery, paid, delivered }) {
  if (!open) return null;
  if (payment === "PAID" && delivery === "DELIVERED") return "SETTLED";
  if (paid > delivered) return "PAID_NOT_DELIVERED";
  if (delivered > paid) return "DELIVERED_NOT_PAID";
  if (paid === 0 && delivery === "NOT_DELIVERED") return "OPEN";
  return "PARTIAL";
}

/** Sales order (or B2B delivery note): needs total, amountPaid, amountPending, deliveredRevenue, lines, status. */
export function soStatusPair(order) {
  const total = d(order.total);
  const paid = d(order.amountPaid);
  const delivered = d(order.deliveredRevenue);
  const payment = paymentOf(paid, total);
  const delivery = deliveryOf(order.lines, "quantityDelivered");
  const open = !["DRAFT", "CANCELLED"].includes(order.status);
  return {
    paymentState: payment,
    deliveryState: delivery,
    awaiting: d(order.amountPending),
    paidAhead: Math.max(0, paid - delivered),
    deliveredUnpaid: Math.max(0, delivered - paid),
    deliveredValue: delivered,
    situation: situationOf({ open, payment, delivery, paid, delivered }),
  };
}

/** Purchase order, from its poMoney() summary: paid = bill payments + prepayments, received at unit cost. */
export function poStatusPair(order, m) {
  const payment = paymentOf(m.paid, m.value);
  const delivery = deliveryOf(order.lines, "quantityReceived");
  const open = !["DRAFT", "CANCELLED"].includes(order.status);
  return {
    paymentState: payment,
    deliveryState: delivery,
    awaiting: 0,
    paidAhead: Math.max(0, m.paid - m.received),
    deliveredUnpaid: Math.max(0, m.received - m.paid),
    deliveredValue: m.received,
    situation: situationOf({ open, payment, delivery, paid: m.paid, delivered: m.received }),
  };
}

/**
 * List filters shared by sales and purchase orders: ?payment=UNPAID|PART_PAID|PAID|AWAITING
 * &delivery=NOT_DELIVERED|PART_DELIVERED|DELIVERED&situation=<SITUATIONS>. Unknown values are ignored.
 */
export function statusFilter(query = {}) {
  const pick = (raw, allowed) => {
    const v = String(raw || "").toUpperCase();
    return allowed.includes(v) ? v : "";
  };
  const payment = pick(query.payment, [...PAYMENT_STATES, "AWAITING"]);
  const delivery = pick(query.delivery, DELIVERY_STATES);
  const situation = pick(query.situation, SITUATIONS);
  const active = Boolean(payment || delivery || situation);
  return {
    active,
    test(pair) {
      if (payment === "AWAITING" ? !(pair.awaiting > 0) : payment && pair.paymentState !== payment) return false;
      if (delivery && pair.deliveryState !== delivery) return false;
      if (situation && pair.situation !== situation) return false;
      return true;
    },
  };
}

/** Riyal strings for the API. */
export function pairApi(pair) {
  const r = (n) => (n / 100).toFixed(2);
  return { ...pair, awaiting: r(pair.awaiting), paidAhead: r(pair.paidAhead), deliveredUnpaid: r(pair.deliveredUnpaid), deliveredValue: r(pair.deliveredValue) };
}
