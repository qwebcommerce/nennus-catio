import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function clean(v) {
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

/** Cloudflare R2 is S3-compatible. */
export function isR2Configured() {
  return Boolean(
    clean(process.env.R2_ACCOUNT_ID) &&
      clean(process.env.R2_ACCESS_KEY_ID) &&
      clean(process.env.R2_SECRET_ACCESS_KEY) &&
      clean(process.env.R2_BUCKET) &&
      clean(process.env.R2_PUBLIC_BASE_URL)
  );
}

let cachedClient = null;

function getR2Client() {
  if (!isR2Configured()) {
    const err = new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL."
    );
    err.status = 503;
    throw err;
  }
  if (cachedClient) return cachedClient;
  const accountId = clean(process.env.R2_ACCOUNT_ID);
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: clean(process.env.R2_ACCESS_KEY_ID),
      secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY),
    },
  });
  return cachedClient;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extForMime(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/**
 * Upload a product image buffer to R2.
 * @returns {{ url: string, key: string }}
 */
export async function uploadProductImageBuffer({
  buffer,
  contentType,
  organizationId,
  originalName,
}) {
  if (!buffer?.length) {
    const err = new Error("Empty image file");
    err.status = 400;
    throw err;
  }
  const mime = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME.has(mime)) {
    const err = new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
    err.status = 400;
    throw err;
  }
  const client = getR2Client();
  const bucket = clean(process.env.R2_BUCKET);
  const publicBase = clean(process.env.R2_PUBLIC_BASE_URL);
  const org = String(organizationId || "org").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "org";
  const baseName =
    String(originalName || "image")
      .replace(/\.(jpe?g|png|webp|gif)$/i, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40) || "image";
  const key = `products/${org}/${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}.${extForMime(mime)}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const url = `${publicBase}/${key}`;
  return { url, key };
}
