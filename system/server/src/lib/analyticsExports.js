/**
 * CSV / XLSX / PDF exports for analytics and the histories (fix-rc), built by routes/exports.js
 * like every other list. All need Finance → export. Same filters as the screens.
 */
import { qatarDayKey, qatarDayStart, qatarRange } from "./qatarTime.js";
import { groomingAnalytics, newUsersAnalytics, peakHoursAnalytics, productAnalytics } from "./analytics.js";
import { expenseHistory, historyFilters, transactionHistory } from "./history.js";

export const ANALYTICS_LISTS = {
  "grooming-daily": "finance",
  "products-daily": "finance",
  "top-products": "finance",
  "new-users": "finance",
  "peak-hours": "finance",
  history: "finance",
  "expense-history": "finance",
};

export const ANALYTICS_TITLES = {
  "grooming-daily": { en: "Grooming by day", ar: "التجميل حسب اليوم" },
  "products-daily": { en: "Product sales by day", ar: "مبيعات المنتجات حسب اليوم" },
  "top-products": { en: "Top products", ar: "المنتجات الأكثر مبيعاً" },
  "new-users": { en: "New registered users", ar: "المستخدمون المسجلون الجدد" },
  "peak-hours": { en: "Orders by hour (Qatar time)", ar: "الطلبات حسب الساعة (بتوقيت قطر)" },
  history: { en: "Transactions history", ar: "سجل المعاملات" },
  "expense-history": { en: "Expenses history", ar: "سجل المصروفات" },
};

export const ANALYTICS_HEAD = {
  day: ["Day", "اليوم"],
  bookings: ["Bookings", "الحجوزات"],
  done: ["Done", "منجزة"],
  pending: ["Pending", "قيد الانتظار"],
  cancelled: ["Cancelled", "ملغاة"],
  noShow: ["No-shows", "لم يحضر"],
  doneValue: ["Value done (QAR)", "قيمة المنجز (ر.ق)"],
  paidIn: ["Paid in, net (QAR)", "المدفوع صافي (ر.ق)"],
  orders: ["Orders", "الطلبات"],
  storeOrders: ["Till orders", "طلبات المتجر"],
  storeAmount: ["Till (QAR)", "المتجر (ر.ق)"],
  vanOrders: ["Van orders", "طلبات الفان"],
  vanAmount: ["Van (QAR)", "الفان (ر.ق)"],
  webOrders: ["Website orders", "طلبات الموقع"],
  webAmount: ["Website (QAR)", "الموقع (ر.ق)"],
  soOrders: ["Sales-order deliveries", "تسليمات طلبات البيع"],
  soAmount: ["Sales orders (QAR)", "طلبات البيع (ر.ق)"],
  pendingWeb: ["Pending website orders", "طلبات موقع معلّقة"],
  pendingSo: ["Pending sales-order deliveries", "تسليمات طلبات بيع معلّقة"],
  rank: ["#", "#"],
  period: ["Period from", "الفترة من"],
  registered: ["Registered", "المسجلون"],
  verified: ["Email confirmed", "البريد مؤكد"],
  hour: ["Hour", "الساعة"],
  time: ["Time", "الوقت"],
  payee: ["Payee", "المستفيد"],
  receipt: ["Receipt no.", "رقم الإيصال"],
};

export const ANALYTICS_NUMERIC = ["bookings", "done", "pending", "cancelled", "noShow", "doneValue", "paidIn", "orders", "storeOrders", "storeAmount", "vanOrders", "vanAmount", "webOrders", "webAmount", "soOrders", "soAmount", "pendingWeb", "pendingSo", "rank", "registered", "verified"];
export const ANALYTICS_MONEY = ["doneValue", "paidIn", "storeAmount", "vanAmount", "webAmount", "soAmount"];

function badDates() {
  const err = new Error("Invalid dates");
  err.status = 400;
  return err;
}

/** Same default as the screens: the last 30 days. */
function rangeOf(q) {
  const last30 = qatarDayStart(qatarDayKey(new Date(Date.now() - 29 * 86400000)));
  const dates = qatarRange(q, { defaultFrom: last30 });
  if (!dates || dates.to <= dates.from || dates.to - dates.from > 731 * 86400000) throw badDates();
  return dates;
}

