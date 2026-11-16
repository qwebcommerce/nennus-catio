/**
 * NFR-03 on the screen: money math in whole dirhams (100 dirhams = 1 riyal), never float riyals.
 * The API sends riyals with at most two decimals; they are turned into dirhams here, added up as
 * integers, and shown with two decimals. Rounding (weight lines) is half away from zero, the
 * same rule the server uses, so the till and the shop show what the server will charge.
 */

/** Riyals (number or "12.50" / "12,5") → whole dirhams. */
export function toDirhams(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Integer n / d (d > 0) rounded half away from zero. */
export function divRound(n, d) {
  const a = Math.abs(n);
  const q = Math.floor(a / d);
  const out = 2 * (a - q * d) >= d ? q + 1 : q;
  return n < 0 ? -out : out;
}

/** Line amount in dirhams: unit price × quantity, or price per kg × grams / 1000 for weight goods. */
export function lineDirhams(unitPrice, quantity, sellBy) {
  const price = toDirhams(unitPrice);
  const qty = Math.trunc(Number(quantity) || 0);
  return sellBy === "WEIGHT" ? divRound(price * qty, 1000) : price * qty;
}

/** Dirhams → riyals as a number (exact two decimals). */
export function riyals(dirhams) {
  return Number((Math.trunc(dirhams) / 100).toFixed(2));
}

/** Dirhams → "12.50". */
export function money2(dirhams) {
  return (Math.trunc(dirhams) / 100).toFixed(2);
}
