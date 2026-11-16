import React from "react";
import { useI18n } from "../../context/LanguageContext.jsx";

function lineTotal(line) {
  if (line.sellBy === "WEIGHT") return (Number(line.price) * Number(line.quantity)) / 1000;
  return Number(line.price) * Number(line.quantity);
}

/**
 * Editable cart lines (FR-33): change the quantity (pieces) or weight (kg), or remove a line.
 * Stock is checked again by the server at checkout.
 */
export function CartLines({ cart, onChange }) {
  const { t, locale } = useI18n();
  const update = (index, quantity) => {
    const rows = cart.map((line, i) => (i === index ? { ...line, quantity } : line));
    onChange(rows);
  };
  const remove = (index) => onChange(cart.filter((_, i) => i !== index));
  return (
    <div className="site-cart-lines">
      {cart.map((line, index) => {
        const weight = line.sellBy === "WEIGHT";
        const name = `${locale === "en" ? line.nameEn || line.name : line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ""}`;
        return (
          <div className="site-flow__line site-cart-line" key={`${line.productId}-${line.variantId}-${index}`}>
            <span className="site-cart-line__name">{name}</span>
            <span className="site-cart-line__qty">
              {weight ? (
                <label>
                  <span className="sr-only">{t("fd.cart.weightKg")}</span>
                  <input
                    type="number"
                    min="0.05"
                    step="0.05"
                    inputMode="decimal"
                    value={Number(line.quantity) / 1000}
                    aria-label={`${t("fd.cart.weightKg")} — ${name}`}
                    onChange={(e) => {
                      const grams = Math.round(Number(e.target.value) * 1000);
                      if (Number.isFinite(grams) && grams >= 1) update(index, grams);
                    }}
                  />
                  <span> {t("fd.cart.kg")}</span>
                </label>
              ) : (
                <>
                  <button type="button" aria-label={`${t("fd.cart.less")} — ${name}`} disabled={Number(line.quantity) <= 1} onClick={() => update(index, Math.max(1, Number(line.quantity) - 1))}>−</button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={line.quantity}
                    aria-label={`${t("fd.cart.quantity")} — ${name}`}
                    onChange={(e) => {
                      const qty = Math.floor(Number(e.target.value));
                      if (Number.isFinite(qty) && qty >= 1) update(index, qty);
                    }}
                  />
                  <button type="button" aria-label={`${t("fd.cart.more")} — ${name}`} onClick={() => update(index, Number(line.quantity) + 1)}>+</button>
                </>
              )}
              <button type="button" className="site-cart-line__remove" onClick={() => remove(index)}>{t("fd.cart.remove")}</button>
            </span>
            <strong>{lineTotal(line).toFixed(2)} QAR</strong>
          </div>
        );
      })}
    </div>
  );
}
