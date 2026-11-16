import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../middleware/auth.js";
import jwt from "jsonwebtoken";
import { createSkipcashPayment, skipcashConfigured, skipcashWebhookValid } from "../lib/skipcash.js";
import { commitSaleHolds, heldQuantity, releaseSaleHolds, restoreCommittedHolds, sweepExpiredHolds } from "../lib/webOrder.js";
import { quotePromotions } from "../lib/promotions.js";
import { mailConfigured, mailCustomer, mailStaff } from "../lib/mailer.js";
import { publicBase as publicUrl } from "../lib/publicUrl.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function publicBase(req) {
  return publicUrl(req);
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

async function websiteBranch(org) {
  if (!org?.websiteBranchId) return null;
  const branch = await prisma.branch.findFirst({
    where: { id: org.websiteBranchId, organizationId: org.id, isActive: true },
  });
  if (!branch || branch.kind === "VAN") return null;
  return branch;
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

function money(n) {
  return new Prisma.Decimal(Number(n).toFixed(2));
}

function unitsFor(product, raw) {
  const n = Number(raw);
  if (product.sellBy === "WEIGHT") {
    const grams = Math.round(n);
    if (!Number.isFinite(grams) || grams < 1) {
      const err = new Error("Enter a weight");
      err.status = 400;
      throw err;
    }
    return grams;
  }
  const qty = Math.floor(n);
  if (!Number.isFinite(qty) || qty < 1) {
    const err = new Error("Enter a quantity");
    err.status = 400;
    throw err;
  }
  return qty;
}

function lineMoney(product, price, units) {
  if (product.sellBy === "WEIGHT") return price.mul(units).div(1000);
  return price.mul(units);
}

function publicProduct(product, branchId) {
  const images = [product.imageUrl, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
  const open = product.takesStock === false;
  const variants = (product.variants || []).filter((v) => v.isActive).map((v) => {
    const stock = (v.stocks || []).find((s) => s.branchId === branchId);
    return {
      id: v.id,
      label: v.label,
      labelEn: v.labelEn,
      sku: v.sku,
      price: Number(v.price),
      packWeight: v.packWeight != null ? Number(v.packWeight) : null,
      available: open ? 99 : stock?.quantity ?? 0,
    };
  });
  const own = (product.inventories || []).find((s) => s.branchId === branchId);
  return {
    id: product.id,
    name: product.name,
    nameEn: product.nameEn,
    shortTitle: product.shortTitle,
    shortTitleEn: product.shortTitleEn,
    description: product.description,
    descriptionEn: product.descriptionEn,
    sellBy: product.sellBy,
    price: Number(product.price),
    images,
    categoryId: product.categoryId,
    category: product.productCategory,
    petTypes: (product.petLinks || []).map((link) => link.petType),
    isPetHouse: product.isPetHouse === true,
    leadTimeDays: product.leadTimeDays,
    houseDeliveryFee: Number(product.houseDeliveryFee || 0),
    takesStock: product.takesStock !== false,
    variants,
    available: variants.length ? null : open ? 99 : own?.quantity ?? 0,
  };
}

function civilDate(iso) {
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(String(iso || ""))) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

function weekdayOf(iso) {
  const date = civilDate(iso);
  return date ? date.getUTCDay() : null;
}

async function seatsUsed(windowId, isoDate) {
  const deliveryDate = civilDate(isoDate);
  if (!deliveryDate) return 0;
  return prisma.sale.count({
    where: {
      deliveryWindowId: windowId,
      deliveryDate,
      NOT: { webStatus: "CANCELLED" },
      OR: [{ webStatus: { not: "PENDING_PAYMENT" } }, { holdExpiresAt: { gt: new Date() } }],
    },
  });
}

router.get("/meta", async (req, res) => {
  const org = await shopOrg();
  if (!org) return res.json({ petTypes: [], categories: [], areas: [], windows: [], location: null });
  await sweepExpiredHolds();
  const branch = await websiteBranch(org);
  const [petTypes, categories, areas, windows] = await Promise.all([
    prisma.catalogPetType.findMany({ where: { organizationId: org.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true },
    }),
    prisma.deliveryArea.findMany({ where: { organizationId: org.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.deliveryWindow.findMany({ where: { organizationId: org.id, isActive: true }, orderBy: { startTime: "asc" } }),
  ]);
  const seatRows = branch
    ? await prisma.stockHold.groupBy({
        by: ["windowId"],
        where: {
          organizationId: org.id,
          windowId: { not: null },
          OR: [
            { status: "COMMITTED" },
            { status: "HELD", expiresAt: { gt: new Date() } },
          ],
        },
        _count: { _all: true },
      })
    : [];
  const taken = new Map(seatRows.map((row) => [row.windowId, row._count._all]));
  res.json({
    location: branch ? { id: branch.id, name: branch.name, nameEn: branch.nameEn } : null,
    petTypes,
    categories,
    whatsappNumber: org.whatsappNumber || "",
    homeVisitFee: Number(org.homeVisitFee || 0),
    business: {
      name: org.name,
      phone: org.phone || "",
      email: org.publicEmail || "",
      address: org.publicAddress || "",
      hours: org.hoursText || "",
      hoursEn: org.hoursTextEn || "",
      whatsapp: org.whatsappNumber || "",
    },
    areas: areas.map((a) => ({ id: a.id, name: a.name, nameEn: a.nameEn, city: a.city, fee: Number(a.fee) })),
    windows: windows.map((w) => ({
      id: w.id,
      label: w.label,
      labelEn: w.labelEn,
      weekday: w.weekday,
      startTime: w.startTime,
      endTime: w.endTime,
      seatsLeft: Math.max(0, w.seats - (taken.get(w.id) || 0)),
    })),
  });
});

router.get("/catalog", async (req, res) => {
  const org = await shopOrg();
  const branch = await websiteBranch(org);
  if (!branch) return res.json([]);
  await sweepExpiredHolds();
  const where = { organizationId: org.id, isActive: true };
  if (req.query.categoryId) where.categoryId = String(req.query.categoryId);
  if (req.query.petTypeId) {
    where.OR = [
      { petLinks: { none: {} } },
      { petLinks: { some: { petTypeId: String(req.query.petTypeId) } } },
    ];
  }
  if (req.query.houses === "1") where.isPetHouse = true;
  if (req.query.q) {
    const q = String(req.query.q);
    where.AND = [
      {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }
  const rows = await prisma.product.findMany({
    where,
    orderBy: { nameEn: "asc" },
    take: 80,
    include: {
      productCategory: { select: { id: true, name: true, nameEn: true } },
      petLinks: { include: { petType: true } },
      inventories: { where: { branchId: branch.id } },
      variants: { where: { isActive: true }, include: { stocks: { where: { branchId: branch.id } } } },
    },
  });
  const out = [];
  for (const product of rows) {
    const dto = publicProduct(product, branch.id);
    if (dto.variants.length) {
      for (const variant of dto.variants) {
        variant.available -= await heldQuantity(prisma, {
          branchId: branch.id,
          productId: product.id,
          variantId: variant.id,
        });
      }
      dto.variants = dto.variants.filter((v) => v.available > 0 || true);
    } else {
      dto.available -= await heldQuantity(prisma, { branchId: branch.id, productId: product.id, variantId: null });
    }
    out.push(dto);
  }
  res.json(out);
});

router.get("/products/:id", async (req, res) => {
  const org = await shopOrg();
  const branch = await websiteBranch(org);
  if (!branch) return res.status(404).json({ error: "The shop is not open yet" });
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: org.id, isActive: true },
    include: {
      productCategory: { select: { id: true, name: true, nameEn: true } },
      petLinks: { include: { petType: true } },
      inventories: { where: { branchId: branch.id } },
      variants: { where: { isActive: true }, include: { stocks: { where: { branchId: branch.id } } } },
    },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const dto = publicProduct(product, branch.id);
  if (dto.variants.length) {
    for (const variant of dto.variants) {
      variant.available -= await heldQuantity(prisma, {
        branchId: branch.id,
        productId: product.id,
        variantId: variant.id,
      });
    }
  } else {
    dto.available -= await heldQuantity(prisma, { branchId: branch.id, productId: product.id, variantId: null });
  }
  res.json(dto);
});

/** Queues the verification email in the customer's language. Never throws. */
async function sendVerifyEmail(customer, token, req) {
  const link = `${publicBase(req)}/shop/verify?token=${encodeURIComponent(token)}`;
  const queued = await mailCustomer(customer, "verify", { name: customer.name, link });
  return { sent: Boolean(queued) && mailConfigured(), link: process.env.NODE_ENV === "production" ? null : link };
}

function bodyLocale(req) {
  const raw = String(req.body?.locale || req.body?.lang || "").toLowerCase();
  return raw === "en" || raw === "ar" ? raw : null;
}

router.post("/register", async (req, res) => {
  const org = await shopOrg();
  if (!org) return res.status(400).json({ error: "Shop is not ready" });
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const phone = String(req.body?.phone || "").trim() || null;
  const locale = bodyLocale(req);
  if (!name || !email || password.length < 8) {
    return res.status(400).json({ error: "Name, email, and a password of at least 8 characters are required" });
  }
  const existing = await prisma.customer.findFirst({
    where: { organizationId: org.id, email: { equals: email, mode: "insensitive" } },
  });
  const token = crypto.randomBytes(24).toString("hex");
  const verifyTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  let customer = existing;
  if (existing?.passwordHash) {
    return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
  }
  if (existing) {
    customer = await prisma.customer.update({
      where: { id: existing.id },
      data: { name, phone, passwordHash, verifyTokenHash, emailVerifiedAt: null, ...(locale ? { locale } : {}) },
    });
  } else {
    customer = await prisma.customer.create({
      data: { organizationId: org.id, name, email, phone, passwordHash, verifyTokenHash, ...(locale ? { locale } : {}) },
    });
  }
  const mail = await sendVerifyEmail(customer, token, req);
  res.status(201).json({ id: customer.id, email, verifyEmailSent: mail.sent, verifyLink: mail.link });
});

router.post("/verify", async (req, res) => {
  const token = String(req.body?.token || req.query?.token || "").trim();
  if (!token) return res.status(400).json({ error: "Missing token" });
  const verifyTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const customer = await prisma.customer.findFirst({ where: { verifyTokenHash } });
  if (!customer) return res.status(400).json({ error: "This confirmation link is not valid" });
  await prisma.customer.update({
    where: { id: customer.id },
    data: { emailVerifiedAt: new Date(), verifyTokenHash: null },
  });
  const session = signToken({
    sub: customer.id,
    role: "CUSTOMER",
    organizationId: customer.organizationId,
    email: customer.email,
  });
  res.json({ token: session, name: customer.name, email: customer.email });
});

router.post("/login", async (req, res) => {
  const org = await shopOrg();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const customer = await prisma.customer.findFirst({
    where: { organizationId: org?.id || "", email: { equals: email, mode: "insensitive" } },
  });
  if (!customer?.passwordHash || !(await bcrypt.compare(password, customer.passwordHash))) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  if (!customer.emailVerifiedAt) {
    return res.status(403).json({ error: "Confirm your email before signing in", code: "EMAIL_UNVERIFIED" });
  }
  const token = signToken({
    sub: customer.id,
    role: "CUSTOMER",
    organizationId: customer.organizationId,
    email: customer.email,
  });
  res.json({ token, name: customer.name, email: customer.email });
});

router.post("/forgot", async (req, res) => {
  const org = await shopOrg();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const customer = await prisma.customer.findFirst({
    where: { organizationId: org?.id || "", email: { equals: email, mode: "insensitive" }, passwordHash: { not: null } },
  });
  if (!customer) return res.json({ ok: true });
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      resetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      resetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const link = `${publicBase(req)}/shop/reset?token=${encodeURIComponent(token)}`;
  const locale = bodyLocale(req);
  await mailCustomer(locale ? { ...customer, locale } : customer, "reset", { link });
  res.json({ ok: true, resetLink: !mailConfigured() && process.env.NODE_ENV !== "production" ? link : null });
});

router.post("/reset", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || password.length < 8) return res.status(400).json({ error: "Use a password of at least 8 characters" });
  const customer = await prisma.customer.findFirst({
    where: { resetTokenHash: crypto.createHash("sha256").update(token).digest("hex") },
  });
  if (!customer?.resetExpiresAt || customer.resetExpiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is not valid" });
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      resetTokenHash: null,
      resetExpiresAt: null,
      emailVerifiedAt: customer.emailVerifiedAt || new Date(),
    },
  });
  res.json({ ok: true });
});

function requireCustomer(req, res) {
  const session = customerFromHeader(req);
  if (!session) {
    res.status(401).json({ error: "Sign in to continue" });
    return null;
  }
  return session;
}

router.get("/me", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  const customer = await prisma.customer.findFirst({
    where: { id: session.sub, organizationId: session.organizationId },
    include: { pets: true, addresses: true },
  });
  if (!customer) return res.status(404).json({ error: "Account not found" });
  res.json({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    pets: customer.pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      breed: pet.breed,
      ageText: pet.ageText,
      petTypeId: pet.petTypeId,
    })),
    addresses: customer.addresses,
  });
});

