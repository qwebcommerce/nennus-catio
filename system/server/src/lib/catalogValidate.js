/** Shared catalog field validation (server). */

const NAME_MIN = 2;
const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 40;
/** Letters (any script), numbers, spaces, hyphen, underscore, slash, & . ( ) */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\s\-_/&.()]*$/u;
/** SKU: start alphanumeric; then alnum . _ - */
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function collapseSpaces(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCatalogName(raw, label = "Name") {
  const name = collapseSpaces(raw);
  if (!name) return { ok: false, error: `${label} is required` };
  if (name.length < NAME_MIN) {
    return { ok: false, error: `${label} must be at least ${NAME_MIN} characters` };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `${label} must be at most ${NAME_MAX} characters` };
  }
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      error: `${label} may only use letters, numbers, spaces, and - _ / & . ( )`,
    };
  }
  if (!/\p{L}/u.test(name)) {
    return { ok: false, error: `${label} must include at least one letter` };
  }
  return { ok: true, value: name };
}

export function validateSkuCode(raw) {
  const code = String(raw || "").trim();
  if (!code) return { ok: false, error: "SKU code is required" };
  if (code.length < SKU_MIN) {
    return { ok: false, error: `SKU must be at least ${SKU_MIN} characters` };
  }
  if (code.length > SKU_MAX) {
    return { ok: false, error: `SKU must be at most ${SKU_MAX} characters` };
  }
  if (!SKU_RE.test(code)) {
    return {
      ok: false,
      error: "SKU may only use letters, numbers, dot, underscore, and hyphen",
    };
  }
  return { ok: true, value: code };
}

export function validateOptionalLabel(raw) {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  const v = validateCatalogName(raw, "Label");
  if (!v.ok) return v;
  return { ok: true, value: v.value };
}

export function normKey(s) {
  return collapseSpaces(s).toLowerCase();
}
