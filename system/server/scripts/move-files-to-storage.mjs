/**
 * Copies files still kept in Postgres (bytea) into Supabase Storage (agreement 8.1):
 *  - ProductImage.data          -> public bucket "product-images"; every URL that pointed at the image's
 *                                  API path (/api/product-images/<id>) is rewritten to the public URL:
 *                                  Product.imageUrl, Product.gallery[] and held-cart snapshots (HeldCart.payload).
 *  - RelocationDocument.content -> private bucket "relocation-documents"; storagePath + size are set,
 *                                  so downloads go through a 60-second signed URL from then on.
 *
 * Idempotent and batched: rows already moved (storagePath set) are skipped, object keys are
 * deterministic (<organizationId>/<row id>.<ext>, the row id is a cuid) and written with upsert, so a
 * re-run or two runs at once never move anything twice. The bytea data is NOT deleted (that cleanup is a
 * later step, after the owner confirms). Exit code 0 even when some files fail; they stay served from the DB.
 *
 * Run: node scripts/move-files-to-storage.mjs   (needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */
import path from "path";
import { pathToFileURL } from "url";
import "../src/loadEnv.js";
import { prisma } from "../src/lib/prisma.js";
import { DOCUMENT_MIMES, IMAGE_MIMES, sniffFileType } from "../src/lib/fileCheck.js";
import { productImagePublicPath } from "../src/lib/productImageDb.js";
import {
  PRODUCT_IMAGES_BUCKET,
  RELOCATION_DOCUMENTS_BUCKET,
  publicObjectUrl,
  storageEnabled,
  uploadObject,
} from "../src/lib/storage.js";

const BATCH = Math.max(1, Number(process.env.MOVE_FILES_BATCH) || 25);

function safeOrg(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function moveProductImages(summary) {
  let cursor = "";
  for (;;) {
    const rows = await prisma.productImage.findMany({
      where: { storagePath: null, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, organizationId: true, mimeType: true, data: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      try {
        const bytes = Buffer.from(row.data || []);
        const kind = sniffFileType(bytes);
        if (!bytes.length || !kind || !IMAGE_MIMES.includes(kind.mime)) {
          summary.images.skipped.push({ id: row.id, reason: "not a JPEG/PNG/WebP image" });
          continue;
        }
        const key = `${safeOrg(row.organizationId)}/${row.id}.${kind.ext}`;
        await uploadObject(PRODUCT_IMAGES_BUCKET, key, bytes, kind.mime, { upsert: true });
        const done = await prisma.productImage.updateMany({ where: { id: row.id, storagePath: null }, data: { storagePath: key } });
        if (done.count) summary.images.moved += 1;
      } catch (e) {
        summary.images.failed.push({ id: row.id, error: e?.message || String(e) });
      }
    }
    if (rows.length < BATCH) break;
  }
}

/** Points every stored URL of a moved image at its public URL (runs for all moved images, so it also repairs re-saved old paths). */
async function rewriteImageUrls(summary) {
  let cursor = "";
  for (;;) {
    const rows = await prisma.productImage.findMany({
      where: { storagePath: { not: null }, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: 200,
      select: { id: true, organizationId: true, storagePath: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      const oldPath = productImagePublicPath(row.id);
      const suffix = `%${oldPath}`;
      const url = publicObjectUrl(PRODUCT_IMAGES_BUCKET, row.storagePath);
      summary.rewritten.imageUrl += await prisma.$executeRaw`
        UPDATE "Product" SET "imageUrl" = ${url}
        WHERE "organizationId" = ${row.organizationId} AND ("imageUrl" = ${oldPath} OR "imageUrl" LIKE ${suffix})`;
      summary.rewritten.gallery += await prisma.$executeRaw`
        UPDATE "Product" SET "gallery" = (
          SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'string' AND (e #>> '{}' = ${oldPath} OR e #>> '{}' LIKE ${suffix})
                                THEN to_jsonb(${url}::text) ELSE e END ORDER BY ord)
          FROM jsonb_array_elements("gallery") WITH ORDINALITY AS t(e, ord))
        WHERE "organizationId" = ${row.organizationId}
          AND jsonb_typeof("gallery") = 'array'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements("gallery") g
                      WHERE jsonb_typeof(g) = 'string' AND (g #>> '{}' = ${oldPath} OR g #>> '{}' LIKE ${suffix}))`;
      const quotedOld = JSON.stringify(oldPath);
      const quotedNew = JSON.stringify(url);
      const like = `%${quotedOld}%`;
      summary.rewritten.heldCarts += await prisma.$executeRaw`
        UPDATE "HeldCart" h SET "payload" = replace(h."payload"::text, ${quotedOld}, ${quotedNew})::jsonb
        FROM "Branch" b
        WHERE b."id" = h."branchId" AND b."organizationId" = ${row.organizationId} AND h."payload"::text LIKE ${like}`;
    }
    if (rows.length < 200) break;
  }
}

async function moveRelocationDocuments(summary) {
  let cursor = "";
  for (;;) {
    const rows = await prisma.relocationDocument.findMany({
      where: { storagePath: null, content: { not: null }, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, content: true, request: { select: { organizationId: true } } },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      try {
        const bytes = Buffer.from(row.content);
        const kind = sniffFileType(bytes);
        const known = kind && DOCUMENT_MIMES.includes(kind.mime);
        // Anything that is not PDF/JPEG/PNG (old test files) is kept as an opaque binary; downloads are attachments.
        const key = `${safeOrg(row.request.organizationId)}/${row.id}.${known ? kind.ext : "bin"}`;
        await uploadObject(RELOCATION_DOCUMENTS_BUCKET, key, bytes, known ? kind.mime : "application/octet-stream", { upsert: true });
        const done = await prisma.relocationDocument.updateMany({
          where: { id: row.id, storagePath: null },
          data: { storagePath: key, size: bytes.length },
        });
        if (done.count) summary.documents.moved += 1;
      } catch (e) {
        summary.documents.failed.push({ id: row.id, error: e?.message || String(e) });
      }
    }
    if (rows.length < BATCH) break;
  }
}

export async function moveFilesToStorage() {
  const summary = {
    images: { moved: 0, skipped: [], failed: [] },
    documents: { moved: 0, failed: [] },
    rewritten: { imageUrl: 0, gallery: 0, heldCarts: 0 },
  };
  await moveProductImages(summary);
  await rewriteImageUrls(summary);
  await moveRelocationDocuments(summary);
  return summary;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  if (!storageEnabled()) {
    console.log("[move-files] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; nothing to do.");
    process.exit(0);
  }
  try {
    const summary = await moveFilesToStorage();
    console.log(`[move-files] ${JSON.stringify(summary)}`);
  } catch (e) {
    console.error("[move-files] stopped:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