router.post("/me/pets", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Pet name is required" });
  const pet = await prisma.customerPet.create({
    data: {
      organizationId: session.organizationId,
      customerId: session.sub,
      name,
      breed: req.body?.breed ? String(req.body.breed).trim() : null,
      ageText: req.body?.ageText ? String(req.body.ageText).trim() : null,
      petTypeId: req.body?.petTypeId ? String(req.body.petTypeId) : null,
    },
  });
  res.status(201).json({ id: pet.id, name: pet.name, breed: pet.breed, ageText: pet.ageText, petTypeId: pet.petTypeId });
});

router.post("/me/addresses", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  const line1 = String(req.body?.line1 || "").trim();
  if (!line1) return res.status(400).json({ error: "Address is required" });
  const address = await prisma.customerAddress.create({
    data: {
      customerId: session.sub,
      label: req.body?.label ? String(req.body.label).trim() : null,
      line1,
      area: req.body?.area ? String(req.body.area).trim() : null,
      city: req.body?.city ? String(req.body.city).trim() : "Doha",
      lat: req.body?.lat != null && req.body.lat !== "" && Number.isFinite(Number(req.body.lat)) ? new Prisma.Decimal(Number(req.body.lat).toFixed(6)) : null,
      lng: req.body?.lng != null && req.body.lng !== "" && Number.isFinite(Number(req.body.lng)) ? new Prisma.Decimal(Number(req.body.lng).toFixed(6)) : null,
      isDefault: Boolean(req.body?.isDefault),
    },
  });
  res.status(201).json(address);
});

