/**
 * Product / sale-line modifiers: [{ key, label, labelAr?, priceDelta }]
 */

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Normalize catalog modifiers for Product.modifiers (null = clear / empty). */
export function normalizeProductModifiers(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const m of raw) {
    const key = String(m?.key || "")
      .trim()
      .slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const priceDelta = roundMoney(Number(m?.priceDelta) || 0);
    out.push({
      key,
      label: String(m?.label || key)
        .trim()
        .slice(0, 80),
      labelAr: m?.labelAr
        ? String(m.labelAr)
            .trim()
            .slice(0, 80)
        : null,
      priceDelta,
    });
  }
  return out.length ? out : null;
}

/** Catalog list from a product row. */
export function catalogModifiers(product) {
  return normalizeProductModifiers(product?.modifiers) || [];
}

/**
 * Resolve selected keys against product catalog.
 * @returns {{ selected: object[], delta: number }}
 */
export function resolveLineModifiers(product, selectedKeys) {
  const catalog = catalogModifiers(product);
  if (!catalog.length) return { selected: [], delta: 0 };
  const byKey = new Map(catalog.map((m) => [m.key, m]));
  const keys = Array.isArray(selectedKeys)
    ? selectedKeys.map((k) => String(k?.key || k || "").trim()).filter(Boolean)
    : [];
  const selected = [];
  let delta = 0;
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const m = byKey.get(key);
    if (!m) continue;
    selected.push(m);
    delta = roundMoney(delta + m.priceDelta);
  }
  return { selected, delta };
}
