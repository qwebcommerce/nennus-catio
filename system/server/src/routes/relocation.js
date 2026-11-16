import crypto from "crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole, requireModule } from "../middleware/auth.js";
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

function customerFromHeader(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "CUSTOMER" || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
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
    pets: (row.pets || []).map((link) => link.pet),
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
    const fileName = String(doc?.fileName || "document").slice(0, 120);
    const mime = String(doc?.mime || "application/octet-stream").slice(0, 80);
    const bytes = Buffer.from(String(doc?.dataBase64 || ""), "base64");
    if (!bytes.length || bytes.length > 1_200_000) {
      const err = new Error("Each document must be under 1.2 MB");
      err.status = 400;
      throw err;
    }
    return { fileName, mime, content: bytes };
  });
}

export const relocationShop = Router();

relocationShop.use(async (req, res, next) => {
  const session = customerFromHeader(req);
  const org = await shopOrg();
  if (!session || !org || session.organizationId !== org.id) {
    return res.status(401).json({ error: "Sign in with a customer account" });
  }
  const customer = await prisma.customer.findFirst({
    where: { id: session.sub, organizationId: org.id },
  });
  if (!customer?.passwordHash) {
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
    await mailStaff(req.shopOrg.id, "alertRelocation", { reference: row.id.slice(-8).toUpperCase() });
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

relocationShop.get("/:id/documents/:docId", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, customerId: req.customer.id } },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.setHeader("Content-Type", doc.mime);
  res.send(Buffer.from(doc.content));
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
relocationStaff.use(requireRole("ADMIN", "MANAGER"));
relocationStaff.use((req, res, next) => requireModule("relocation", req.method === "GET" ? "view" : "edit")(req, res, next));

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
  await mailCustomer(buyer, "relocation", { reference: updated.id.slice(-8).toUpperCase(), status: updated.status });
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
  await mailCustomer(buyer, "relocation", { reference: updated.id.slice(-8).toUpperCase(), status: "QUOTE_SENT", amount });
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
  await mailCustomer(buyer, "relocation", { reference: updated.id.slice(-8).toUpperCase(), status: "PAID" });
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

relocationStaff.get("/:id/documents/:docId", async (req, res) => {
  const doc = await prisma.relocationDocument.findFirst({
    where: { id: req.params.docId, request: { id: req.params.id, organizationId: req.user.organizationId } },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.setHeader("Content-Type", doc.mime);
  res.send(Buffer.from(doc.content));
});
