import type { HouseGap } from "@nennus-catio/contracts";
import type { Product } from "@/mocks/data/business";
import { houseMissing } from "./ordering";

/**
 * The admin's view of one Pet House model (#14, D268): what it still needs before customers can order
 * it online (the contract's one rule, `houseGaps`), and whether customers can see it at all.
 */
export interface HouseReadiness {
  readonly gaps: HouseGap[];
  /** Hidden from customers: the model's Store visibility, or the Pet Houses category, is off. */
  readonly hidden: boolean;
  /** Customers can order it online now. */
  readonly ready: boolean;
}

export function houseReadiness(product: Product, categoryShown = true): HouseReadiness {
  const gaps = product.house ? houseMissing(product.house, product.variants.map((variant) => variant.price)) : [];
  const hidden = !product.active || !categoryShown;
  return { gaps, hidden, ready: gaps.length === 0 && !hidden };
}

const GAP_WORDS: Record<HouseGap, { en: string; ar: string }> = {
  price: { en: "price", ar: "السعر" },
  availability: { en: "availability", ar: "التوفر" },
  leadTime: { en: "days", ar: "المدة" },
  deliveryFee: { en: "delivery charge", ar: "رسوم التوصيل" },
  checked: { en: "details check", ar: "مراجعة التفاصيل" },
};

/** "Ready to order online" or "Not ready: delivery charge missing", for the Pet Houses tab and its panel. */
export function readinessLabel(readiness: HouseReadiness, text: (en: string, ar: string) => string): string {
  const [first, second] = readiness.gaps.map((gap) => GAP_WORDS[gap]);
  if (!first) {
    return readiness.hidden
      ? text("Ready, but hidden from customers", "جاهز، لكنه مخفي عن العملاء")
      : text("Ready to order online", "جاهز للطلب عبر الموقع");
  }
  if (!second) return text(`Not ready: ${first.en} missing`, `غير جاهز: ينقصه ${first.ar}`);
  if (readiness.gaps.length === 2) {
    return text(`Not ready: ${first.en} and ${second.en} missing`, `غير جاهز: ينقصه ${first.ar} و${second.ar}`);
  }
  return text(`Not ready: ${readiness.gaps.length} things missing`, `غير جاهز: تنقصه ${readiness.gaps.length} أمور`);
}
