/**
 * Bilingual API error for the sales-order / payments code (the global error handler in app.js
 * answers it with `errorAr`, `errorEn` and `code`). Every pair is also listed in errorMessages.js.
 */
export function fail(status, code, errorAr, errorEn, extra) {
  const err = new Error(errorEn);
  err.status = status;
  err.code = code;
  err.errorAr = errorAr;
  err.errorEn = errorEn;
  if (extra) err.extra = extra;
  return err;
}

/** Trimmed optional text, cut to `max` characters; null when empty. */
export function optText(value, max = 500) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date "YYYY-MM-DD" (stored in @db.Date columns) or null. Throws on a bad value. */
export function optDate(value, field = "date") {
  if (value == null || value === "") return null;
  const s = String(value).trim().slice(0, 10);
  if (!DAY_RE.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
    throw fail(400, "DATE_INVALID", "تاريخ غير صالح", "Invalid date", { field });
  }
  return new Date(`${s}T00:00:00Z`);
}

/** "YYYY-MM-DD" of a @db.Date value. */
export function dayOf(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

/** A calendar day plus n days (UTC dates, as stored in @db.Date). */
export function addDays(day, n) {
  const base = day instanceof Date ? day : new Date(`${day}T00:00:00Z`);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + Number(n || 0)));
}
