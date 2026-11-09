/**
 * Map API error codes (and common Arabic/English messages) to i18n keys.
 * Prefer server `code` when present.
 */
export function apiErrorMessage(err, t, fallbackKey = "errors.generic") {
  const code = err?.data?.code || err?.code;
  if (code && typeof t === "function") {
    const keyed = t(`errors.${code}`);
    if (keyed && keyed !== `errors.${code}`) return keyed;
  }

  const raw = String(err?.message || err?.data?.error || "").trim();
  if (!raw) return typeof t === "function" ? t(fallbackKey) : "Something went wrong";

  // Prefer English when the message is already English-looking
  if (/^[A-Za-z0-9]/.test(raw) && !/[\u0600-\u06FF]/.test(raw)) {
    return raw;
  }

  const known = {
    BRANCH_LIMIT: "errors.BRANCH_LIMIT",
    LAST_BRANCH: "errors.LAST_BRANCH",
    BRANCH_IN_USE: "errors.BRANCH_IN_USE",
    PLAN_LIMIT_TOO_LOW: "errors.PLAN_LIMIT_TOO_LOW",
  };
  if (code && known[code]) {
    return typeof t === "function" ? t(known[code]) : raw;
  }

  return typeof t === "function" ? t(fallbackKey) : "Something went wrong";
}
