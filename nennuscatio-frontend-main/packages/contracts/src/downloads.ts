import { z } from "zod";

/**
 * Data downloads (#12 part 2, D196, answers 5A-7A). Every download comes as CSV, Excel and PDF, made on
 * the server from the same rows. CSV stays in English; Excel and PDF use the staff member's admin
 * language. Each download needs its page's Export permission and is audited.
 */
export const DOWNLOAD_FORMATS = ["csv", "xlsx", "pdf"] as const;
export const downloadFormatSchema = z.enum(DOWNLOAD_FORMATS);
export type DownloadFormat = z.infer<typeof downloadFormatSchema>;

/** The longest date range one download may cover, in days, when it has one (Orders, Bookings, Finance). */
export const DOWNLOAD_MAX_DAYS = 366;
/** A PDF holds at most this many rows (answer 6A, about 50 pages); for more, narrow the filters or use Excel. */
export const PDF_MAX_ROWS = 2000;

/** The language of an Excel or PDF file: `?lang=ar` for Arabic, English otherwise. */
export function downloadLocale(value: unknown): "en" | "ar" {
  return value === "ar" ? "ar" : "en";
}