router.get("/orders", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  const rows = await prisma.sale.findMany({
    where: { customerId: session.sub, orderChannel: "WEBSITE" },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { items: { include: { product: { select: { name: true, nameEn: true, sellBy: true } }, variant: true } } },
  });
  res.json(rows.map(publicOrder));
});

router.get("/orders/:id", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, customerId: session.sub, orderChannel: "WEBSITE" },
    include: { items: { include: { product: { select: { name: true, nameEn: true, sellBy: true } }, variant: true } } },
  });
  if (!sale) return res.status(404).json({ error: "Order not found" });
  res.json(publicOrder(sale));
});

function publicOrder(sale) {
  return {
    id: sale.id,
    status: sale.webStatus,
    fulfillment: sale.fulfillment,
    total: Number(sale.total),
    deliveryFee: Number(sale.deliveryFee || 0),
    deliveryAddress: sale.deliveryAddress,
    createdAt: sale.createdAt,
    items: (sale.items || []).map((item) => ({
      name: item.product?.name,
      nameEn: item.product?.nameEn,
      variant: item.variant?.label || null,
      sellBy: item.product?.sellBy,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}

router.post("/orders/:id/cancel", async (req, res) => {
  const session = requireCustomer(req, res);
  if (!session) return;
  try {
    const sale = await prisma.$transaction(async (tx) => {
      const row = await tx.sale.findFirst({
        where: { id: req.params.id, customerId: session.sub, orderChannel: "WEBSITE" },
      });
      if (!row) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }
      if (row.webStatus !== "CONFIRMED") {
        const err = new Error("This order can only be cancelled before it is being prepared");
        err.status = 400;
        throw err;
      }
      await restoreCommittedHolds(tx, row.id);
      return tx.sale.update({
        where: { id: row.id },
        data: { webStatus: "CANCELLED", invoiceStatus: "CANCELLED" },
      });
    });
    res.json({ id: sale.id, status: sale.webStatus });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Could not cancel" });
  }
});

router.get("/windows", async (req, res) => {
  const org = await shopOrg();
  if (!org) return res.json([]);
  await sweepExpiredHolds();
  const date = String(req.query.date || "");
  const weekday = weekdayOf(date);
  if (weekday == null) return res.status(400).json({ error: "Choose a delivery date" });
  const windows = await prisma.deliveryWindow.findMany({
    where: {
      organizationId: org.id,
      isActive: true,
      OR: [{ weekday: null }, { weekday }],
    },
    orderBy: { startTime: "asc" },
  });
  const rows = [];
  for (const windowRow of windows) {
    const used = await seatsUsed(windowRow.id, date);
    rows.push({
      id: windowRow.id,
      label: windowRow.label,
      labelEn: windowRow.labelEn,
      weekday: windowRow.weekday,
      startTime: windowRow.startTime,
      endTime: windowRow.endTime,
      seatsLeft: Math.max(0, windowRow.seats - used),
    });
  }
  res.json(rows);
});

router.post("/checkout", async (req, res) => {
  try {
    if (!skipcashConfigured()) {
      return res.status(503).json({
        error: "Card payment is not configured yet. Add the SkipCash key and secret on the server.",
        code: "SKIPCASH_NOT_CONFIGURED",
      });
    }
    const org = await shopOrg();
    const branch = await websiteBranch(org);
    if (!org || !branch) return res.status(400).json({ error: "The website selling location is not set" });
    await sweepExpiredHolds();
    const body = req.body || {};
    const fulfillment = String(body.fulfillment || "").toUpperCase() === "PICKUP" ? "PICKUP" : "DELIVERY";
    const session = customerFromHeader(req);
    const email = String(body.email || session?.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    if (!email || !name || !phone) return res.status(400).json({ error: "Name, email, and phone are required" });
    if (!Array.isArray(body.items) || !body.items.length) return res.status(400).json({ error: "The cart is empty" });

    let area = null;
    let windowRow = null;
    let addressText = "";
    let deliveryDate = null;
    let pin = null;
    if (fulfillment === "DELIVERY") {
      addressText = String(body.address || "").trim();
      if (!addressText) return res.status(400).json({ error: "A delivery address is required" });
      deliveryDate = civilDate(body.deliveryDate);
      if (!deliveryDate) return res.status(400).json({ error: "Choose a delivery date" });
      const lat = body.lat === "" || body.lat == null ? null : Number(body.lat);
      const lng = body.lng === "" || body.lng == null ? null : Number(body.lng);
      if ((lat == null) !== (lng == null) || (lat != null && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180))) {
        return res.status(400).json({ error: "Enter both map pin coordinates, or leave them blank" });
      }
      if (lat != null) pin = { lat, lng };
      if (body.areaId) {
        area = await prisma.deliveryArea.findFirst({
          where: { id: String(body.areaId), organizationId: org.id, isActive: true },
        });
      }
      if (body.windowId) {
        windowRow = await prisma.deliveryWindow.findFirst({
          where: { id: String(body.windowId), organizationId: org.id, isActive: true },
        });
      }
      if (!windowRow) return res.status(400).json({ error: "Choose a delivery window" });
      const day = weekdayOf(body.deliveryDate);
      if (windowRow.weekday != null && windowRow.weekday !== day) {
        return res.status(400).json({ error: "That window is not on the chosen day" });
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const found = await tx.customer.findFirst({
        where: { organizationId: org.id, email: { equals: email, mode: "insensitive" } },
      });
      if (found) {
        return tx.customer.update({
          where: { id: found.id },
          data: {
            name: found.name || name,
            phone: found.phone || phone,
            locale: body.locale === "en" ? "en" : body.locale === "ar" ? "ar" : found.locale,
          },
        });
      }
      return tx.customer.create({
        data: { organizationId: org.id, name, email, phone, locale: body.locale === "en" ? "en" : "ar" },
      });
    });

    const prepared = [];
    let goods = new Prisma.Decimal(0);
    for (const raw of body.items) {
      const product = await prisma.product.findFirst({
        where: { id: String(raw.productId || ""), organizationId: org.id, isActive: true },
        include: { variants: true },
      });
      if (!product) return res.status(400).json({ error: "A product in the cart is no longer available" });
      const units = unitsFor(product, raw.quantity);
      let variant = null;
      let price = product.price;
      if (product.variants.length) {
        variant = product.variants.find((v) => v.id === raw.variantId && v.isActive);
        if (!variant) return res.status(400).json({ error: `Choose a variant for ${product.nameEn || product.name}` });
        price = variant.price;
      } else if (raw.variantId) {
        return res.status(400).json({ error: "That variant is not on this product" });
      }
      let unitCost = 0;
      if (product.takesStock !== false) {
      const stockRow = variant
        ? await prisma.variantStock.findUnique({
            where: { variantId_branchId: { variantId: variant.id, branchId: branch.id } },
          })
        : await prisma.inventory.findUnique({
            where: { productId_branchId: { productId: product.id, branchId: branch.id } },
          });
      const onHand = stockRow?.quantity ?? 0;
      unitCost = stockRow?.unitCost != null ? Number(stockRow.unitCost) : 0;
        const held = await heldQuantity(prisma, {
          branchId: branch.id,
          productId: product.id,
          variantId: variant?.id || null,
        });
        if (onHand - held < units) {
          return res.status(400).json({ error: `Not enough stock for ${variant?.label || product.nameEn || product.name}` });
        }
      }
      const subtotal = lineMoney(product, price, units);
      goods = goods.add(subtotal);
      prepared.push({
        product,
        variant,
        units,
        price,
        subtotal,
        unitCost,
        costAmount: product.sellBy === "WEIGHT" ? (unitCost * units) / 1000 : unitCost * units,
        discount: 0,
      });
    }
    const promo = await quotePromotions(prisma, {
      organizationId: org.id,
      channel: "WEBSITE",
      lines: prepared.map((line) => ({
        productId: line.product.id,
        categoryId: line.product.categoryId,
        quantity: line.units,
        subtotal: Number(line.subtotal),
        sellBy: line.product.sellBy,
      })),
      goods: Number(goods),
      code: body.code,
    });
    prepared.forEach((line, index) => {
      line.discount = promo.lineDiscounts[index] || 0;
    });
    goods = goods.sub(promo.discountDec);
    if (goods.lessThan(0)) goods = new Prisma.Decimal(0);

    if (windowRow) {
      const used = await seatsUsed(windowRow.id, body.deliveryDate);
      if (used >= windowRow.seats) return res.status(400).json({ error: "That delivery window is full" });
    }

    let fee = area ? area.fee : new Prisma.Decimal(0);
    if (fulfillment === "DELIVERY") {
      for (const line of prepared) {
        if (line.product.isPetHouse) {
          const copies = line.product.sellBy === "WEIGHT" ? 1 : line.units;
          fee = fee.add(new Prisma.Decimal(line.product.houseDeliveryFee || 0).mul(copies));
        }
      }
    }
    const total = goods.add(fee);
    const holdMinutes = Math.max(5, Number(org.holdMinutes) || 20);
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    const [first, ...rest] = name.split(/\s+/);
    const staff = await prisma.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
      select: { id: true },
    });
    if (!staff) return res.status(500).json({ error: "Shop checkout needs a staff user on the account" });
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          branchId: branch.id,
          userId: staff.id,
          customerId: customer.id,
          channel: "RETAIL",
          orderChannel: "WEBSITE",
          webStatus: "PENDING_PAYMENT",
          fulfillment,
          deliveryAddress: fulfillment === "DELIVERY" ? addressText : null,
          deliveryAreaId: area?.id || null,
          deliveryWindowId: windowRow?.id || null,
          deliveryDate,
          deliveryLat: pin ? new Prisma.Decimal(pin.lat.toFixed(6)) : null,
          deliveryLng: pin ? new Prisma.Decimal(pin.lng.toFixed(6)) : null,
          deliveryFee: fee,
          total,
          discountAmount: promo.discountDec,
          promotionDiscount: promo.discountDec,
          taxAmount: 0,
          taxPercent: 0,
          amountPaid: 0,
          amountDue: total,
          paymentMethod: "ONLINE",
          invoiceStatus: "ISSUED",
          holdExpiresAt: expiresAt,
          items: {
            create: prepared.map((line) => ({
              productId: line.product.id,
              variantId: line.variant?.id || null,
              quantity: line.units,
              unitPrice: line.price,
              subtotal: line.subtotal,
              discountAmount: new Prisma.Decimal(Number(line.discount || 0).toFixed(2)),
              unitCost: new Prisma.Decimal(Number(line.unitCost || 0).toFixed(4)),
              costAmount: new Prisma.Decimal(Number(line.costAmount || 0).toFixed(4)),
            })),
          },
        },
      });
      const stockLines = prepared.filter((line) => line.product.takesStock !== false);
      for (let i = 0; i < stockLines.length; i += 1) {
        const line = stockLines[i];
        await tx.stockHold.create({
          data: {
            organizationId: org.id,
            saleId: created.id,
            productId: line.product.id,
            variantId: line.variant?.id || null,
            branchId: branch.id,
            quantity: line.units,
            windowId: i === 0 ? windowRow?.id || null : null,
            status: "HELD",
            expiresAt,
          },
        });
      }
      if (!stockLines.length && windowRow && prepared[0]) {
        await tx.stockHold.create({
          data: {
            organizationId: org.id,
            saleId: created.id,
            productId: prepared[0].product.id,
            variantId: prepared[0].variant?.id || null,
            branchId: branch.id,
            quantity: 0,
            windowId: windowRow.id,
            status: "HELD",
            expiresAt,
          },
        });
      }
      return created;
    });

    const payment = await createSkipcashPayment({
      Uid: crypto.randomUUID(),
      KeyId: process.env.SKIPCASH_KEY_ID.trim(),
      Amount: Number(total).toFixed(2),
      FirstName: (first || "Customer").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Customer",
      LastName: (rest.join(" ") || "Catio").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Catio",
      Phone: phone.slice(0, 15),
      Email: email.slice(0, 255),
      TransactionId: sale.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40),
      Custom1: sale.id,
      WebhookUrl: `${(process.env.API_PUBLIC_URL || process.env.APP_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/api/shop/payments/skipcash`,
      ReturnUrl: `${publicBase(req)}/shop/orders/${sale.id}`,
    }).catch(async (err) => {
      await prisma.$transaction(async (tx) => {
        await releaseSaleHolds(tx, sale.id);
        await tx.sale.update({ where: { id: sale.id }, data: { webStatus: "CANCELLED" } });
      });
      throw err;
    });

    await prisma.sale.update({
      where: { id: sale.id },
      data: { gatewayPaymentId: payment.id, paymentReference: payment.id },
    });
    res.status(201).json({ orderId: sale.id, payUrl: payment.payUrl, total: Number(total) });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Checkout failed" });
  }
});

