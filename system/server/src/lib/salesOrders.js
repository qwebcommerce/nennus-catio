/**
 * Sales orders (B2B / project orders): lines, an installment plan, payments and deliveries.
 *
 * Accounting rule (documented in docs/testing/sales-orders-payments.md):
 * - Revenue and cost are recognised at DELIVERY, line by line, when the goods leave the location
 *   (SALE stock movement linked to the order). Paid lines bring their net value (after the order
 *   discount share) in proportion to the quantity delivered; free lines bring no revenue and their
 *   cost is reported as Complimentary.
 * - Money in is recognised when a payment is recorded, by payment method (cash, card, bank
 *   transfer, ...). An order may be paid before delivery or delivered before payment.
 * - Payments are spread over the installments oldest first; more than the balance is refused.
 *
 * All amounts are whole dirhams (NFR-03).
 */
import { prisma } from "./prisma.js";
import { d, divRound, lineAmount, percentOf, splitProportional, toDirhams } from "./money.js";
import { toApi } from "./moneyFields.js";
import { fail, addDays, dayOf, optDate, optText } from "./bizError.js";
import { qatarDayKey } from "./qatarTime.js";
import { FILE_SELECT } from "./businessFiles.js";

export const SO_MAX_INSTALLMENTS = 4;
/** Methods an installment can be paid with. */
export const SO_PAY_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "FAWRAN", "PAYMENT_LINK"];
export const OPEN_STATUSES = ["CONFIRMED", "PARTLY_DELIVERED", "DELIVERED"];

export const SO_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, email: true, isBusiness: true, companyName: true, accountBalance: true } },
  branch: { select: { id: true, name: true, nameEn: true, kind: true } },
  user: { select: { id: true, name: true, nameEn: true } },
  lines: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      product: { select: { id: true, name: true, nameEn: true, sku: true, sellBy: true } },
      variant: { select: { id: true, label: true, labelEn: true, sku: true } },
    },
  },
  installments: { orderBy: { seq: "asc" } },
  payments: {
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    include: { proofFile: { select: FILE_SELECT }, user: { select: { id: true, name: true, nameEn: true } } },
  },
  deliveries: {
    orderBy: { deliveredAt: "asc" },
    include: { lines: true, user: { select: { id: true, name: true, nameEn: true } } },
  },
  // B2B delivery notes: the invoice they are on (lib/b2b.js).
  invoice: { select: { id: true, reference: true, status: true, invoiceDate: true, dueDate: true } },
};

/** Today in Qatar as a @db.Date value. */
export function todayDate() {
  return new Date(`${qatarDayKey()}T00:00:00Z`);
}

/**
 * Lines from the request, checked and priced. `rights`: { editPrice, giveFree } (module rights).
 * `previous`: lines already saved on the order (a saved price override can be kept by anyone).
 */
