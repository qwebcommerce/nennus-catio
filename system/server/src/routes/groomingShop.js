import crypto from "crypto";
import { Router } from "express";
import { d, fmt, riyals } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import { createSkipcashPayment, skipcashConfigured } from "../lib/skipcash.js";
import { priceGrooming, priceBody } from "../lib/groomingPrice.js";
import { claimCoupon, couponErrorBody, isCouponError, releaseCouponFor } from "../lib/coupons.js";
import { claimSlot, minutesOf, qatarDateTime, slotTaken, weekdayOf } from "../lib/groomingSlots.js";
import { sweepExpiredHolds } from "../lib/webOrder.js";
import { lookupOnReturn } from "../lib/paymentLookup.js";
import { customerSession } from "../lib/customerSession.js";
import { LOCK_TX } from "../lib/payments.js";
import { mailCustomer, mailStaff } from "../lib/mailer.js";

const router = Router();

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

function publicPackage(row) {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.nameEn,
    price: riyals(row.price),
    durationMin: row.durationMin,
    included: row.included,
    includedEn: row.includedEn,
    petTypes: (row.petLinks || []).map((link) => link.petType),
  };
}

function cancelDeadline(row, org) {
  const hours = Math.max(0, Number(org?.bookingCancelHours ?? 24));
  return new Date(new Date(row.startAt).getTime() - hours * 60 * 60 * 1000);
}

function publicBooking(row, org) {
  const deadline = cancelDeadline(row, org);
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    note: row.notes,
    paid: d(row.amountPaid) > 0,
    cancelUntil: deadline,
    canCancel: row.status === "CONFIRMED" && new Date() < deadline,
    visitKind: row.visitKind,
    startAt: row.startAt,
    endAt: row.endAt,
    petName: row.petName,
    breed: row.breed,
    ageText: row.ageText,
    address: row.address,
    amount: riyals(row.amount),
    homeFee: riyals(row.homeFee),
    couponCode: row.couponCode || null,
    couponDiscount: riyals(row.couponDiscount || 0),
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
  res.json({ ...publicPackage(row), homeVisitFee: riyals(org.homeVisitFee) });
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
      if (start <= new Date()) continue;
      const taken = await slotTaken(prisma, org.id, start, end);
      if (taken < schedule.capacity) {
        slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), seatsLeft: schedule.capacity - taken });
      }
    }
  }
  res.json(slots);
});

router.get("/bookings", async (req, res) => {
  const session = await customerSession(req, res);
  const org = await shopOrg();
  if (!session || !org) return res.status(401).json({ error: "Sign in to see bookings" });
  const rows = await prisma.appointment.findMany({
    where: { organizationId: org.id, customerId: session.sub },
    include: { service: true },
    orderBy: { startAt: "desc" },
    take: 50,
  });
  res.json(rows.map((row) => publicBooking(row, org)));
});

router.get("/bookings/:id", async (req, res) => {
  const session = await customerSession(req, res);
  const org = await shopOrg();
  // A guest back from the card page proves the booking with the gateway payment id on the return URL.
  const returnPaymentId = String(req.query.paymentId || "").trim();
  if (!org || (!session && !returnPaymentId)) return res.status(401).json({ error: "Sign in to see bookings" });
  let row = await prisma.appointment.findFirst({
    where: session
      ? { id: req.params.id, organizationId: org.id, customerId: session.sub }
      : { id: req.params.id, organizationId: org.id, gatewayPaymentId: returnPaymentId },
    include: { service: true },
  });
  if (!row) return res.status(404).json({ error: "Booking not found" });
  // FR-76: back from the payment page — the server looks the payment up itself.
  if (await lookupOnReturn(req, "appointment", row, row.status === "PENDING_PAYMENT")) {
    row = await prisma.appointment.findUnique({ where: { id: row.id }, include: { service: true } });
  }
  res.json(session ? publicBooking(row, org) : { ...publicBooking(row, org), canCancel: false, guest: true });
});

