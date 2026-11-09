import { productDisplayName } from "./productName.js";

const PAY_AR = {
  CASH: "نقدي",
  CARD: "بطاقة",
  ONLINE: "أونلاين",
  SPLIT: "تقسيم",
  ON_ACCOUNT: "على الحساب",
  ON_DELIVERY: "عند الاستلام",
};
const PAY_EN = {
  CASH: "Cash",
  CARD: "Card",
  ONLINE: "Online",
  SPLIT: "Split",
  ON_ACCOUNT: "On account",
  ON_DELIVERY: "On delivery",
};

function payLabel(method, locale) {
  const m = String(method || "").toUpperCase();
  return locale === "en" ? PAY_EN[m] || m : PAY_AR[m] || m;
}

/**
 * نص فاتورة بسيط للطابعة النصية أو الحافظة
 */
export function buildReceiptPlainText(sale, branchName, locale, taxInfo) {
  if (!sale) return "";
  const loc = locale === "en" ? "en-US" : "ar-SA";
  const cur =
    (locale === "en" ? taxInfo?.currencyLabelEn || taxInfo?.currency : taxInfo?.currencyLabelAr) ||
    (locale === "en" ? "SAR" : "ر.س");
  const lines = [];
  lines.push(locale === "en" ? "SALES INVOICE" : "فاتورة بيع");
  lines.push("---");
  const storeLine = branchName || sale.branch?.name || "";
  if (storeLine) lines.push(storeLine);
  if (taxInfo?.vatNumber) {
    lines.push(`${locale === "en" ? "VAT #" : "الرقم الضريبي"}: ${taxInfo.vatNumber}`);
  }
  lines.push(`${locale === "en" ? "Date" : "التاريخ"}: ${new Date(sale.createdAt).toLocaleString(loc)}`);
  lines.push(`${locale === "en" ? "Invoice #" : "رقم الفاتورة"}: ${sale.invoiceNumber || sale.id}`);
  const sellerName =
    locale === "en" && sale.user?.nameEn?.trim()
      ? sale.user.nameEn.trim()
      : sale.user?.name || "—";
  const sellerLabel =
    sale.user?.role === "ASSOCIATE"
      ? locale === "en"
        ? "Floor associate"
        : "بائع الأرضية"
      : locale === "en"
        ? "Cashier"
        : "الكاشير";
  lines.push(`${sellerLabel}: ${sellerName}${sale.user?.email ? ` (${sale.user.email})` : ""}`);
  if (sale.channel === "WHOLESALE") {
    lines.push(locale === "en" ? "Channel: Wholesale" : "القناة: بيع بالجملة");
  }
  if (sale.paymentMethod === "SPLIT" && Array.isArray(sale.paymentSplits)) {
    lines.push(`${locale === "en" ? "Payment" : "الدفع"}:`);
    for (const row of sale.paymentSplits) {
      lines.push(
        `  ${payLabel(row.method, locale)}: ${Number(row.amount).toFixed(2)} ${cur}`
      );
    }
  } else {
    lines.push(
      `${locale === "en" ? "Payment" : "الدفع"}: ${payLabel(sale.paymentMethod, locale)}`
    );
  }
  if (sale.customer) {
    lines.push(
      `${locale === "en" ? "Customer" : "العميل"}: ${sale.customer.name}${sale.customer.phone ? ` — ${sale.customer.phone}` : ""}`
    );
  }
  if (sale.tableNumber) {
    lines.push(`${locale === "en" ? "Table" : "الطاولة"}: ${sale.tableNumber}`);
  }
  if (sale.orderNote) {
    lines.push(`${locale === "en" ? "Note" : "ملاحظة"}: ${sale.orderNote}`);
  }
  lines.push("---");
  for (const it of sale.items || []) {
    const nm = productDisplayName(it.product, locale);
    const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
    const modTxt = mods.length
      ? ` (${mods
          .map((m) => (locale === "en" ? m.label || m.key : m.labelAr || m.label || m.key))
          .join(", ")})`
      : "";
    lines.push(`${nm}${modTxt} ×${it.quantity} = ${Number(it.subtotal).toFixed(2)} ${cur}`);
  }
  lines.push("---");
  const sub = sale.items?.reduce((s, it) => s + Number(it.subtotal), 0) ?? Number(sale.total);
  lines.push(`${locale === "en" ? "Subtotal" : "المجموع"}: ${sub.toFixed(2)} ${cur}`);
  const disc = Number(sale.discountAmount ?? 0);
  if (disc > 0) lines.push(`${locale === "en" ? "Discount" : "الخصم"}: -${disc.toFixed(2)} ${cur}`);
  const tax = Number(sale.taxAmount ?? 0);
  const taxPct = sale.taxPercent != null ? Number(sale.taxPercent) : null;
  if (tax > 0) {
    const pctTxt = taxPct != null && !Number.isNaN(taxPct) ? ` (${taxPct}%)` : "";
    lines.push(`${locale === "en" ? "Tax" : "الضريبة"}${pctTxt}: ${tax.toFixed(2)} ${cur}`);
  }
  lines.push(`${locale === "en" ? "TOTAL" : "الإجمالي"}: ${Number(sale.total).toFixed(2)} ${cur}`);
  const dueLine = Number(sale.amountDue ?? 0);
  if (dueLine > 0.001) {
    lines.push(
      `${locale === "en" ? "Paid" : "المدفوع"}: ${Number(sale.amountPaid ?? sale.total).toFixed(2)} ${cur}`
    );
    lines.push(
      `${locale === "en" ? "On account" : "متبقٍ على الحساب"}: ${dueLine.toFixed(2)} ${cur}`
    );
  }
  return lines.join("\n");
}
