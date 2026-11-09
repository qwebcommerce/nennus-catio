import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { isUnitPriceAtOrBelowCost } from "../utils/saleCostWarning.js";
import { ProductImagePreview } from "./ProductImagePreview.jsx";

/**
 * سلة مشتريات — عرض الأسطر مع تعديل الكمية وحذف
 * @param {boolean} [embedded] إذا true: بدون إطار card مزدوج وبدون عنوان (للاستخدام داخل POS)
 */
export function Cart({ lines, onChangeQty, onRemove, total, embedded = false }) {
  const { t, locale } = useI18n();
  if (!lines.length) {
    if (embedded) {
      return (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: "1rem 0.5rem", fontSize: 14 }}>
          {t("cart.empty")}
        </div>
      );
    }
    return (
      <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
        {t("cart.empty")}
      </div>
    );
  }

  const list = (
    <>
      {lines.map((line) => (
        <div
          key={line.productId}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto auto",
            gap: 8,
            alignItems: "center",
            padding: "8px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <ProductImagePreview url={line.imageUrl} alt="" width={44} height={44} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {productDisplayName({ name: line.name, nameEn: line.nameEn }, locale)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {line.unitPrice.toFixed(2)} × {line.quantity} = {(line.unitPrice * line.quantity).toFixed(2)}
            </div>
            {isUnitPriceAtOrBelowCost(line.unitPrice, line.cost) ? (
              <div
                role="status"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--warning)",
                  marginTop: 4,
                  lineHeight: 1.35,
                }}
              >
                {t("pos.belowCostLine")}
              </div>
            ) : null}
          </div>
          <input
            type="number"
            min={1}
            max={line.maxStock}
            value={line.quantity}
            onChange={(e) => onChangeQty(line.productId, e.target.value)}
            style={{
              width: 72,
              padding: 8,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <button
            type="button"
            className="btn-touch"
            onClick={() => onRemove(line.productId)}
            style={{ background: "var(--danger)", color: "#fff", minWidth: 44 }}
          >
            {t("common.delete")}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 8 }}>
        <span>{t("common.total")}</span>
        <span>
          {total.toFixed(2)} {t("common.currency")}
        </span>
      </div>
    </>
  );

  if (embedded) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{list}</div>;
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{t("cart.title")}</div>
      {list}
    </div>
  );
}
