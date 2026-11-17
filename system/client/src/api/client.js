const BASE = import.meta.env.VITE_API_URL || "";

/**
 * Sessions are httpOnly cookies set by the server (NFR-11): page scripts never see the token.
 * Every request sends credentials and the X-Requested-With header (CSRF guard on the server).
 */
function baseHeaders(extra) {
  const headers = new Headers(extra || {});
  if (!headers.has("X-Requested-With")) headers.set("X-Requested-With", "XMLHttpRequest");
  return headers;
}

/** Remove the legacy localStorage tokens left by older builds. */
try {
  localStorage.removeItem("token");
  localStorage.removeItem("nennus.shopToken");
} catch {
  /* ignore */
}

function readUiLocale() {
  try {
    const s = localStorage.getItem("petstore-lang");
    if (s === "ar" || s === "en") return s;
  } catch {
    /* ignore */
  }
  return "ar";
}

const ARABIC = /[\u0600-\u06FF]/;
const GENERIC_ERROR = { ar: "تعذّر إتمام الطلب.", en: "The request could not be completed." };

/** Is `text` written in the UI language (Arabic letters for ar, none for en)? */
function inLocale(text, locale) {
  return locale === "ar" ? ARABIC.test(text) : !ARABIC.test(text);
}

/**
 * The server's error message in the UI language. The API sends `errorAr` and `errorEn` with
 * every error; `error` (one language only) is the fallback for older responses. Text in the
 * other language is never shown: a generic message in the UI language is used instead.
 */
export function resolveApiErrorMessage(data, fallback) {
  const locale = readUiLocale();
  if (data && typeof data === "object") {
    if (locale === "en" && data.errorEn) return String(data.errorEn);
    if (locale === "ar" && data.errorAr) return String(data.errorAr);
    if (data.error && inLocale(String(data.error), locale)) return String(data.error);
  }
  if (fallback && inLocale(String(fallback), locale)) return String(fallback);
  return GENERIC_ERROR[locale] || GENERIC_ERROR.en;
}

/** A row-level message ({ message, messageAr, messageEn }, e.g. import results) in the UI language. */
export function resolveRowMessage(row) {
  const locale = readUiLocale();
  if (!row || typeof row !== "object") return "";
  if (locale === "en" && row.messageEn) return String(row.messageEn);
  if (locale === "ar" && row.messageAr) return String(row.messageAr);
  return String(row.message || "");
}

/**
 * NFR-13: an edit saved from an older copy of a record is refused with 409 STALE_EDIT
 * (or 428 VERSION_REQUIRED when no version was sent). Forms reload the record on it.
 */
export function isStaleEdit(err) {
  return err?.code === "STALE_EDIT" || err?.code === "VERSION_REQUIRED";
}

/** The message to show for a failed save: the bilingual stale-edit notice, else the server message. */
export function editErrorMessage(err, t) {
  return isStaleEdit(err) ? t("common.staleEdit") : err?.message || String(err);
}

export async function api(path, options = {}) {
  const headers = baseHeaders(options.headers);
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body,
    credentials: "include",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(resolveApiErrorMessage(data, res.statusText || "Request failed"));
    err.status = res.status;
    err.data = data;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/** تنزيل ملف ثنائي (مثل Excel) بجلسة الكوكي */
export async function apiBlob(path) {
  const res = await fetch(`${BASE}${path}`, { headers: baseHeaders(), credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    const err = new Error(resolveApiErrorMessage(data, res.statusText || "Download failed"));
    err.status = res.status;
    err.data = data;
    err.code = data?.code;
    throw err;
  }
  return res.blob();
}

/** رفع ملف صورة منتج (يُخزَّن في قاعدة البيانات) */
export async function apiUploadImage(path, file, extraFields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(extraFields || {})) {
    if (v != null && String(v).trim() !== "") fd.append(k, String(v));
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: baseHeaders(),
    body: fd,
    credentials: "include",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(resolveApiErrorMessage(data, res.statusText || "Upload failed"));
    err.status = res.status;
    err.data = data;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/** رفع ملف Excel للاستيراد — branchId مطلوب في الاستعلام */
export async function apiUploadExcel(path, file, branchId) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}${path}${qs}`, {
    method: "POST",
    headers: baseHeaders(),
    body: fd,
    credentials: "include",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(resolveApiErrorMessage(data, res.statusText || "Upload failed"));
    err.status = res.status;
    err.data = data;
    err.code = data?.code;
    throw err;
  }
  return data;
}
