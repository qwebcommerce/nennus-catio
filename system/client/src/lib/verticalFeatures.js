/**
 * إظهار أو إخفاء وحدات الواجهة حسب مجال النشاط (Organization.businessVertical).
 * إذا لم يُضبط المجال (منشآت قديمة) نعرض كل الشاشات — سلوك متوافق مع الخلف.
 */

/** أنشطة لا تحتاج قناة جملة في الواجهة */
const WHOLESALE_EXCLUDED = new Set([
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "HOTEL",
  "FITNESS",
]);

/** أنشطة يُفترض فيها مواعيد / حجوزات أو صيانة جدولة */
const APPOINTMENTS_VERTICALS = new Set([
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "PET_STORE",
  "HOTEL",
  "FITNESS",
  "PHARMACY",
  "RESTAURANT",
  "CAFE",
  "SERVICES_OTHER",
  "CLOTHING",
  "PHONE_STORE",
  "AUTO_DEALER",
]);

/** أنشطة نقطة بيع مباشرة — غالباً دون ذمم عملاء */
const CUSTOMER_ACCOUNTS_EXCLUDED = new Set([
  "CAFE",
  "RESTAURANT",
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "HOTEL",
  "FITNESS",
]);

/** أنشطة تعتمد دفعات الصلاحية (بقالة + تجزئة عامة إن وُجدت دفعات) */
const LOTS_EXPIRY_VERTICALS = new Set(["GROCERY", "RETAIL_GENERAL", "PHARMACY"]);

/** كافيه / مطعم — طاولة وملاحظات وإضافات بسيطة */
const CAFE_POS_VERTICALS = new Set(["CAFE", "RESTAURANT"]);

/**
 * @param {'wholesale' | 'appointments' | 'customerAccounts' | 'petPosFilters' | 'lotsExpiry' | 'cafePosExtras' | 'stockBrain' | 'priceBrain' | 'cashierCopilot' | 'ownerBrief' | 'costBrain' | 'stockBalancer' | 'customerRfm'} feature
 * @param {string | null | undefined} businessVertical
 */
export function isVerticalFeatureEnabled(feature, businessVertical) {
  if (businessVertical == null || String(businessVertical).trim() === "") {
    return true;
  }
  const v = String(businessVertical).trim();
  switch (feature) {
    case "petPosFilters":
      return v === "PET_STORE";
    case "wholesale":
      return !WHOLESALE_EXCLUDED.has(v);
    case "appointments":
      return APPOINTMENTS_VERTICALS.has(v);
    case "customerAccounts":
      return !CUSTOMER_ACCOUNTS_EXCLUDED.has(v);
    case "lotsExpiry":
      return LOTS_EXPIRY_VERTICALS.has(v);
    case "cafePosExtras":
      return CAFE_POS_VERTICALS.has(v);
    case "stockBrain":
    case "priceBrain":
    case "cashierCopilot":
    case "ownerBrief":
    case "costBrain":
    case "stockBalancer":
    case "customerRfm":
      return v === "GROCERY" || v === "RETAIL_GENERAL";
    default:
      return true;
  }
}
