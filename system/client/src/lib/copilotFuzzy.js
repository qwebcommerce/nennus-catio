/** Client-side fuzzy helpers for offline barcode miss (mirrors server fuzzyMatch). */

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = cur[j];
  }
  return prev[t.length];
}

function normCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function scoreCodeMatch(query, product) {
  const q = normCode(query);
  if (!q || !product) return 0;
  const barcode = normCode(product.barcode);
  const sku = normCode(product.sku);
  const name = String(product.name || "").toLowerCase();
  const nameEn = String(product.nameEn || "").toLowerCase();
  if (barcode === q || sku === q) return 100;
  let best = 0;
  for (const cand of [barcode, sku]) {
    if (!cand) continue;
    if (cand.includes(q) || q.includes(cand)) {
      best = Math.max(best, 82);
      continue;
    }
    const dist = levenshtein(q, cand);
    const maxLen = Math.max(q.length, cand.length) || 1;
    if (dist <= 2 && maxLen >= 4) best = Math.max(best, Math.max(40, 75 - dist * 12));
    else if (dist <= 3 && maxLen >= 8) best = Math.max(best, 48);
  }
  const qPlain = String(query || "").trim().toLowerCase();
  if (qPlain.length >= 2 && (name.includes(qPlain) || nameEn.includes(qPlain))) {
    best = Math.max(best, 70);
  }
  return best;
}

export function suggestProductsLocal(query, products, limit = 5) {
  const q = String(query || "").trim();
  if (!q || !Array.isArray(products)) return [];
  const scored = [];
  for (const p of products) {
    if (p?.isActive === false) continue;
    const score = scoreCodeMatch(q, p);
    if (score < 45) continue;
    scored.push({ product: p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.product);
}

export function assessDiscountRiskLocal(subtotal, discountAmount, hasReason) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const disc = Math.max(0, Number(discountAmount) || 0);
  const pct = sub > 0 ? Math.round((disc / sub) * 1000) / 10 : 0;
  const requireReason = disc > 0 && (pct >= 20 || disc >= 50) && !hasReason;
  const level =
    disc > sub + 0.009
      ? "CRITICAL"
      : pct >= 35
        ? "CRITICAL"
        : pct >= 20
          ? "WARN"
          : disc > 0
            ? "INFO"
            : null;
  return { pct, requireReason, level, canProceed: !requireReason && disc <= sub + 0.009 };
}
