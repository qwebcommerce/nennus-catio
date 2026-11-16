import crypto from "crypto";
import { Router } from "express";
import { d, fmt, riyals, toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { customerSession } from "../lib/customerSession.js";
import { DOCUMENT_MIMES, contentDisposition, sniffFileType } from "../lib/fileCheck.js";
import {
  DOCUMENT_MAX_BYTES,
  RELOCATION_DOCUMENTS_BUCKET,
  downloadObject,
  objectKey,
  removeObjects,
  signedDownloadUrl,
  signedUploadUrl,
  storageEnabled,
  uploadObject,
} from "../lib/storage.js";
import { createSkipcashPayment, skipcashConfigured } from "../lib/skipcash.js";
import { checkGatewayPayment, lookupOnReturn } from "../lib/paymentLookup.js";
import { mailCustomer, mailStaff } from "../lib/mailer.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import {
  LOCK_TX,
  acceptReviewPayments,
  lockParent,
  paymentTotals,
  recordStaffPayment,
  refundParent,
  rejectReviewPayments,
  statusError,
} from "../lib/payments.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const NEXT = {
  SUBMITTED: ["DOCUMENTS_REQUESTED", "UNDER_REVIEW", "CANCELLED"],
  DOCUMENTS_REQUESTED: ["DOCUMENTS_RECEIVED", "CANCELLED"],
  DOCUMENTS_RECEIVED: ["UNDER_REVIEW", "DOCUMENTS_REQUESTED", "CANCELLED"],
  UNDER_REVIEW: ["QUOTE_SENT", "DOCUMENTS_REQUESTED", "CANCELLED"],
  QUOTE_SENT: ["CANCELLED"],
  PAID: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};

