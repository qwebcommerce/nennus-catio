import type { Locale } from "@nennus-catio/contracts";
import {
  categories,
  shopCategories,
  type Product,
  type Variant,
} from "@/mocks/data/business";
import { matchesPublicPet, publicPetTypes } from "@/mocks/data/public-pets";

/** Public catalogue boundary. House cards open the separate house detail route. */
export function isShopProduct(product: Product) {
  return (
    (product.house
      ? product.category === "pet-houses" &&
        categories.some((category) => category.id === product.category)
      : shopCategories.some((category) => category.id === product.category)) &&
    publicPetTypes.some((pet) => matchesPublicPet(product, pet.id))
  );
}

/** A pack's price today (11e): after the offer everyone gets on it alone, otherwise its list price. */
export const packPrice = (variant: Variant) => variant.salePrice ?? variant.price;

/** The pack a card shows: the cheapest after offers (the first of equals). */
export function cheapestPack(product: Product): Variant {
  return product.variants.reduce((best, variant) => (packPrice(variant) < packPrice(best) ? variant : best));
}

/** What the price filter and the sort use: the cheapest pack after offers; a house priced on request goes last. */
export function sortPrice(product: Product): number {
  return product.house?.purchaseMode === "inquiry" ? Number.MAX_SAFE_INTEGER : packPrice(cheapestPack(product));
}

export function selectShopProducts(
  products: readonly Product[],
  filters: {
    category?: string;
    pet?: string;
    search?: string;
    sort?: string;
    locale?: Locale;
    brands?: readonly string[];
  } = {},
) {
  const { category, pet, sort, locale = "en" } = filters;
  const search = filters.search?.trim().toLowerCase();
  const brands = (filters.brands ?? []).map(normaliseBrand).filter(Boolean);
  return products
    .filter(
      (product) =>
        product.active &&
        isShopProduct(product) &&
        (!category || product.category === category) &&
        (!pet || matchesPublicPet(product, pet)) &&
        (!brands.length || brands.includes(normaliseBrand(product.brand ?? ""))) &&
        (!search || product.name[locale].toLowerCase().includes(search)),
    )
    .sort((a, b) => (sort === "price" ? sortPrice(a) - sortPrice(b) : 0));
}

export function normaliseBrand(brand: string) {
  return brand.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Counts use the other filters, not the brand selection itself. */
export function shopBrandFacets(products: readonly Product[], selected: readonly string[] = []) {
  const facets = new Map<string, { id: string; name: string; count: number }>();
  for (const product of products) {
    const name = product.brand?.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const id = normaliseBrand(name);
    const existing = facets.get(id);
    facets.set(id, { id, name: existing?.name ?? name, count: (existing?.count ?? 0) + 1 });
  }
  // Keep zero-result selected brands visible so they can always be unchecked.
  for (const name of selected) {
    const id = normaliseBrand(name);
    if (id && !facets.has(id)) facets.set(id, { id, name, count: 0 });
  }
  return [...facets.values()].sort((a, b) => a.name.localeCompare(b.name));
}
