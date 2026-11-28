/** Location kinds (keep in sync with server/src/lib/locationKinds.js). */
export const LOCATION_KINDS = ["SHOP", "VAN", "WAREHOUSE", "FACTORY", "OTHER"];
/** Stock-only kinds: no till. */
export const STOCK_ONLY_KINDS = ["WAREHOUSE", "FACTORY"];
export const isTillKind = (kind) => !STOCK_ONLY_KINDS.includes(String(kind || "SHOP"));
