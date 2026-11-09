/** Client-side catalog validation (mirrors server rules). */

const NAME_MIN = 2;
const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 40;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\s\-_/&.()]*$/u;
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function collapseSpaces(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normKey(s) {
  return collapseSpaces(s).toLowerCase();
}

export function validateCatalogName(raw, t, labelKey = "catalog.name") {
  const name = collapseSpaces(raw);
  if (!name) return { ok: false, error: t("catalog.errNameRequired") };
  if (name.length < NAME_MIN) return { ok: false, error: t("catalog.errNameShort") };
  if (name.length > NAME_MAX) return { ok: false, error: t("catalog.errNameLong") };
  if (!NAME_RE.test(name) || !/\p{L}/u.test(name)) {
    return { ok: false, error: t("catalog.errNameChars") };
  }
  return { ok: true, value: name };
}

export function validateSkuCode(raw, t) {
  const code = String(raw || "").trim();
  if (!code) return { ok: false, error: t("catalog.errSkuRequired") };
  if (code.length < SKU_MIN) return { ok: false, error: t("catalog.errSkuShort") };
  if (code.length > SKU_MAX) return { ok: false, error: t("catalog.errSkuLong") };
  if (!SKU_RE.test(code)) return { ok: false, error: t("catalog.errSkuChars") };
  return { ok: true, value: code };
}

export function validateOptionalLabel(raw, t) {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  return validateCatalogName(raw, t);
}