router.post("/bookings/:id/cancel", async (req, res) => {
  const session = await customerSession(req, res);
  const org = await shopOrg();
  if (!session || !org) return res.status(401).json({ error: "Sign in to cancel a booking" });
  const row = await prisma.appointment.findFirst({
    where: { id: req.params.id, organizationId: org.id, customerId: session.sub },
  });
  if (!row) return res.status(404).json({ error: "Booking not found" });
  if (row.status !== "CONFIRMED") {
    return res.status(400).json({ error: "This booking can only be cancelled while it is confirmed" });
  }
  // FR-52: only until the cut-off set by the owner (hours before the start).
  const deadline = cancelDeadline(row, org);
  if (new Date() >= deadline) {
    return res.status(400).json({
      error: `Bookings can be cancelled up to ${org.bookingCancelHours} hours before they start. Please contact us.`,
      code: "CANCEL_WINDOW_CLOSED",
    });
  }
  const paid = d(row.amountPaid) > 0;
  // Guarded: a parallel staff change or retry cannot cancel twice. A paid cancel is flagged for a refund.
  const moved = await prisma.appointment.updateMany({
    where: { id: row.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", ...(paid ? { paymentReview: true, paymentReviewReason: "REFUND_DUE" } : {}) },
  });
  if (!moved.count) return res.status(409).json({ error: "This booking changed. Refresh and try again." });
  // fix-re: a paid booking keeps its coupon use unless the batch gives it back (releaseOnPaidCancel).
  await releaseCouponFor(prisma, row.id, "CUSTOMER_CANCEL");
  if (paid) {
    await mailStaff(org.id, "alertBooking", `Grooming booking ${row.reference || row.id} was cancelled by the customer. A refund of ${fmt(row.amountPaid)} QAR is due.`);
  }
  const customer = await prisma.customer.findUnique({ where: { id: session.sub } });
  await mailCustomer(customer, "booking", { reference: row.reference || row.id.slice(-8).toUpperCase(), status: "CANCELLED", startAt: row.startAt });
  res.json({ id: row.id, reference: row.reference, status: "CANCELLED", refundDue: paid });
});

/**
 * fix-re: price check before payment — the package, home-visit fee, the coupon (or automatic
 * promotion) and the total SkipCash will charge. Takes no use; /book checks again and claims it.
 */
router.post("/quote", async (req, res) => {
  try {
    const org = await shopOrg();
    if (!org) return res.status(400).json({ error: "The shop is not ready" });
    const body = req.body || {};
    const service = await prisma.groomingService.findFirst({
      where: { id: String(body.packageId || ""), organizationId: org.id, active: true },
    });
    if (!service) return res.status(400).json({ error: "That package is not available" });
    const session = await customerSession(req, res);
    const email = String(session?.email || body.email || "").trim().toLowerCase();
    const customer = email
      ? await prisma.customer.findFirst({ where: { organizationId: org.id, email: { equals: email, mode: "insensitive" } }, select: { id: true } })
      : null;
    const homeFee = String(body.visitKind || "").toUpperCase() === "HOME" ? d(org.homeVisitFee) : 0;
    const priced = await priceGrooming(prisma, { organizationId: org.id, service, homeFee, code: body.couponCode ?? body.code, channel: "WEBSITE", customerId: customer?.id || null });
    res.json(priceBody(priced, riyals));
  } catch (e) {
    if (isCouponError(e)) return res.status(e.status || 400).json(couponErrorBody(e));
    res.status(e.status || 400).json({ error: e.message || "Booking failed" });
  }
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
    const session = await customerSession(req, res);
    // FR-05: a signed-in customer always books as themselves (body email is ignored).
    const email = String(session?.email || body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const petName = String(body.petName || "").trim();
    const breed = String(body.breed || "").trim();
    const ageText = String(body.ageText || "").trim();
    const visitKind = String(body.visitKind || "").toUpperCase() === "HOME" ? "HOME" : "SHOP";
    const startAt = new Date(String(body.startAt || ""));
    const note = String(body.note ?? body.notes ?? "").trim().slice(0, 1000) || null;
    if (!email || !name || !phone || !petName || !breed || !ageText) {
      return res.status(400).json({ error: "Name, email, phone, and the pet's name, breed, and age are required" });
    }
    if (Number.isNaN(startAt.getTime())) {
      return res.status(400).json({ error: "Choose a free time" });
    }
    if (startAt <= new Date()) return res.status(400).json({ error: "That time has already passed" });
    const service = await prisma.groomingService.findFirst({
      where: { id: String(body.packageId || ""), organizationId: org.id, active: true },
    });
    if (!service) return res.status(400).json({ error: "That package is not available" });
    // The end always comes from the package, never from the browser.
    const duration = Math.max(10, service.durationMin || 60);
    const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
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
      : await prisma.branch.findFirst({ where: { organizationId: org.id, isActive: true, kind: { not: "VAN" } }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
    // Whole dirhams (NFR-03).
    const homeFee = visitKind === "HOME" ? d(org.homeVisitFee) : 0;
    // fix-re: a generated coupon replaces the automatic grooming promotions (lib/groomingPrice.js).
    const priced = await priceGrooming(prisma, {
      organizationId: org.id,
      service,
      homeFee,
      code: body.couponCode ?? body.code,
      channel: "WEBSITE",
      customerId: customer.id,
    });
    const amount = priced.amount;
    const coupon = priced.coupon;
    const holdMinutes = Math.max(5, Number(org.holdMinutes) || 20);
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    const booking = await prisma.$transaction(async (tx) => {
      await claimSlot(tx, { organizationId: org.id, startAt, endAt, grid: duration });
      const created = await tx.appointment.create({
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
        notes: note,
        createdByUserId: staff.id,
        ...(coupon ? { couponCodeId: coupon.codeRow.id, couponCode: coupon.codeRow.code, couponDiscount: priced.discount } : {}),
      },
      });
      // fix-re: the use is held while the booking waits for payment (committed at once when free).
      if (coupon) {
        await claimCoupon(tx, { checked: coupon, appointmentId: created.id, customerId: customer.id, channel: "WEBSITE", status: amount <= 0 ? "COMMITTED" : "HELD", gross: priced.gross });
      }
      return created;
    }, LOCK_TX);
    if (amount <= 0) {
      await prisma.appointment.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CONFIRMED" } });
      return res.status(201).json({ bookingId: booking.id, reference: booking.reference, total: 0, discount: riyals(priced.discount), couponCode: coupon?.codeRow.code || null });
    }
    const [first, ...rest] = name.split(/\s+/);
    const payment = await createSkipcashPayment({
      Uid: crypto.randomUUID(),
      KeyId: process.env.SKIPCASH_KEY_ID.trim(),
      Amount: fmt(amount),
      FirstName: (first || "Customer").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Customer",
      LastName: (rest.join(" ") || "Catio").replace(/[^a-zA-Z\u0600-\u06FF ]/g, "").slice(0, 60) || "Catio",
      Phone: phone.slice(0, 15),
      Email: email.slice(0, 255),
      TransactionId: booking.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40),
      Custom1: `booking:${booking.id}`,
      WebhookUrl: `${(process.env.API_PUBLIC_URL || process.env.APP_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/api/shop/payments/skipcash`,
      ReturnUrl: `${publicBase()}/shop/grooming/bookings/${booking.id}`,
    }).catch(async (err) => {
      await prisma.appointment.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
      await releaseCouponFor(prisma, booking.id, "GATEWAY_ERROR");
      throw err;
    });
    await prisma.appointment.update({
      where: { id: booking.id },
      data: { gatewayPaymentId: payment.id, paymentReference: payment.id },
    });
    res.status(201).json({ bookingId: booking.id, reference: booking.reference, payUrl: payment.payUrl, total: riyals(amount), discount: riyals(priced.discount), couponCode: coupon?.codeRow.code || null });
  } catch (e) {
    if (isCouponError(e)) return res.status(e.status || 400).json(couponErrorBody(e));
    res.status(e.status || 400).json({ error: e.message || "Booking failed", ...(e.errorAr ? { errorAr: e.errorAr, errorEn: e.message } : {}) });
  }
});

export default router;
