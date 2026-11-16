/** Business time is Qatar local time (NFR-04), whatever the browser's time zone. */
export const QATAR_TZ = "Asia/Qatar";

export function qatarToday(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function qatarTime(value, locale) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(locale === "ar" ? "ar-QA" : "en-GB", { timeZone: QATAR_TZ, hour: "2-digit", minute: "2-digit" });
}

export function qatarDateTime(value, locale) {
  if (!value) return "";
  return new Date(value).toLocaleString(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "YYYY-MM-DDTHH:MM" in Qatar time, for a datetime-local field. */
export function toQatarInput(value) {
  if (!value) return "";
  return new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** Reads a datetime-local value as Qatar time and returns an ISO instant. */
export function fromQatarInput(text) {
  if (!text) return null;
  const d = new Date(`${text}:00.000+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
