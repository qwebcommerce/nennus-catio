/**
 * Supabase Storage (agreement 8.1 / 8.3): product images in a public bucket, relocation documents
 * in a private bucket. Server only: the service-role key never leaves this process.
 * Without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY everything stays in the database (storageEnabled() false).
 */
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const RELOCATION_DOCUMENTS_BUCKET = "relocation-documents";
/** Private: evidence photos of van returns (WebP, re-encoded, no metadata). */
export const VAN_RETURN_PHOTOS_BUCKET = "van-return-photos";
/** Private: proof of van-return payments (WebP images or PDF). */
export const VAN_RETURN_PROOFS_BUCKET = "van-return-proofs";
/** Largest relocation document accepted (direct upload). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Lifetime of a Supabase signed download URL. */
export const SIGNED_DOWNLOAD_SECONDS = 60;

const BUCKET_OPTIONS = {
  [PRODUCT_IMAGES_BUCKET]: {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  },
  [RELOCATION_DOCUMENTS_BUCKET]: {
    public: false,
    fileSizeLimit: DOCUMENT_MAX_BYTES,
    // octet-stream: legacy database documents that are not PDF/JPEG/PNG (always downloaded as attachments).
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "application/octet-stream"],
  },
  [VAN_RETURN_PHOTOS_BUCKET]: {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/webp"],
  },
  [VAN_RETURN_PROOFS_BUCKET]: {
    public: false,
    fileSizeLimit: 6 * 1024 * 1024,
    allowedMimeTypes: ["image/webp", "application/pdf"],
  },
};

function clean(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
  return s.replace(/\/+$/, "");
}

function supabaseUrl() {
  return clean(process.env.SUPABASE_URL);
}

export function storageEnabled() {
  return Boolean(supabaseUrl() && clean(process.env.SUPABASE_SERVICE_ROLE_KEY));
}

let cached = null;
function client() {
  if (!storageEnabled()) throw storageError("File storage is not configured");
  const key = `${supabaseUrl()}|${clean(process.env.SUPABASE_SERVICE_ROLE_KEY)}`;
  if (cached?.key !== key) {
    cached = {
      key,
      client: createClient(supabaseUrl(), clean(process.env.SUPABASE_SERVICE_ROLE_KEY), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
      buckets: new Map(),
    };
  }
  return cached;
}

function storageError(en, cause) {
  const err = new Error(en);
  err.status = 502;
  err.errorEn = en;
  err.errorAr = "تعذّر الوصول إلى خدمة تخزين الملفات، حاول مرة أخرى";
  if (cause) err.cause = cause;
  return err;
}

function failed(action, error) {
  console.error(`[storage] ${action}:`, error?.message || error);
  return storageError("File storage is not available. Try again.", error);
}

/** Creates the bucket if it does not exist yet (idempotent, once per process). */
export function ensureBucket(name) {
  const state = client();
  if (!state.buckets.has(name)) {
    const run = (async () => {
      const storage = state.client.storage;
      const found = await storage.getBucket(name);
      if (!found.error && found.data) return true;
      const made = await storage.createBucket(name, BUCKET_OPTIONS[name]);
      if (made.error && !/exist|duplicate|409/i.test(`${made.error.message} ${made.error.statusCode || ""} ${made.error.status || ""}`)) {
        throw failed(`create bucket ${name}`, made.error);
      }
      return true;
    })();
    state.buckets.set(name, run);
    run.catch(() => state.buckets.delete(name));
  }
  return state.buckets.get(name);
}

async function bucket(name) {
  await ensureBucket(name);
  return client().client.storage.from(name);
}

/** Collision-resistant, cuid-style id (letters and digits only). */
export function newObjectId() {
  return `c${Date.now().toString(36)}${crypto.randomBytes(10).toString("hex")}`;
}

/** `<organizationId>/<cuid>.<ext>` — the user's file name is never part of the key. */
export function objectKey(organizationId, ext) {
  const org = String(organizationId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeExt = String(ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  if (!org) throw new Error("organizationId is required for a storage key");
  return `${org}/${newObjectId()}.${safeExt}`;
}

export async function uploadObject(bucketName, key, buffer, contentType, { upsert = false } = {}) {
  const from = await bucket(bucketName);
  const { error } = await from.upload(key, buffer, {
    contentType,
    upsert,
    cacheControl: bucketName === PRODUCT_IMAGES_BUCKET ? "31536000" : "0",
  });
  if (error) throw failed(`upload ${bucketName}/${key}`, error);
  return key;
}

export function publicObjectUrl(bucketName, key) {
  return client().client.storage.from(bucketName).getPublicUrl(key).data.publicUrl;
}

/** Key of a product image in our public bucket, from its public URL (null for any other URL). */
export function productImageKeyFromUrl(url) {
  if (!storageEnabled() || !url) return null;
  const prefix = `${supabaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const s = String(url).trim();
  if (!s.startsWith(prefix)) return null;
  const key = decodeURIComponent(s.slice(prefix.length).split(/[?#]/)[0]);
  return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9]+\.[a-z0-9]+$/.test(key) ? key : null;
}

/** Best effort: a failure is logged, never thrown (the database change already happened). */
export async function removeObjects(bucketName, keys) {
  const list = [...new Set((keys || []).filter(Boolean))];
  if (!list.length || !storageEnabled()) return 0;
  try {
    const from = await bucket(bucketName);
    const { error } = await from.remove(list);
    if (error) throw error;
    return list.length;
  } catch (e) {
    console.error(`[storage] remove ${bucketName} (${list.length}):`, e?.message || e);
    return 0;
  }
}

/** Object bytes, or null when the object does not exist. */
export async function downloadObject(bucketName, key) {
  const from = await bucket(bucketName);
  const { data, error } = await from.download(key);
  if (error) {
    const status = Number(error.status || error.statusCode || error.originalError?.status || 0);
    if (status === 404 || status === 400 || /not.?found/i.test(String(error.message))) return null;
    throw failed(`download ${bucketName}/${key}`, error);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Signed GET URL; with fileName the response is an attachment under that name. */
export async function signedDownloadUrl(bucketName, key, fileName, seconds = SIGNED_DOWNLOAD_SECONDS) {
  const from = await bucket(bucketName);
  const { data, error } = await from.createSignedUrl(key, seconds);
  if (error || !data?.signedUrl) throw failed(`sign ${bucketName}/${key}`, error);
  // `download` is added here, not through supabase-js: it runs encodeURI over an already encoded
  // query, so names with "(", "&", Arabic letters … would arrive double-encoded. The token signs the
  // object path only, so this parameter is free to set.
  if (!fileName) return data.signedUrl;
  return `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
}

/** Signed upload URL for a key the server chose (the browser PUTs the file there). */
export async function signedUploadUrl(bucketName, key) {
  const from = await bucket(bucketName);
  const { data, error } = await from.createSignedUploadUrl(key);
  if (error || !data?.signedUrl) throw failed(`sign upload ${bucketName}/${key}`, error);
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}
