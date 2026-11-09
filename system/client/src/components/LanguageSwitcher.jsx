import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/**
 * AR | EN language switcher for Gulf markets.
 * @param {'segmented' | 'compact'} [variant]
 */
export function LanguageSwitcher({ variant = "segmented", className = "" }) {
  const { locale, setLocale, t } = useI18n();

  if (variant === "compact") {
    const next = locale === "ar" ? "en" : "ar";
    return (
      <button
        type="button"
        className={`lang-switcher lang-switcher--compact ${className}`.trim()}
        onClick={() => setLocale(next)}
        title={t("lang.switchTo", { lang: next === "ar" ? t("lang.ar") : t("lang.en") })}
        aria-label={t("lang.switchTo", { lang: next === "ar" ? t("lang.ar") : t("lang.en") })}
      >
        {locale === "ar" ? "EN" : "ع"}
      </button>
    );
  }

  return (
    <div
      className={`lang-switcher lang-switcher--segmented ${className}`.trim()}
      role="group"
      aria-label={t("lang.switch")}
    >
      <button
        type="button"
        className={`lang-switcher__opt${locale === "ar" ? " is-active" : ""}`}
        aria-pressed={locale === "ar"}
        onClick={() => setLocale("ar")}
      >
        {t("lang.arShort")}
      </button>
      <button
        type="button"
        className={`lang-switcher__opt${locale === "en" ? " is-active" : ""}`}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        {t("lang.enShort")}
      </button>
    </div>
  );
}
