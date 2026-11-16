import { Prisma } from "./prisma-client-bundle.js";

/** Exact decimal from a Prisma Decimal, number or string (no float sums on money). */
export function dec(value) {
  if (value == null || value === "") return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  try {
    return new Prisma.Decimal(typeof value === "object" && "toString" in value ? value.toString() : value);
  } catch {
    return new Prisma.Decimal(0);
  }
}

export function sumDec(list, pick = (x) => x) {
  return list.reduce((acc, item) => acc.plus(dec(pick(item))), new Prisma.Decimal(0));
}

/** Rounded to 2 dp for JSON / display. */
export function money(value) {
  return Number(dec(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2));
}

/** Parses a user-entered amount to whole dirhams (2 dp). Returns null when not a valid amount. */
export function parseMoney(value, { allowZero = true } = {}) {
  if (value == null || value === "") return null;
  let d;
  try {
    d = new Prisma.Decimal(String(value).trim());
  } catch {
    return null;
  }
  if (!d.isFinite() || d.isNegative()) return null;
  // Amounts finer than one dirham are refused, not silently rounded.
  if (d.decimalPlaces() > 2) return null;
  if (!allowZero && d.isZero()) return null;
  return d;
}
