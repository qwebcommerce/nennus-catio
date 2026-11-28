/**
 * Location kinds (LocationKind). New kinds work everywhere that lists locations; code that must
 * treat kinds differently asks these helpers instead of comparing with one kind.
 * - SHOP, OTHER: can run a till.
 * - VAN: a mobile till (van sales, van returns, vehicles).
 * - WAREHOUSE, FACTORY: hold stock only (no till, no drawer cash).
 */
export const LOCATION_KINDS = ["SHOP", "VAN", "WAREHOUSE", "FACTORY", "OTHER"];
export const STOCK_ONLY_KINDS = ["WAREHOUSE", "FACTORY"];

export function isLocationKind(kind) {
  return LOCATION_KINDS.includes(String(kind || "").toUpperCase());
}

/** May this location run a till (and so hold drawer cash)? */
export function isTillKind(kind) {
  return !STOCK_ONLY_KINDS.includes(String(kind || "SHOP").toUpperCase());
}
