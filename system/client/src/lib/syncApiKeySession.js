/** نسخة عرض فقط للمفتاح — لا يُرسل من الخادم بعد الحفظ */
const KEY = "petstore_pos_sync_api_key_v1";

export function getStoredSyncApiKey() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredSyncApiKey(plain) {
  try {
    if (plain != null && String(plain).trim()) {
      sessionStorage.setItem(KEY, String(plain).trim());
    }
  } catch {
    /* ignore */
  }
}

export function clearStoredSyncApiKey() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
