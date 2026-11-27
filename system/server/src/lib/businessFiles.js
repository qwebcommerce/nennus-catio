/**
 * Private business documents: supplier quotations / invoices attached to a purchase order and
 * proof of payment (picture or PDF) on supplier, freight, prepayment, sales-order and customer
 * account payments.
 *
 * - Only real JPEG, PNG, WebP or PDF bytes are accepted (the declared type and name are ignored),
 *   at most 10 MB. Image metadata (EXIF / text chunks) is dropped.
 * - Supabase Storage (private bucket "business-documents") when configured, else the database.
 * - Downloads go through a 5-minute signed link bound to the staff user; the download checks the
 *   session and the module right that matches what the file belongs to (purchasing for purchase
 *   orders and supplier payments, sales orders for installment payments, finance for customer
 *   account payments).
 */
import crypto from "crypto";
import { prisma } from "./prisma.js";
import { fail } from "./bizError.js";
import { contentDisposition, sniffFileType, stripImageMetadata } from "./fileCheck.js";
import {
  BUSINESS_DOCUMENTS_BUCKET,
  objectKey,
  signedDownloadUrl,
  storageEnabled,
  uploadObject,
} from "./storage.js";

export const BUSINESS_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const BUSINESS_FILE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const FILE_PURPOSES = ["PO_ATTACHMENT", "PAYMENT_PROOF"];

/** Methods paid by bank transfer: a proof file is required (owner decision). */
const PROOF_REQUIRED = new Set(["BANK_TRANSFER", "BANK"]);

