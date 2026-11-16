import { useMemo } from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/**
 * Display currency for the business (Qatari riyal).
 */
export function useOrgCurrency() {
  const { locale } = useI18n();

  return useMemo(() => {
    const code = "QAR";
    const label = locale === "en" ? "QAR" : "ر.ق";
    const decimals = 2;

    const format = (amount) => {
      const n = Number(amount);
      const v = Number.isFinite(n) ? n : 0;
      return `${v.toFixed(decimals)} ${label}`;
    };

    return { code, label, decimals, format };
  }, [locale]);
}
