/** Dates and times are shown in Qatar time and in the site's language, not the browser's. */
const TZ = "Asia/Qatar";

function intlLocale(locale) {
  return locale === "en" ? "en-GB" : "ar-QA";
}

function fmt(value, locale, options) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TZ, ...options }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatDateTime(value, locale) {
  return fmt(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value, locale) {
  return fmt(value, locale, { dateStyle: "medium" });
}

export function formatTime(value, locale) {
  return fmt(value, locale, { hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" of the Qatar day containing `value` (default now). */
export function qatarYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
