import { DOWNLOAD_MAX_DAYS, type DownloadFormat, type Locale, PDF_MAX_ROWS } from "@nennus-catio/contracts";
import { ApiError, toApiError } from "./client";

const ACCEPT: Readonly<Record<DownloadFormat, string>> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/**
 * A list's download (#12 part 2, D196) as CSV, Excel or PDF: `/api<path>/export.<format>` with the
 * list's filters (`search`, without pages). Excel and PDF come in the admin's language (`lang`); the CSV
 * is always English, so its address is the one it has always had. Read with fetch rather than the JSON
 * client; the same-origin `/api` rewrite sends the staff cookie. Returns the file and the server's name.
 */
export async function fetchDownload(
  path: string,
  format: DownloadFormat,
  search: string,
  locale: Locale,
  fetchImpl: typeof fetch = fetch,
): Promise<{ blob: Blob; filename: string }> {
  const query = format === "csv" ? search : [search, `lang=${locale}`].filter(Boolean).join("&");
  let response: Response;
  try {
    response = await fetchImpl(`/api${path}/export.${format}${query ? `?${query}` : ""}`, {
      credentials: "same-origin",
      headers: { Accept: ACCEPT[format] },
    });
  } catch {
    throw new ApiError("NETWORK", "The server could not be reached.");
  }
  if (!response.ok) throw await toApiError(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${path.split("/").pop() || "download"}.${format}`;
  return { blob: await response.blob(), filename };
}

/** Saves a downloaded file under the server's name. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** One readable line, in the admin's language, for a download that could not be made. */
export function describeDownloadError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("The download failed. Please try again.", "تعذّر التنزيل. يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "DOWNLOAD_BUSY":
      return text(
        "Another download is still being prepared. Please wait for it to finish, then try again.",
        "لا يزال تنزيل آخر قيد التجهيز. يرجى الانتظار حتى ينتهي ثم المحاولة مرة أخرى.",
      );
    case "TOO_MANY_ROWS":
      return text(
        `A PDF holds at most ${PDF_MAX_ROWS.toLocaleString("en")} rows. Narrow the filters, or download Excel.`,
        `يتسع ملف PDF لـ ${PDF_MAX_ROWS.toLocaleString("en")} صف كحد أقصى. ضيّق عوامل التصفية أو نزّل ملف Excel.`,
      );
    case "PDF_UNAVAILABLE":
      return text(
        "PDF files cannot be made on this server yet. Please download Excel or CSV.",
        "لا يمكن إنشاء ملفات PDF على هذا الخادم بعد. يرجى تنزيل Excel أو CSV.",
      );
    case "PDF_TIMEOUT":
      return text(
        "The PDF took too long to prepare. Narrow the filters, or download Excel.",
        "استغرق تجهيز ملف PDF وقتاً طويلاً. ضيّق عوامل التصفية أو نزّل ملف Excel.",
      );
    case "VALIDATION_FAILED":
      return error.fields.to
        ? text(
            `A download covers at most ${DOWNLOAD_MAX_DAYS} days. Please choose a shorter date range.`,
            `يغطي التنزيل ${DOWNLOAD_MAX_DAYS} يوماً كحد أقصى. يرجى اختيار فترة أقصر.`,
          )
        : text("Please check the filters.", "يرجى التحقق من عوامل التصفية.");
    case "FORBIDDEN":
      return text("Your role cannot download this.", "لا يسمح دورك بتنزيل هذا.");
    case "UNAUTHENTICATED":
      return text("Your session has ended. Please log in again.", "انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
