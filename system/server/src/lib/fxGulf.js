import { COUNTRY_PACKS } from "./countries.js";

/**
 * Display FX vs SAR (billing source of truth).
 * Approximate mid rates for plan display only — Stripe still charges SAR.
 */
export const LOCAL_PER_SAR = {
  SAR: 1,
  QAR: 1,
  AED: 0.98,
  KWD: 0.082,
  BHD: 0.1,
  OMR: 0.103,
  DZD: 35.5,
  MAD: 2.65,
  TND: 0.83,
  LYD: 1.28,
  EGP: 13.2,
  JOD: 0.19,
  LBP: 23800,
  IQD: 350,
  ILS: 0.98,
  YER: 67,
  SDG: 160,
  NGN: 430,
  KES: 34,
  ZAR: 4.8,
  EUR: 0.25,
  GBP: 0.21,
  USD: 0.27,
  CAD: 0.37,
  TRY: 9.1,
  INR: 22.5,
  PKR: 74,
  IDR: 4300,
  MYR: 1.2,
  SGD: 0.36,
  AUD: 0.41,
};

const COUNTRY_CURRENCY = Object.fromEntries(
  COUNTRY_PACKS.map((c) => [c.code, c.currency]),
);

export function normalizeCurrency(code) {
  const c = String(code || "QAR").trim().toUpperCase();
  return LOCAL_PER_SAR[c] != null ? c : "QAR";
}

export function currencyFromCountry(countryCode) {
  const mapped = COUNTRY_CURRENCY[String(countryCode || "QA").toUpperCase()];
  return normalizeCurrency(mapped || "QAR");
}

/** Convert SAR plan amount → local major units for display. */
export function sarToLocal(amountSar, currency) {
  const code = normalizeCurrency(currency);
  const rate = LOCAL_PER_SAR[code] ?? 1;
  const n = Number(amountSar) || 0;
  const decimals = code === "KWD" || code === "BHD" || code === "OMR" || code === "JOD" ? 3 : 2;
  const local = n * rate;
  return Number(local.toFixed(decimals));
}

export function formatLocalAmount(amountSar, currency, locale = "ar") {
  const code = normalizeCurrency(currency);
  const local = sarToLocal(amountSar, code);
  const labels = {
    SAR: { ar: "ر.س", en: "SAR" },
    QAR: { ar: "ر.ق", en: "QAR" },
    AED: { ar: "د.إ", en: "AED" },
    KWD: { ar: "د.ك", en: "KWD" },
    BHD: { ar: "د.ب", en: "BHD" },
    OMR: { ar: "ر.ع", en: "OMR" },
    DZD: { ar: "د.ج", en: "DZD" },
    MAD: { ar: "د.م", en: "MAD" },
    TND: { ar: "د.ت", en: "TND" },
    LYD: { ar: "د.ل", en: "LYD" },
    EGP: { ar: "ج.م", en: "EGP" },
    EUR: { ar: "€", en: "EUR" },
    GBP: { ar: "£", en: "GBP" },
    USD: { ar: "$", en: "USD" },
  };
  const label = labels[code]?.[locale === "en" ? "en" : "ar"] || code;
  const decimals = code === "KWD" || code === "BHD" || code === "OMR" || code === "JOD" ? 3 : 2;
  return { amount: local, code, label, formatted: `${local.toFixed(decimals)} ${label}` };
}

export function planDisplayPayload(plan, countryOrCurrency) {
  const currency =
    String(countryOrCurrency || "").length === 2
      ? currencyFromCountry(countryOrCurrency)
      : normalizeCurrency(countryOrCurrency);
  const amountSar = Number(plan.amount) || 0;
  const local = formatLocalAmount(amountSar, currency, "en");
  return {
    id: plan.id,
    amountSar,
    amountLocal: local.amount,
    currencyLocal: local.code,
    currencyCharge: "SAR",
    interval: plan.interval,
    intervalCount: plan.intervalCount,
    labelEn: plan.labelEn,
    labelAr: plan.labelAr,
  };
}
