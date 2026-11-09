const BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("token");
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

/** Prefer bilingual API error fields when present (Gulf AR/EN). */
export function resolveApiErrorMessage(data, fallback = "Request failed") {
  const locale = readUiLocale();
  if (data && typeof data === "object") {
    if (locale === "en" && data.errorEn) return String(data.errorEn);
    if (locale === "ar" && data.errorAr) return String(data.errorAr);
    if (data.error) return String(data.error);
  }
  return fallback;
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body,
    credentials: options.credentials ?? "same-origin",
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

/** تنزيل ملف ثنائي (مثل Excel) مع نفس التوكن */
export async function apiBlob(path) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
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
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(extraFields || {})) {
    if (v != null && String(v).trim() !== "") fd.append(k, String(v));
  }
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: fd,
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
  const token = getToken();
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const fd = new FormData();
  fd.append("file", file);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}${qs}`, {
    method: "POST",
    headers,
    body: fd,
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
