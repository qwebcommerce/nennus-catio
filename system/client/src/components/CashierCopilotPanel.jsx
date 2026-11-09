import React from "react";
import { productDisplayName } from "../utils/productName.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";

/**
 * Compact cashier-assist strip: barcode suggestions + upsell tips + risk banner.
 */
export function CashierCopilotPanel({
  barcodeMiss,
  barcodeSuggestions = [],
  onPickSuggestion,
  upsellTips = [],
  onAddUpsell,
  risk = null,
  discountReason,
  onDiscountReasonChange,
}) {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();

  const hasBarcode = barcodeMiss && barcodeSuggestions.length > 0;
  const hasUpsell = upsellTips.length > 0;
  const hasRisk = risk && (risk.level || risk.requireReason || risk.alerts?.length);

  if (!hasBarcode && !hasUpsell && !hasRisk) return null;

  return (
    <div className="cashier-copilot" aria-label={t("copilot.title")}>
      <div className="cashier-copilot__head">
        <strong>{t("copilot.title")}</strong>
        <span className="cashier-copilot__hint">{t("copilot.hint")}</span>
      </div>

      {hasBarcode ? (
        <div className="cashier-copilot__block">
          <div className="cashier-copilot__label">
            {t("copilot.barcodeMiss", { code: barcodeMiss })}
          </div>
          <div className="cashier-copilot__chips">
            {barcodeSuggestions.map((p) => (
              <button
                key={p.id || p.productId}
                type="button"
                className="cashier-copilot__chip"
                onClick={() => onPickSuggestion?.(p)}
              >
                {productDisplayName(p, locale)}
                {p.price != null ? (
                  <span className="cashier-copilot__chip-meta">{cur(Number(p.price))}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasUpsell ? (
        <div className="cashier-copilot__block">
          <div className="cashier-copilot__label">{t("copilot.upsellTitle")}</div>
          <div className="cashier-copilot__chips">
            {upsellTips.map((tip) => (
              <button
                key={tip.productId}
                type="button"
                className="cashier-copilot__chip cashier-copilot__chip--upsell"
                onClick={() => onAddUpsell?.(tip)}
                title={tip.reason}
              >
                + {productDisplayName(tip, locale)}
                <span className="cashier-copilot__chip-meta">
                  {t("copilot.with", { name: tip.anchorName || "" })}
                  {tip.price != null ? ` · ${cur(Number(tip.price))}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasRisk ? (
        <div
          className={`cashier-copilot__risk cashier-copilot__risk--${String(
            risk.level || (risk.requireReason ? "BLOCK" : "WARN"),
          ).toLowerCase()}`}
        >
          <div>
            {risk.requireReason
              ? t("copilot.discountReasonNeeded", { pct: String(risk.pct ?? "") })
              : risk.level === "CRITICAL"
                ? t("copilot.discountCritical", { pct: String(risk.pct ?? "") })
                : t("copilot.discountWarn", { pct: String(risk.pct ?? "") })}
          </div>
          {risk.requireReason || (risk.pct != null && risk.pct >= 20) ? (
            <label className="cashier-copilot__reason">
              <span>{t("copilot.discountReason")}</span>
              <input
                value={discountReason || ""}
                onChange={(e) => onDiscountReasonChange?.(e.target.value)}
                placeholder={t("copilot.discountReasonPh")}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
