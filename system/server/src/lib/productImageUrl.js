/** إزالة مسافات وعلامات اقتباس زائدة من قيم .env */
function cleanEnvUrl(v) {
  if (v == null) return "";
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
 * يحوّل قيمة imageUrl المخزّنة إلى رابط يعمل في المتصفح.
 * يدعم: روابط كاملة https، مسارات نسبية مع PUBLIC_IMAGE_BASE_URL أو SUPABASE_PUBLIC_IMAGE_PREFIX
 */
export function resolveStoredImageUrl(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(s)) return s.slice(0, 2000);
  if (s.startsWith("//")) return s.slice(0, 2000);
  if (s.startsWith("data:") || s.startsWith("blob:")) return s.slice(0, 2000);
  // DB-backed product images — keep API path (client fetches with auth)
  if (s.startsWith("/api/product-images/")) return s.slice(0, 200);
  const prefix =
    cleanEnvUrl(process.env.SUPABASE_PUBLIC_IMAGE_PREFIX) ||
    cleanEnvUrl(process.env.PUBLIC_IMAGE_BASE_URL);
  if (prefix) {
    return `${prefix}/${s.replace(/^\/+/, "")}`.slice(0, 2000);
  }
  return s.slice(0, 2000);
}

/** للتشخيص أو الواجهات الإدارية — هل البادئة مفعّلة؟ */
export function hasPublicImageBaseConfigured() {
  return Boolean(
    cleanEnvUrl(process.env.SUPABASE_PUBLIC_IMAGE_PREFIX) ||
      cleanEnvUrl(process.env.PUBLIC_IMAGE_BASE_URL)
  );
}