export async function buildAnalyticsList(list, req, { lang, qatarStamp, pick }) {
  if (!ANALYTICS_LISTS[list]) return null;
  const orgId = req.user.organizationId;
  const q = req.query;
  const dates = rangeOf(q);
  const subtitle = `${qatarStamp(dates.from, false)} – ${qatarStamp(new Date(dates.to.getTime() - 1), false)}`;
  const branchId = q.branchId ? String(q.branchId) : "";
  const totalLabel = lang === "ar" ? "الإجمالي" : "Total";

  if (list === "grooming-daily") {
    const data = await groomingAnalytics(orgId, dates, { branchId });
    const row = (r, day) => ({ day, bookings: r.bookings, done: r.done, pending: r.pending, cancelled: r.cancelled, noShow: r.noShow, doneValue: r.doneValue, paidIn: r.paid });
    return {
      subtitle,
      columns: ["day", "bookings", "done", "pending", "cancelled", "noShow", "doneValue", "paidIn"],
      rows: [...data.days.map((r) => row(r, r.day)), row(data.totals, totalLabel)],
    };
  }
  if (list === "products-daily") {
    const data = await productAnalytics(orgId, dates, { branchId });
    const row = (r, day) => ({
      day, orders: r.orders, amount: r.amount,
      storeOrders: r.channels.IN_STORE.orders, storeAmount: r.channels.IN_STORE.amount,
      vanOrders: r.channels.VAN.orders, vanAmount: r.channels.VAN.amount,
      webOrders: r.channels.WEBSITE.orders, webAmount: r.channels.WEBSITE.amount,
      soOrders: r.channels.SALES_ORDER.orders, soAmount: r.channels.SALES_ORDER.amount,
      pendingWeb: r.pendingWeb, pendingSo: r.pendingSo, cancelled: r.cancelled,
    });
    return {
      subtitle,
      columns: ["day", "orders", "amount", "storeOrders", "storeAmount", "vanOrders", "vanAmount", "webOrders", "webAmount", "soOrders", "soAmount", "pendingWeb", "pendingSo", "cancelled"],
      rows: [...data.days.map((r) => row(r, r.day)), row(data.totals, totalLabel)],
    };
  }
  if (list === "top-products") {
    const data = await productAnalytics(orgId, dates, { branchId, top: q.top || 20 });
    return {
      subtitle,
      columns: ["rank", "product", "unit", "quantity", "amount"],
      rows: data.topProducts.map((r) => ({ rank: r.rank, product: pick(lang, r.name, r.nameEn), unit: r.unit, quantity: r.quantity, amount: r.amount })),
    };
  }
  if (list === "new-users") {
    const raw = String(q.groupBy || "day").toLowerCase();
    const data = await newUsersAnalytics(orgId, dates, { groupBy: ["day", "week", "month"].includes(raw) ? raw : "day" });
    return {
      subtitle,
      columns: ["period", "registered", "verified"],
      rows: [...data.periods, { period: totalLabel, ...data.totals }],
    };
  }
  if (list === "peak-hours") {
    const data = await peakHoursAnalytics(orgId, dates, { channel: String(q.channel || "").toUpperCase(), branchId });
    return {
      subtitle,
      columns: ["hour", "orders", "amount"],
      rows: data.hours.map((h) => ({ hour: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour).padStart(2, "0")}:59`, orders: h.orders, amount: h.amount })),
    };
  }
  if (list === "history") {
    const f = historyFilters(q);
    const data = await transactionHistory(orgId, dates, f, { all: true });
    return {
      subtitle,
      columns: ["date", "type", "reference", "channel", "location", "customer", "phone", "paymentMethod", "status", "amount"],
      rows: data.rows.map((row) => ({
        date: qatarStamp(row.date),
        type: row.type,
        reference: row.reference,
        channel: row.channel,
        location: pick(lang, row.location, row.locationEn),
        customer: row.customer,
        phone: row.phone,
        paymentMethod: row.paymentMethod,
        status: row.status,
        amount: row.amount,
      })),
    };
  }
  if (list === "expense-history") {
    const data = await expenseHistory(orgId, dates, q, { all: true });
    return {
      subtitle,
      columns: ["date", "time", "category", "payee", "receipt", "amount", "paidFrom", "note"],
      rows: data.rows.map((e) => ({
        date: qatarStamp(e.expenseDate, false),
        time: qatarStamp(e.createdAt).slice(11),
        category: e.category,
        payee: e.payee || "",
        receipt: e.reference || "",
        amount: e.amount,
        paidFrom: e.paidFrom,
        note: e.description || "",
      })),
    };
  }
  return null;
}
