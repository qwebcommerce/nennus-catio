/**
 * NFR-13 — stale edits. Every editable record carries `version`; a save must name the
 * version it was loaded at and is applied as a conditional write, so a save from an
 * older copy is refused (409 STALE_EDIT) and the record is left unchanged.
 *
 * Internal writes never need the version: a DB trigger (migration 20261118101000)
 * bumps it on any UPDATE that does not move it itself.
 */

export const STALE_EDIT_AR = "تم تعديل هذا السجل من قِبل شخص آخر. أعد التحميل وحاول مرة أخرى.";
export const STALE_EDIT_EN = "This record was changed by someone else. Reload and try again.";
const VERSION_REQUIRED_AR = "نسخة السجل مطلوبة لحفظ التعديل. أعد التحميل وحاول مرة أخرى.";
const VERSION_REQUIRED_EN = "The record version is required to save an edit. Reload and try again.";

function apiErr(status, code, ar, en, extra = {}) {
  const err = new Error(ar);
  err.status = status;
  err.code = code;
  err.errorAr = ar;
  err.errorEn = en;
  err.extra = extra;
  return err;
}

export function staleEditError(currentVersion) {
  return apiErr(409, "STALE_EDIT", STALE_EDIT_AR, STALE_EDIT_EN, {
    currentVersion: currentVersion ?? null,
  });
}

export function isStaleEditError(e) {
  return e?.code === "STALE_EDIT" || e?.code === "VERSION_REQUIRED";
}

/** Version the client loaded: body `version`, else the `If-Match` header ("3", W/"3"). */
export function clientVersion(req) {
  let raw = req.body?.version;
  if (raw === undefined || raw === null || raw === "") raw = req.get?.("If-Match");
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(String(raw).replace(/^W\//i, "").replace(/"/g, "").trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The loaded version, or throws 428 VERSION_REQUIRED (edits without a version are refused). */
export function requireVersion(req) {
  const v = clientVersion(req);
  if (v == null) throw apiErr(428, "VERSION_REQUIRED", VERSION_REQUIRED_AR, VERSION_REQUIRED_EN);
  return v;
}

/** Cheap early refusal when the row we just read is already past the client's copy. */
export function assertVersion(existing, version) {
  if (existing && version != null && existing.version !== version) {
    throw staleEditError(existing.version);
  }
}

/**
 * Conditional write: `UPDATE ... SET ..., version = version + 1 WHERE id AND version`.
 * `where` adds guards (scope, status). `data` must hold scalar columns only (updateMany).
 * Count 0 → 404 if the row is gone, else 409 STALE_EDIT.
 * Returns the fresh row (with `include`/`select` when given).
 */
export async function versionedUpdate(db, model, { id, version, data = {}, where = {}, include, select }) {
  const r = await db[model].updateMany({
    where: { ...where, id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (r.count !== 1) {
    // Callers have already found the row in scope; a guard that no longer matches is a stale copy.
    const cur = await db[model].findUnique({ where: { id }, select: { version: true } });
    if (!cur) throw apiErr(404, "NOT_FOUND", "السجل غير موجود", "Record not found");
    throw staleEditError(cur.version);
  }
  return db[model].findUnique({
    where: { id },
    ...(include ? { include } : {}),
    ...(select ? { select } : {}),
  });
}
