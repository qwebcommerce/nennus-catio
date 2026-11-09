import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

const PAY_KEYS = {
  CASH: "payment.cash",
  CARD: "payment.card",
  ONLINE: "payment.online",
  SPLIT: "payment.split",
  ON_ACCOUNT: "payment.onAccount",
  ON_DELIVERY: "payment.onDelivery",
};

/**
 * Simple receipt for receivable collections (non-sale payments).
 */
export function PaymentReceiptPrint({ txn }) {
  const { t, locale } = useI18n();
  if (!txn) return null;
  const loc = locale === "en" ? "en-US" : "ar-SA";

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 22 }}>{t("accounts.collectionReceipt")}</h2>
      <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700 }}>
          {txn.branch ? branchDisplayName(txn.branch, locale) : "—"}
        </div>
        <div>
          {t("invoice.date")} {new Date(txn.createdAt).toLocaleString(loc)}
        </div>
        <div>
          {t("invoice.payment")} {t(PAY_KEYS[txn.paymentMethod] || "payment.cash")}
        </div>
        {txn.customer?.name ? (
          <div>
            {t("invoice.customer")} {txn.customer.name}
          </div>
        ) : null}
        {txn.user?.name ? (
          <div>
            {t("invoice.cashier")} {txn.user.name}
          </div>
        ) : null}
        {txn.invoiceNumber ? (
          <div>
            {t("receivable.colSale")} {txn.invoiceNumber}
          </div>
        ) : null}
        {txn.note ? (
          <div>
            {t("receivable.note")}: {txn.note}
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 18 }}>
        {t("invoice.total")} {Number(txn.amount ?? 0).toFixed(2)} {t("common.currency")}
      </div>
    </div>
  );
}