export function proofRequired(method) {
  return PROOF_REQUIRED.has(String(method || "").toUpperCase());
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const LINK_TTL_MS = 5 * 60 * 1000;
const LINK_KEY = crypto.createHash("sha256").update(`business-file-link:${JWT_SECRET}`).digest();

function signature(fileId, principal, exp) {
  return crypto.createHmac("sha256", LINK_KEY).update(`${fileId}.${principal}.${exp}`).digest("base64url");
}

export function signedFileLink(fileId, userId) {
  const exp = Date.now() + LINK_TTL_MS;
  const p = `s:${userId}`;
  return {
    url: `/api/business-files/${encodeURIComponent(fileId)}?p=${encodeURIComponent(p)}&exp=${exp}&sig=${signature(fileId, p, exp)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function fileLinkValid(fileId, principal, exp, sig) {
  const n = Number(exp);
  if (!principal || !Number.isFinite(n) || n < Date.now() || n > Date.now() + LINK_TTL_MS + 5000) return false;
  const want = Buffer.from(signature(fileId, principal, n));
  const got = Buffer.from(String(sig || ""));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function cleanName(raw, mime) {
  let name = String(raw || "document").replace(/[\r\n"\\/]/g, "_").trim().slice(0, 120) || "document";
  const ext = EXT[mime];
  if (ext && !name.toLowerCase().endsWith(`.${ext}`)) name = `${name.replace(/\.[^.]*$/, "")}.${ext}`;
  return name;
}

/** Checks and stores an uploaded file. Returns the BusinessFile row (without content). */
export async function saveBusinessFile({ orgId, userId, purpose, purchaseOrderId = null, buffer, originalName }) {
  if (!FILE_PURPOSES.includes(purpose)) throw fail(400, "FILE_PURPOSE_INVALID", "نوع الملف غير معروف", "Unknown file purpose");
  if (!buffer || !buffer.length) throw fail(400, "FILE_REQUIRED", "اختر ملفاً لرفعه", "Choose a file to upload");
  if (buffer.length > BUSINESS_FILE_MAX_BYTES) {
    throw fail(413, "FILE_TOO_LARGE", "الملف أكبر من 10 ميغابايت", "The file is larger than 10 MB");
  }
  const kind = sniffFileType(buffer);
  if (!kind || !BUSINESS_FILE_MIMES.includes(kind.mime)) {
    throw fail(400, "FILE_TYPE_INVALID", "الملف ليس صورة JPEG أو PNG أو WebP أو ملف PDF", "The file is not a JPEG, PNG, WebP image or a PDF");
  }
  const bytes = stripImageMetadata(buffer, kind.mime);
  const fileName = cleanName(originalName, kind.mime);
  let storagePath = null;
  let content = bytes;
  if (storageEnabled()) {
    storagePath = objectKey(orgId, kind.ext);
    await uploadObject(BUSINESS_DOCUMENTS_BUCKET, storagePath, bytes, kind.mime);
    content = null;
  }
  return prisma.businessFile.create({
    data: {
      organizationId: orgId,
      purpose,
      purchaseOrderId,
      fileName,
      mime: kind.mime,
      size: bytes.length,
      content,
      storagePath,
      uploadedByUserId: userId || null,
    },
    select: FILE_SELECT,
  });
}

export const FILE_SELECT = {
  id: true,
  purpose: true,
  purchaseOrderId: true,
  fileName: true,
  mime: true,
  size: true,
  createdAt: true,
  uploadedByUserId: true,
};

/**
 * The proof for a payment: required for bank transfer, optional otherwise. When given it must be
 * an unused PAYMENT_PROOF of this organisation, uploaded by this user. Returns the file id or null.
 */
export async function checkProof(db, { orgId, userId, method, proofFileId }) {
  const id = proofFileId != null && String(proofFileId).trim() ? String(proofFileId).trim() : null;
  if (!id) {
    if (proofRequired(method)) {
      throw fail(400, "PROOF_REQUIRED", "أرفق صورة أو ملف PDF لإثبات التحويل البنكي", "Attach a picture or PDF as proof of the bank transfer");
    }
    return null;
  }
  const file = await db.businessFile.findFirst({
    where: { id, organizationId: orgId, purpose: "PAYMENT_PROOF" },
    select: {
      id: true,
      uploadedByUserId: true,
      _count: { select: { ledgerProofs: true, billProofs: true, supplierPaymentProofs: true, salesOrderPaymentProofs: true, prepaymentProofs: true, b2bReceiptProofs: true } },
    },
  });
  if (!file) throw fail(400, "PROOF_NOT_FOUND", "ملف الإثبات غير موجود — ارفعه مرة أخرى", "The proof file was not found. Upload it again.");
  const used = Object.values(file._count).reduce((a, b) => a + b, 0);
  if (used > 0) throw fail(409, "PROOF_ALREADY_USED", "ملف الإثبات مستخدم لدفعة أخرى", "This proof file is already attached to another payment");
  if (file.uploadedByUserId && userId && file.uploadedByUserId !== userId) {
    throw fail(403, "PROOF_NOT_YOURS", "ارفع ملف الإثبات بنفسك", "Upload the proof file yourself");
  }
  return file.id;
}

/**
 * What a file belongs to, as [module, action] pairs any of which allows the download.
 * A proof not attached to anything yet can only be fetched by the person who uploaded it.
 */
export async function fileAccess(file) {
  if (file.purchaseOrderId) return { rules: [["purchasing", "view"]] };
  const [ledger, bill, supplierPay, soPay, prepay, b2bReceipt] = await Promise.all([
    prisma.customerAccountLedger.count({ where: { proofFileId: file.id } }),
    prisma.supplierBill.count({ where: { proofFileId: file.id } }),
    prisma.supplierPayment.count({ where: { proofFileId: file.id } }),
    prisma.salesOrderPayment.count({ where: { proofFileId: file.id } }),
    prisma.supplierPrepayment.count({ where: { proofFileId: file.id } }),
    prisma.b2bReceipt.count({ where: { proofFileId: file.id } }),
  ]);
  const rules = [];
  if (bill || supplierPay || prepay) rules.push(["purchasing", "view"]);
  if (soPay) rules.push(["salesOrders", "view"]);
  if (ledger) rules.push(["finance", "view"]);
  // B2B cash receipt proofs: the B2B tab, or Finance (accounts).
  if (b2bReceipt) rules.push(["b2b", "view"], ["finance", "view"]);
  return { rules, unattached: rules.length === 0 };
}

/** Sends the file: a 302 to a short Supabase signed URL, or the database bytes as an attachment. */
export async function sendBusinessFile(res, file) {
  if (file.storagePath && (storageEnabled() || !file.content)) {
    const url = await signedDownloadUrl(BUSINESS_DOCUMENTS_BUCKET, file.storagePath, file.fileName);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(302, url);
  }
  const buf = Buffer.from(file.content || []);
  const kind = sniffFileType(buf);
  res.setHeader("Content-Type", kind && BUSINESS_FILE_MIMES.includes(kind.mime) ? kind.mime : "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(file.fileName, kind?.ext));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  return res.send(buf);
}

/** Multer error (size limit, field) as a bilingual API error. */
export function uploadError(e) {
  if (e?.code === "LIMIT_FILE_SIZE") return fail(413, "FILE_TOO_LARGE", "الملف أكبر من 10 ميغابايت", "The file is larger than 10 MB");
  return fail(400, "FILE_UPLOAD_INVALID", "تعذّر قراءة الملف المرفوع", "The uploaded file could not be read");
}
