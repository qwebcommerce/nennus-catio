/**
 * Bilingual API error helper for Gulf (Arabic + English).
 * `error` stays Arabic for backward compatibility with older clients.
 */
export function sendError(res, status, ar, en, extra = {}) {
  return res.status(status).json({
    error: ar,
    errorAr: ar,
    errorEn: en || ar,
    ...extra,
  });
}

export function httpError(status, ar, en) {
  const err = new Error(ar);
  err.status = status;
  err.errorAr = ar;
  err.errorEn = en || ar;
  return err;
}
