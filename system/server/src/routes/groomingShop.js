import crypto from "crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { createSkipcashPayment, skipcashConfigured } from "../lib/skipcash.js";
import { quotePromotions } from "../lib/promotions.js";
import { minutesOf, qatarDateTime, qatarParts, slotTaken, weekdayOf } from "../lib/groomingSlots.js";
import { sweepExpiredHolds } from "../lib/webOrder.js";
import { mailCustomer } from "../lib/mailer.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

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

function publicPackage(row) {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.nameEn,
    price: Number(row.price),
    durationMin: row.durationMin,
    included: row.included,
    includedEn: row.includedEn,
    petTypes: (row.petLinks || []).map((link) => link.petType),
  };
}

function publicBooking(row) {
  return {
    id: row.id,
    status: row.status,
    visitKind: row.visitKind,
    startAt: row.startAt,
    endAt: row.endAt,
    petName: row.petName,
    breed: row.breed,
    ageText: row.ageText,
    address: row.address,
    amount: Number(row.amount),
    homeFee: Number(row.homeFee),
    package: row.service ? { id: row.service.id, name: row.service.name, nameEn: row.service.nameEn } : null,
  };
}

router.get("/packages", async (_req, res) => {
  const org = await shopOrg();
  if (!org) return res.json([]);
  const rows = await prisma.groomingService.findMany({
    where: { organizationId: org.id, active: true },
    include: { petLinks: { include: { petType: true } } },
    orderBy: { name: "asc" },
  });
  res.json(rows.map(publicPackage));
});

router.get("/packages/:id", async (req, res) => {
  const org = await shopOrg();
  if (!org) return res.status(404).json({ error: "Package not found" });
  const row = await prisma.groomingService.findFirst({
    where: { id: req.params.id, organizationId: org.id, active: true },
    include: { petLinks: { include: { petType: true } } },
  });
  if (!row) return res.status(404).json({ error: "Package not found" });
  res.json({ ...publicPackage(row), homeVisitFee: Number(org.homeVisitFee) });
});

router.get("/availability", async (req, res) => {
  const org = await shopOrg();
  if (!org) return res.json([]);
  await sweepExpiredHolds();
  const date = String(req.query.date || "");
  const weekday = weekdayOf(date);
  const service = await prisma.groomingService.findFirst({
    where: { id: String(req.query.packageId || ""), organizationId: org.id, active: true },
  });
  if (!service || weekday == null) return res.status(400).json({ error: "Choose a package and a date" });
  const schedules = await prisma.groomingSchedule.findMany({
    where: { organizationId: org.id, weekday, isActive: true },
  });
  const duration = Math.max(10, service.durationMin || 60);
  const slots = [];
  for (const schedule of schedules) {
    const open = minutesOf(schedule.startTime);
    const close = minutesOf(schedule.endTime);
    if (open == null || close == null) continue;
    for (let startMin = open; startMin + duration <= close; startMin += duration) {
      const start = qatarDateTime(date, startMin);
      const end = qatarDateTime(date, startMin + duration);
      const taken = await slotTaken(prisma, org.id, start, end);
      if (taken < schedule.capacity) {
        slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), seatsLeft: schedule.capacity - taken });
      }
    }
  }
  res.json(slots);
});

router.get("/bookings", async (req, res) => {
  const session = customerFromHeader(req);
  const org = await shopOrg();
  if (!session || !org) return res.status(401).json({ error: "Sign in to see bookings" });
  const rows = await prisma.appointment.findMany({
    where: { organizationId: org.id, customerId: session.sub },
    include: { service: true },
    orderBy: { startAt: "desc" },
    take: 50,
  });
  res.json(rows.map(publicBooking));
});

router.get("/bookings/:id", async (req, res) => {
  const session = customerFromHeader(req);
  const org = await shopOrg();
  if (!session || !org) return res.status(401).json({ error: "Sign in to see bookings" });
  const row = await prisma.appointment.findFirst({
    where: { id: req.params.id, organizationId: org.id, customerId: session.sub },
    include: { service: true },
  });
  if (!row) return res.status(404).json({ error: "Booking not found" });
  res.json(publicBooking(row));
});

router.post("/bookings/:id/cancel", async (req, res) => {
  const session = customerFromHeader(req);
  const org = await shopOrg();
  if (!session || !org) return res.status(401).json({ error: "Sign in to cancel a booking" });
  const row = await prisma.appointment.findFirst({
    where: { id: req.params.id, organizationId: org.id, customerId: session.sub },
  });
  if (!row) return res.status(404).json({ error: "Booking not found" });
  if (row.status !== "CONFIRMED") {
    return res.status(400).json({ error: "This booking can only be cancelled while it is confirmed" });
  }
  const updated = await prisma.appointment.update({
    where: { id: row.id },
    data: { status: "CANCELLED" },
  });
  const customer = await prisma.customer.findUnique({ where: { id: session.sub } });
  await mailCustomer(customer, "booking", { reference: updated.id.slice(-8).toUpperCase(), status: "CANCELLED", startAt: updated.startAt });
  res.json({ id: updated.id, status: updated.status });
});

