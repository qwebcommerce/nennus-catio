import type { Locale } from "@nennus-catio/contracts";

export function formatMoney(minorUnits: number, locale: Locale): string {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0)
    throw new RangeError("Money must be non-negative integer minor units");
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", {
    style: "currency",
    currency: "QAR",
  }).format(minorUnits / 100);
}
/**
 * A discount, as an amount taken off: "− QAR 6.35" (11e). Money itself is never negative, so the amount is
 * checked as usual. Arabic uses its own negative form, whose direction marks keep the minus sign at the
 * start of the amount in right-to-left text (a plain minus in front ends up after it).
 */
export function formatDiscount(minorUnits: number, locale: Locale): string {
  const amount = formatMoney(minorUnits, locale);
  if (locale === "ar" && minorUnits > 0) {
    return new Intl.NumberFormat("ar-QA", { style: "currency", currency: "QAR" }).format(-minorUnits / 100);
  }
  return `\u2212\u00a0${amount}`;
}
/**
 * Money that can be below zero: a finance net figure, when a day's refunds are more than its payments
 * (#12). "−QAR 45.00" in English; Arabic uses its own negative form, as `formatDiscount` does.
 */
export function formatSignedMoney(minorUnits: number, locale: Locale): string {
  if (minorUnits >= 0) return formatMoney(minorUnits, locale);
  if (locale === "ar") return new Intl.NumberFormat("ar-QA", { style: "currency", currency: "QAR" }).format(minorUnits / 100);
  return `−${formatMoney(-minorUnits, locale)}`;
}
export function formatQatarDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-QA", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
  }).format(new Date(iso));
}

/**
 * A Qatar clock time ("HH:MM"; "24:00" is the midnight that ends a day) as customers read it, in the
 * 12-hour form (D249): "10:30 AM", "01:00 PM"; in Arabic "١٠:٣٠ ص" with Arabic digits, as the site's
 * Arabic money and dates use. Staff pages keep the 24-hour "10:30".
 */
export function formatClock(time: string, locale: Locale): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const afternoon = hours >= 12 && hours < 24;
  const two = (value: number) =>
    locale === "ar" ? new Intl.NumberFormat("ar-QA", { minimumIntegerDigits: 2, useGrouping: false }).format(value) : String(value).padStart(2, "0");
  const clock = `${two(hours % 12 || 12)}:${two(minutes)}`;
  return locale === "ar" ? `${clock} ${afternoon ? "م" : "ص"}` : `${clock} ${afternoon ? "PM" : "AM"}`;
}

/**
 * A name or code kept whole inside a sentence of the other direction (an English key name or a POS
 * code in Arabic): Unicode's first-strong isolate, as `<bdi>` does in markup. For plain strings only,
 * such as dialog titles and messages; markup uses `<bdi>`.
 */
export function isolate(text: string): string {
  return String.fromCharCode(0x2068) + text + String.fromCharCode(0x2069);
}

/** An instant as staff pages show it, in Qatar time with the 24-hour clock (D249): "26 Oct 2026, 14:05". */
export function formatStaffDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** The Qatar clock time ("HH:MM", 24-hour) of an instant, for `formatClock`. */
export function qatarClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Qatar" }).format(new Date(iso));
}

/** "Saturday 17 October" for a Qatar date ("YYYY-MM-DD"). */
export function formatQatarDay(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Qatar",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

/** "10:30 AM – 11:15 AM" for customers; the start alone when there is no end (a home visit's arrival). */
export function formatClockRange(start: string, end: string | null, locale: Locale): string {
  return end ? `${formatClock(start, locale)} – ${formatClock(end, locale)}` : formatClock(start, locale);
}
