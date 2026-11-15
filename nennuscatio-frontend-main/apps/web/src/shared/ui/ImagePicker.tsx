"use client";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { uploadImage } from "@/shared/api/admin-catalog";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "./BusinessUI";

/**
 * API mode (6b): the chosen file is uploaded, checked and re-encoded by the server, and its
 * address is used. Mock mode: the file is kept in the browser as before (demo only).
 */
function useImageFile(uploadPath?: string) {
  const c = useCopy();
  const { source } = useRepositories();
  const limitMb = source === "api" ? 5 : 3;
  async function read(file: File): Promise<string> {
    if (
      file.size > limitMb * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new Error(
        c.text(
          `Use a PNG, JPEG or WebP image under ${limitMb} MB.`,
          `استخدم صورة PNG أو JPEG أو WebP أصغر من ${limitMb} م.ب.`,
        ),
      );
    if (source === "api") return uploadImage(file, uploadPath);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Image could not be read."));
      reader.readAsDataURL(file);
    });
  }
  return { source, limitMb, read };
}

function failure(error: unknown, text: (en: string, ar: string) => string) {
  return error instanceof Error
    ? error.message
    : text("The image could not be uploaded.", "تعذّر رفع الصورة.");
}

export function ImagePicker({
  value,
  onChange,
  onError,
  uploadPath,
}: {
  value: string;
  onChange: (s: string) => void;
  onError: (s: string) => void;
  /** Where API mode uploads (default: the catalogue's `/api/admin/media`). */
  uploadPath?: string;
}) {
  const c = useCopy();
  const { source, limitMb, read } = useImageFile(uploadPath);
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <Field
        label={c.text(
          source === "api" ? "Image address (HTTPS) or upload below" : "Image URL (HTTPS) or local demo asset",
          source === "api" ? "عنوان الصورة (HTTPS) أو ارفعها أدناه" : "رابط صورة HTTPS أو صورة تجريبية",
        )}
      >
        <input
          value={value.startsWith("data:") ? "" : value}
          placeholder={c.text(
            "HTTPS URL or select file",
            "رابط HTTPS أو اختر ملفاً",
          )}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      <Field
        label={c.text(
          `Upload image · PNG, JPEG, WebP · up to ${limitMb} MB`,
          `ارفع صورة · PNG، JPEG، WebP · حتى ${limitMb} م.ب`,
        )}
      >
        <span className="row">
          <ImagePlus size={18} />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                onChange(await read(file));
                onError("");
              } catch (error: unknown) {
                onError(failure(error, c.text));
              } finally {
                setUploading(false);
                input.value = "";
              }
            }}
          />
          {uploading && (
            <span role="status" className="small muted">
              {c.text("Uploading…", "جارٍ الرفع…")}
            </span>
          )}
        </span>
      </Field>
    </>
  );
}

/**
 * Adds several gallery photos in one go (2026-10-07: one file per slot was too slow).
 * Files are uploaded one after another; only as many as still fit (`room`) are used.
 */
export function GalleryUpload({
  room,
  onAdd,
  onError,
}: {
  room: number;
  onAdd: (sources: string[]) => void;
  onError: (s: string) => void;
}) {
  const c = useCopy();
  const { limitMb, read } = useImageFile();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  return (
    <Field
      label={c.text(
        `Add photos · choose one or several · PNG, JPEG, WebP · up to ${limitMb} MB each`,
        `أضف صوراً · اختر صورة أو أكثر · PNG، JPEG، WebP · حتى ${limitMb} م.ب لكل صورة`,
      )}
    >
      <span className="row">
        <ImagePlus size={18} />
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          disabled={progress !== null || room < 1}
          onChange={async (e) => {
            const input = e.currentTarget;
            const chosen = Array.from(input.files ?? []);
            if (chosen.length === 0) return;
            const files = chosen.slice(0, room);
            const added: string[] = [];
            const problems: string[] = [];
            setProgress({ done: 0, total: files.length });
            for (const file of files) {
              try {
                added.push(await read(file));
              } catch (error: unknown) {
                problems.push(`${file.name}: ${failure(error, c.text)}`);
              }
              setProgress({ done: added.length + problems.length, total: files.length });
            }
            if (chosen.length > files.length)
              problems.push(
                c.text(
                  `Only ${room} more photo(s) fit (8 at most); the rest were not added.`,
                  `يتسع فقط لـ ${room} صورة إضافية (٨ كحد أقصى)؛ لم تُضف البقية.`,
                ),
              );
            if (added.length > 0) onAdd(added);
            onError(problems.join(" "));
            setProgress(null);
            input.value = "";
          }}
        />
        {progress && (
          <span role="status" className="small muted">
            {c.text(
              `Uploading ${progress.done + 1} of ${progress.total}…`,
              `جارٍ رفع ${progress.done + 1} من ${progress.total}…`,
            )}
          </span>
        )}
      </span>
    </Field>
  );
}
