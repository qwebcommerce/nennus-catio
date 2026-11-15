import type { Promotion, PromotionStatus } from "@/mocks/data/promotions";
export function promotionStatus(p: Promotion, date: string): PromotionStatus {
  if (!p.enabled) return "inactive";
  if (p.to && p.to < date) return "ended";
  if (p.from > date) return "scheduled";
  return "active";
}
export const promotionTypes = {
  en: { discount: "Discount", code: "Promo Code", bundle: "Bundle" },
  ar: { discount: "خصم", code: "رمز ترويجي", bundle: "مجموعة" },
};
export const promotionTargets = {
  en: {
    products: "Products",
    "selected-products": "Selected Products",
    grooming: "Grooming",
    houses: "Pet Houses",
    order: "Entire Order",
  },
  ar: {
    products: "المنتجات",
    "selected-products": "منتجات محددة",
    grooming: "العناية",
    houses: "بيوت الحيوانات",
    order: "الطلب بالكامل",
  },
};
export const promotionStatuses = {
  en: {
    active: "Active",
    scheduled: "Scheduled",
    ended: "Ended",
    inactive: "Inactive",
  },
  ar: {
    active: "نشط",
    scheduled: "مجدول",
    ended: "منتهي",
    inactive: "غير نشط",
  },
};
export function promotionMoney(value: number, locale: "en" | "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", {
    style: "currency",
    currency: "QAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
export function promotionOffer(p: Promotion, locale: "en" | "ar") {
  return p.offer === "percent"
    ? `${p.value}% ${locale === "ar" ? "خصم" : "Off"}`
    : `${promotionMoney(p.value, locale)}${p.offer === "fixed" ? (locale === "ar" ? " خصم" : " Off") : ""}`;
}
export function promotionDate(date: string, locale: "en" | "ar", long = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function promotionPeriod(p: Promotion, locale: "en" | "ar") {
  if (!p.to) return locale === "ar" ? "مستمر" : "Ongoing";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .formatRange(new Date(`${p.from}T12:00:00Z`), new Date(`${p.to}T12:00:00Z`))
    .replace(/\s*–\s*/g, " – ")
    .replace(/\s+/g, " ");
}
