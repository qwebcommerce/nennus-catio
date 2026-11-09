import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { currencyLabel, normalizeCurrency } from "./fxGulf.js";

/**
 * Tenant display currency from org tax pack / country.
 * Falls back to SAR when unset (legacy sessions).
 */
export function useOrgCurrency() {
  const { user } = useAuth();
  const { locale } = useI18n();

  return useMemo(() => {
    const code = normalizeCurrency(user?.tax?.currency || "SAR");
    const label =
      (locale === "en" ? user?.tax?.currencyLabelEn : user?.tax?.currencyLabelAr) ||
      currencyLabel(code, locale);
    const decimals = code === "KWD" || code === "BHD" || code === "OMR" ? 3 : 2;

    const format = (amount) => {
      const n = Number(amount);
      const v = Number.isFinite(n) ? n : 0;
      return `${v.toFixed(decimals)} ${label}`;
    };

    return { code, label, decimals, format };
  }, [user?.tax, locale]);
}
