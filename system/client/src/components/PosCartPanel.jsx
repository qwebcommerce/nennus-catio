import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { isUnitPriceAtOrBelowCost } from "../utils/saleCostWarning.js";
import { ProductImagePreview } from "./ProductImagePreview.jsx";

function modifierLabel(m, locale) {
  if (locale === "en") return m.label || m.key;
  return m.labelAr || m.label || m.key;
}

/**
 * Premium cart list for POS left panel — qty steppers, line totals, empty state.
 */
export function PosCartPanel({ lines, onChangeQty, onRemove, total }) {
  const { t, locale } = useI18n();

  if (!lines.length) {
    return (
      <div className="pos-cart-panel pos-cart-panel--empty">
        <div className="pos-cart-panel__empty-icon" aria-hidden>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="20" r="1.2" fill="currentColor" />
            <circle cx="18" cy="20" r="1.2" fill="currentColor" />
          </svg>
        </div>
        <h2 className="pos-cart-panel__empty-title">{t("cart.emptyTitle")}</h2>
        <p className="pos-cart-panel__empty-hint">{t("cart.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="pos-cart-panel">
      <div className="pos-cart-panel__header">
        <div>
          <h2 className="pos-cart-panel__title">{t("cart.title")}</h2>
          <p className="pos-cart-panel__meta">
            {t("cart.itemCount", { n: lines.length })}
          </p>
        </div>
        <div className="pos-cart-panel__total-chip">
          <span className="pos-cart-panel__total-label">{t("common.total")}</span>
          <strong>
            {Number(total).toFixed(2)} {t("common.currency")}
          </strong>
        </div>
      </div>

      <ul className="pos-cart-panel__list">
        {lines.map((line) => {
          const key = line.lineKey || line.productId;
          const lineTotal = line.unitPrice * line.quantity;
          const belowCost = isUnitPriceAtOrBelowCost(line.unitPrice, line.cost);
          const mods = Array.isArray(line.modifiers) ? line.modifiers : [];
          return (
            <li key={key} className="pos-cart-line">
              <div className="pos-cart-line__media">
                <ProductImagePreview url={line.imageUrl} alt="" width={72} height={72} />
              </div>
              <div className="pos-cart-line__body">
                <div className="pos-cart-line__top">
                  <div className="pos-cart-line__name">
                    {productDisplayName({ name: line.name, nameEn: line.nameEn }, locale)}
                  </div>
                  <button
                    type="button"
                    className="pos-cart-line__remove"
                    onClick={() => onRemove(key)}
                    aria-label={t("common.delete")}
                  >
                    ×
                  </button>
                </div>
                {mods.length ? (
                  <div className="pos-cart-line__mods" style={{ fontSize: 12, color: "var(--muted)" }}>
                    {mods.map((m) => modifierLabel(m, locale)).join(" · ")}
                  </div>
                ) : null}
                <div className="pos-cart-line__price">
                  {line.unitPrice.toFixed(2)} {t("common.currency")}
                  <span className="pos-cart-line__each"> / {t("cart.each")}</span>
                </div>
                {belowCost ? (
                  <div className="pos-cart-line__warn" role="status">
                    {t("pos.belowCostLine")}
                  </div>
                ) : null}
                <div className="pos-cart-line__footer">
                  <div className="pos-qty">
                    <button
                      type="button"
                      className="pos-qty__btn"
                      disabled={line.quantity <= 1}
                      onClick={() => onChangeQty(key, line.quantity - 1)}
                      aria-label="−"
                    >
                      −
                    </button>
                    <input
                      className="pos-qty__input"
                      type="number"
                      min={1}
                      max={line.maxStock}
                      value={line.quantity}
                      onChange={(e) => onChangeQty(key, Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="pos-qty__btn"
                      disabled={line.quantity >= (line.maxStock ?? Infinity)}
                      onClick={() => onChangeQty(key, line.quantity + 1)}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                  <div className="pos-cart-line__line-total">
                    {lineTotal.toFixed(2)} {t("common.currency")}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
