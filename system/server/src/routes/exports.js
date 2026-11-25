import { Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { d, money, sum } from "../lib/money.js";
import { qatarRange } from "../lib/qatarTime.js";
import { financeFilters, financeSummary, financeTransactions, stockValueRows } from "../lib/financeData.js";
import { tablePdf } from "../lib/pdfTable.js";

const router = Router();
router.use(authMiddleware);

const MAX_ROWS = 10000;

/** Module that grants export rights for each list. */
const LISTS = {
  orders: "orders",
  customers: "customers",
  products: "products",
  bookings: "grooming",
  bills: "purchasing",
  payments: "purchasing",
  expenses: "finance",
  cashups: "finance",
  profit: "finance",
  transactions: "finance",
  stockvalue: "finance",
};

const TITLES = {
  orders: { en: "Website orders", ar: "طلبات الموقع" },
  customers: { en: "Customers", ar: "العملاء" },
  products: { en: "Products", ar: "المنتجات" },
  bookings: { en: "Grooming bookings", ar: "حجوزات التجميل" },
  bills: { en: "Supplier bills", ar: "فواتير الموردين" },
  payments: { en: "Supplier payments", ar: "دفعات الموردين" },
  expenses: { en: "Expenses", ar: "المصروفات" },
  cashups: { en: "Cash-ups", ar: "إقفالات الصندوق" },
  profit: { en: "Profit and loss", ar: "الأرباح والخسائر" },
  transactions: { en: "Sales and refunds", ar: "المبيعات والمرتجعات" },
  stockvalue: { en: "Stock value", ar: "قيمة المخزون" },
};

/** Enum values shown to people, in both languages. */
const VALUES = {
  SALE: { en: "Sale", ar: "بيع" },
  REFUND: { en: "Refund", ar: "استرجاع" },
  REFUNDED: { en: "Refunded", ar: "مسترد" },
  UNPAID: { en: "Not paid yet", ar: "غير مدفوع بعد" },
  PAYMENT: { en: "Payment", ar: "دفعة" },
  REJECTED: { en: "Rejected (refunded)", ar: "مرفوضة (مستردة)" },
  GROOMING: { en: "Grooming", ar: "التجميل" },
  RELOCATION: { en: "Relocation", ar: "نقل الحيوانات" },
  IN_STORE: { en: "In-store", ar: "المتجر" },
  VAN: { en: "Van", ar: "الفان" },
  WEBSITE: { en: "Website", ar: "الموقع" },
  CASH: { en: "Cash", ar: "نقداً" },
  CARD: { en: "Card", ar: "بطاقة" },
  BANK: { en: "Bank", ar: "البنك" },
  ONLINE: { en: "Online", ar: "إلكتروني" },
  FAWRAN: { en: "Fawran", ar: "فوران" },
  PAYMENT_LINK: { en: "Payment link", ar: "رابط دفع" },
  SPLIT: { en: "Split", ar: "مقسّم" },
  ON_DELIVERY: { en: "On delivery", ar: "عند الاستلام" },
  ON_ACCOUNT: { en: "On account", ar: "على الحساب" },
  OPEN: { en: "Open", ar: "مفتوحة" },
  PARTIAL: { en: "Part paid", ar: "مدفوعة جزئياً" },
  PAID: { en: "Paid", ar: "مدفوعة" },
  ISSUED: { en: "Issued", ar: "صادرة" },
  DRAFT: { en: "Draft", ar: "مسودة" },
  CANCELLED: { en: "Cancelled", ar: "ملغى" },
  PENDING_PAYMENT: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد" },
  PREPARING: { en: "Preparing", ar: "قيد التجهيز" },
  OUT_FOR_DELIVERY: { en: "Out for delivery", ar: "خرج للتوصيل" },
  READY_FOR_PICKUP: { en: "Ready for pickup", ar: "جاهز للاستلام" },
  DELIVERED: { en: "Delivered", ar: "تم التوصيل" },
  COLLECTED: { en: "Collected", ar: "تم الاستلام" },
  BOOKED: { en: "Booked", ar: "محجوز" },
  CHECKED_IN: { en: "Checked in", ar: "تم الوصول" },
  IN_PROGRESS: { en: "In progress", ar: "قيد التنفيذ" },
  DONE: { en: "Done", ar: "منجز" },
  NO_SHOW: { en: "No show", ar: "لم يحضر" },
  RENT: { en: "Rent", ar: "إيجار" },
  PAYROLL: { en: "Payroll", ar: "رواتب" },
  ELECTRICITY: { en: "Electricity", ar: "كهرباء" },
  INTERNET: { en: "Internet", ar: "إنترنت" },
  OTHER: { en: "Other", ar: "أخرى" },
  YES: { en: "Yes", ar: "نعم" },
  NO: { en: "No", ar: "لا" },
  SHOP: { en: "Shop", ar: "زيارة المحل" },
  HOME: { en: "Home visit", ar: "زيارة منزلية" },
  kg: { en: "kg", ar: "كغ" },
  pc: { en: "pc", ar: "قطعة" },
};

/** Column headers, in both languages. */
const HEAD = {
  id: ["Reference", "المرجع"],
  reference: ["Reference", "المرجع"],
  type: ["Type", "النوع"],
  customer: ["Customer", "العميل"],
  status: ["Status", "الحالة"],
  total: ["Total (QAR)", "الإجمالي (ر.ق)"],
  amount: ["Amount (QAR)", "المبلغ (ر.ق)"],
  date: ["Date", "التاريخ"],
  when: ["Date and time", "الموعد"],
  name: ["Name", "الاسم"],
  email: ["Email", "البريد الإلكتروني"],
  phone: ["Phone", "الهاتف"],
  credit: ["Credit approved", "آجل معتمد"],
  balance: ["Balance (QAR)", "الرصيد (ر.ق)"],
  sku: ["SKU", "رمز المنتج"],
  price: ["Price (QAR)", "السعر (ر.ق)"],
  active: ["Active", "نشط"],
  package: ["Package", "الباقة"],
  visit: ["Visit", "نوع الزيارة"],
  supplier: ["Supplier", "المورد"],
  paid: ["Paid (QAR)", "المدفوع (ر.ق)"],
  owed: ["Owed (QAR)", "المتبقي (ر.ق)"],
  ageDays: ["Age (days)", "العمر (أيام)"],
  method: ["Paid from", "الدفع من"],
  paidFrom: ["Paid from", "الدفع من"],
  category: ["Category", "الفئة"],
  note: ["Note", "ملاحظة"],
  location: ["Location", "الموقع"],
  opened: ["Opened", "الفتح"],
  closed: ["Closed", "الإقفال"],
  float: ["Opening float", "الرصيد الافتتاحي"],
  counted: ["Cash counted", "النقد المعدود"],
  card: ["Card total", "إجمالي البطاقة"],
  expected: ["Expected cash", "النقد المتوقع"],
  difference: ["Difference", "الفرق"],
  channel: ["Channel", "القناة"],
  paymentMethod: ["Payment", "طريقة الدفع"],
  line: ["Line", "البند"],
  product: ["Product", "المنتج"],
  unit: ["Unit", "الوحدة"],
  quantity: ["Quantity", "الكمية"],
  unitCost: ["Unit cost (QAR)", "تكلفة الوحدة (ر.ق)"],
  value: ["Value (QAR)", "القيمة (ر.ق)"],
};

const NUMERIC = new Set(["total", "amount", "balance", "price", "paid", "owed", "ageDays", "float", "counted", "card", "expected", "difference", "quantity", "unitCost", "value"]);
/** NFR-03: money columns are shown with two decimals in every format (CSV text, XLSX number format, PDF). */
const MONEY_COLUMNS = new Set(["total", "amount", "balance", "price", "paid", "owed", "float", "counted", "card", "expected", "difference", "unitCost", "value"]);
const moneyText = (value) => (typeof value === "number" ? value.toFixed(2) : value);
const ENUMS = new Set(["type", "status", "method", "paidFrom", "category", "channel", "paymentMethod", "credit", "active", "visit", "unit"]);

function tr(value, lang) {
  if (value == null || value === "") return "";
  const key = String(value);
  return VALUES[key]?.[lang] || key;
}

/** "YYYY-MM-DD HH:mm" in Qatar time. */
function qatarStamp(date, withTime = true) {
  if (!date) return "";
  const local = new Date(new Date(date).getTime() + 3 * 60 * 60 * 1000).toISOString();
  return withTime ? `${local.slice(0, 10)} ${local.slice(11, 16)}` : local.slice(0, 10);
}

function pick(lang, ar, en) {
  return lang === "en" ? en || ar || "" : ar || en || "";
}

const LINES = {
  sales: ["Sales", "المبيعات"],
  refunds: ["Refunds", "المرتجعات"],
  cogs: ["Cost of goods", "تكلفة البضاعة"],
  gross: ["Gross profit", "إجمالي الربح"],
  expenses: ["Expenses", "المصروفات"],
  result: ["Result (net profit)", "النتيجة (صافي الربح)"],
  moneyIn: ["Money in", "الأموال الواردة"],
  cashTaken: ["Cash taken", "النقد المحصّل"],
  cardTaken: ["Card taken", "البطاقات المحصّلة"],
  bankTaken: ["Bank transfers / links", "تحويلات وروابط دفع"],
  fawranTaken: ["Fawran", "فوران"],
  groomingIn: ["Grooming payments", "مدفوعات التجميل"],
  collections: ["Account collections", "تحصيلات الحسابات"],
  relocation: ["Relocation paid", "مدفوعات النقل"],
  moneyOut: ["Money out", "الأموال الصادرة"],
  refundsCash: ["Refunds paid in cash", "مرتجعات نقدية"],
  refundsCard: ["Refunds to card / gateway", "مرتجعات إلى البطاقة / بوابة الدفع"],
  refundsBank: ["Refunds by bank transfer", "مرتجعات بتحويل بنكي"],
  refundsFawran: ["Refunds by Fawran", "مرتجعات عبر فوران"],
  byMethod: ["By method", "حسب طريقة الدفع"],
  methodCash: ["Cash", "نقداً"],
  methodCard: ["Card / gateway", "بطاقة / بوابة الدفع"],
  methodBank: ["Bank", "البنك"],
  methodFawran: ["Fawran", "فوران"],
  supplierCash: ["Supplier payments — cash", "دفعات الموردين — نقداً"],
  supplierBank: ["Supplier payments — bank", "دفعات الموردين — البنك"],
  expensesCash: ["Expenses — cash", "المصروفات — نقداً"],
  expensesBank: ["Expenses — bank", "المصروفات — البنك"],
  net: ["Net money", "صافي الحركة"],
  vanReturns: ["Van returns (in refunds — Van)", "مرتجعات سيارات البيع (ضمن المرتجعات — سيارة البيع)"],
  vanReturnsCost: ["Van returns: cost taken off cost of goods", "مرتجعات سيارات البيع: تكلفة مخصومة من تكلفة البضاعة"],
  stockWrittenOff: ["Damaged stock written off (in cost of goods)", "بضاعة تالفة مشطوبة (ضمن تكلفة البضاعة)"],
  damagedSales: ["Damaged stock sold (in sales — Van)", "بضاعة تالفة مباعة (ضمن المبيعات — سيارة البيع)"],
  vanReturnsCash: ["Van returns paid in cash", "مرتجعات سيارات البيع نقداً"],
  vanReturnsBank: ["Van returns paid by bank transfer", "مرتجعات سيارات البيع بتحويل بنكي"],
};

async function buildList(list, req, lang) {
  const orgId = req.user.organizationId;
  const q = req.query;
  const hasDates = Boolean(q.from || q.to);
  const dates = qatarRange(q, { defaultFrom: hasDates ? undefined : new Date(0) });
  if (!dates) {
    const err = new Error("Invalid dates");
    err.status = 400;
    throw err;
  }
  const range = hasDates ? { gte: dates.from, lt: dates.to } : undefined;
  let subtitle = hasDates ? `${qatarStamp(dates.from, false)} – ${qatarStamp(new Date(dates.to.getTime() - 1), false)}` : "";

  if (list === "orders") {
    const sales = await prisma.sale.findMany({
      where: { branch: { organizationId: orgId }, orderChannel: "WEBSITE", ...(range ? { createdAt: range } : {}) },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      subtitle,
      columns: ["id", "customer", "status", "total", "date"],
      rows: sales.map((sale) => ({
        id: sale.invoiceNumber || sale.id,
        customer: sale.customer?.name || "",
        status: sale.webStatus || "",
        total: money(sale.total),
        date: qatarStamp(sale.createdAt),
      })),
    };
  }
  if (list === "customers") {
    const customers = await prisma.customer.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, take: MAX_ROWS });
    return {
      subtitle,
      columns: ["name", "email", "phone", "credit", "balance"],
      rows: customers.map((customer) => ({
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone || "",
        credit: customer.creditApproved ? "YES" : "NO",
        balance: money(customer.accountBalance),
      })),
    };
  }
  if (list === "products") {
    const products = await prisma.product.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, take: MAX_ROWS });
    return {
      subtitle,
      columns: ["name", "sku", "price", "active"],
      rows: products.map((product) => ({
        name: pick(lang, product.name, product.nameEn),
        sku: product.sku || "",
        price: money(product.price),
        active: product.isActive ? "YES" : "NO",
      })),
    };
  }
  if (list === "bookings") {
    const bookings = await prisma.appointment.findMany({
      where: { organizationId: orgId, ...(range ? { startAt: range } : {}) },
      include: { customer: true, service: true },
      orderBy: { startAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      subtitle,
      columns: ["when", "customer", "package", "visit", "status", "amount"],
      rows: bookings.map((booking) => ({
        when: qatarStamp(booking.startAt),
        customer: booking.customer?.name || booking.petName || "",
        package: pick(lang, booking.service?.name, booking.service?.nameEn),
        visit: booking.visitKind,
        status: booking.status,
        amount: money(booking.amount),
      })),
    };
  }
  if (list === "bills") {
    const open = ["1", "true", "yes"].includes(String(q.open || "").toLowerCase());
    const bills = await prisma.supplierBill.findMany({
      where: {
        organizationId: orgId,
        ...(q.supplierId ? { supplierId: String(q.supplierId) } : {}),
        ...(open ? { status: { in: ["OPEN", "PARTIAL"] } } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    const now = Date.now();
    return {
      subtitle,
      columns: ["supplier", "amount", "paid", "owed", "ageDays", "status", "date"],
      rows: bills.map((bill) => ({
        supplier: bill.supplier?.name || "",
        amount: money(bill.amount),
        paid: money(bill.amountPaid),
        owed: money(d(bill.amount) - d(bill.amountPaid)),
        ageDays: Math.max(0, Math.floor((now - bill.createdAt.getTime()) / 86400000)),
        status: bill.status,
        date: qatarStamp(bill.createdAt, false),
      })),
    };
  }
  if (list === "payments") {
    const payments = await prisma.supplierPayment.findMany({
      where: { bill: { organizationId: orgId }, ...(range ? { paidAt: range } : {}) },
      include: { bill: { include: { supplier: true } } },
      orderBy: { paidAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      subtitle,
      columns: ["supplier", "amount", "method", "date", "note"],
      rows: payments.map((payment) => ({
        supplier: payment.bill?.supplier?.name || "",
        amount: money(payment.amount),
        method: payment.method,
        date: qatarStamp(payment.paidAt),
        note: payment.note || "",
      })),
    };
  }
  if (list === "expenses") {
    const source = ["CASH", "BANK"].includes(String(q.paidFrom || "").toUpperCase()) ? String(q.paidFrom).toUpperCase() : "";
    const expenses = await prisma.expense.findMany({
      where: { organizationId: orgId, ...(range ? { expenseDate: range } : {}), ...(source ? { paidFrom: source } : {}) },
      orderBy: { expenseDate: "desc" },
      take: MAX_ROWS,
    });
    return {
      subtitle,
      columns: ["date", "category", "amount", "paidFrom", "note"],
      rows: expenses.map((expense) => ({
        date: qatarStamp(expense.expenseDate, false),
        category: expense.category,
        amount: money(expense.amount),
        paidFrom: expense.paidFrom,
        note: expense.description || "",
      })),
    };
  }
  if (list === "cashups") {
    const sessions = await prisma.cashSession.findMany({
      where: {
        branch: { organizationId: orgId },
        ...(q.branchId ? { branchId: String(q.branchId) } : {}),
        ...(range ? { openedAt: range } : {}),
      },
      include: { branch: true, sales: { select: { paymentMethod: true, total: true, amountPaid: true, paymentSplits: true } } },
      orderBy: { openedAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      subtitle,
      columns: ["location", "opened", "closed", "float", "counted", "card", "expected", "difference"],
      rows: sessions.map((session) => {
        const card = session.sales.reduce((acc, sale) => {
          if (sale.paymentMethod === "CARD") return acc + d(sale.amountPaid);
          if (sale.paymentMethod === "SPLIT" && Array.isArray(sale.paymentSplits)) {
            return acc + sum(sale.paymentSplits.filter((row) => String(row?.method).toUpperCase() === "CARD"), (row) => row.amount);
          }
          return acc;
        }, 0);
        return {
          location: pick(lang, session.branch?.name, session.branch?.nameEn),
          opened: qatarStamp(session.openedAt),
          closed: qatarStamp(session.closedAt),
          float: money(session.openingFloat),
          counted: session.closingCountedCash != null ? money(session.closingCountedCash) : "",
          card: money(card),
          expected: session.expectedCash != null ? money(session.expectedCash) : "",
          difference: session.cashVariance != null ? money(session.cashVariance) : "",
        };
      }),
    };
  }
  if (list === "profit") {
    const s = await financeSummary(orgId, dates, financeFilters(q));
    subtitle = `${qatarStamp(dates.from, false)} – ${qatarStamp(new Date(dates.to.getTime() - 1), false)}`;
    const L = (key) => LINES[key][lang === "ar" ? 1 : 0];
    const ch = (key) => tr(key, lang);
    const CH = ["IN_STORE", "VAN", "WEBSITE", "GROOMING", "RELOCATION"];
    const mi = s.moneyInDetail;
    const mo = s.moneyOutDetail;
    const rows = [
      { line: L("sales"), amount: s.revenue },
      ...CH.map((key) => ({ line: `  ${L("sales")} — ${ch(key)}`, amount: s.channels[key].revenue })),
      { line: L("refunds"), amount: -s.refunds },
      ...CH.map((key) => ({ line: `  ${L("refunds")} — ${ch(key)}`, amount: -s.channels[key].refunds })),
      { line: `  ${L("vanReturns")}`, amount: -s.vanReturns },
      { line: L("cogs"), amount: -s.cogs },
      { line: `  ${L("vanReturnsCost")}`, amount: s.vanReturnsCost },
      { line: `  ${L("stockWrittenOff")}`, amount: -s.stockWrittenOff },
      { line: L("gross"), amount: s.grossProfit },
      { line: L("expenses"), amount: -s.expenses },
      { line: L("result"), amount: s.netProfit },
      { line: "", amount: "" },
      { line: L("moneyIn"), amount: s.moneyIn },
      { line: `  ${L("cashTaken")}`, amount: mi.cashSales },
      { line: `  ${L("cardTaken")}`, amount: mi.cardSales },
      { line: `  ${L("bankTaken")}`, amount: mi.bankSales },
      { line: `  ${L("fawranTaken")}`, amount: mi.fawranSales },
      { line: `  ${L("groomingIn")}`, amount: mi.grooming },
      { line: `  ${L("relocation")}`, amount: mi.relocation },
      { line: `  ${L("collections")}`, amount: mi.accountCollections },
      { line: `  ${L("damagedSales")}`, amount: mi.damagedSales },
      { line: `  ${L("byMethod")}: ${L("methodCash")}`, amount: mi.cash },
      { line: `  ${L("byMethod")}: ${L("methodCard")}`, amount: mi.card },
      { line: `  ${L("byMethod")}: ${L("methodBank")}`, amount: mi.bank },
      { line: `  ${L("byMethod")}: ${L("methodFawran")}`, amount: mi.fawran },
      { line: L("moneyOut"), amount: s.moneyOut },
      { line: `  ${L("refundsCash")}`, amount: mo.refundsCash },
      { line: `  ${L("refundsCard")}`, amount: mo.refundsCard },
      { line: `  ${L("refundsBank")}`, amount: mo.refundsBank },
      { line: `  ${L("refundsFawran")}`, amount: mo.refundsFawran },
      { line: `  ${L("vanReturnsCash")}`, amount: mo.vanReturnsCash },
      { line: `  ${L("vanReturnsBank")}`, amount: mo.vanReturnsBank },
      { line: `  ${L("supplierCash")}`, amount: mo.supplierPaymentsCash },
      { line: `  ${L("supplierBank")}`, amount: mo.supplierPaymentsBank },
      { line: `  ${L("expensesCash")}`, amount: mo.expensesCash },
      { line: `  ${L("expensesBank")}`, amount: mo.expensesBank },
      { line: `  ${L("byMethod")}: ${L("methodCash")}`, amount: mo.cash },
      { line: `  ${L("byMethod")}: ${L("methodCard")}`, amount: mo.card },
      { line: `  ${L("byMethod")}: ${L("methodBank")}`, amount: mo.bank },
      { line: `  ${L("byMethod")}: ${L("methodFawran")}`, amount: mo.fawran },
      { line: L("net"), amount: s.net },
    ];
    return { subtitle, columns: ["line", "amount"], rows };
  }
  if (list === "transactions") {
    const data = await financeTransactions(orgId, dates, financeFilters(q));
    subtitle = `${qatarStamp(dates.from, false)} – ${qatarStamp(new Date(dates.to.getTime() - 1), false)}`;
    return {
      subtitle,
      columns: ["date", "type", "reference", "channel", "location", "customer", "paymentMethod", "status", "amount"],
      rows: data.rows.slice(0, MAX_ROWS).map((row) => ({
        date: qatarStamp(row.date),
        type: row.type,
        reference: row.reference,
        channel: row.channel,
        location: pick(lang, row.location, row.locationEn),
        customer: row.customer,
        paymentMethod: row.paymentMethod,
        status: row.status,
        amount: row.amount,
      })),
    };
  }
  if (list === "stockvalue") {
    const { branchId } = financeFilters(q);
    const data = await stockValueRows(orgId, branchId);
    const totalLabel = lang === "ar" ? "الإجمالي" : "Total";
    return {
      subtitle: `${lang === "ar" ? "في" : "As of"} ${qatarStamp(new Date())}`,
      columns: ["location", "product", "sku", "unit", "quantity", "unitCost", "value"],
      rows: [
        ...data.rows.map((row) => ({
          location: pick(lang, row.location, row.locationEn),
          product: pick(lang, row.product, row.productEn),
          sku: row.sku,
          unit: row.unit,
          quantity: row.quantity,
          unitCost: row.costMissing ? "" : row.unitCost,
          value: row.value,
        })),
        ...data.byLocation.map((row) => ({ location: pick(lang, row.location, row.locationEn), product: totalLabel, sku: "", unit: "", quantity: "", unitCost: "", value: row.value })),
        { location: totalLabel, product: "", sku: "", unit: "", quantity: "", unitCost: "", value: data.total },
      ],
    };
  }
  return null;
}

router.get("/:list", async (req, res, next) => {
  const mod = LISTS[req.params.list];
  if (!mod) return res.status(404).json({ error: "Unknown list" });
  return requireModule(mod, "export")(req, res, async () => {
    try {
      const lang = String(req.query.lang || "en").toLowerCase() === "ar" ? "ar" : "en";
      const list = req.params.list;
      const built = await buildList(list, req, lang);
      const { columns } = built;
      const headers = columns.map((key) => HEAD[key]?.[lang === "ar" ? 1 : 0] || key);
      // Translated cell values; numbers stay numbers for Excel.
      const cells = built.rows.map((row) => columns.map((key) => (ENUMS.has(key) ? tr(row[key], lang) : row[key] ?? "")));
      const title = TITLES[list][lang];
      const format = String(req.query.format || "csv").toLowerCase();
      const base = `${list}-${lang}`;
      if (format === "xlsx") {
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...cells]);
        // Money cells stay numbers for Excel, shown with two decimals.
        cells.forEach((row, r) => row.forEach((value, c) => {
          if (MONEY_COLUMNS.has(columns[c]) && typeof value === "number") {
            const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })];
            if (cell) cell.z = "0.00";
          }
        }));
        sheet["!cols"] = columns.map((key) => ({ wch: NUMERIC.has(key) ? 14 : 24 }));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
        if (lang === "ar") book.Workbook = { Views: [{ RTL: true }] };
        const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
        return res.send(buffer);
      }
      if (format === "pdf") {
        const buffer = await tablePdf({
          title,
          subtitle: built.subtitle,
          headers,
          rows: cells.map((row) => row.map((value, i) => (NUMERIC.has(columns[i]) && typeof value === "number" ? value.toFixed(columns[i] === "ageDays" || columns[i] === "quantity" ? (Number.isInteger(value) ? 0 : 3) : 2) : value))),
          rtl: lang === "ar",
          numeric: columns.map((key) => NUMERIC.has(key)),
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.pdf"`);
        return res.send(buffer);
      }
      const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const csv = [headers.map(esc).join(","), ...cells.map((row) => row.map((value, i) => esc(MONEY_COLUMNS.has(columns[i]) ? moneyText(value) : value)).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`);
      res.send(`﻿${csv}`);
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message, errorAr: "تاريخ غير صالح", errorEn: error.message });
      next(error);
    }
  });
});

export default router;
