import crypto from "crypto";
import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { customerSession } from "../lib/customerSession.js";
import { DOCUMENT_MIMES, contentDisposition, sniffFileType } from "../lib/fileCheck.js";
import { createSkipcashPayment, skipcashConfigured } from "../lib/skipcash.js";
import { mailCustomer, mailStaff } from "../lib/mailer.js";

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

function sendDocument(res, doc) {
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

function publicRequest(row) {
  return {
    id: row.id,
    destination: row.destination,
    petSummary: row.petSummary,
    status: row.status,
    quoteAmount: row.quoteAmount != null ? Number(row.quoteAmount) : null,
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

async function readDocuments(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (raw.length > 3) {
    const err = new Error("Attach up to three documents");
    err.status = 400;
    throw err;
  }
  return raw.map((doc) => {
    const bytes = Buffer.from(String(doc?.dataBase64 || ""), "base64");
    if (!bytes.length || bytes.length > 1_200_000) {
      const err = new Error("Each document must be under 1.2 MB");
      err.status = 400;
      throw err;
    }
    // NFR-18: only PDF, JPEG or PNG, decided from the file's bytes (not the declared type).
    const kind = sniffFileType(bytes);
    if (!kind || !DOCUMENT_MIMES.includes(kind.mime)) {
      const err = new Error("Documents must be PDF, JPEG or PNG files");
      err.status = 400;
      throw err;
    }
    let fileName = String(doc?.fileName || "document").replace(/[\r\n"\\/]/g, "_").slice(0, 120) || "document";
    if (!fileName.toLowerCase().endsWith(`.${kind.ext}`)) fileName = `${fileName.replace(/\.[^.]*$/, "")}.${kind.ext}`;
    return { fileName, mime: kind.mime, content: bytes };
  });
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
    const documents = await readDocuments(req.body?.documents);
    if (!documents.length) return res.status(400).json({ error: "Attach the relocation documents" });
    const row = await prisma.relocationRequest.create({
      data: {
        organizationId: req.shopOrg.id,
        customerId: req.customer.id,
        destination,
        petSummary: petSummary || null,
        history: pushHistory([], "SUBMITTED", ""),
        pets: { create: pets.map((pet) => ({ petId: pet.id })) },
        documents: { create: documents },
      },
      include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
    });
    await mailStaff(req.shopOrg.id, "alertRelocation", `Relocation request ${row.id} was submitted.`);
    res.status(201).json(publicRequest(row));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not submit the request" });
  }
});

relocationShop.get("/:id", async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, customerId: req.customer.id },
    include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
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
  const documents = await readDocuments(req.body?.documents);
  if (!documents.length) return res.status(400).json({ error: "Attach a document" });
  const updated = await prisma.relocationRequest.update({
    where: { id: row.id },
    data: {
      status: "DOCUMENTS_RECEIVED",
      history: pushHistory(row.history, "DOCUMENTS_RECEIVED", ""),
      documents: { create: documents },
    },
    include: { pets: { include: { pet: true } }, documents: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
  });
  res.json(publicRequest(updated));
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
    Amount: Number(row.quoteAmount).toFixed(2),
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
  res.json({ payUrl: payment.payUrl, total: Number(row.quoteAmount) });
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
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows);
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
  const updated = await prisma.relocationRequest.update({
    where: { id: row.id },
    data: {
      status: next,
      history: pushHistory(row.history, next, String(req.body?.note || "").trim()),
    },
  });
  const buyer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
  await mailCustomer(buyer, "relocation", `Relocation ${updated.id} is now ${updated.status}.`);
  res.json(updated);
});

relocationStaff.post("/:id/quote", async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Enter a quote amount" });
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (!["UNDER_REVIEW", "QUOTE_SENT"].includes(row.status)) {
    return res.status(400).json({ error: "Review the request before sending a quote" });
  }
  const updated = await prisma.relocationRequest.update({
    where: { id: row.id },
    data: {
      status: "QUOTE_SENT",
      quoteAmount: new Prisma.Decimal(amount.toFixed(2)),
      quoteNote: req.body?.note ? String(req.body.note).trim() : null,
      history: pushHistory(row.history, "QUOTE_SENT", req.body?.note ? String(req.body.note).trim() : ""),
    },
  });
  const buyer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
  await mailCustomer(buyer, "relocation", `A quote of ${amount.toFixed(2)} QAR is ready.`);
  res.json(updated);
});

relocationStaff.post("/:id/pay", async (req, res) => {
  const method = String(req.body?.method || "").toUpperCase();
  if (!["CASH", "BANK"].includes(method)) return res.status(400).json({ error: "Record cash or a bank transfer" });
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row || row.status !== "QUOTE_SENT") return res.status(400).json({ error: "There is no quote to mark paid" });
  const updated = await prisma.relocationRequest.update({
    where: { id: row.id },
    data: {
      status: "PAID",
      paymentMethod: method,
      paidAt: new Date(),
      history: pushHistory(row.history, "PAID", method),
    },
  });
  const buyer = await prisma.customer.findUnique({ where: { id: updated.customerId } });
  await mailCustomer(buyer, "relocation", `Relocation ${updated.id} is marked paid.`);
  res.json(updated);
});

relocationStaff.post("/:id/notes", async (req, res) => {
  const row = await prisma.relocationRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).json({ error: "Request not found" });
  const updated = await prisma.relocationRequest.update({
    where: { id: row.id },
    data: { staffNotes: String(req.body?.staffNotes || "").trim() || null },
  });
  res.json({ id: updated.id, staffNotes: updated.staffNotes });
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
    return sendDocument(res, doc);
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
        return sendDocument(res, doc);
      } catch (e) {
        next(e);
      }
    });
  }
  return res.status(403).json({ error: "Not allowed" });
});
