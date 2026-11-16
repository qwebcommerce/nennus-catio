import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";

const PAY_KEYS = {
  CASH: "payment.cash",
  CARD: "payment.card",
  ONLINE: "payment.online",
  FAWRAN: "payment.fawran",
  PAYMENT_LINK: "payment.link",
  SPLIT: "payment.split",
  ON_ACCOUNT: "payment.onAccount",
  ON_DELIVERY: "payment.onDelivery",
};

/**
 * محتوى قابل للطباعة — يُعرض في نافذة الطباعة (window.print)
 */
export function InvoicePrint({ sale, branchName }) {
  const { t, locale } = useI18n();
  if (!sale) return null;
  const loc = locale === "en" ? "en-US" : "ar-SA";
  const splits =
    sale.paymentMethod === "SPLIT" && Array.isArray(sale.paymentSplits)
      ? sale.paymentSplits
      : null;
  const linesSubtotal =
    sale.items?.reduce((s, it) => s + Number(it.subtotal), 0) ?? Number(sale.total);
  const disc = Number(sale.discountAmount ?? 0);
  const cur = t("common.currency");

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 22 }}>{t("invoice.title")}</h2>
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 700 }}>
          {branchName || sale.branch?.name || "—"}
        </div>
        <div>
          {t("invoice.date")} {new Date(sale.createdAt).toLocaleString(loc)}
        </div>
        <div>
          {t("invoice.id")} {sale.invoiceNumber || sale.id}
        </div>
        <div>
          {t("invoice.cashier")}{" "}
          {locale === "en" && sale.user?.nameEn?.trim()
            ? sale.user.nameEn.trim()
            : sale.user?.name || "—"}
          {sale.user?.email ? ` (${sale.user.email})` : ""}
        </div>
        {sale.deliveryAddress ? (
          <div>
            {t("invoice.deliveryAddress")}: {sale.deliveryAddress}
          </div>
        ) : null}
        {splits ? (
          <div>
            <div>{t("invoice.payment")}</div>
            <ul style={{ margin: "4px 0 0", paddingInlineStart: 18, fontSize: 13 }}>
              {splits.map((row, idx) => (
                <li key={idx}>
                  {t(PAY_KEYS[row.method] || "payment.cash")}: {Number(row.amount).toFixed(2)} {t("common.currency")}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            {t("invoice.payment")} {t(PAY_KEYS[sale.paymentMethod] || "payment.cash")}
            {sale.paymentReference ? ` · ${sale.paymentReference}` : ""}
          </div>
        )}
        {sale.customer ? (
          <div>
            {t("invoice.customer")}{" "}
            {sale.customer.name}
            {sale.customer.phone ? ` — ${sale.customer.phone}` : ""}
          </div>
        ) : null}
        {sale.orderNote ? (
          <div>
            {t("invoice.orderNote")}: {sale.orderNote}
          </div>
        ) : null}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <th style={{ textAlign: "start", padding: 8 }}>{t("invoice.colProduct")}</th>
            <th style={{ padding: 8 }}>{t("invoice.colQty")}</th>
            <th style={{ textAlign: "end", padding: 8 }}>{t("invoice.colSubtotal")}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((it) => (
            <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{productDisplayName(it.product, locale)}</td>
              <td style={{ padding: 8, textAlign: "center" }}>{it.quantity}</td>
              <td style={{ padding: 8 }}>{Number(it.subtotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 14 }}>
        <div>
          {t("invoice.subtotal")} {linesSubtotal.toFixed(2)} {cur}
        </div>
        {disc > 0 ? (
          <div>
            {t("invoice.discount")} −{disc.toFixed(2)} {cur}
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 16 }}>
        {t("invoice.total")} {Number(sale.total).toFixed(2)} {cur}
      </div>
      {Number(sale.amountDue ?? 0) > 0.001 ? (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div>
            {t("invoice.amountPaid")}: {Number(sale.amountPaid ?? sale.total).toFixed(2)} {cur}
          </div>
          <div style={{ fontWeight: 700 }}>
            {t("invoice.amountDueLine")}: {Number(sale.amountDue).toFixed(2)} {cur}
          </div>
        </div>
      ) : null}
    </div>
  );
}
