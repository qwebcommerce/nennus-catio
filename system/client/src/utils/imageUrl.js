function cleanViteBase(v) {
  if (v == null || v === "") return "";
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\/$/, "");
}

/**
 * يطابق منطق الخادم: إكمال المسارات النسبية.
 * استخدم VITE_IMAGE_URL_PREFIX أو VITE_PUBLIC_IMAGE_BASE_URL (نفس قيمة PUBLIC_IMAGE_BASE_URL على السيرفر إن لزم).
 */
export function resolveImageUrlForDisplay(raw) {
  if (raw == null) return "";
  let s = String(raw).trim().replace(/\\/g, "/");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  // Authenticated DB image API — resolve against API base, not CDN prefix
  if (s.startsWith("/api/product-images/")) {
    const apiBase = cleanViteBase(import.meta.env.VITE_API_URL);
    return apiBase ? `${apiBase}${s}` : s;
  }
  const prefix =
    cleanViteBase(import.meta.env.VITE_IMAGE_URL_PREFIX) ||
    cleanViteBase(import.meta.env.VITE_PUBLIC_IMAGE_BASE_URL);
  if (prefix) return `${prefix}/${s.replace(/^\/+/, "")}`;
  return s;
}

/**
 * يحوّل data URL (base64) إلى blob: object URL — يُستدعى revoke عند unmount.
 * @returns {string | null}
 */
export function dataUrlToObjectUrl(dataUrl) {
  if (dataUrl == null || typeof dataUrl !== "string") return null;
  const s = dataUrl.trim();
  if (!s.startsWith("data:")) return null;
  const comma = s.indexOf(",");
  if (comma === -1) return null;
  const header = s.slice(5, comma);
  const payload = s.slice(comma + 1).replace(/\s/g, "");
  const mime = header.split(";")[0]?.trim() || "image/jpeg";
  if (!/;base64/i.test(header) && !header.includes("base64")) {
    try {
      const decoded = decodeURIComponent(payload);
      return URL.createObjectURL(new Blob([decoded], { type: mime }));
    } catch {
      return null;
    }
  }
  try {
    const binary = atob(payload);
    const len = binary.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch {
    return null;
  }
}
