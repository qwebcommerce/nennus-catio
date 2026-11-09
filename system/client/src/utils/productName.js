/**
 * تطبيع النص للمطابقة رغم اختلاف شرطة طويلة/قصيرة أو المسافات
 */
function normalizeKey(s) {
  if (s == null) return "";
  return String(s)
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d-]/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * عند غياب nameEn في قاعدة البيانات: ترجمة احتياطية للأسماء العربية الشائعة (العينات)
 */
const FALLBACK_EN_BY_AR = {
  [normalizeKey("طعام كلاب — لحم")]: "Dog food — meat",
  [normalizeKey("طعام قطط جاف — ممتاز")]: "Premium dry cat food",
  [normalizeKey("لعبة خيط للقطط")]: "Cat string toy",
};

/**
 * اسم العرض حسب لغة الواجهة — nameEn إلزامي عملياً؛ name (محلي) اختياري
 */
export function productDisplayName(product, locale) {
  if (!product) return "";
  const nameAr = product.name != null ? String(product.name) : "";
  const nameEnDb =
    product.nameEn != null && String(product.nameEn).trim() !== "" ? String(product.nameEn).trim() : "";

  if (locale === "en") {
    if (nameEnDb) return nameEnDb;
    const fb = FALLBACK_EN_BY_AR[normalizeKey(nameAr)];
    if (fb) return fb;
    return nameAr;
  }

  if (nameAr && (!nameEnDb || normalizeKey(nameAr) !== normalizeKey(nameEnDb))) {
    return nameAr;
  }
  return nameEnDb || nameAr;
}
