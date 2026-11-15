import type { Locale } from "@nennus-catio/contracts";
import { formatClock, formatQatarDate, qatarClock } from "@/shared/lib/format";

type Text = (en: string, ar: string) => string;

/** "2 years 3 months" (as the booking page words a pet's age). */
export function petAgeText(ageMonths: number, text: Text): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return [
    years > 0 ? text(`${years} year${years === 1 ? "" : "s"}`, `${years} سنة`) : "",
    months > 0 || years === 0 ? text(`${months} month${months === 1 ? "" : "s"}`, `${months} شهراً`) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "4.5 kg" from grams. */
export function weightText(grams: number, locale: Locale): string {
  const kg = new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", { maximumFractionDigits: 3 }).format(grams / 1000);
  return locale === "ar" ? `${kg} كغ` : `${kg} kg`;
}

/** "1.2 MB", "350 KB". */
export function fileSizeText(bytes: number, locale: Locale): string {
  const number = (value: number) => new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", { maximumFractionDigits: 1 }).format(value);
  if (bytes >= 1024 * 1024) return locale === "ar" ? `${number(bytes / (1024 * 1024))} ميغابايت` : `${number(bytes / (1024 * 1024))} MB`;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return locale === "ar" ? `${number(kb)} كيلوبايت` : `${number(kb)} KB`;
}

/** "21 Oct 2026, 03:15 PM" in Qatar time: customers read 12-hour times (D250). */
export function whenText(iso: string, locale: Locale): string {
  return `${formatQatarDate(iso, locale)}${locale === "ar" ? "،" : ","} ${formatClock(qatarClock(iso), locale)}`;
}

/** "17 October 2027" for a Qatar date ("YYYY-MM-DD"), with the year: a move can be months away. */
export function dayText(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Qatar" }).format(
    new Date(`${date}T12:00:00+03:00`),
  );
}

/** Today's date in Qatar ("YYYY-MM-DD"): the earliest planned date the form offers. */
export function qatarToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Qatar" }).format(now);
}
