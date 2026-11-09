import { BusinessVertical } from "./prisma-client-bundle.js";

const ALLOWED = new Set(Object.values(BusinessVertical));

/** Must stay in sync with client MVP_ENABLED_VERTICAL_IDS */
export const MVP_ENABLED_VERTICAL_IDS = new Set([
  "GROCERY",
  "RETAIL_GENERAL",
]);

/**
 * @returns {string | null | undefined} قيمة صالحة، أو null إذا فارغ، أو undefined إذا غير مقبولة
 */
export function normalizeBusinessVertical(raw, { required = false, mvpOnly = false } = {}) {
  if (raw == null || String(raw).trim() === "") {
    return required ? undefined : null;
  }
  const v = String(raw).trim();
  if (!ALLOWED.has(v)) return undefined;
  if (mvpOnly && !MVP_ENABLED_VERTICAL_IDS.has(v)) return undefined;
  return v;
}

export function isMvpVerticalEnabled(id) {
  return MVP_ENABLED_VERTICAL_IDS.has(String(id || "").trim());
}
