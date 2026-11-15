import type { Product } from "./business";
import { assets } from "./assets";

/** Reference-led public groups. Underlying product/house pet IDs remain stable. */
export const publicPetTypes = [
  {
    id: "cats",
    name: { en: "Cats", ar: "القطط" },
    image: assets.cat,
    productPetIds: ["cats"],
    housePetIds: ["cats"],
  },
  {
    id: "dogs",
    name: { en: "Dogs", ar: "الكلاب" },
    image: assets.dogPortrait,
    productPetIds: ["dogs"],
    housePetIds: ["dogs"],
  },
  {
    id: "birds",
    name: { en: "Birds", ar: "الطيور" },
    image: assets.bird,
    productPetIds: ["birds"],
    housePetIds: ["birds"],
  },
  {
    id: "small-pets",
    name: { en: "Small Pets", ar: "الحيوانات الصغيرة" },
    image: assets.rabbitPortrait,
    productPetIds: ["small-pets"],
    housePetIds: ["small-pets"],
  },
  {
    id: "other-pets",
    name: { en: "Other Pets", ar: "حيوانات أخرى" },
    image: assets.hamsterPortrait,
    productPetIds: ["pets"],
    housePetIds: ["deer-goats", "horses"],
  },
  {
    id: "reptiles",
    name: { en: "Reptiles", ar: "الزواحف" },
    image: assets.tortoisePortrait,
    productPetIds: ["reptiles"],
    housePetIds: ["reptiles"],
  },
  {
    id: "fish",
    name: { en: "Fish", ar: "الأسماك" },
    image: assets.fishPortrait,
    productPetIds: ["fish"],
    housePetIds: ["fish"],
  },
  {
    id: "exotic-pets",
    name: { en: "Exotic Pets", ar: "حيوانات غريبة" },
    image: assets.lizardPortrait,
    productPetIds: [],
    // Temporary overlap with reptiles, pending owner-approved suitability tags.
    housePetIds: ["reptiles"],
  },
] as const;

/** A product can suit several pets (#6); it belongs to a group if any of them is in the group. */
function inGroup(product: Product, group: (typeof publicPetTypes)[number]) {
  const ids = (product.house ? group.housePetIds : group.productPetIds) as readonly string[];
  return (product.pets ?? [product.pet]).some((pet) => ids.includes(pet));
}

export function publicPetForProduct(product: Product) {
  return publicPetTypes.find((group) => inGroup(product, group));
}

export function matchesPublicPet(product: Product, groupId: string) {
  const group = publicPetTypes.find((entry) => entry.id === groupId);
  return group ? inGroup(product, group) : false;
}
