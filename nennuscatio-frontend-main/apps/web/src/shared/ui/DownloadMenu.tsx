"use client";

import { DOWNLOAD_FORMATS, type DownloadFormat } from "@nennus-catio/contracts";
import { Download } from "lucide-react";
import { useState } from "react";
import {
  describeDownloadError,
  fetchDownload,
  saveFile,
} from "@/shared/api/downloads";
import { useCopy } from "@/shared/lib/copy";

const FORMAT_NAMES: Readonly<Record<DownloadFormat, string>> = {
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
};

export interface DownloadMenuProps {
  /** The download's address under `/api`, without `export.<format>`: "/admin/orders". */
  path: string;
  /** The list's filters, without pages. */
  search?: string;
  /** Shows why a download failed where the page shows its messages; "" clears it. */
  onError: (message: string) => void;
  disabled?: boolean;
  /** Each button's spoken name, from the format's name: "Download CSV" by default. */
  name?: (format: string) => string;
  /** The smaller size that sits in a list's toolbar (Finance). */
  compact?: boolean;
}

/**
 * A list's downloads (#12 part 2, D196): CSV, Excel and PDF, made by the server from the same rows,
 * Excel and PDF in the admin's language. One download at a time, as the server allows one per staff
 * member: the three buttons wait while one is prepared.
 */
export function DownloadMenu({
  path,
  search = "",
  onError,
  disabled = false,
  name,
  compact = false,
}: DownloadMenuProps) {
  const c = useCopy();
  const [busy, setBusy] = useState<DownloadFormat | null>(null);
  const spoken =
    name ??
    ((format: string) => c.text(`Download ${format}`, `تنزيل ${format}`));

  async function run(format: DownloadFormat) {
    setBusy(format);
    onError("");
    try {
      const { blob, filename } = await fetchDownload(
        path,
        format,
        search,
        c.locale,
      );
      saveFile(blob, filename);
    } catch (error) {
      onError(describeDownloadError(error, c.text));
    } finally {
      setBusy(null);
    }
  }

  return (
    <fieldset
      className={`download-menu${compact ? " download-menu--compact" : ""}`}
      aria-label={c.text("Download", "تنزيل")}
    >
      {/* The row does the layout: Chrome does not lay out a fieldset's own content as a stretched flex row. */}
      <div className="download-menu__row">
        <span className="download-menu__label" aria-hidden="true">
          <Download size={compact ? 13 : 15} />
          {c.text("Download", "تنزيل")}
        </span>
        {DOWNLOAD_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            className="download-menu__button"
            disabled={disabled || busy !== null}
            aria-label={
              busy === format
                ? c.text(
                    `Preparing ${FORMAT_NAMES[format]}…`,
                    `جارٍ تجهيز ${FORMAT_NAMES[format]}…`,
                  )
                : spoken(FORMAT_NAMES[format])
            }
            onClick={() => void run(format)}
          >
            {busy === format
              ? `${FORMAT_NAMES[format]}…`
              : FORMAT_NAMES[format]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
