import type {
  AdminPromotion,
  PromotionEligibility,
  PromotionStatus,
  PromotionTargetKind,
  PromotionType,
  PromotionUseStatus,
} from "@nennus-catio/contracts";

type Text = (en: string, ar: string) => string;
type Locale = "en" | "ar";

/** The approved screen's type names (D57). */
export const PROMOTION_TYPES: Record<PromotionType, { en: string; ar: string }> = {
  discount: { en: "Discount", ar: "خصم" },
  code: { en: "Promo Code", ar: "رمز ترويجي" },
  bundle: { en: "Bundle", ar: "مجموعة" },
};

/** What a promotion applies to (D202 question 1). */
export const PROMOTION_TARGETS: Record<PromotionTargetKind, { en: string; ar: string }> = {
  all_products: { en: "All products", ar: "كل المنتجات" },
  categories: { en: "Categories", ar: "فئات" },
  products: { en: "Selected products", ar: "منتجات محددة" },
  order: { en: "Entire order", ar: "الطلب بالكامل" },
  all_grooming: { en: "All grooming", ar: "كل باقات العناية" },
  grooming_packages: { en: "Selected grooming", ar: "باقات عناية محددة" },
  bundle: { en: "Bundle items", ar: "عناصر المجموعة" },
};

export const PROMOTION_STATUSES: Record<PromotionStatus, { en: string; ar: string }> = {
  active: { en: "Active", ar: "نشط" },
  scheduled: { en: "Scheduled", ar: "مجدول" },
  ended: { en: "Ended", ar: "منتهي" },
  inactive: { en: "Inactive", ar: "غير نشط" },
};

export const PROMOTION_ELIGIBILITY: Record<PromotionEligibility, { en: string; ar: string }> = {
  all: { en: "All customers", ar: "جميع العملاء" },
  registered: { en: "Registered customers", ar: "العملاء المسجلون" },
  new: { en: "New customers", ar: "العملاء الجدد" },
};

/** A use of a promotion by an order or booking: counted while held or used, not once given back. */
export const PROMOTION_USE_STATUSES: Record<PromotionUseStatus, { en: string; ar: string }> = {
  held: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  used: { en: "Paid", ar: "مدفوع" },
  released: { en: "Given back", ar: "أُعيد" },
};

export const isGroomingTarget = (kind: PromotionTargetKind) => kind === "all_grooming" || kind === "grooming_packages";

/** The shop's and the admin's offer wording live in one place (11e). */
export { offerMoney as promotionMoney, offerText } from "@/shared/lib/offers";

/** A calendar date some days later (YYYY-MM-DD; plain days, so UTC arithmetic is exact). */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** A Qatar calendar date, for example "13 Oct 2026". */
export function promotionDay(date: string, locale: Locale, long = false): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** The dates a promotion runs, inclusive (Qatar). */
export function periodText(promotion: Pick<AdminPromotion, "startsOn" | "endsOn">, text: Text, locale: Locale): string {
  const from = promotionDay(promotion.startsOn, locale);
  return promotion.endsOn ? `${from} – ${promotionDay(promotion.endsOn, locale)}` : text(`From ${from}, no end`, `من ${from}، بلا نهاية`);
}

/** What it applies to, with the chosen names when there are some. */
export function appliesToText(promotion: Pick<AdminPromotion, "targetKind" | "targets" | "bundleItems">, text: Text, local: (value: { en: string; ar: string }) => string): string {
  if (promotion.targetKind === "bundle") {
    const packs = promotion.bundleItems.map((item) =>
      item.productName && item.label ? `${item.quantity} × ${local(item.productName)} (${local(item.label)})` : text(`${item.quantity} × a deleted pack`, `${item.quantity} × عبوة محذوفة`),
    );
    return packs.join(" + ");
  }
  const names = promotion.targets.map((target) => local(target.name));
  const kind = local(PROMOTION_TARGETS[promotion.targetKind]);
  return names.length ? `${kind}: ${names.join(", ")}` : kind;
}
