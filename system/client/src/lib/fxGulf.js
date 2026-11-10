/**
 * Client mirror of supported countries / display FX vs SAR.
 * Keep in sync with server/src/lib/countries.js + fxGulf.js.
 */
export const COUNTRY_PACKS = [
  { code: "DZ", currency: "DZD", standardRate: 19, labelEn: "Algeria", labelAr: "الجزائر" },
  { code: "MA", currency: "MAD", standardRate: 20, labelEn: "Morocco", labelAr: "المغرب" },
  { code: "TN", currency: "TND", standardRate: 19, labelEn: "Tunisia", labelAr: "تونس" },
  { code: "LY", currency: "LYD", standardRate: 0, labelEn: "Libya", labelAr: "ليبيا" },
  { code: "EG", currency: "EGP", standardRate: 14, labelEn: "Egypt", labelAr: "مصر" },
  { code: "SA", currency: "SAR", standardRate: 15, labelEn: "Saudi Arabia", labelAr: "السعودية" },
  { code: "AE", currency: "AED", standardRate: 5, labelEn: "United Arab Emirates", labelAr: "الإمارات" },
  { code: "QA", currency: "QAR", standardRate: 0, labelEn: "Qatar", labelAr: "قطر" },
  { code: "KW", currency: "KWD", standardRate: 0, labelEn: "Kuwait", labelAr: "الكويت" },
  { code: "BH", currency: "BHD", standardRate: 10, labelEn: "Bahrain", labelAr: "البحرين" },
  { code: "OM", currency: "OMR", standardRate: 5, labelEn: "Oman", labelAr: "عُمان" },
  { code: "JO", currency: "JOD", standardRate: 16, labelEn: "Jordan", labelAr: "الأردن" },
  { code: "LB", currency: "LBP", standardRate: 11, labelEn: "Lebanon", labelAr: "لبنان" },
  { code: "IQ", currency: "IQD", standardRate: 0, labelEn: "Iraq", labelAr: "العراق" },
  { code: "PS", currency: "ILS", standardRate: 16, labelEn: "Palestine", labelAr: "فلسطين" },
  { code: "YE", currency: "YER", standardRate: 0, labelEn: "Yemen", labelAr: "اليمن" },
  { code: "SD", currency: "SDG", standardRate: 0, labelEn: "Sudan", labelAr: "السودان" },
  { code: "NG", currency: "NGN", standardRate: 7.5, labelEn: "Nigeria", labelAr: "نيجيريا" },
  { code: "KE", currency: "KES", standardRate: 16, labelEn: "Kenya", labelAr: "كينيا" },
  { code: "ZA", currency: "ZAR", standardRate: 15, labelEn: "South Africa", labelAr: "جنوب أفريقيا" },
  { code: "FR", currency: "EUR", standardRate: 20, labelEn: "France", labelAr: "فرنسا" },
  { code: "DE", currency: "EUR", standardRate: 19, labelEn: "Germany", labelAr: "ألمانيا" },
  { code: "GB", currency: "GBP", standardRate: 20, labelEn: "United Kingdom", labelAr: "المملكة المتحدة" },
  { code: "ES", currency: "EUR", standardRate: 21, labelEn: "Spain", labelAr: "إسبانيا" },
  { code: "IT", currency: "EUR", standardRate: 22, labelEn: "Italy", labelAr: "إيطاليا" },
  { code: "TR", currency: "TRY", standardRate: 20, labelEn: "Turkey", labelAr: "تركيا" },
  { code: "US", currency: "USD", standardRate: 0, labelEn: "United States", labelAr: "الولايات المتحدة" },
  { code: "CA", currency: "CAD", standardRate: 5, labelEn: "Canada", labelAr: "كندا" },
  { code: "IN", currency: "INR", standardRate: 18, labelEn: "India", labelAr: "الهند" },
  { code: "PK", currency: "PKR", standardRate: 18, labelEn: "Pakistan", labelAr: "باكستان" },
  { code: "ID", currency: "IDR", standardRate: 11, labelEn: "Indonesia", labelAr: "إندونيسيا" },
  { code: "MY", currency: "MYR", standardRate: 8, labelEn: "Malaysia", labelAr: "ماليزيا" },
  { code: "SG", currency: "SGD", standardRate: 9, labelEn: "Singapore", labelAr: "سنغافورة" },
  { code: "AU", currency: "AUD", standardRate: 10, labelEn: "Australia", labelAr: "أستراليا" },
];

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

export function currencyLabel(code, locale = "ar") {
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
  const c = normalizeCurrency(code);
  const row = labels[c] || { ar: c, en: c };
  return locale === "en" ? row.en : row.ar;
}

export function sarToLocal(amountSar, currency) {
  const code = normalizeCurrency(currency);
  const rate = LOCAL_PER_SAR[code] ?? 1;
  const n = Number(amountSar) || 0;
  const decimals = code === "KWD" || code === "BHD" || code === "OMR" || code === "JOD" ? 3 : 2;
  return Number((n * rate).toFixed(decimals));
}

export function formatMoneySarAsLocal(amountSar, currency, locale = "ar") {
  const code = normalizeCurrency(currency);
  const local = sarToLocal(amountSar, code);
  const decimals = code === "KWD" || code === "BHD" || code === "OMR" || code === "JOD" ? 3 : 2;
  return `${local.toFixed(decimals)} ${currencyLabel(code, locale)}`;
}

export function countryLabel(code, locale = "ar") {
  const pack = COUNTRY_PACKS.find((c) => c.code === String(code || "").toUpperCase());
  if (!pack) return code || "—";
  return locale === "en" ? pack.labelEn : pack.labelAr;
}
