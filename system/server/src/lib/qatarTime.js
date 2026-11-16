/** Qatar is UTC+3 all year (no daylight saving). Finance days are Qatar calendar days. */
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Start of the Qatar day for "YYYY-MM-DD", as a UTC instant. */
export function qatarDayStart(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_MS);
}

/** "YYYY-MM-DD" of the Qatar calendar day that contains this instant. */
export function qatarDayKey(date = new Date()) {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) of today in Qatar. */
export function qatarToday(now = new Date()) {
  const start = qatarDayStart(qatarDayKey(now));
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Start of the current Qatar month. */
export function qatarMonthStart(now = new Date()) {
  return qatarDayStart(`${qatarDayKey(now).slice(0, 7)}-01`);
}

/**
 * Date range from ?from=&to=. A plain day ("2026-11-16") means the whole Qatar day, so
 * from=to=2026-11-16 covers that day. A full timestamp is taken as given (inclusive end).
 * Returns { from, to } where `to` is EXCLUSIVE (use `lt`), or null when a date is invalid.
 */
export function qatarRange(query, { defaultFrom = qatarMonthStart() } = {}) {
  const rawFrom = query?.from ? String(query.from).trim() : "";
  const rawTo = query?.to ? String(query.to).trim() : "";
  let from = defaultFrom;
  let to = null;
  if (rawFrom) from = DAY_RE.test(rawFrom) ? qatarDayStart(rawFrom) : new Date(rawFrom);
  if (rawTo) {
    to = DAY_RE.test(rawTo) ? new Date(qatarDayStart(rawTo).getTime() + DAY_MS) : new Date(new Date(rawTo).getTime() + 1);
  } else {
    to = qatarToday().end;
  }
  if (Number.isNaN(from?.getTime?.()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}
