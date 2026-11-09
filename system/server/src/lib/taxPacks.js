import { COUNTRY_PACKS, countryPack } from "./countries.js";

/** Tax / currency packs derived from supported countries */
export const TAX_PACKS = Object.fromEntries(
  COUNTRY_PACKS.map((c) => [
    c.code,
    {
      countryCode: c.code,
      currency: c.currency,
      standardRate: c.standardRate,
      labelEn: c.labelEn,
      labelAr: c.labelAr,
    },
  ]),
);

/** Common VAT/GST rates used across supported countries */
export const ALLOWED_TAX_RATES = [0, 5, 7.5, 8, 9, 10, 11, 14, 15, 16, 18, 19, 20, 21, 22];

export function packForCountry(countryCode) {
  const pack = countryPack(countryCode);
  if (pack) {
    return {
      countryCode: pack.code,
      currency: pack.currency,
      standardRate: pack.standardRate,
      labelEn: pack.labelEn,
      labelAr: pack.labelAr,
    };
  }
  return TAX_PACKS.SA || TAX_PACKS.QA;
}

export function currencyLabel(currency, locale = "ar") {
  const map = {
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
    JOD: { ar: "د.أ", en: "JOD" },
    LBP: { ar: "ل.ل", en: "LBP" },
    IQD: { ar: "د.ع", en: "IQD" },
    ILS: { ar: "₪", en: "ILS" },
    YER: { ar: "ر.ي", en: "YER" },
    SDG: { ar: "ج.س", en: "SDG" },
    NGN: { ar: "₦", en: "NGN" },
    KES: { ar: "KSh", en: "KES" },
    ZAR: { ar: "R", en: "ZAR" },
    EUR: { ar: "€", en: "EUR" },
    GBP: { ar: "£", en: "GBP" },
    USD: { ar: "$", en: "USD" },
    CAD: { ar: "C$", en: "CAD" },
    TRY: { ar: "₺", en: "TRY" },
    INR: { ar: "₹", en: "INR" },
    PKR: { ar: "₨", en: "PKR" },
    IDR: { ar: "Rp", en: "IDR" },
    MYR: { ar: "RM", en: "MYR" },
    SGD: { ar: "S$", en: "SGD" },
    AUD: { ar: "A$", en: "AUD" },
  };
  const code = String(currency || "SAR").toUpperCase();
  const row = map[code] || { ar: code, en: code };
  return locale === "en" ? row.en : row.ar;
}

export function summarizeTaxSettings(row, org = null) {
  const rate = Number(row?.standardRate ?? 0);
  const currency = row?.currency || "SAR";
  return {
    enabled: row?.enabled !== false,
    countryCode: row?.countryCode || "SA",
    currency,
    currencyLabelAr: currencyLabel(currency, "ar"),
    currencyLabelEn: currencyLabel(currency, "en"),
    standardRate: rate,
    defaultTaxPercent: row?.enabled === false ? 0 : rate,
    pricesIncludeTax: Boolean(row?.pricesIncludeTax),
    vatNumber: org?.vatNumber || null,
    taxNumber: org?.taxNumber || null,
    allowedRates: ALLOWED_TAX_RATES,
    packs: Object.values(TAX_PACKS),
  };
}

export async function getOrCreateTaxSettings(prismaClient, organizationId) {
  const existing = await prismaClient.organizationTaxSettings.findUnique({
    where: { organizationId },
  });
  if (existing) return existing;

  const org = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { country: true },
  });
  const pack = packForCountry(org?.country || "SA");
  return prismaClient.organizationTaxSettings.create({
    data: {
      organizationId,
      countryCode: pack.countryCode,
      currency: pack.currency,
      standardRate: pack.standardRate,
      pricesIncludeTax: false,
      enabled: true,
    },
  });
}

/** Keep tax pack in sync when onboarding country changes */
export async function syncTaxPackFromCountry(prismaClient, organizationId, countryCode) {
  const pack = packForCountry(countryCode);
  await getOrCreateTaxSettings(prismaClient, organizationId);
  return prismaClient.organizationTaxSettings.update({
    where: { organizationId },
    data: {
      countryCode: pack.countryCode,
      currency: pack.currency,
      standardRate: pack.standardRate,
    },
  });
}

/** Resolve effective tax % for a sale (client override clamped to allowed rates). */
export function resolveSaleTaxPercent(clientTaxPercent, taxSettings) {
  const summary = summarizeTaxSettings(taxSettings);
  if (!summary.enabled) return 0;
  if (clientTaxPercent == null || String(clientTaxPercent).trim() === "") {
    return summary.defaultTaxPercent;
  }
  const n = Number(clientTaxPercent);
  if (!Number.isFinite(n) || n < 0) return summary.defaultTaxPercent;
  const rounded = Math.round(n * 100) / 100;
  if (ALLOWED_TAX_RATES.includes(rounded) || ALLOWED_TAX_RATES.includes(Math.round(rounded))) {
    return Math.min(100, Math.max(0, rounded));
  }
  // Allow pack default rate even if not in the short list
  if (Math.abs(rounded - summary.defaultTaxPercent) < 0.001) {
    return summary.defaultTaxPercent;
  }
  return Math.min(100, Math.max(0, rounded));
}
