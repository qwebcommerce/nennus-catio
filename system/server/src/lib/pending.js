/**
 * What is still open at a date ("as of", default today, Qatar days):
 * - pending payments owed TO us: sales-order installments not fully paid, and credit customers'
 *   on-account balances; owed BY us: supplier and freight bills not fully paid;
 * - pending stock: purchase-order quantity not yet received (incoming) and sales-order quantity
 *   not yet delivered (outgoing);
 * - balances per supplier / freight company.
 * Figures as of a past date replay the records dated up to the end of that day. All sums are
 * whole dirhams; the API answers riyals.
 */
import { prisma } from "./prisma.js";
import { d, fmt, lineAmount } from "./money.js";
import { fail, dayOf } from "./bizError.js";
import { qatarDayKey, qatarDayStart } from "./qatarTime.js";
import { allocatePaid, paidStatus } from "./salesOrders.js";
import { poMoney, sellByMap } from "./purchaseExtras.js";

const DAY_MS = 86400000;

export function asOfRange(query) {
  const raw = String(query?.asOf || "").trim();
  const day = raw ? raw.slice(0, 10) : qatarDayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(qatarDayStart(day).getTime())) {
    throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date");
  }
  const end = new Date(qatarDayStart(day).getTime() + DAY_MS);
  const weekEnd = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
  return { day, end, weekEnd };
}

const name = (p, v) => ({
  product: `${p?.name || ""}${v?.label ? ` (${v.label})` : ""}`,
  productEn: `${p?.nameEn || p?.name || ""}${v ? ` (${v.labelEn || v.label})` : ""}`,
});

function dueFlags(due, day, weekEnd, owed) {
  const dueDay = due ? dayOf(due) : null;
  return {
    overdue: owed > 0 && dueDay != null && dueDay < day,
    dueThisWeek: owed > 0 && dueDay != null && dueDay >= day && dueDay < weekEnd,
  };
}

