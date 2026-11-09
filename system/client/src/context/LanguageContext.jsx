import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";
import { getMessage } from "../i18n/translations.js";

const STORAGE_KEY = "petstore-lang";

const TITLES = {
  ar: "Nennus Catio",
  en: "Nennus Catio",
};

function readLocale() {
  if (typeof window === "undefined") return "ar";
  const s = localStorage.getItem(STORAGE_KEY);
  if (s === "ar" || s === "en") return s;
  return navigator.language && navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(readLocale);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = locale === "en" ? "en" : "ar";
    root.dir = locale === "en" ? "ltr" : "rtl";
    localStorage.setItem(STORAGE_KEY, locale);
    document.title = TITLES[locale] || TITLES.ar;
  }, [locale]);

  const setLocale = useCallback((l) => {
    if (l === "ar" || l === "en") setLocaleState(l);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === "ar" ? "en" : "ar"));
  }, []);

  const t = useCallback((key, vars) => getMessage(locale, key, vars || {}), [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
      isRTL: locale === "ar",
    }),
    [locale, setLocale, t, toggleLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}
