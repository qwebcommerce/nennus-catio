"use client";
import { useLocale } from "next-intl";
import type { Locale, LocalisedText } from "@nennus-catio/contracts";
import { formatDiscount, formatMoney } from "./format";
export function useCopy() {
  const locale = useLocale() as Locale;
  return {
    locale,
    ar: locale === "ar",
    text: (en: string, ar: string) => (locale === "ar" ? ar : en),
    local: (value: LocalisedText) => value[locale],
    money: (amount: number) => formatMoney(amount, locale),
    /** An amount taken off, "− QAR 6.35" (11e). */
    discount: (amount: number) => formatDiscount(amount, locale),
  };
}