/** Rows and totals of money owed to us and by us. */
export async function pendingPayments(orgId, query = {}) {
  const { day, end, weekEnd } = asOfRange(query);
  const customerId = query.customerId ? String(query.customerId) : "";
  const supplierId = query.supplierId ? String(query.supplierId) : "";
  const side = String(query.side || "").toLowerCase();
  const toUs = [];
  const byUs = [];

  if (!supplierId && side !== "byus") {
    // Sales-order installments (orders confirmed by the date).
    const orders = await prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: ["DRAFT", "CANCELLED"] },
        confirmedAt: { lt: end },
        ...(customerId ? { customerId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, companyName: true } },
        installments: true,
        invoice: { select: { reference: true } },
        payments: { where: { paidAt: { lt: end } }, select: { amount: true } },
      },
    });
    for (const o of orders) {
      const paid = o.payments.reduce((s, p) => s + d(p.amount), 0);
      for (const inst of allocatePaid(o.installments, paid)) {
        const owed = inst.amount - inst.paid;
        if (owed <= 0) continue;
        toUs.push({
          kind: "SALES_ORDER",
          id: `${o.id}:${inst.seq}`,
          salesOrderId: o.id,
          // B2B delivery notes show their note and invoice numbers (lib/b2b.js).
          reference: o.orderType === "B2B" ? `${o.dnReference}${o.invoice ? ` · ${o.invoice.reference}` : ""}` : `${o.reference} #${inst.seq}`,
          b2b: o.orderType === "B2B",
          customerId: o.customerId,
          counterparty: o.customer?.companyName || o.customer?.name || "",
          dueDate: dayOf(inst.dueDate),
          amount: inst.amount,
          paid: inst.paid,
          owed,
          ...dueFlags(inst.dueDate, day, weekEnd, owed),
        });
      }
    }
    // Credit customers: on-account balance from the ledger up to the date.
    const ledger = await prisma.customerAccountLedger.groupBy({
      by: ["customerId"],
      where: { organizationId: orgId, createdAt: { lt: end }, ...(customerId ? { customerId } : {}) },
      _sum: { amount: true },
    });
    const owing = ledger.filter((r) => d(r._sum.amount) > 0);
    if (owing.length) {
      const ids = owing.map((r) => r.customerId);
      const [customers, openSales] = await Promise.all([
        prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, companyName: true } }),
        prisma.sale.findMany({
          where: { customerId: { in: ids }, amountDue: { gt: 0 }, createdAt: { lt: end }, invoiceStatus: { not: "CANCELLED" } },
          select: { customerId: true, dueDate: true },
        }),
      ]);
      const byId = new Map(customers.map((c) => [c.id, c]));
      for (const r of owing) {
        const owed = d(r._sum.amount);
        const dues = openSales.filter((s) => s.customerId === r.customerId && s.dueDate).map((s) => s.dueDate).sort((a, b) => a - b);
        const due = dues[0] || null;
        const c = byId.get(r.customerId);
        toUs.push({
          kind: "ON_ACCOUNT",
          id: `acct:${r.customerId}`,
          customerId: r.customerId,
          reference: "",
          counterparty: c?.companyName || c?.name || "",
          dueDate: due ? qatarDayKey(due) : null,
          amount: owed,
          paid: 0,
          owed,
          ...dueFlags(due ? new Date(`${qatarDayKey(due)}T00:00:00Z`) : null, day, weekEnd, owed),
        });
      }
    }
  }

  if (!customerId && side !== "tous") {
    const bills = await prisma.supplierBill.findMany({
      where: { organizationId: orgId, createdAt: { lt: end }, ...(supplierId ? { supplierId } : {}) },
      include: {
        supplier: { select: { id: true, name: true, isFreight: true } },
        payments: { where: { paidAt: { lt: end } }, select: { amount: true } },
        prepaymentApplications: { where: { createdAt: { lt: end } }, select: { amount: true } },
      },
    });
    for (const b of bills) {
      const paid = b.payments.reduce((s, p) => s + d(p.amount), 0) + b.prepaymentApplications.reduce((s, p) => s + d(p.amount), 0);
      const owed = d(b.amount) - paid;
      if (owed <= 0) continue;
      const due = b.dueDate || new Date(`${qatarDayKey(b.createdAt)}T00:00:00Z`);
      byUs.push({
        kind: b.kind === "FREIGHT" ? "FREIGHT_BILL" : "SUPPLIER_BILL",
        id: b.id,
        purchaseOrderId: b.purchaseOrderId,
        supplierId: b.supplierId,
        reference: b.reference || (b.purchaseOrderId ? `PO ${b.purchaseOrderId.slice(-6).toUpperCase()}` : ""),
        counterparty: b.supplier?.name || "",
        dueDate: dayOf(due),
        amount: d(b.amount),
        paid,
        owed,
        ...dueFlags(due, day, weekEnd, owed),
      });
    }
  }

  // Van returns (routes/vanReturns.js): money owed back to customers until paid.
  if (!customerId && !supplierId && side !== "tous") {
    const returns = await prisma.vanReturn.findMany({
      where: {
        organizationId: orgId,
        amountOwed: { gt: 0 },
        collectedAt: { lt: end },
        OR: [{ paymentStatus: "UNPAID" }, { paidAt: { gte: end } }],
      },
      select: { id: true, reference: true, customerName: true, customer: { select: { name: true } }, amountOwed: true, collectedAt: true },
    });
    for (const r of returns) {
      const owed = d(r.amountOwed);
      const due = new Date(`${qatarDayKey(r.collectedAt)}T00:00:00Z`);
      byUs.push({
        kind: "VAN_RETURN",
        id: r.id,
        vanReturnId: r.id,
        reference: r.reference || r.id.slice(-8).toUpperCase(),
        counterparty: r.customerName || r.customer?.name || "",
        dueDate: dayOf(due),
        amount: owed,
        paid: 0,
        owed,
        ...dueFlags(due, day, weekEnd, owed),
      });
    }
  }

  const sort = (a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")) || a.counterparty.localeCompare(b.counterparty);
  toUs.sort(sort);
  byUs.sort(sort);
  const total = (rows, pick) => rows.reduce((s, r) => s + (pick(r) ? r.owed : 0), 0);
  const totals = {
    owedToUs: total(toUs, () => true),
    overdueToUs: total(toUs, (r) => r.overdue),
    dueThisWeekToUs: total(toUs, (r) => r.dueThisWeek),
    owedByUs: total(byUs, () => true),
    overdueByUs: total(byUs, (r) => r.overdue),
    dueThisWeekByUs: total(byUs, (r) => r.dueThisWeek),
  };
  const out = (r) => ({ ...r, amount: fmt(r.amount), paid: fmt(r.paid), owed: fmt(r.owed) });
  return {
    asOf: day,
    toUs: toUs.map(out),
    byUs: byUs.map(out),
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, fmt(v)])),
    counts: { toUs: toUs.length, byUs: byUs.length, overdueToUs: toUs.filter((r) => r.overdue).length, overdueByUs: byUs.filter((r) => r.overdue).length },
  };
}

