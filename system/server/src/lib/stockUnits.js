/**
 * Units a transfer or van-return line can be entered in. Stock itself is always kept in
 * pieces, or in grams for goods sold by weight (FR-17). Shared by transfers and van returns.
 *
 *  - PIECE  — one piece (a bag for pack-size variants). Piece goods only.
 *  - CARTON — `piecesPerCarton` pieces (variant value, else the product's). Piece goods only.
 *  - KG     — kilograms of a weight product, up to 3 decimals; stored as grams.
 */

export const STOCK_UNITS = ["PIECE", "CARTON", "KG"];

function unitError(errorAr, errorEn) {
  const err = new Error(errorAr);
  err.status = 400;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  return err;
}

/** Pieces per carton for a product / variant, or null when cartons are not set up. */
export function cartonSize(product, variant) {
  const n = variant?.piecesPerCarton ?? product?.piecesPerCarton ?? null;
  return Number.isInteger(n) && n >= 2 ? n : null;
}

/** Units offered for a product / variant. */
export function unitsFor(product, variant) {
  if (product?.sellBy === "WEIGHT") return ["KG"];
  return cartonSize(product, variant) ? ["PIECE", "CARTON"] : ["PIECE"];
}

/**
 * Pieces per carton from a form or sheet: null when empty, else a whole number of 2 or more.
 * Throws a 400 for anything else.
 */
export function parsePiecesPerCarton(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 2 || n > 100000) {
    throw unitError("عدد القطع في الكرتونة يجب أن يكون عدداً صحيحاً 2 أو أكثر", "Pieces per carton must be a whole number of 2 or more");
  }
  return n;
}

/**
 * Converts one entered line to stock units.
 * `unit` missing keeps the old API meaning: `quantity` is already in stock units
 * (pieces, or grams for weight goods).
 * @returns {{ unit: "PIECE"|"CARTON"|"KG", enteredQty: string, piecesPerCarton: number|null, baseQty: number }}
 */
export function toBaseQuantity({ product, variant, unit, quantity, label }) {
  const name = label || product?.nameEn || product?.name || "";
  const weight = product?.sellBy === "WEIGHT";
  const raw = String(quantity ?? "").trim().replace(",", ".");
  const q = Number(raw);
  if (!raw || !Number.isFinite(q) || q <= 0) {
    throw unitError(`أدخل كمية أكبر من صفر: ${name}`, `Enter a quantity above zero: ${name}`);
  }
  const u = unit == null || unit === "" ? null : String(unit).toUpperCase();
  if (u != null && !STOCK_UNITS.includes(u)) {
    throw unitError(`وحدة غير معروفة: ${name}`, `Unknown unit: ${name}`);
  }
  if (weight) {
    if (u === null) {
      // Old callers send grams.
      if (!Number.isInteger(q)) throw unitError(`الكمية بالغرام يجب أن تكون عدداً صحيحاً: ${name}`, `Grams must be a whole number: ${name}`);
      return { unit: "KG", enteredQty: (q / 1000).toFixed(3), piecesPerCarton: null, baseQty: q };
    }
    if (u !== "KG") throw unitError(`هذا المنتج يُباع بالوزن، استخدم الكيلوغرام: ${name}`, `This product is sold by weight. Use kg: ${name}`);
    if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
      throw unitError(`الكيلوغرام بثلاث خانات عشرية كحد أقصى: ${name}`, `Use at most 3 decimals for kg: ${name}`);
    }
    const grams = Math.round(q * 1000);
    if (grams < 1) throw unitError(`أدخل كمية أكبر من صفر: ${name}`, `Enter a quantity above zero: ${name}`);
    return { unit: "KG", enteredQty: q.toFixed(3), piecesPerCarton: null, baseQty: grams };
  }
  if (u === "KG") throw unitError(`الكيلوغرام للمنتجات الموزونة فقط: ${name}`, `kg is only for goods sold by weight: ${name}`);
  if (!Number.isInteger(q)) {
    throw unitError(`الكمية يجب أن تكون عدداً صحيحاً: ${name}`, `Quantity must be a whole number: ${name}`);
  }
  if (u === "CARTON") {
    const size = cartonSize(product, variant);
    if (!size) throw unitError(`لم يُحدَّد عدد القطع في الكرتونة: ${name}`, `Pieces per carton is not set: ${name}`);
    return { unit: "CARTON", enteredQty: String(q), piecesPerCarton: size, baseQty: q * size };
  }
  return { unit: "PIECE", enteredQty: String(q), piecesPerCarton: null, baseQty: q };
}

/** Line label "Product (Variant)" in Arabic and English. */
export function lineNames(product, variant) {
  const ar = `${product?.name || product?.nameEn || ""}${variant ? ` (${variant.label || variant.labelEn || ""})` : ""}`;
  const en = `${product?.nameEn || product?.name || ""}${variant ? ` (${variant.labelEn || variant.label || ""})` : ""}`;
  return { ar, en };
}
