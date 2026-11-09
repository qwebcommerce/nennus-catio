/**
 * Supported onboarding / tax countries (ISO 3166-1 alpha-2).
 * Maghreb + GCC first, then broader global coverage.
 */
export const COUNTRY_PACKS = [
  // Maghreb / North Africa
  { code: "DZ", currency: "DZD", standardRate: 19, labelEn: "Algeria", labelAr: "الجزائر" },
  { code: "MA", currency: "MAD", standardRate: 20, labelEn: "Morocco", labelAr: "المغرب" },
  { code: "TN", currency: "TND", standardRate: 19, labelEn: "Tunisia", labelAr: "تونس" },
  { code: "LY", currency: "LYD", standardRate: 0, labelEn: "Libya", labelAr: "ليبيا" },
  { code: "EG", currency: "EGP", standardRate: 14, labelEn: "Egypt", labelAr: "مصر" },
  // GCC
  { code: "SA", currency: "SAR", standardRate: 15, labelEn: "Saudi Arabia", labelAr: "السعودية" },
  { code: "AE", currency: "AED", standardRate: 5, labelEn: "United Arab Emirates", labelAr: "الإمارات" },
  { code: "QA", currency: "QAR", standardRate: 0, labelEn: "Qatar", labelAr: "قطر" },
  { code: "KW", currency: "KWD", standardRate: 0, labelEn: "Kuwait", labelAr: "الكويت" },
  { code: "BH", currency: "BHD", standardRate: 10, labelEn: "Bahrain", labelAr: "البحرين" },
  { code: "OM", currency: "OMR", standardRate: 5, labelEn: "Oman", labelAr: "عُمان" },
  // Levant / Near East
  { code: "JO", currency: "JOD", standardRate: 16, labelEn: "Jordan", labelAr: "الأردن" },
  { code: "LB", currency: "LBP", standardRate: 11, labelEn: "Lebanon", labelAr: "لبنان" },
  { code: "IQ", currency: "IQD", standardRate: 0, labelEn: "Iraq", labelAr: "العراق" },
  { code: "PS", currency: "ILS", standardRate: 16, labelEn: "Palestine", labelAr: "فلسطين" },
  { code: "YE", currency: "YER", standardRate: 0, labelEn: "Yemen", labelAr: "اليمن" },
  { code: "SD", currency: "SDG", standardRate: 0, labelEn: "Sudan", labelAr: "السودان" },
  // Africa (selected)
  { code: "NG", currency: "NGN", standardRate: 7.5, labelEn: "Nigeria", labelAr: "نيجيريا" },
  { code: "KE", currency: "KES", standardRate: 16, labelEn: "Kenya", labelAr: "كينيا" },
  { code: "ZA", currency: "ZAR", standardRate: 15, labelEn: "South Africa", labelAr: "جنوب أفريقيا" },
  // Europe
  { code: "FR", currency: "EUR", standardRate: 20, labelEn: "France", labelAr: "فرنسا" },
  { code: "DE", currency: "EUR", standardRate: 19, labelEn: "Germany", labelAr: "ألمانيا" },
  { code: "GB", currency: "GBP", standardRate: 20, labelEn: "United Kingdom", labelAr: "المملكة المتحدة" },
  { code: "ES", currency: "EUR", standardRate: 21, labelEn: "Spain", labelAr: "إسبانيا" },
  { code: "IT", currency: "EUR", standardRate: 22, labelEn: "Italy", labelAr: "إيطاليا" },
  { code: "TR", currency: "TRY", standardRate: 20, labelEn: "Turkey", labelAr: "تركيا" },
  // Americas / Asia-Pacific
  { code: "US", currency: "USD", standardRate: 0, labelEn: "United States", labelAr: "الولايات المتحدة" },
  { code: "CA", currency: "CAD", standardRate: 5, labelEn: "Canada", labelAr: "كندا" },
  { code: "IN", currency: "INR", standardRate: 18, labelEn: "India", labelAr: "الهند" },
  { code: "PK", currency: "PKR", standardRate: 18, labelEn: "Pakistan", labelAr: "باكستان" },
  { code: "ID", currency: "IDR", standardRate: 11, labelEn: "Indonesia", labelAr: "إندونيسيا" },
  { code: "MY", currency: "MYR", standardRate: 8, labelEn: "Malaysia", labelAr: "ماليزيا" },
  { code: "SG", currency: "SGD", standardRate: 9, labelEn: "Singapore", labelAr: "سنغافورة" },
  { code: "AU", currency: "AUD", standardRate: 10, labelEn: "Australia", labelAr: "أستراليا" },
];

export const ONBOARDING_COUNTRY_CODES = COUNTRY_PACKS.map((c) => c.code);

/** @deprecated use ONBOARDING_COUNTRY_CODES — kept for older imports */
export const GULF_COUNTRIES = ONBOARDING_COUNTRY_CODES;

const BY_CODE = Object.fromEntries(COUNTRY_PACKS.map((c) => [c.code, c]));

export function countryPack(code) {
  const key = String(code || "").trim().toUpperCase();
  return BY_CODE[key] || null;
}

export function isSupportedCountry(code) {
  return Boolean(countryPack(code));
}

export function countriesForClient() {
  return COUNTRY_PACKS.map((c) => ({
    code: c.code,
    labelEn: c.labelEn,
    labelAr: c.labelAr,
    currency: c.currency,
    standardRate: c.standardRate,
  }));
}
