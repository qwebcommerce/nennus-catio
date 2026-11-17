import { resolveApiErrorMessage } from "../api/client.js";

/**
 * The message for a failed API call, in the UI language: an i18n text for a known error
 * `code`, else the server's own bilingual message (errorAr / errorEn), else `fallbackKey`.
 */
export function apiErrorMessage(err, t, fallbackKey = "errors.generic") {
  const code = err?.data?.code || err?.code;
  if (code && typeof t === "function") {
    const keyed = t(`errors.${code}`);
    if (keyed && keyed !== `errors.${code}`) return keyed;
  }
  const fallback = typeof t === "function" ? t(fallbackKey) : undefined;
  if (err?.data && typeof err.data === "object") return resolveApiErrorMessage(err.data, fallback);
  // api() already resolved err.message to the UI language.
  return resolveApiErrorMessage({ error: String(err?.message || "").trim() || undefined }, fallback);
}
