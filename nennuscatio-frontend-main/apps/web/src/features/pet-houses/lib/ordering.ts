import { houseGaps, ORDER_LIMITS, type HouseGap, type PetHouseDetails } from "@nennus-catio/contracts";
import type { Product, Variant } from "@/mocks/data/business";
import type { HouseMetadata } from "@/mocks/data/pet-houses";

/** The website's house details in the contract's shape, for the one readiness rule (`houseGaps`, D268). */
function asContract(house: HouseMetadata): PetHouseDetails {
  return {
    collection: house.collection,
    purchaseMode: house.purchaseMode,
    availability: house.availability,
    dimensions: house.dimensions ? { height: house.dimensions.height, width: house.dimensions.width, depth: house.dimensions.depth } : null,
    features: house.features,
    leadTime: house.leadTime,
    deliveryFee: house.deliveryFee,
    fulfilment: house.fulfilment,
    provisional: house.provisional,
    source: house.source ?? null,
  };
}

/** What a house still needs before it can be ordered online (empty = ready), by the contract's rule (#14). */
export function houseMissing(house: HouseMetadata, prices: readonly number[]): HouseGap[] {
  return houseGaps(asContract(house), prices);
}

/** Customers can order this Pet House online now: shown in the shop, and complete by the one rule (#14). */
export function houseOrderable(product: Product): boolean {
  return Boolean(product.house && product.active && houseMissing(product.house, product.variants.map((variant) => variant.price)).length === 0);
}

/** A made-to-order house takes no stock (#14, D269): it can always be ordered, and its estimate applies. */
export function madeToOrder(product: Product | undefined): boolean {
  return product?.house?.availability === "made-to-order";
}

/**
 * How many of a size can be in the cart: its stock, or for a made-to-order house the order limit.
 * An ordinary item and an in-stock house are limited by their stock, as checkout reserves it.
 */
export function quantityLimit(product: Product | undefined, variant: Variant | undefined): number {
  if (!variant) return 0;
  return madeToOrder(product) ? ORDER_LIMITS.maxQuantity : variant.stock;
}

/** Today in Qatar, as YYYY-MM-DD. */
function qatarToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The first Qatar day a house can be delivered: today plus its longest estimate (as checkout counts it). */
export function earliestHouseDay(maxDays: number, now = new Date()): string {
  const [year, month, day] = qatarToday(now).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + maxDays)).toISOString().slice(0, 10);
}

/** The cart's longest house estimate, from the catalogue (the quote's `houseLeadDays` once it answers). */
export function cartHouseDays(products: readonly (Product | undefined)[]): number | null {
  const days = products.flatMap((product) => (product?.house?.leadTime ? [product.house.leadTime.maxDays] : []));
  return days.length ? Math.max(...days) : null;
}
