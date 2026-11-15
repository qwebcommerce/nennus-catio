import type { Locale } from "@nennus-catio/contracts";

/** ISO weekdays (1 = Monday … 7 = Sunday), listed Sunday first as the Qatar week starts. */
export const WEEK_ORDER = [7, 1, 2, 3, 4, 5, 6] as const;

const WEEKDAYS: Record<Locale, readonly string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
};

export function weekdayName(weekday: number, locale: Locale): string {
  return WEEKDAYS[locale][weekday - 1] ?? String(weekday);
}

/** Half-hour choices from 00:00 to 24:00 (24:00 = end of the day). */
export const TIME_CHOICES: readonly string[] = Array.from({ length: 49 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});

/** "Thursday, 8 Oct" for a Qatar date ("YYYY-MM-DD"). */
export function dateLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

export const timeRange = (start: string, end: string) => `${start}–${end}`;

/** Today's Qatar date ("YYYY-MM-DD"), for date pickers. */
export function qatarToday(now = new Date()): string {
  return new Date(now.getTime() + 180 * 60_000).toISOString().slice(0, 10);
}
