/**
 * Extra export lists (CSV / XLSX / PDF through routes/exports.js): sales orders, pending payments,
 * pending stock and supplier balances, plus the P&L rows for sales orders, complimentary goods,
 * bank transfer, prepayments and freight.
 */
import { prisma } from "./prisma.js";
import { d, money } from "./money.js";
import { pendingPayments, pendingStock, supplierBalances } from "./pending.js";
import { soView, SO_INCLUDE } from "./salesOrders.js";

export const EXTRA_LISTS = {
  salesorders: "salesOrders",
  pending: "finance",
  pendingstock: "purchasing",
  supplierbalances: "purchasing",
};

export const EXTRA_TITLES = {
  salesorders: { en: "Sales orders", ar: "طلبات البيع" },
  pending: { en: "Pending payments", ar: "المدفوعات المعلّقة" },
  pendingstock: { en: "Pending stock", ar: "المخزون المعلّق" },
  supplierbalances: { en: "Supplier balances", ar: "أرصدة الموردين" },
};

export const EXTRA_VALUES = {
  BANK_TRANSFER: { en: "Bank transfer", ar: "تحويل بنكي" },
  SALES_ORDER: { en: "B2B / sales orders", ar: "طلبات البيع (B2B)" },
  PARTLY_DELIVERED: { en: "Part delivered", ar: "مُسلَّم جزئياً" },
  COMPLETED: { en: "Completed", ar: "مكتمل" },
  ON_ACCOUNT: { en: "On account", ar: "على الحساب" },
  SUPPLIER_BILL: { en: "Supplier bill", ar: "فاتورة مورد" },
  FREIGHT_BILL: { en: "Freight bill", ar: "فاتورة شحن" },
  UNPAID: { en: "Unpaid", ar: "غير مدفوع" },
  PART_PAID: { en: "Part paid", ar: "مدفوع جزئياً" },
  IN: { en: "Incoming", ar: "وارد" },
  OUT: { en: "Outgoing", ar: "صادر" },
  TO_US: { en: "Owed to us", ar: "مستحق لنا" },
  BY_US: { en: "Owed by us", ar: "مستحق علينا" },
};

export const EXTRA_HEAD = {
  side: ["Side", "الجهة"],
  kind: ["Kind", "النوع"],
  counterparty: ["Customer / supplier", "العميل / المورد"],
  dueDate: ["Due date", "تاريخ الاستحقاق"],
  overdue: ["Overdue", "متأخر"],
  direction: ["Direction", "الاتجاه"],
  deliveryDate: ["Delivery date", "تاريخ التسليم"],
  paidStatus: ["Paid", "الدفع"],
  billed: ["Billed (QAR)", "المفوتر (ر.ق)"],
  prepaid: ["Prepaid (QAR)", "المدفوع مقدماً (ر.ق)"],
  freight: ["Freight company", "شركة شحن"],
};

export const EXTRA_ENUMS = ["side", "kind", "overdue", "direction", "paidStatus", "freight"];
export const EXTRA_MONEY = ["billed", "prepaid"];

const num = (v) => Number(v);

export async function buildExtraList(list, req, { lang, qatarStamp, pick }) {
  const orgId = req.user.organizationId;
  const q = req.query;
  if (list === "salesorders") {
    const rows = await prisma.salesOrder.findMany({ where: { organizationId: orgId }, include: SO_INCLUDE, orderBy: { createdAt: "desc" }, take: 5000 });
    return {
      subtitle: "",
      columns: ["reference", "customer", "status", "total", "paid", "owed", "deliveryDate", "overdue", "date"],
      rows: rows.map((o) => {
        const v = soView(o);
        return {
          reference: o.reference,
          customer: o.customer?.companyName || o.customer?.name || "",
          status: o.status,
          total: money(o.total),
          paid: money(o.amountPaid),
          owed: money(d(o.total) - d(o.amountPaid)),
          deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : "",
          overdue: v.overdue ? "YES" : "NO",
          date: qatarStamp(o.createdAt, false),
        };
      }),
    };
  }
  if (list === "pending") {
    const data = await pendingPayments(orgId, q);
    const row = (side) => (r) => ({
      side,
      kind: r.kind,
      counterparty: r.counterparty,
      reference: r.reference,
      dueDate: r.dueDate || "",
      amount: num(r.amount),
      paid: num(r.paid),
      owed: num(r.owed),
      overdue: r.overdue ? "YES" : "NO",
    });
    return {
      subtitle: `${lang === "ar" ? "في" : "As of"} ${data.asOf}`,
      columns: ["side", "kind", "counterparty", "reference", "dueDate", "amount", "paid", "owed", "overdue"],
      rows: [...data.toUs.map(row("TO_US")), ...data.byUs.map(row("BY_US"))],
    };
  }
  if (list === "pendingstock") {
    const data = await pendingStock(orgId, q);
    const row = (r) => ({
      direction: r.direction,
      product: pick(lang, r.product, r.productEn),
      quantity: r.quantity,
      unit: r.unit,
      deliveryDate: r.date || "",
      counterparty: r.counterparty,
      reference: r.reference,
      location: pick(lang, r.location, r.locationEn),
      paidStatus: r.paidStatus,
    });
    return {
      subtitle: `${lang === "ar" ? "في" : "As of"} ${qatarStamp(new Date())}`,
      columns: ["direction", "product", "quantity", "unit", "deliveryDate", "counterparty", "reference", "location", "paidStatus"],
      rows: [...data.incoming.map(row), ...data.outgoing.map(row)],
    };
  }
  if (list === "supplierbalances") {
    const data = await supplierBalances(orgId, q);
    return {
      subtitle: `${lang === "ar" ? "في" : "As of"} ${data.asOf}`,
      columns: ["supplier", "freight", "billed", "paid", "prepaid", "balance"],
      rows: data.rows.map((r) => ({
        supplier: r.supplier,
        freight: r.isFreight ? "YES" : "NO",
        billed: num(r.billed),
        paid: num(r.paid),
        prepaid: num(r.prepaid),
        balance: num(r.balance),
      })),
    };
  }
  return null;
}

const PL = {
  complimentary: ["Complimentary (free goods at cost)", "بضاعة مجانية (بالتكلفة)"],
  freightOnSold: ["Freight on goods already sold", "شحن على بضاعة مباعة سابقاً"],
  soIn: ["Sales-order payments", "دفعات طلبات البيع"],
  transfer: ["of which bank transfer", "منها تحويل بنكي"],
  prepay: ["Supplier prepayments", "دفعات مقدمة للموردين"],
};

/** Extra P&L / money rows for the "profit" export (inserted after the standard lines). */
export function extraProfitRows(s, lang) {
  const L = (k) => PL[k][lang === "ar" ? 1 : 0];
  return [
    { line: L("complimentary"), amount: -(s.complimentary ?? 0) },
    { line: L("freightOnSold"), amount: -(s.freightOnSold ?? 0) },
    { line: `  ${L("soIn")}`, amount: s.moneyInDetail.salesOrders ?? 0 },
    { line: `  ${L("transfer")}`, amount: s.moneyInDetail.bankTransfer ?? 0 },
    { line: `  ${L("prepay")}`, amount: (s.moneyOutDetail.supplierPrepaymentsCash ?? 0) + (s.moneyOutDetail.supplierPrepaymentsBank ?? 0) },
  ];
}
