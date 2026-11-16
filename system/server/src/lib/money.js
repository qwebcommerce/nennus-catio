/**
 * NFR-03: money is stored and computed as whole QAR dirhams (100 dirhams = 1 riyal), as
 * integers — never floating-point riyals. The API keeps speaking riyals: request bodies send
 * riyal amounts ("12.50" or 12.5) and responses show riyals with two decimals. Convert only at
 * that boundary: toDirhams() on the way in, fmt() / riyals() / toApi() on the way out.
 *
 * Rounding rule for every derived amount (weight lines, percentages, proportional shares):
 * half away from zero, to whole dirhams. Proportional splits use largest remainder so the parts
 * always add up to the whole exactly.
 */

export const DIRHAMS_PER_RIYAL = 100;

/** n / d rounded half away from zero, in exact integer (BigInt) arithmetic. d > 0. */
export function divRound(n, den) {
  const N = BigInt(n);
  const D = BigInt(den);
  if (D <= 0n) throw new RangeError("divRound needs d > 0");
  const a = N < 0n ? -N : N;
  let q = a / D;
  if ((a % D) * 2n >= D) q += 1n;
  const out = Number(N < 0n ? -q : q);
  if (!Number.isSafeInteger(out)) throw new RangeError("Amount too large");
  return out === 0 ? 0 : out;
}

/** A dirham value read from the database (Int / BigInt) or computed here; null counts as 0. */
export function d(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (!Number.isInteger(n)) throw new RangeError(`Not a whole dirham amount: ${value}`);
  return n;
}

/** Sum of whole-dirham values. */
export function sum(list, pick = (x) => x) {
  let total = 0;
  for (const item of list || []) total += d(pick(item));
  return total;
}

const RIYAL_RE = /^(-)?(\d{1,9})(?:[.,](\d{1,2}))?$/;

/**
 * Parses a riyal amount from a request (string "12.50", "12,5", "12" or a number 12.5) into
 * whole dirhams. Strict: more than two decimals ("1.005") or a float artefact
 * (0.1 + 0.2 = 0.30000000000000004) is refused, never rounded. Returns null when invalid.
 * Options: allowZero (default true), allowNegative (default false).
 */
export function toDirhams(value, { allowZero = true, allowNegative = false } = {}) {
  if (value == null) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!text) return null;
  const m = RIYAL_RE.exec(text);
  if (!m) return null;
  let out = Number(m[2]) * DIRHAMS_PER_RIYAL + (m[3] ? Number(m[3].padEnd(2, "0")) : 0);
  if (m[1] && out !== 0) {
    if (!allowNegative) return null;
    out = -out;
  }
  if (!allowZero && out === 0) return null;
  return out;
}

/** Back-compat name: a user-entered riyal amount → whole dirhams, or null when invalid. */
export function parseMoney(value, opts) {
  return toDirhams(value, opts);
}

/** Dirhams → riyal string with two decimals: 1250 → "12.50", -5 → "-0.05". null stays null. */
export function fmt(value) {
  if (value == null) return null;
  const n = d(value);
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / DIRHAMS_PER_RIYAL)}.${String(a % DIRHAMS_PER_RIYAL).padStart(2, "0")}`;
}

/** Dirhams → riyals as a JSON number (1250 → 12.5) for responses that always sent numbers. */
export function riyals(value) {
  if (value == null) return null;
  return Number(fmt(value));
}

/** Name used by finance / reports: dirhams → riyal number with 2 dp. */
export const money = riyals;

/** A decimal factor (string / number / Prisma Decimal) as an exact integer scaled by 1e6. */
function scaled6(factor) {
  const text = String(factor ?? 0).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new RangeError(`Bad factor: ${factor}`);
  const digits = m[3] || "";
  let s = BigInt(m[2]) * 1000000n + BigInt(digits.slice(0, 6).padEnd(6, "0"));
  if (digits.length > 6 && Number(digits[6]) >= 5) s += 1n;
  return m[1] ? -s : s;
}

/** amount (dirhams) × factor, rounded half away from zero. Factor exact to 6 decimals. */
export function mulRound(amount, factor) {
  return divRound(BigInt(d(amount)) * scaled6(factor), 1000000n);
}

/** percent (e.g. 12.5) of a dirham amount, rounded half away from zero. */
export function percentOf(amount, percent) {
  return divRound(BigInt(d(amount)) * scaled6(percent), 100000000n);
}

/** Weight line: price per kilogram (dirhams) × grams / 1000, rounded half away from zero. */
export function perKg(pricePerKg, grams) {
  return divRound(BigInt(d(pricePerKg)) * BigInt(Math.trunc(Number(grams))), 1000n);
}

/** Unit amount × quantity; a WEIGHT quantity is grams against a per-kg amount. */
export function lineAmount(unit, quantity, sellBy) {
  return sellBy === "WEIGHT" ? perKg(unit, quantity) : d(unit) * Math.trunc(Number(quantity));
}

/**
 * Splits a whole-dirham total over weights in proportion, so the parts always add up to the
 * total exactly (largest remainder: each part is floored, the dirhams left over go to the
 * largest remainders, ties to the earlier line). Weights are non-negative integers.
 */
export function splitProportional(total, weights) {
  const T = d(total);
  const w = weights.map((x) => Math.max(0, Math.round(Number(x) || 0)));
  const W = w.reduce((a, b) => a + b, 0);
  if (!w.length) return [];
  if (W === 0 || T === 0) return w.map(() => 0);
  const abs = BigInt(Math.abs(T));
  const WB = BigInt(W);
  const parts = w.map((x) => (abs * BigInt(x)) / WB);
  let left = abs - parts.reduce((a, b) => a + b, 0n);
  const order = w
    .map((x, i) => ({ i, rem: (abs * BigInt(x)) % WB }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (let k = 0; left > 0n; k += 1, left -= 1n) parts[order[k % order.length].i] += 1n;
  return parts.map((p) => Number(p) * (T < 0 ? -1 : 1));
}

/** share of total in proportion part / whole, rounded half away from zero (whole > 0). */
export function shareOf(total, part, whole) {
  if (d(whole) <= 0) return 0;
  return divRound(BigInt(d(total)) * BigInt(d(part)), BigInt(d(whole)));
}

/** 400 error for an amount that is not a valid riyal value with at most two decimals. */
export function amountError(field = "") {
  const err = new Error(`Enter a valid amount${field ? ` for ${field}` : ""} (at most 2 decimals)`);
  err.status = 400;
  err.code = "AMOUNT_INVALID";
  err.errorAr = "المبلغ غير صالح (رقمان عشريان كحد أقصى)";
  err.errorEn = err.message;
  return err;
}

/** toDirhams() that throws amountError() instead of returning null. */
export function requireDirhams(value, opts = {}, field = "") {
  const n = toDirhams(value, opts);
  if (n == null) throw amountError(field);
  return n;
}