function publicBase() {
  return (process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
}

async function shopOrg() {
  const envId = process.env.SHOP_ORGANIZATION_ID?.trim();
  if (envId) return prisma.organization.findUnique({ where: { id: envId } });
  const chosen = await prisma.organization.findFirst({
    where: { websiteBranchId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (chosen) return chosen;
  return prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
}

/** Signed, short-lived document links (FR-66, NFR-18). */
const LINK_TTL_MS = 5 * 60 * 1000;
const LINK_KEY = crypto
  .createHash("sha256")
  .update(`relocation-doc-link:${JWT_SECRET}`)
  .digest();

function linkSignature(docId, principal, exp) {
  return crypto.createHmac("sha256", LINK_KEY).update(`${docId}.${principal}.${exp}`).digest("base64url");
}

function signedDocumentLink(docId, principal) {
  const exp = Date.now() + LINK_TTL_MS;
  const sig = linkSignature(docId, principal, exp);
  return {
    url: `/api/relocation-files/${encodeURIComponent(docId)}?p=${encodeURIComponent(principal)}&exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

function linkValid(docId, principal, exp, sig) {
  const n = Number(exp);
  if (!principal || !Number.isFinite(n) || n < Date.now() || n > Date.now() + LINK_TTL_MS + 5000) return false;
  const want = Buffer.from(linkSignature(docId, principal, n));
  const got = Buffer.from(String(sig || ""));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/**
 * Agreement 8.3: a document in the private bucket is answered with a 302 to a Supabase signed URL
 * valid 60 seconds, forced to download under its file name. Database documents stream as before.
 */
async function sendDocument(res, doc) {
  // A moved document still has its database copy until the owner's cleanup: serve that if storage is off.
  if (doc.storagePath && (storageEnabled() || !doc.content)) {
    const url = await signedDownloadUrl(RELOCATION_DOCUMENTS_BUCKET, doc.storagePath, downloadName(doc));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(302, url);
  }
  const kind = sniffFileType(Buffer.from(doc.content));
  const mime = kind && DOCUMENT_MIMES.includes(kind.mime) ? kind.mime : "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", contentDisposition(doc.fileName, kind?.ext));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.send(Buffer.from(doc.content));
}

/** File name for the download (the stored name, with the extension of the real file type). */
function downloadName(doc) {
  return cleanFileName(doc.fileName, DOC_EXT[doc.mime]);
}

function cleanFileName(raw, ext) {
  let fileName = String(raw || "document").replace(/[\r\n"\\/]/g, "_").slice(0, 120) || "document";
  if (ext && !fileName.toLowerCase().endsWith(`.${ext}`)) fileName = `${fileName.replace(/\.[^.]*$/, "")}.${ext}`;
  return fileName;
}

const DOC_EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

function publicRequest(row) {
  return {
    id: row.id,
    reference: row.reference,
    destination: row.destination,
    petSummary: row.petSummary,
    status: row.status,
    version: row.version,
    quoteAmount: riyals(row.quoteAmount),
    quoteNote: row.quoteNote,
    history: Array.isArray(row.history) ? row.history : [],
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    // Customer-facing: never the staff pet notes, staff notes or tags (FR-03, FR-65, FR-69).
    pets: (row.pets || []).map((link) => ({
      id: link.pet?.id,
      name: link.pet?.name,
      breed: link.pet?.breed,
      ageText: link.pet?.ageText,
      petTypeId: link.pet?.petTypeId,
    })),
    documents: (row.documents || []).map((doc) => ({ id: doc.id, fileName: doc.fileName, mime: doc.mime, createdAt: doc.createdAt })),
  };
}

function pushHistory(current, status, note) {
  const history = Array.isArray(current) ? current : [];
  return [...history, { at: new Date().toISOString(), status, note: note || "" }];
}

function docError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Documents sent with a request: either base64 in the JSON body (up to 1.2 MB each), or
 * `{ uploadId }` of a direct upload to Supabase Storage that was already confirmed (checked).
 * Returns the RelocationDocument rows to create, the uploads they consume and the objects
 * written here (removed again if the request is not saved).
 */
async function readDocuments(raw, { organizationId, customerId }) {
  if (!Array.isArray(raw) || !raw.length) return { rows: [], uploadIds: [], written: [] };
  if (raw.length > 3) throw docError("Attach up to three documents");
  const rows = [];
  const uploadIds = [];
  const inline = [];
  for (const doc of raw) {
    if (doc?.uploadId) {
      uploadIds.push(String(doc.uploadId));
      continue;
    }
    const bytes = Buffer.from(String(doc?.dataBase64 || ""), "base64");
    if (!bytes.length || bytes.length > 1_200_000) throw docError("Each document must be under 1.2 MB");
    // NFR-18: only PDF, JPEG or PNG, decided from the file's bytes (not the declared type).
    const kind = sniffFileType(bytes);
    if (!kind || !DOCUMENT_MIMES.includes(kind.mime)) throw docError("Documents must be PDF, JPEG or PNG files");
    inline.push({ fileName: cleanFileName(doc?.fileName, kind.ext), mime: kind.mime, bytes, ext: kind.ext });
  }
  if (uploadIds.length) {
    if (new Set(uploadIds).size !== uploadIds.length) throw docError("Each document can be attached once");
    const uploads = await prisma.relocationUpload.findMany({
      where: { id: { in: uploadIds }, customerId, organizationId, verifiedAt: { not: null } },
    });
    if (uploads.length !== uploadIds.length) throw docError("Upload the documents again (an upload was not found or not checked)");
    for (const up of uploads) rows.push({ fileName: up.fileName, mime: up.mime, size: up.size, storagePath: up.storagePath });
  }
  const written = [];
  try {
    for (const doc of inline) {
      if (storageEnabled()) {
        const key = objectKey(organizationId, doc.ext);
        await uploadObject(RELOCATION_DOCUMENTS_BUCKET, key, doc.bytes, doc.mime);
        written.push(key);
        rows.push({ fileName: doc.fileName, mime: doc.mime, size: doc.bytes.length, storagePath: key });
      } else {
        rows.push({ fileName: doc.fileName, mime: doc.mime, size: doc.bytes.length, content: doc.bytes });
      }
    }
  } catch (e) {
    await removeObjects(RELOCATION_DOCUMENTS_BUCKET, written);
    throw e;
  }
  return { rows, uploadIds, written };
}

/** Inside the transaction that creates the documents: each confirmed upload is used once. */
async function consumeUploads(tx, uploadIds, customerId) {
  if (!uploadIds.length) return;
  const used = await tx.relocationUpload.deleteMany({
    where: { id: { in: uploadIds }, customerId, verifiedAt: { not: null } },
  });
  if (used.count !== uploadIds.length) throw docError("Upload the documents again (an upload was already used)", 409);
}

/** Daily cron: direct uploads never confirmed or attached within 24 h are deleted with their objects. */
export async function cleanupStaleUploads({ olderThanMs = 24 * 60 * 60 * 1000, batch = 200 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  let removed = 0;
  for (;;) {
    const stale = await prisma.relocationUpload.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: batch,
    });
    if (!stale.length) break;
    if (storageEnabled()) await removeObjects(RELOCATION_DOCUMENTS_BUCKET, stale.map((u) => u.storagePath));
    const done = await prisma.relocationUpload.deleteMany({ where: { id: { in: stale.map((u) => u.id) }, createdAt: { lt: cutoff } } });
    removed += done.count;
    if (stale.length < batch) break;
  }
  return { removed };
}

export const relocationShop = Router();

relocationShop.use(async (req, res, next) => {
  const session = await customerSession(req, res);
  const org = await shopOrg();
  if (!session || !org || session.organizationId !== org.id) {
    return res.status(401).json({ error: "Sign in with a customer account" });
  }
  const customer = await prisma.customer.findFirst({
    where: { id: session.sub, organizationId: org.id },
  });
  // customerSession() only accepts registered (password) accounts.
  if (!customer) {
    return res.status(403).json({ error: "Only a registered customer can request relocation" });
  }
  req.customer = customer;
  req.shopOrg = org;
  next();
});

relocationShop.get("/", async (req, res) => {
  const rows = await prisma.relocationRequest.findMany({
    where: { customerId: req.customer.id },
    include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows.map(publicRequest));
});

relocationShop.post("/", async (req, res) => {
  try {
    const destination = String(req.body?.destination || "").trim();
    const petIds = Array.isArray(req.body?.petIds) ? req.body.petIds.map(String) : [];
    const petSummary = String(req.body?.petSummary || "").trim();
    if (!destination) return res.status(400).json({ error: "A destination is required" });
    if (!petIds.length && !petSummary) return res.status(400).json({ error: "Add the pets for this move" });
    const pets = petIds.length
      ? await prisma.customerPet.findMany({ where: { id: { in: petIds }, customerId: req.customer.id } })
      : [];
    if (petIds.length && pets.length !== petIds.length) return res.status(400).json({ error: "Choose pets from your account" });
    if (!Array.isArray(req.body?.documents) || !req.body.documents.length) {
      return res.status(400).json({ error: "Attach the relocation documents" });
    }
    const documents = await readDocuments(req.body.documents, { organizationId: req.shopOrg.id, customerId: req.customer.id });
    let row;
    try {
      row = await prisma.$transaction(async (tx) => {
        await consumeUploads(tx, documents.uploadIds, req.customer.id);
        return tx.relocationRequest.create({
          data: {
            organizationId: req.shopOrg.id,
            customerId: req.customer.id,
            destination,
            petSummary: petSummary || null,
            history: pushHistory([], "SUBMITTED", ""),
            pets: { create: pets.map((pet) => ({ petId: pet.id })) },
            documents: { create: documents.rows },
          },
          include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
        });
      });
    } catch (e) {
      await removeObjects(RELOCATION_DOCUMENTS_BUCKET, documents.written);
      throw e;
    }
    await mailStaff(req.shopOrg.id, "alertRelocation", { reference: row.reference || row.id.slice(-8).toUpperCase() });
    res.status(201).json(publicRequest(row));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not submit the request" });
  }
});

relocationShop.get("/:id", async (req, res) => {
  const include = { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } };
  let row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, customerId: req.customer.id },
    include,
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  // FR-76: back from the payment page — the server looks the payment up itself.
  if (await lookupOnReturn(req, "relocation", row, row.status === "QUOTE_SENT")) {
    row = await prisma.relocationRequest.findUnique({ where: { id: row.id }, include });
  }
  res.json(publicRequest(row));
});

relocationShop.post("/:id/documents", async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, customerId: req.customer.id },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "DOCUMENTS_REQUESTED" && row.status !== "SUBMITTED") {
    return res.status(400).json({ error: "Documents are not being requested" });
  }
  if (!Array.isArray(req.body?.documents) || !req.body.documents.length) return res.status(400).json({ error: "Attach a document" });
  let documents;
  let updated;
  try {
    documents = await readDocuments(req.body.documents, { organizationId: row.organizationId, customerId: req.customer.id });
    updated = await prisma.$transaction(async (tx) => {
      await consumeUploads(tx, documents.uploadIds, req.customer.id);
      return tx.relocationRequest.update({
        where: { id: row.id },
        data: {
          status: "DOCUMENTS_RECEIVED",
          history: pushHistory(row.history, "DOCUMENTS_RECEIVED", ""),
          documents: { create: documents.rows },
        },
        include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
      });
    });
  } catch (e) {
    await removeObjects(RELOCATION_DOCUMENTS_BUCKET, documents?.written);
    return res.status(e.status || 400).json({ error: e.message || "Could not add the documents" });
  }
  res.json(publicRequest(updated));
});

/**
 * Direct browser upload (agreement 8.1), only when Supabase Storage is configured:
 * 1. POST /uploads {fileName, mime, size} -> a signed upload URL for a key the server chose;
 * 2. the browser PUTs the file to Supabase;
 * 3. POST /uploads/:uploadId/confirm -> the server downloads the object and checks its bytes
 *    (PDF/JPEG/PNG) and size (max 10 MB); a bad file is deleted and refused with 400;
 * 4. the confirmed upload is attached with documents: [{ uploadId }] on POST / or POST /:id/documents,
 *    which is when its RelocationDocument row is created.
 */
const MAX_OPEN_UPLOADS = 12;

relocationShop.post("/uploads", async (req, res) => {
  if (!storageEnabled()) {
    return res.status(400).json({ error: "Direct upload is not available. Attach the file to the form.", code: "STORAGE_DISABLED" });
  }
  const mime = String(req.body?.mime || "").toLowerCase().split(";")[0].trim();
  const ext = DOC_EXT[mime];
  if (!ext) return res.status(400).json({ error: "Documents must be PDF, JPEG or PNG files" });
  const size = Number(req.body?.size);
  if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: "Choose a file" });
  if (size > DOCUMENT_MAX_BYTES) return res.status(400).json({ error: "Each document must be 10 MB or smaller", code: "FILE_TOO_LARGE" });
  const open = await prisma.relocationUpload.count({
    where: { customerId: req.customer.id, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (open >= MAX_OPEN_UPLOADS) return res.status(429).json({ error: "Too many uploads waiting. Submit the request or try again tomorrow." });
  const storagePath = objectKey(req.shopOrg.id, ext);
  const upload = await prisma.relocationUpload.create({
    data: {
      organizationId: req.shopOrg.id,
      customerId: req.customer.id,
      storagePath,
      fileName: cleanFileName(req.body?.fileName, ext),
      mime,
    },
  });
  try {
    const signed = await signedUploadUrl(RELOCATION_DOCUMENTS_BUCKET, storagePath);
    res.status(201).json({ uploadId: upload.id, signedUrl: signed.signedUrl, maxBytes: DOCUMENT_MAX_BYTES });
  } catch (e) {
    await prisma.relocationUpload.delete({ where: { id: upload.id } }).catch(() => {});
    res.status(e.status || 502).json({ error: e.message });
  }
});

relocationShop.post("/uploads/:uploadId/confirm", async (req, res) => {
  if (!storageEnabled()) return res.status(400).json({ error: "Direct upload is not available", code: "STORAGE_DISABLED" });
  const upload = await prisma.relocationUpload.findFirst({
    where: { id: req.params.uploadId, customerId: req.customer.id, organizationId: req.shopOrg.id },
  });
  if (!upload) return res.status(404).json({ error: "Upload not found" });
  if (upload.verifiedAt) return res.json({ uploadId: upload.id, fileName: upload.fileName, mime: upload.mime, size: upload.size });
  const refuse = async (message, code) => {
    await removeObjects(RELOCATION_DOCUMENTS_BUCKET, [upload.storagePath]);
    await prisma.relocationUpload.deleteMany({ where: { id: upload.id, verifiedAt: null } });
    return res.status(400).json({ error: message, code });
  };
  let bytes;
  try {
    bytes = await downloadObject(RELOCATION_DOCUMENTS_BUCKET, upload.storagePath);
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }
  if (!bytes || !bytes.length) return refuse("The file was not uploaded. Try again.", "UPLOAD_MISSING");
  if (bytes.length > DOCUMENT_MAX_BYTES) return refuse("Each document must be 10 MB or smaller", "FILE_TOO_LARGE");
  // NFR-18: the bytes decide the type; it must also be the type the upload was issued for.
  const kind = sniffFileType(bytes);
  if (!kind || !DOCUMENT_MIMES.includes(kind.mime) || kind.mime !== upload.mime) {
    return refuse("Documents must be PDF, JPEG or PNG files", "FILE_TYPE");
  }
  const done = await prisma.relocationUpload.updateMany({
    where: { id: upload.id, verifiedAt: null },
    data: { verifiedAt: new Date(), size: bytes.length },
  });
  if (!done.count) return res.status(409).json({ error: "The upload changed. Try again." });
  res.json({ uploadId: upload.id, fileName: upload.fileName, mime: upload.mime, size: bytes.length });
});

/** Issue a 5-minute signed download link for one of the customer's own documents. */
relocationShop.post("/:id/documents/:docId/link", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, customerId: req.customer.id } },
    select: { id: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(signedDocumentLink(doc.id, `c:${req.customer.id}`));
});

relocationShop.get("/:id/documents/:docId", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, customerId: req.customer.id } },
    select: { id: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.redirect(303, signedDocumentLink(doc.id, `c:${req.customer.id}`).url);
});

relocationShop.post("/:id/pay", async (req, res) => {
  if (!skipcashConfigured()) {
    return res.status(503).json({ error: "Card payment is not configured yet.", code: "SKIPCASH_NOT_CONFIGURED" });
  }
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, customerId: req.customer.id },
    include: { customer: true },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "QUOTE_SENT" || row.quoteAmount == null) {
    return res.status(400).json({ error: "There is no quote to pay" });
  }
  const [first, ...rest] = String(row.customer.name || "Customer").split(/\s+/);
  const payment = await createSkipcashPayment({
    Uid: crypto.randomUUID(),
    KeyId: process.env.SKIPCASH_KEY_ID.trim(),
    Amount: fmt(row.quoteAmount),
    FirstName: (first || "Customer").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Customer",
    LastName: (rest.join(" ") || "Catio").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Catio",
    Phone: String(row.customer.phone || "00000000").slice(0, 15),
    Email: String(row.customer.email || "").slice(0, 255),
    TransactionId: row.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40),
    Custom1: `relocation:${row.id}`,
    WebhookUrl: `${(process.env.API_PUBLIC_URL || process.env.APP_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/api/shop/payments/skipcash`,
    ReturnUrl: `${publicBase()}/shop/relocation/${row.id}`,
  });
  await prisma.relocationRequest.update({
    where: { id: row.id },
    data: { gatewayPaymentId: payment.id },
  });
  res.json({ payUrl: payment.payUrl, total: riyals(row.quoteAmount) });
});

export const relocationStaff = Router();
relocationStaff.use(authMiddleware);
relocationStaff.use(requireModule("relocation", "view"));
relocationStaff.use((req, res, next) => (req.method === "GET" ? next() : requireModule("relocation", "edit")(req, res, next)));

relocationStaff.get("/", async (req, res) => {
  const rows = await prisma.relocationRequest.findMany({
    where: { organizationId: req.user.organizationId },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      pets: { include: { pet: true } },
      documents: { select: { id: true, fileName: true, mime: true, createdAt: true } },
      payments: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(toApi("RelocationRequest", rows));
});

relocationStaff.post("/:id/status", async (req, res) => {
  const next = String(req.body?.status || "").toUpperCase();
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (!(NEXT[row.status] || []).includes(next)) {
    return res.status(400).json({ error: "That status change is not allowed" });
  }
  if (next === "QUOTE_SENT") return res.status(400).json({ error: "Send a quote with an amount" });
  // FR-64: a paid request is cancelled only with a refund decision: FULL_REFUND or NO_REFUND (with a reason).
  const decision = String(req.body?.refundDecision || "").toUpperCase();
  const note = String(req.body?.note || "").trim();
  let refunded = 0;
  if (next === "CANCELLED") {
    const totals = await paymentTotals(prisma, "relocation", row.id);
    if (totals.remaining > 0) {
      if (!["FULL_REFUND", "NO_REFUND"].includes(decision)) {
        return res.status(400).json({
          error: "This request is paid. Choose to refund it in full or to keep the payment before cancelling.",
          code: "REFUND_DECISION_REQUIRED",
          remaining: riyals(totals.remaining),
        });
      }
      if (decision === "NO_REFUND" && !note) {
        return res.status(400).json({ error: "Give a reason for keeping the payment" });
      }
      if (decision === "FULL_REFUND") {
        try {
          await refundParent({
            parentKind: "relocation",
            parentId: row.id,
            organizationId: row.organizationId,
            amount: totals.remaining,
            userId: req.user.sub,
            method: totals.rows.some((p) => p.kind === "PAYMENT" && p.method === "ONLINE" && p.status === "CAPTURED") ? "ONLINE" : row.paymentMethod,
            note: "Refund on cancel",
          });
          refunded = totals.remaining;
        } catch (e) {
          return res.status(e.status || 400).json({ error: e.message });
        }
      }
    }
  }
  // Guarded transition so two staff actions cannot both apply.
  const updated = await prisma.$transaction(async (tx) => {
    const moved = await tx.relocationRequest.updateMany({ where: { id: row.id, status: row.status }, data: { status: next } });
    if (!moved.count) throw statusError("The request changed. Refresh and try again.", 409);
    const fresh = await tx.relocationRequest.findUnique({ where: { id: row.id } });
    const historyNote = [note, refunded ? `Refunded ${fmt(refunded)} QAR` : ""].filter(Boolean).join(" · ");
    return tx.relocationRequest.update({
      where: { id: row.id },
      data: { history: pushHistory(fresh.history, next, historyNote) },
    });
  }).catch((e) => e);
  if (updated instanceof Error) return res.status(updated.status || 400).json({ error: updated.message });
  await writeAudit({
    userId: req.user.sub,
    action: "RELOCATION_STATUS",
    entityType: "RelocationRequest",
    entityId: row.id,
    summary: `${row.reference || row.id}: ${row.status} -> ${next}${decision ? ` (${decision}${note ? `: ${note}` : ""})` : ""}`,
  });
  const buyer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
  await mailCustomer(buyer, "relocation", { reference: updated.reference || updated.id.slice(-8).toUpperCase(), status: updated.status });
  res.json(toApi("RelocationRequest", updated));
});

relocationStaff.post("/:id/quote", async (req, res) => {
  const amount = toDirhams(req.body?.amount);
  if (amount == null) return res.status(400).json({ error: "Enter a quote amount (at most 2 decimals)", errorAr: "أدخل مبلغ العرض (منزلتان عشريتان كحد أقصى)", errorEn: "Enter a quote amount (at most 2 decimals)" });
  const version = requireVersion(req);
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  assertVersion(row, version);
  if (!["UNDER_REVIEW", "QUOTE_SENT"].includes(row.status)) {
    return res.status(400).json({ error: "Review the request before sending a quote" });
  }
  // Conditional write: refused if the request moved on (status or version) since it was loaded.
  const updated = await versionedUpdate(prisma, "relocationRequest", {
    id: row.id,
    version,
    where: { status: { in: ["UNDER_REVIEW", "QUOTE_SENT"] } },
    data: {
      status: "QUOTE_SENT",
      quoteAmount: amount,
      quoteNote: req.body?.note ? String(req.body.note).trim() : null,
      history: pushHistory(row.history, "QUOTE_SENT", req.body?.note ? String(req.body.note).trim() : ""),
    },
  });
  await writeAudit({ userId: req.user.sub, action: "RELOCATION_QUOTE", entityType: "RelocationRequest", entityId: row.id, summary: `${row.reference || row.id} ${fmt(amount)}` });
  const buyer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
  await mailCustomer(buyer, "relocation", { reference: updated.reference || updated.id.slice(-8).toUpperCase(), status: "QUOTE_SENT", amount: fmt(amount) });
  res.json(toApi("RelocationRequest", updated));
});

/**
 * FR-64: staff record a cash or bank payment. Writes a Payment row (amount, method,
 * reference, staff user) and an audit row; the QUOTE_SENT -> PAID change is guarded.
 */
relocationStaff.post("/:id/pay", async (req, res) => {
  const method = String(req.body?.method || "").toUpperCase();
  if (!["CASH", "BANK"].includes(method)) return res.status(400).json({ error: "Record cash or a bank transfer" });
  const reference = String(req.body?.reference || "").trim();
  if (method === "BANK" && !reference) return res.status(400).json({ error: "Enter the bank transfer reference" });
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row || row.status !== "QUOTE_SENT" || row.quoteAmount == null) return res.status(400).json({ error: "There is no quote to mark paid" });
  const amount = req.body?.amount == null || req.body.amount === "" ? d(row.quoteAmount) : toDirhams(req.body.amount);
  if (amount == null || amount !== d(row.quoteAmount)) {
    return res.status(400).json({ error: `The payment must be the quoted ${fmt(row.quoteAmount)} QAR` });
  }
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockParent(tx, "relocation", row.id);
      const moved = await tx.relocationRequest.updateMany({
        where: { id: row.id, status: "QUOTE_SENT", quoteAmount: row.quoteAmount },
        data: { status: "PAID", paymentMethod: method, paidAt: new Date(), amountPaid: amount },
      });
      if (!moved.count) throw statusError("The request changed. Refresh and try again.", 409);
      const payment = await recordStaffPayment(tx, {
        parentKind: "relocation",
        parentId: row.id,
        organizationId: row.organizationId,
        amount,
        method,
        reference,
        userId: req.user.sub,
        note: req.body?.note,
      });
      const fresh = await tx.relocationRequest.findUnique({ where: { id: row.id } });
      const updated = await tx.relocationRequest.update({
        where: { id: row.id },
        data: { history: pushHistory(fresh.history, "PAID", method) },
      });
      return { updated, payment };
    }, LOCK_TX);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  await writeAudit({
    userId: req.user.sub,
    action: "RELOCATION_PAYMENT",
    entityType: "Payment",
    entityId: result.payment.id,
    summary: `${row.reference || row.id} ${fmt(amount)} ${method}${reference ? ` ref ${reference}` : ""}`,
  });
  const buyer = await prisma.customer.findUnique({ where: { id: result.updated.customerId } });
  await mailCustomer(buyer, "relocation", { reference: result.updated.reference || result.updated.id.slice(-8).toUpperCase(), status: "PAID" });
  res.json({ ...toApi("RelocationRequest", result.updated), payment: toApi("Payment", result.payment) });
});

/** FR-76: staff ask the gateway for the payment's status; a paid result confirms through the webhook's path. */
relocationStaff.post("/:id/check-payment", async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!row) return res.status(404).json({ error: "Request not found" });
  try {
    const result = await checkGatewayPayment({ parentKind: "relocation", parentId: row.id, source: "staff", req, allowReview: true });
    if (!result.checked) return res.status(400).json({ error: "There is no gateway payment to check", ...result });
    await writeAudit({
      userId: req.user.sub,
      action: "PAYMENT_LOOKUP",
      entityType: "RelocationRequest",
      entityId: row.id,
      summary: `${row.reference || row.id} gateway ${result.gatewayStatus}: ${result.outcome}`,
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

/** FR-77: refund a relocation payment in part or in full (gateway for online, recorded for cash/bank). */
relocationStaff.post("/:id/refund", requireModule("relocation", "refund"), async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { customer: true },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  try {
    const refund = await refundParent({
      parentKind: "relocation",
      parentId: row.id,
      organizationId: row.organizationId,
      amount: toDirhams(req.body?.amount, { allowZero: false }) ?? 0,
      userId: req.user.sub,
      method: req.body?.method || (row.paymentMethod === "ONLINE" ? "ONLINE" : row.paymentMethod),
      note: req.body?.note,
    });
    await writeAudit({ userId: req.user.sub, action: "RELOCATION_REFUND", entityType: "Payment", entityId: refund.id, summary: `${row.reference || row.id} ${fmt(refund.amount)} ${refund.method}` });
    await mailCustomer(row.customer, "refund", { reference: row.reference || row.id.slice(-8).toUpperCase(), amount: fmt(refund.amount) });
    res.status(201).json(toApi("Payment", refund));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

/** FR-79: accept (mark paid) or refund an online payment that arrived late or for the wrong amount. */
relocationStaff.post("/:id/resolve-payment", async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId, paymentReview: true },
  });
  if (!row) return res.status(404).json({ error: "No payment is waiting for review" });
  const accept = Boolean(req.body?.accept);
  try {
    if (accept) {
      await prisma.$transaction(async (tx) => {
        await lockParent(tx, "relocation", row.id);
        const current = await tx.relocationRequest.findUnique({ where: { id: row.id } });
        if (current.status !== "QUOTE_SENT") throw statusError("Only a request waiting for payment can accept it. Refund it instead.", 400);
        const accepted = await acceptReviewPayments(tx, "relocation", row.id);
        if (accepted <= 0) throw statusError("No payment is waiting for review", 404);
        await tx.relocationRequest.update({
          where: { id: row.id },
          data: {
            status: "PAID",
            paymentMethod: "ONLINE",
            paidAt: new Date(),
            amountPaid: accepted,
            paymentReview: false,
            paymentReviewReason: null,
            history: pushHistory(current.history, "PAID", "ONLINE"),
          },
        });
      }, LOCK_TX);
    } else {
      await rejectReviewPayments({ parentKind: "relocation", parentId: row.id, userId: req.user.sub });
      await prisma.relocationRequest.update({ where: { id: row.id }, data: { paymentReview: false, paymentReviewReason: null } });
    }
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  await writeAudit({ userId: req.user.sub, action: "PAYMENT_REVIEW", entityType: "RelocationRequest", entityId: row.id, summary: `${row.reference || row.id} ${row.paymentReviewReason}: ${accept ? "accepted" : "refunded"}` });
  res.json({ id: row.id, reference: row.reference, accepted: accept });
});

relocationStaff.post("/:id/notes", async (req, res) => {
  const version = requireVersion(req);
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  assertVersion(row, version);
  const updated = await versionedUpdate(prisma, "relocationRequest", {
    id: row.id,
    version,
    data: { staffNotes: String(req.body?.staffNotes || "").trim() || null },
  });
  res.json({ id: updated.id, staffNotes: updated.staffNotes, version: updated.version });
});

/** Staff with Relocation → view get a 5-minute signed download link. */
relocationStaff.get("/:id/documents/:docId/link", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, organizationId: req.user.organizationId } },
    select: { id: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(signedDocumentLink(doc.id, `s:${req.user.sub}`));
});

relocationStaff.get("/:id/documents/:docId", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, organizationId: req.user.organizationId } },
    select: { id: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.redirect(303, signedDocumentLink(doc.id, `s:${req.user.sub}`).url);
});

/**
 * GET /api/relocation-files/:docId?p&exp&sig — the signed link is bound to the person it was
 * issued to; their session must still be valid (and staff must still hold Relocation → view).
 * Served as an attachment with nosniff and a locked-down CSP, never inline.
 */
export const relocationFiles = Router();

relocationFiles.get("/:docId", async (req, res, next) => {
  const { p: principal, exp, sig } = req.query;
  if (!linkValid(req.params.docId, String(principal || ""), exp, sig)) {
    return res.status(403).json({ error: "This download link is not valid or has expired", code: "LINK_INVALID" });
  }
  const p = String(principal);
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId },
    include: { request: { select: { customerId: true, organizationId: true } } },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (p.startsWith("c:")) {
    const session = await customerSession(req, res);
    if (!session || `c:${session.sub}` !== p || doc.request.customerId !== session.sub) {
      return res.status(403).json({ error: "Sign in with the account that owns this document" });
    }
    return await sendDocument(res, doc);
  }
  if (p.startsWith("s:")) {
    return authMiddleware(req, res, async () => {
      try {
        if (`s:${req.user.sub}` !== p || doc.request.organizationId !== req.user.organizationId) {
          return res.status(403).json({ error: "Not allowed" });
        }
        if (!(await hasModule(req, "relocation", "view"))) {
          return res.status(403).json({ error: "Insufficient permission for this action", code: "FORBIDDEN" });
        }
        return await sendDocument(res, doc);
      } catch (e) {
        next(e);
      }
    });
  }
  return res.status(403).json({ error: "Not allowed" });
});