/** Goods still to come in (purchase orders) and to go out (sales orders). */
export async function pendingStock(orgId, query = {}) {
  const branchId = query.branchId ? String(query.branchId) : "";
  const [pos, sos] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "PARTIALLY_RECEIVED"] }, ...(branchId ? { branchId } : {}) },
      include: {
        lines: { include: { variant: { select: { label: true, labelEn: true } } } },
        bills: true,
        prepayments: true,
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, nameEn: true } },
      },
    }),
    prisma.salesOrder.findMany({
      where: { organizationId: orgId, status: { in: ["CONFIRMED", "PARTLY_DELIVERED"] }, ...(branchId ? { branchId } : {}) },
      include: {
        lines: { include: { product: { select: { name: true, nameEn: true, sellBy: true } }, variant: { select: { label: true, labelEn: true } } } },
        customer: { select: { id: true, name: true, companyName: true } },
        branch: { select: { id: true, name: true, nameEn: true } },
      },
    }),
  ]);
  const productIds = [...new Set(pos.flatMap((o) => o.lines.map((l) => l.productId)))];
  const products = new Map(
    (await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, nameEn: true, sellBy: true } })).map((p) => [p.id, p]),
  );
  const sellBy = await sellByMap(prisma, pos.flatMap((o) => o.lines));
  const incoming = [];
  for (const o of pos) {
    const m = poMoney(o, sellBy);
    for (const l of o.lines) {
      const qty = l.quantity - l.quantityReceived;
      if (qty <= 0) continue;
      const p = products.get(l.productId);
      incoming.push({
        direction: "IN",
        purchaseOrderId: o.id,
        reference: `PO ${o.id.slice(-6).toUpperCase()}`,
        productId: l.productId,
        variantId: l.variantId,
        ...name(p, l.variant),
        unit: p?.sellBy === "WEIGHT" ? "kg" : "pc",
        quantity: p?.sellBy === "WEIGHT" ? qty / 1000 : qty,
        value: fmt(lineAmount(l.unitCost, qty, p?.sellBy)),
        date: dayOf(o.expectedDate),
        counterparty: o.supplier?.name || "",
        location: o.branch?.name || "",
        locationEn: o.branch?.nameEn || o.branch?.name || "",
        paidStatus: m.paidStatus,
      });
    }
  }
  const outgoing = [];
  for (const o of sos) {
    for (const l of o.lines) {
      const qty = l.quantity - l.quantityDelivered;
      if (qty <= 0) continue;
      outgoing.push({
        direction: "OUT",
        salesOrderId: o.id,
        reference: o.reference,
        productId: l.productId,
        variantId: l.variantId,
        ...name(l.product, l.variant),
        unit: l.product?.sellBy === "WEIGHT" ? "kg" : "pc",
        quantity: l.product?.sellBy === "WEIGHT" ? qty / 1000 : qty,
        isFree: l.isFree,
        date: dayOf(o.deliveryDate),
        counterparty: o.customer?.companyName || o.customer?.name || "",
        location: o.branch?.name || "",
        locationEn: o.branch?.nameEn || o.branch?.name || "",
        paidStatus: paidStatus(o),
      });
    }
  }
  const byDate = (a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"));
  incoming.sort(byDate);
  outgoing.sort(byDate);
  return { incoming, outgoing, counts: { incoming: incoming.length, outgoing: outgoing.length } };
}

/**
 * Per supplier / freight company: billed, paid on bills, prepaid (and still unapplied), balance.
 * balance = billed − bill payments − prepayments (negative = credit with the supplier).
 */
export async function supplierBalances(orgId, query = {}) {
  const { day, end } = asOfRange(query);
  const supplierId = query.supplierId ? String(query.supplierId) : "";
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: orgId, ...(supplierId ? { id: supplierId } : {}) },
    select: {
      id: true,
      name: true,
      isFreight: true,
      isActive: true,
      paymentTermsDays: true,
      supplierBills: {
        where: { createdAt: { lt: end } },
        select: {
          amount: true,
          kind: true,
          dueDate: true,
          payments: { where: { paidAt: { lt: end } }, select: { amount: true } },
          prepaymentApplications: { where: { createdAt: { lt: end } }, select: { amount: true } },
        },
      },
      prepayments: { where: { paidAt: { lt: end } }, select: { amount: true } },
    },
    orderBy: { name: "asc" },
  });
  const rows = [];
  const tot = { billed: 0, paid: 0, prepaid: 0, prepaidUnapplied: 0, balance: 0, overdue: 0 };
  for (const s of suppliers) {
    let billed = 0;
    let paid = 0;
    let applied = 0;
    let overdue = 0;
    for (const b of s.supplierBills) {
      const bp = b.payments.reduce((x, p) => x + d(p.amount), 0);
      const ba = b.prepaymentApplications.reduce((x, p) => x + d(p.amount), 0);
      billed += d(b.amount);
      paid += bp;
      applied += ba;
      const owed = d(b.amount) - bp - ba;
      if (owed > 0 && b.dueDate && dayOf(b.dueDate) < day) overdue += owed;
    }
    const prepaid = s.prepayments.reduce((x, p) => x + d(p.amount), 0);
    if (!billed && !prepaid) continue;
    const row = { billed, paid, prepaid, prepaidUnapplied: prepaid - applied, balance: billed - paid - prepaid, overdue };
    for (const k of Object.keys(tot)) tot[k] += row[k];
    rows.push({
      supplierId: s.id,
      supplier: s.name,
      isFreight: s.isFreight,
      isActive: s.isActive,
      paymentTermsDays: s.paymentTermsDays,
      ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fmt(v)])),
    });
  }
  return { asOf: day, rows, totals: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, fmt(v)])) };
}

/** Dashboard card: totals of pending payments and counts of pending stock lines. */
export async function pendingSummary(orgId) {
  const [pay, stock] = await Promise.all([pendingPayments(orgId, {}), pendingStock(orgId, {})]);
  return {
    asOf: pay.asOf,
    ...pay.totals,
    counts: pay.counts,
    incomingLines: stock.counts.incoming,
    outgoingLines: stock.counts.outgoing,
    nextIncoming: stock.incoming.find((r) => r.date) || null,
    nextOutgoing: stock.outgoing.find((r) => r.date) || null,
  };
}