export async function prepareLines(db, orgId, input, rights, previous = []) {
  if (!Array.isArray(input) || !input.length) throw fail(400, "SO_LINES_REQUIRED", "أضف سطراً واحداً على الأقل", "Add at least one line");
  if (input.length > 200) throw fail(400, "SO_TOO_MANY_LINES", "عدد الأسطر كبير جداً", "Too many lines");
  const out = [];
  for (const [index, raw] of input.entries()) {
    const product = await db.product.findFirst({
      where: { id: String(raw?.productId || ""), organizationId: orgId },
      include: { variants: { select: { id: true, isActive: true, price: true, label: true } } },
    });
    if (!product) throw fail(400, "SO_PRODUCT_NOT_FOUND", "منتج غير موجود", "A line product was not found");
    let variant = null;
    if (raw?.variantId) {
      variant = product.variants.find((v) => v.id === String(raw.variantId));
      if (!variant || !variant.isActive) throw fail(400, "SO_VARIANT_INVALID", "الصنف غير متاح", "This variant cannot be sold");
    } else if (product.variants.length) {
      throw fail(400, "SO_VARIANT_REQUIRED", "اختر صنفاً للمنتج", "Choose a variant for this product");
    }
    const qtyRaw = Number(raw?.quantity);
    const quantity = product.sellBy === "WEIGHT" ? Math.round(qtyRaw) : qtyRaw;
    if (!Number.isFinite(qtyRaw) || !Number.isInteger(quantity) || quantity < 1) {
      throw fail(400, "SO_QUANTITY_INVALID", "كمية غير صالحة (عدد صحيح أكبر من صفر، أو غرامات للوزن)", "Enter a whole quantity above zero (grams for weight goods)");
    }
    const listPrice = variant ? d(variant.price) : d(product.price);
    let unitPrice = listPrice;
    if (raw?.unitPrice != null && String(raw.unitPrice).trim() !== "") {
      const asked = toDirhams(raw.unitPrice);
      if (asked == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
      const kept = previous.some((p) => p.productId === product.id && (p.variantId || null) === (variant?.id || null) && d(p.unitPrice) === asked);
      if (asked !== listPrice && !kept && !rights.editPrice) {
        throw fail(403, "SO_PRICE_EDIT_FORBIDDEN", "تغيير السعر للمدير أو المالك فقط", "Only a manager or the owner can change the price");
      }
      unitPrice = asked;
    }
    const isFree = raw?.isFree === true || raw?.isFree === "true";
    if (isFree && !rights.giveFree) {
      throw fail(403, "FREE_GOODS_FORBIDDEN", "البضاعة المجانية للمدير أو المالك فقط", "Only a manager or the owner can give goods free");
    }
    out.push({
      productId: product.id,
      variantId: variant?.id || null,
      sellBy: product.sellBy,
      sortOrder: index,
      quantity,
      listPrice,
      unitPrice,
      subtotal: isFree ? 0 : lineAmount(unitPrice, quantity, product.sellBy),
      isFree,
      discountShare: 0,
    });
  }
  return out;
}

/** Order totals and each line's share of the order discount (largest remainder, exact). */
export function priceOrder(lines, discountRaw) {
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  let discount = 0;
  if (discountRaw != null && String(discountRaw).trim() !== "") {
    discount = toDirhams(discountRaw);
    if (discount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
    if (discount > subtotal) throw fail(400, "SO_DISCOUNT_TOO_LARGE", "الخصم أكبر من قيمة الطلب", "The discount is larger than the order value");
  }
  const shares = splitProportional(discount, lines.map((l) => l.subtotal));
  lines.forEach((l, i) => {
    l.discountShare = shares[i] || 0;
  });
  return { subtotal, discount, total: subtotal - discount };
}

/**
 * Payment plan: up to 4 installments, each { amount } or { percent }, with a due date. The
 * installments add up to the order total exactly; on rounding the last one takes the remainder.
 * No plan: one installment for the total, due after the payment terms (or today).
 */
export function buildPlan(total, planInput, { termsDays = null, baseDay = todayDate() } = {}) {
  if (total <= 0) return [];
  const raw = Array.isArray(planInput) ? planInput.filter((r) => r && (r.amount != null && String(r.amount).trim() !== "" || r.percent != null && String(r.percent).trim() !== "")) : [];
  const defaultDue = addDays(baseDay, termsDays || 0);
  if (!raw.length) return [{ seq: 1, amount: total, percent: null, dueDate: defaultDue }];
  if (raw.length > SO_MAX_INSTALLMENTS) {
    throw fail(400, "SO_PLAN_TOO_LONG", "خطة الدفع 4 دفعات كحد أقصى", "A payment plan has at most 4 installments");
  }
  const rows = raw.map((r, i) => {
    const dueDate = optDate(r.dueDate, "dueDate") || (i === 0 ? defaultDue : null);
    if (!dueDate) throw fail(400, "SO_PLAN_DUE_REQUIRED", "أدخل تاريخ استحقاق لكل دفعة", "Enter a due date for each installment");
    if (r.percent != null && String(r.percent).trim() !== "") {
      const p = Number(r.percent);
      if (!Number.isFinite(p) || p <= 0 || p > 100 || !/^\d{1,3}(\.\d{1,3})?$/.test(String(r.percent).trim())) {
        throw fail(400, "SO_PLAN_PERCENT_INVALID", "نسبة الدفعة غير صالحة", "Enter an installment percent above 0 and up to 100");
      }
      return { seq: i + 1, percent: String(r.percent).trim(), amount: percentOf(total, String(r.percent).trim()), dueDate };
    }
    const amount = toDirhams(r.amount, { allowZero: false });
    if (amount == null) throw fail(400, "AMOUNT_INVALID", "المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)");
    return { seq: i + 1, percent: null, amount, dueDate };
  });
  const allPercent = rows.every((r) => r.percent != null);
  const anyPercent = rows.some((r) => r.percent != null);
  if (allPercent) {
    const thousandths = rows.reduce((s, r) => s + Math.round(Number(r.percent) * 1000), 0);
    if (thousandths !== 100000) throw fail(400, "SO_PLAN_SUM", "مجموع الدفعات يجب أن يساوي إجمالي الطلب (100%)", "The installments must add up to the order total (100%)");
  }
  const before = rows.slice(0, -1).reduce((s, r) => s + r.amount, 0);
  const last = rows[rows.length - 1];
  const remainder = total - before;
  // Amounts only: exact. With percents: the last installment takes the rounding remainder.
  const slack = anyPercent ? rows.length : 0;
  if (Math.abs(remainder - last.amount) > slack || remainder <= 0) {
    throw fail(400, "SO_PLAN_SUM", "مجموع الدفعات يجب أن يساوي إجمالي الطلب", "The installments must add up to the order total", { total: (total / 100).toFixed(2) });
  }
  last.amount = remainder;
  if (rows.some((r) => r.amount <= 0)) throw fail(400, "SO_PLAN_SUM", "مجموع الدفعات يجب أن يساوي إجمالي الطلب", "The installments must add up to the order total");
  return rows;
}

/** Spreads `paid` over installments oldest first: [{ id, seq, amount, paid }]. */
export function allocatePaid(installments, paid) {
  let left = paid;
  return [...installments]
    .sort((a, b) => a.seq - b.seq)
    .map((inst) => {
      const take = Math.max(0, Math.min(d(inst.amount), left));
      left -= take;
      return { id: inst.id, seq: inst.seq, amount: d(inst.amount), dueDate: inst.dueDate, paid: take };
    });
}

/** Revenue of delivering `qty` more of a line that already delivered `prev` (exact over the line). */
export function deliveryRevenue(line, prev, qty) {
  if (line.isFree) return 0;
  const net = d(line.subtotal) - d(line.discountShare);
  return divRound(BigInt(net) * BigInt(prev + qty), line.quantity) - divRound(BigInt(net) * BigInt(prev), line.quantity);
}

export function paidStatus(order) {
  const total = d(order.total);
  const paid = d(order.amountPaid);
  if (total > 0 && paid >= total) return "PAID";
  if (total <= 0) return "PAID";
  return paid > 0 ? "PART_PAID" : "UNPAID";
}

/** Next status after a delivery or a payment. */
export function settledStatus(order, lines) {
  if (order.status === "CANCELLED" || order.status === "DRAFT") return order.status;
  const delivered = lines.every((l) => l.quantityDelivered >= l.quantity);
  const any = lines.some((l) => l.quantityDelivered > 0);
  if (delivered && d(order.amountPaid) >= d(order.total)) return "COMPLETED";
  if (delivered) return "DELIVERED";
  return any ? "PARTLY_DELIVERED" : "CONFIRMED";
}

/** API view: riyal amounts plus balance, overdue installments and what is left to deliver. */
export function soView(order, today = qatarDayKey()) {
  const view = toApi("SalesOrder", order);
  const balance = d(order.total) - d(order.amountPaid);
  const open = order.status !== "CANCELLED" && order.status !== "DRAFT";
  const installments = (order.installments || []).map((inst, i) => {
    const owed = d(inst.amount) - d(inst.amountPaid);
    return {
      ...view.installments[i],
      owed: (owed / 100).toFixed(2),
      overdue: open && owed > 0 && dayOf(inst.dueDate) < today,
      status: owed <= 0 ? "PAID" : d(inst.amountPaid) > 0 ? "PART_PAID" : "UNPAID",
    };
  });
  const lines = (order.lines || []).map((line, i) => ({
    ...view.lines[i],
    quantityPending: Math.max(0, line.quantity - line.quantityDelivered),
  }));
  return {
    ...view,
    lines,
    installments,
    balance: (balance / 100).toFixed(2),
    paidStatus: paidStatus(order),
    overdue: installments.some((i) => i.overdue),
    nextDue: installments.find((i) => Number(i.owed) > 0)?.dueDate || null,
    pendingDelivery: lines.some((l) => l.quantityPending > 0) && open,
    hasFreeLines: (order.lines || []).some((l) => l.isFree),
  };
}

export async function loadOrder(db, orgId, id) {
  const order = await db.salesOrder.findFirst({ where: { id: String(id), organizationId: orgId }, include: SO_INCLUDE });
  if (!order) throw fail(404, "SO_NOT_FOUND", "طلب البيع غير موجود", "Sales order not found");
  return order;
}

export async function lockOrder(tx, orgId, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${String(id)} AND "organizationId" = ${orgId} FOR UPDATE`;
  if (!rows.length) throw fail(404, "SO_NOT_FOUND", "طلب البيع غير موجود", "Sales order not found");
}

/** Text fields shared by create / edit. */
export function orderFields(body) {
  const termsDays = body?.paymentTermsDays == null || body.paymentTermsDays === "" ? null : Number(body.paymentTermsDays);
  if (termsDays != null && (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365)) {
    throw fail(400, "TERMS_INVALID", "مدة السداد غير صالحة (0 إلى 365 يوماً)", "Payment terms must be 0 to 365 days");
  }
  return {
    deliveryDate: optDate(body?.deliveryDate, "deliveryDate"),
    note: optText(body?.note, 1000),
    paymentTerms: optText(body?.paymentTerms, 200),
    paymentTermsDays: termsDays,
    freeReason: optText(body?.freeReason, 300),
  };
}
