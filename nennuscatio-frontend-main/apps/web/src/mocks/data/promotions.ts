import type { LocalisedText } from "@nennus-catio/contracts";
import { assets } from "./assets";
import { bi } from "./business";
import { seedPetHouses } from "./pet-houses";

export type PromotionType = "discount" | "code" | "bundle";
export type PromotionTarget =
  | "products"
  | "selected-products"
  | "grooming"
  | "houses"
  | "order";
export type PromotionStatus = "active" | "scheduled" | "ended" | "inactive";
export interface Promotion {
  id: string;
  name: LocalisedText;
  description: LocalisedText;
  type: PromotionType;
  target: PromotionTarget;
  offer: "percent" | "fixed" | "bundle";
  value: number; // Percent, or integer QAR minor units for fixed/bundle.
  code: string;
  from: string; // Inclusive Asia/Qatar calendar dates.
  to: string; // Empty means no end date.
  minimumSpend: number;
  eligibility: "all" | "registered" | "new";
  limit: number; // Zero means unlimited.
  perCustomer: number; // Zero means unlimited.
  productIds: string[];
  image: string;
  enabled: boolean;
  visible: boolean;
  featured: boolean;
  redemptions: { at: string; reference: string; discount: number }[];
}
export type PromotionDraft = Omit<Promotion, "id" | "redemptions">;

/** Synthetic offers/history only; not client prices or live checkout rules. */
export function seedPromotions(): Promotion[] {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
  }).format(new Date());
  const shift = (offset: number) =>
    new Date(new Date(`${day}T12:00:00Z`).getTime() + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  const definitions: [
    string,
    string,
    PromotionType,
    PromotionTarget,
    Promotion["offer"],
    number,
    string,
    string,
  ][] = [
    [
      "Weekend Grooming Offer",
      "عرض العناية الأسبوعي",
      "discount",
      "grooming",
      "percent",
      15,
      "",
      assets.grooming,
    ],
    [
      "WELCOME20",
      "WELCOME20",
      "code",
      "products",
      "fixed",
      2000,
      "WELCOME20",
      assets.catFood,
    ],
    [
      "Pet Essentials Bundle",
      "مجموعة مستلزمات الحيوانات",
      "bundle",
      "products",
      "bundle",
      12500,
      "",
      assets.essentials,
    ],
    [
      "Cat Care Weekend",
      "عطلة العناية بالقطط",
      "discount",
      "selected-products",
      "percent",
      10,
      "",
      assets.catFood,
    ],
    [
      "Home Starter Bundle",
      "مجموعة المنزل الأول",
      "bundle",
      "houses",
      "bundle",
      45000,
      "",
      assets.housesHero,
    ],
    [
      "FIRSTGROOM",
      "FIRSTGROOM",
      "code",
      "grooming",
      "fixed",
      5000,
      "FIRSTGROOM",
      assets.grooming,
    ],
    [
      "Litter Essentials Bundle",
      "مجموعة مستلزمات الرمل",
      "bundle",
      "products",
      "bundle",
      9500,
      "",
      assets.catLitter,
    ],
    [
      "Premium Food Discount",
      "خصم الطعام المميز",
      "discount",
      "products",
      "percent",
      10,
      "",
      assets.dogFood,
    ],
    [
      "NEWFRIEND10",
      "NEWFRIEND10",
      "code",
      "order",
      "percent",
      10,
      "NEWFRIEND10",
      assets.catTreats,
    ],
    [
      "Indoor Pet Bundle",
      "مجموعة الحيوانات المنزلية",
      "bundle",
      "products",
      "bundle",
      14500,
      "",
      assets.essentials,
    ],
    [
      "Bird Care Offer",
      "عرض العناية بالطيور",
      "discount",
      "products",
      "percent",
      12,
      "",
      assets.birdSeed,
    ],
    [
      "PETCARE15",
      "PETCARE15",
      "code",
      "order",
      "percent",
      15,
      "PETCARE15",
      assets.shampoo,
    ],
  ];
  return definitions.map(
    ([en, ar, type, target, offer, value, code, image], index) => ({
      id: `PR-${1001 + index}`,
      name: bi(en, ar),
      description:
        index === 1
          ? bi(
              "QAR 20 off product orders over QAR 100.",
              "خصم 20 ر.ق على طلبات المنتجات فوق 100 ر.ق.",
            )
          : bi(en, ar),
      type,
      target,
      offer,
      value,
      code,
      image,
      from: shift(index === 3 || index === 10 ? 3 : -7),
      to:
        index === 2 || index === 6 || index === 9
          ? ""
          : shift(index === 7 ? -1 : index === 0 ? 3 : 30),
      minimumSpend: index === 1 ? 10000 : 0,
      eligibility: index === 1 ? "registered" : index === 8 ? "new" : "all",
      limit: index === 1 ? 200 : 0,
      perCustomer: index === 1 ? 1 : 0,
      productIds:
        type === "bundle"
          ? target === "houses"
            ? [seedPetHouses()[0].id, "cat-bowl"]
            : ["cat-food", "cat-treats"]
          : target === "selected-products"
            ? ["cat-food"]
            : [],
      enabled: index !== 11,
      visible: true,
      featured: false,
      redemptions:
        index === 3 || index === 10 || index === 11
          ? []
          : Array.from({ length: (index % 3) + 1 }, (_, n) => ({
              at: `${shift(index === 7 ? -2 - n : -n)}T09:00:00+03:00`,
              reference: `DEMO-${index + 1}-${n + 1}`,
              discount:
                offer === "fixed"
                  ? value
                  : offer === "percent"
                    ? value * 100
                    : 0,
            })),
    }),
  );
}