router.post("/book", async (req, res) => {
  try {
    if (!skipcashConfigured()) {
      return res.status(503).json({
        error: "Card payment is not configured yet. Add the SkipCash key and secret on the server.",
        code: "SKIPCASH_NOT_CONFIGURED",
      });
    }
    const org = await shopOrg();
    if (!org) return res.status(400).json({ error: "The shop is not ready" });
    await sweepExpiredHolds();
    const body = req.body || {};
    const session = customerFromHeader(req);
    const email = String(body.email || session?.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const petName = String(body.petName || "").trim();
    const breed = String(body.breed || "").trim();
    const ageText = String(body.ageText || "").trim();
    const visitKind = String(body.visitKind || "").toUpperCase() === "HOME" ? "HOME" : "SHOP";
    const startAt = new Date(String(body.startAt || ""));
    const endAt = new Date(String(body.endAt || ""));
    if (!email || !name || !phone || !petName || !breed || !ageText) {
      return res.status(400).json({ error: "Name, email, phone, and the pet's name, breed, and age are required" });
    }
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      return res.status(400).json({ error: "Choose a free time" });
    }
    const service = await prisma.groomingService.findFirst({
      where: { id: String(body.packageId || ""), organizationId: org.id, active: true },
    });
    if (!service) return res.status(400).json({ error: "That package is not available" });
    let area = null;
    let address = null;
    if (visitKind === "HOME") {
      address = String(body.address || "").trim();
      if (!address) return res.status(400).json({ error: "A home-visit address is required" });
      if (body.areaId) {
        area = await prisma.deliveryArea.findFirst({
          where: { id: String(body.areaId), organizationId: org.id, isActive: true },
        });
      }
      if (!area) return res.status(400).json({ error: "Choose an area for the home visit" });
    }
    const taken = await slotTaken(prisma, org.id, startAt, endAt);
    const local = qatarParts(startAt);
    const schedules = await prisma.groomingSchedule.findMany({
      where: { organizationId: org.id, weekday: local.weekday, isActive: true },
    });
    const startMinutes = local.minutes;
    const fits = schedules.some((schedule) => {
      const open = minutesOf(schedule.startTime);
      const close = minutesOf(schedule.endTime);
      return open != null && close != null && startMinutes >= open && startMinutes < close && taken < schedule.capacity;
    });
    if (!fits) return res.status(400).json({ error: "That time is no longer free" });

    const customer = await prisma.$transaction(async (tx) => {
      const found = await tx.customer.findFirst({
        where: { organizationId: org.id, email: { equals: email, mode: "insensitive" } },
      });
      if (found) return found;
      return tx.customer.create({ data: { organizationId: org.id, name, email, phone } });
    });
    const staff = await prisma.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
      select: { id: true },
    });
    if (!staff) return res.status(500).json({ error: "A booking needs a staff user on the account" });
    const branch = org.websiteBranchId
      ? await prisma.branch.findFirst({ where: { id: org.websiteBranchId, organizationId: org.id, isActive: true } })
      : await prisma.branch.findFirst({ where: { organizationId: org.id, isActive: true, kind: { not: "VAN" } } });
    const homeFee = visitKind === "HOME" ? org.homeVisitFee : new Prisma.Decimal(0);
    const gross = service.price.add(homeFee);
    const promo = await quotePromotions(prisma, {
      organizationId: org.id,
      channel: "GROOMING",
      lines: [],
      goods: Number(gross),
      code: body.code,
    });
    let amount = gross.sub(promo.discountDec);
    if (amount.lessThan(0)) amount = new Prisma.Decimal(0);
    const holdMinutes = Math.max(5, Number(org.holdMinutes) || 20);
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    const booking = await prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch?.id || null,
        customerId: customer.id,
        serviceId: service.id,
        petName,
        breed,
        ageText,
        visitKind,
        address,
        areaId: area?.id || null,
        homeFee,
        amount,
        status: "PENDING_PAYMENT",
        startAt,
        endAt,
        holdExpiresAt: expiresAt,
        createdByUserId: staff.id,
      },
    });
    if (Number(amount) <= 0) {
      await prisma.appointment.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
      return res.status(201).json({ bookingId: booking.id, total: 0 });
    }
    const [first, ...rest] = name.split(/\s+/);
    const payment = await createSkipcashPayment({
      Uid: crypto.randomUUID(),
      KeyId: process.env.SKIPCASH_KEY_ID.trim(),
      Amount: Number(amount).toFixed(2),
      FirstName: (first || "Customer").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Customer",
      LastName: (rest.join(" ") || "Catio").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Catio",
      Phone: phone.slice(0, 15),
      Email: email.slice(0, 255),
      TransactionId: booking.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40),
      Custom1: `booking:${booking.id}`,
      WebhookUrl: `${(process.env.API_PUBLIC_URL || process.env.APP_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/api/shop/payments/skipcash`,
      ReturnUrl: `${publicBase()}/shop/grooming/bookings/${booking.id}`,
    }).catch(async (err) => {
      await prisma.appointment.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
      throw err;
    });
    await prisma.appointment.update({
      where: { id: booking.id },
      data: { gatewayPaymentId: payment.id, paymentReference: payment.id },
    });
    res.status(201).json({ bookingId: booking.id, payUrl: payment.payUrl, total: Number(amount) });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || "Booking failed" });
  }
});

export default router;