router.post("/fleetwiz", async (req, res) => {
  const key = process.env.FLEETWIZ_WEBHOOK_KEY?.trim();
  if (!key || req.headers["x-fleetwiz-key"] !== key) return res.status(401).json({ error: "Invalid signature" });
  const sale = await prisma.sale.findFirst({ where: { id: String(req.body?.orderId || ""), orderChannel: "WEBSITE" } });
  if (!sale) return res.status(200).json({ ok: true });
  await prisma.sale.update({
    where: { id: sale.id },
    data: {
      fleetwizReference: req.body?.reference ? String(req.body.reference) : sale.fleetwizReference,
      fleetwizStatus: req.body?.status ? String(req.body.status).slice(0, 80) : sale.fleetwizStatus,
    },
  });
  res.json({ ok: true });
});

router.post("/payments/skipcash", async (req, res) => {
  const body = req.body || {};
  if (!skipcashWebhookValid(body, req.headers.authorization)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const custom = String(body.Custom1 || "").trim();
  const statusId = Number(body.StatusId);
  if (custom.startsWith("till:")) return res.status(200).json({ ok: true });
  if (custom.startsWith("booking:")) {
    const booking = await prisma.appointment.findFirst({ where: { id: custom.slice(8) } });
    if (!booking || booking.status === "CONFIRMED" || booking.status === "CANCELLED") return res.status(200).json({ ok: true });
    if (statusId === 2 && booking.status === "PENDING_PAYMENT") {
      await prisma.appointment.update({
        where: { id: booking.id },
        data: { status: "CONFIRMED", paymentReference: String(body.PaymentId || booking.paymentReference || "") },
      });
      if (booking.customerId) {
        const buyer = await prisma.customer.findUnique({ where: { id: booking.customerId } });
        await mailCustomer(buyer, "booking", { reference: booking.id.slice(-8).toUpperCase(), status: "CONFIRMED", startAt: booking.startAt });
        await mailStaff(booking.organizationId, "alertBooking", { reference: booking.id.slice(-8).toUpperCase() });
      }
    } else if ([3, 4, 5].includes(statusId) && booking.status === "PENDING_PAYMENT") {
      await prisma.appointment.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    }
    return res.status(200).json({ ok: true });
  }
  if (custom.startsWith("relocation:")) {
    const request = await prisma.relocationRequest.findFirst({ where: { id: custom.slice(11) } });
    if (!request || request.status === "PAID" || request.status === "CANCELLED") return res.status(200).json({ ok: true });
    if (statusId === 2 && request.status === "QUOTE_SENT") {
      const history = Array.isArray(request.history) ? request.history : [];
      await prisma.relocationRequest.update({
        where: { id: request.id },
        data: {
          status: "PAID",
          paymentMethod: "ONLINE",
          paidAt: new Date(),
          history: [...history, { at: new Date().toISOString(), status: "PAID", note: "ONLINE" }],
        },
      });
      const buyer = await prisma.customer.findUnique({ where: { id: request.customerId } });
      await mailCustomer(buyer, "relocation", { reference: request.id.slice(-8).toUpperCase(), status: "PAID" });
    }
    return res.status(200).json({ ok: true });
  }
  const saleId = custom;
  const sale = saleId
    ? await prisma.sale.findFirst({ where: { id: saleId, orderChannel: "WEBSITE" } })
    : null;
  if (!sale) return res.status(200).json({ ok: true });
  if (sale.webStatus === "CONFIRMED" || sale.webStatus === "CANCELLED") return res.status(200).json({ ok: true });
  try {
    if (statusId === 2) {
      const paid = Number(body.Amount);
      if (Number.isFinite(paid) && Math.abs(paid - Number(sale.total)) > 0.05) {
        await prisma.sale.update({ where: { id: sale.id }, data: { paymentReview: true } });
        return res.status(200).json({ ok: true, review: true });
      }
      await prisma.$transaction(async (tx) => {
        const current = await tx.sale.findUnique({ where: { id: sale.id } });
        if (!current || current.webStatus !== "PENDING_PAYMENT") return;
        await commitSaleHolds(tx, current);
        await tx.sale.update({
          where: { id: current.id },
          data: {
            webStatus: "CONFIRMED",
            amountPaid: current.total,
            amountDue: 0,
            invoiceStatus: "PAID",
            paidAt: new Date(),
            paymentReference: String(body.PaymentId || current.paymentReference || ""),
          },
        });
      });
      if (sale.customerId) {
        const buyer = await prisma.customer.findUnique({ where: { id: sale.customerId } });
        const reference = sale.invoiceNumber || sale.id.slice(-8).toUpperCase();
        await mailCustomer(buyer, "order", { reference, status: "CONFIRMED", link: `${publicBase(req)}/shop/orders/${sale.id}` });
        if (buyer) await mailStaff(buyer.organizationId, "alertOrder", { reference });
      }
    } else if ([3, 4, 5].includes(statusId)) {
      await prisma.$transaction(async (tx) => {
        await releaseSaleHolds(tx, sale.id);
        await tx.sale.update({ where: { id: sale.id }, data: { webStatus: "CANCELLED" } });
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Could not update the order" });
  }
});

export default router;
