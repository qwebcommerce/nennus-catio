/** Lightweight string distance for barcode / SKU typo tolerance. */
export function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const cur = new Array(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j];
  }
  return prev[t.length - 1];
}

function normCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * Score how well a product matches a scanned/typed code (0–100).
 */
export function scoreCodeMatch(query, product) {
  const q = normCode(query);
  if (!q || !product) return 0;
  const barcode = normCode(product.barcode);
  const sku = normCode(product.sku);
  const name = String(product.name || "").toLowerCase();
  const nameEn = String(product.nameEn || "").toLowerCase();

  if (barcode && barcode === q) return 100;
  if (sku && sku === q) return 100;

  let best = 0;
  for (const cand of [barcode, sku]) {
    if (!cand) continue;
    if (cand.includes(q) || q.includes(cand)) {
      best = Math.max(best, 82);
      continue;
    }
    const dist = levenshtein(q, cand);
    const maxLen = Math.max(q.length, cand.length) || 1;
    if (dist <= 2 && maxLen >= 4) {
      const score = Math.round(75 - dist * 12 + (1 - dist / maxLen) * 10);
      best = Math.max(best, Math.max(40, score));
    } else if (dist <= 3 && maxLen >= 8) {
      best = Math.max(best, 48);
    }
  }

  const qPlain = String(query || "").trim().toLowerCase();
  if (qPlain.length >= 2) {
    if (name.includes(qPlain) || nameEn.includes(qPlain)) best = Math.max(best, 70);
  }
  return best;
}

/**
 * @param {string} query
 * @param {Array<object>} products
 * @param {{ limit?: number, minScore?: number }} [opts]
 */
export function suggestProductsForCode(query, products, opts = {}) {
  const limit = Math.min(8, Math.max(1, opts.limit ?? 5));
  const minScore = opts.minScore ?? 45;
  const q = String(query || "").trim();
  if (!q || !Array.isArray(products)) return [];

  const scored = [];
  for (const p of products) {
    if (p?.isActive === false) continue;
    const score = scoreCodeMatch(q, p);
    if (score < minScore) continue;
    scored.push({ product: p, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.product.name || "").localeCompare(String(b.product.name || "")));
  return scored.slice(0, limit);
}
