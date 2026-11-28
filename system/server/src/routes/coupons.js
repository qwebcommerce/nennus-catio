/**
 * fix-re: generated grooming coupons — staff screen API (docs/testing/coupons.md).
 * Rights reuse the `promotions` module: view = see batches and codes, create = generate a batch,
 * edit = disable / enable a batch or a code, export = CSV.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { fmt, toDirhams } from "../lib/money.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { toCsv } from "../lib/b2b.js";
import { qatarDayKey } from "../lib/qatarTime.js";
import {
  MAX_CODES,
  MAX_USES_PER_CODE,
  batchExpired,
  cleanPrefix,
  codeKey,
  codeStatus,
  lastValidDay,
  randomCode,
  validityWindow,
} from "../lib/coupons.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("promotions", "view"));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS = ["WEBSITE", "DESK", "BOTH"];

function fail(status, code, ar, en, extra = {}) {
  const err = new Error(ar);
  err.status = status;
  err.code = code;
  err.errorAr = ar;
  err.errorEn = en;
  Object.assign(err, extra);
  return err;
}

const R = (v) => (v == null ? null : fmt(v));

function batchView(b, stats = null, now = new Date()) {
  return {
    id: b.id,
    version: b.version,
    name: b.name,
    nameEn: b.nameEn,
    prefix: b.prefix,
    discountType: b.discountType,
    percent: b.percent,
    amount: R(b.amount),
    allPackages: b.allPackages,
    packages: (b.packages || []).map((p) => ({ id: p.service?.id || p.serviceId, name: p.service?.name, nameEn: p.service?.nameEn, price: R(p.service?.price) })),
    validFrom: qatarDayKey(new Date(b.validFrom)),
    validUntil: lastValidDay(b),
    codeCount: b.codeCount,
    usesPerCode: b.usesPerCode,
    onePerCustomer: b.onePerCustomer,
    minAmount: R(b.minAmount),
    channel: b.channel,
    releaseOnPaidCancel: b.releaseOnPaidCancel,
    active: b.active,
    expired: batchExpired(b, now),
    notStarted: now < new Date(b.validFrom),
    createdAt: b.createdAt,
    ...(stats ? { stats } : {}),
  };
}

/**
 * Per-batch counts and money, in one query (whole dirhams in SQL):
 *  generated = codes; used = committed uses; held = uses held by unpaid website bookings;
 *  usesLeft = uses still available on active codes of a live batch; expiredCodes = codes with
 *  uses left when the batch has ended; discount = coupon discount on committed uses;
 *  bookingValue = net value of the bookings behind committed uses (not cancelled);
 *  paid = grooming money taken on those bookings less refunds (as Finance counts it).
 */
async function batchStats(orgId, batchIds = null) {
  const only = batchIds ? Prisma.sql`AND b.id IN (${Prisma.join(batchIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT b.id,
      (SELECT count(*) FROM "CouponCode" c WHERE c."batchId" = b.id)::int AS generated,
      (SELECT count(*) FROM "CouponCode" c WHERE c."batchId" = b.id AND NOT c.active)::int AS "disabledCodes",
      (SELECT count(*) FROM "CouponCode" c WHERE c."batchId" = b.id AND c."usedCount" >= c."maxUses")::int AS "fullyUsedCodes",
      (SELECT count(*) FROM "CouponCode" c WHERE c."batchId" = b.id AND c."usedCount" = 0)::int AS "untouchedCodes",
      (SELECT coalesce(sum(greatest(c."maxUses" - c."usedCount", 0)), 0) FROM "CouponCode" c WHERE c."batchId" = b.id AND c.active)::int AS "usesLeftRaw",
      (SELECT count(*) FROM "CouponCode" c WHERE c."batchId" = b.id AND c.active AND c."usedCount" < c."maxUses")::int AS "openCodes",
      (SELECT count(*) FROM "CouponRedemption" r WHERE r."batchId" = b.id AND r.status = 'COMMITTED')::int AS used,
      (SELECT count(*) FROM "CouponRedemption" r WHERE r."batchId" = b.id AND r.status = 'HELD')::int AS held,
      (SELECT count(*) FROM "CouponRedemption" r WHERE r."batchId" = b.id AND r.status = 'RELEASED')::int AS released,
      (SELECT coalesce(sum(r.discount), 0) FROM "CouponRedemption" r WHERE r."batchId" = b.id AND r.status = 'COMMITTED')::bigint AS discount,
      (SELECT coalesce(sum(a.amount), 0) FROM "CouponRedemption" r JOIN "Appointment" a ON a.id = r."appointmentId"
        WHERE r."batchId" = b.id AND r.status = 'COMMITTED' AND a.status <> 'CANCELLED')::bigint AS "bookingValue",
      (SELECT coalesce(sum(CASE WHEN p.kind = 'PAYMENT' THEN p.amount ELSE -p.amount END), 0)
        FROM "CouponRedemption" r JOIN "Payment" p ON p."appointmentId" = r."appointmentId"
        WHERE r."batchId" = b.id AND r.status = 'COMMITTED'
          AND ((p.kind = 'PAYMENT' AND p.status IN ('CAPTURED','REJECTED')) OR (p.kind = 'REFUND' AND p.status = 'CAPTURED')))::bigint AS paid
    FROM "CouponBatch" b
    WHERE b."organizationId" = ${orgId} ${only}`;
  return new Map(rows.map((r) => [r.id, r]));
}

function statsView(batch, raw, now = new Date()) {
  const s = raw || {};
  const expired = batchExpired(batch, now);
  const live = batch.active && !expired;
  return {
    generated: Number(s.generated || 0),
    used: Number(s.used || 0),
    held: Number(s.held || 0),
    released: Number(s.released || 0),
    fullyUsedCodes: Number(s.fullyUsedCodes || 0),
    unusedCodes: Number(s.untouchedCodes || 0),
    disabledCodes: Number(s.disabledCodes || 0),
    remaining: live ? Number(s.usesLeftRaw || 0) : 0,
    expired: expired ? Number(s.openCodes || 0) : 0,
    discount: fmt(Number(s.discount || 0)),
    bookingValue: fmt(Number(s.bookingValue || 0)),
    paid: fmt(Number(s.paid || 0)),
  };
}

const BATCH_INCLUDE = { packages: { include: { service: { select: { id: true, name: true, nameEn: true, price: true } } } } };

router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const rows = await prisma.couponBatch.findMany({ where: { organizationId: orgId }, include: BATCH_INCLUDE, orderBy: { createdAt: "desc" }, take: 500 });
  const stats = rows.length ? await batchStats(orgId, rows.map((r) => r.id)) : new Map();
  const now = new Date();
  const batches = rows.map((b) => batchView(b, statsView(b, stats.get(b.id), now), now));
  // Totals for the report line (whole dirhams summed, shown in riyals).
  const sumDh = (key) => batches.reduce((t, b) => t + (toDirhams(b.stats[key]) || 0), 0);
  res.json({
    batches,
    totals: {
      batches: batches.length,
      generated: batches.reduce((t, b) => t + b.stats.generated, 0),
      used: batches.reduce((t, b) => t + b.stats.used, 0),
      held: batches.reduce((t, b) => t + b.stats.held, 0),
      discount: fmt(sumDh("discount")),
      bookingValue: fmt(sumDh("bookingValue")),
      paid: fmt(sumDh("paid")),
    },
  });
});

/** Packages a batch can be for (the grooming packages, paused ones included). */
router.get("/packages", async (req, res) => {
  const rows = await prisma.groomingService.findMany({
    where: { organizationId: req.user.organizationId },
    select: { id: true, name: true, nameEn: true, price: true, active: true },
    orderBy: { name: "asc" },
  });
  res.json(rows.map((r) => ({ ...r, price: fmt(r.price) })));
});

function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

router.post("/", requireModule("promotions", "create"), async (req, res) => {
  const orgId = req.user.organizationId;
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw fail(400, "COUPON_BATCH_NAME", "اسم الحملة مطلوب", "The batch / campaign name is required");
  const discountType = String(b.discountType || "").toUpperCase();
  if (!["PERCENT", "AMOUNT"].includes(discountType)) throw fail(400, "COUPON_BATCH_TYPE", "اختر نوع الخصم: نسبة أو مبلغ", "Choose the discount type: percent or amount");
  let percent = null;
  let amount = null;
  if (discountType === "PERCENT") {
    percent = intIn(b.percent, 1, 100);
    if (percent == null) throw fail(400, "COUPON_BATCH_PERCENT", "النسبة رقم صحيح من 1 إلى 100", "The percentage must be a whole number from 1 to 100");
  } else {
    amount = toDirhams(b.amount, { allowZero: false });
    if (amount == null) throw fail(400, "COUPON_BATCH_AMOUNT", "أدخل مبلغ خصم صالحاً (رقمان عشريان كحد أقصى)", "Enter a valid discount amount (at most 2 decimals)");
  }
  const allPackages = Boolean(b.allPackages);
  const ids = Array.isArray(b.packageIds) ? [...new Set(b.packageIds.map(String))] : [];
  if (!allPackages && !ids.length) throw fail(400, "COUPON_BATCH_PACKAGES", "اختر باقة واحدة على الأقل أو كل الباقات", "Choose at least one package, or all packages");
  const packages = await prisma.groomingService.findMany({
    where: { organizationId: orgId, ...(allPackages ? { active: true } : { id: { in: ids } }) },
    select: { id: true, name: true, nameEn: true, price: true },
  });
  if (!allPackages && packages.length !== ids.length) throw fail(400, "COUPON_BATCH_PACKAGES", "باقة غير موجودة", "A chosen package was not found");
  if (allPackages && !packages.length) throw fail(400, "COUPON_BATCH_PACKAGES", "لا توجد باقات تجميل مفعلة", "There are no active grooming packages");
  if (amount != null) {
    const cheapest = packages.reduce((m, p) => (p.price < m.price ? p : m), packages[0]);
    if (amount > cheapest.price) {
      throw fail(400, "COUPON_BATCH_AMOUNT_OVER_PRICE", "مبلغ الخصم أكبر من سعر الباقة", "The discount amount is more than the package price", {
        package: cheapest.nameEn || cheapest.name,
        price: fmt(cheapest.price),
      });
    }
  }
  const fromDay = String(b.validFrom || "").trim();
  const untilDay = String(b.validUntil || "").trim();
  if (!DAY_RE.test(fromDay) || !DAY_RE.test(untilDay) || untilDay < fromDay) {
    throw fail(400, "COUPON_BATCH_DATES", "أدخل تاريخي البدء والانتهاء (الانتهاء بعد البدء)", "Enter the valid-from and valid-until dates (until on or after from)");
  }
  const codeCount = intIn(b.codeCount ?? b.count, 1, MAX_CODES);
  if (codeCount == null) throw fail(400, "COUPON_BATCH_COUNT", "عدد القسائم من 1 إلى 1000", "The number of codes must be from 1 to 1000");
  const usesPerCode = b.usesPerCode == null || b.usesPerCode === "" ? 1 : intIn(b.usesPerCode, 1, MAX_USES_PER_CODE);
  if (usesPerCode == null) throw fail(400, "COUPON_BATCH_USES", "عدد مرات الاستخدام لكل قسيمة من 1 إلى 1000", "Uses per code must be from 1 to 1000");
  let minAmount = null;
  if (b.minAmount != null && b.minAmount !== "") {
    minAmount = toDirhams(b.minAmount);
    if (minAmount == null) throw fail(400, "COUPON_BATCH_MIN", "الحد الأدنى غير صالح", "Enter a valid minimum amount (at most 2 decimals)");
    if (minAmount === 0) minAmount = null;
  }
  const channel = CHANNELS.includes(String(b.channel || "").toUpperCase()) ? String(b.channel).toUpperCase() : "BOTH";
  const prefix = cleanPrefix(b.prefix) || null;
  const { validFrom, validUntil } = validityWindow(fromDay, untilDay);

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.couponBatch.create({
      data: {
        organizationId: orgId,
        name,
        nameEn: b.nameEn ? String(b.nameEn).trim().slice(0, 120) : null,
        prefix,
        discountType,
        percent,
        amount,
        allPackages,
        validFrom,
        validUntil,
        codeCount,
        usesPerCode,
        onePerCustomer: Boolean(b.onePerCustomer),
        minAmount,
        channel,
        releaseOnPaidCancel: Boolean(b.releaseOnPaidCancel),
        createdByUserId: req.user.sub,
        packages: allPackages ? undefined : { create: packages.map((p) => ({ serviceId: p.id })) },
      },
    });
    // Unique per organisation (DB unique index on organizationId + codeKey): codes that collide
    // with an existing code are skipped and drawn again.
    let made = 0;
    for (let round = 0; made < codeCount && round < 20; round += 1) {
      const want = new Map();
      while (want.size < codeCount - made) {
        const code = randomCode(prefix);
        want.set(codeKey(code), code);
      }
      const result = await tx.couponCode.createMany({
        data: [...want].map(([key, code]) => ({ organizationId: orgId, batchId: created.id, code, codeKey: key, maxUses: usesPerCode })),
        skipDuplicates: true,
      });
      made += result.count;
    }
    if (made !== codeCount) throw fail(500, "COUPON_BATCH_GENERATE", "تعذر إنشاء رموز فريدة. أعد المحاولة.", "Could not generate unique codes. Try again.");
    await writeAudit({
      userId: req.user.sub,
      action: "COUPON_BATCH_CREATE",
      entityType: "CouponBatch",
      entityId: created.id,
      summary: `${name}: ${codeCount} codes, ${discountType === "PERCENT" ? `${percent}%` : `${fmt(amount)} QAR`}, ${fromDay}..${untilDay}, ${channel}`,
    }, tx);
    return created;
  }, { maxWait: 10000, timeout: 30000 });
  const row = await prisma.couponBatch.findUnique({ where: { id: batch.id }, include: BATCH_INCLUDE });
  const stats = await batchStats(orgId, [batch.id]);
  res.status(201).json(batchView(row, statsView(row, stats.get(batch.id))));
});

async function loadBatch(req) {
  const row = await prisma.couponBatch.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId }, include: BATCH_INCLUDE });
  if (!row) throw fail(404, "COUPON_BATCH_NOT_FOUND", "مجموعة القسائم غير موجودة", "Coupon batch not found");
  return row;
}

/** Every code of a batch with its status and its uses (customer, booking, when, channel). */
async function batchCodes(batch) {
  const codes = await prisma.couponCode.findMany({
    where: { batchId: batch.id },
    orderBy: { code: "asc" },
    include: {
      redemptions: {
        orderBy: { createdAt: "asc" },
        include: {
          appointment: {
            select: { id: true, reference: true, status: true, startAt: true, amount: true, amountPaid: true, customer: { select: { id: true, name: true, phone: true, email: true } } },
          },
        },
      },
    },
  });
  const now = new Date();
  return codes.map((c) => ({
    id: c.id,
    version: c.version,
    code: c.code,
    active: c.active,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    status: codeStatus(c, batch, c.redemptions, now),
    uses: c.redemptions.map((r) => ({
      id: r.id,
      status: r.status,
      channel: r.channel,
      discount: fmt(r.discount),
      grossAmount: fmt(r.grossAmount),
      createdAt: r.createdAt,
      committedAt: r.committedAt,
      releasedAt: r.releasedAt,
      releaseReason: r.releaseReason,
      booking: r.appointment
        ? { id: r.appointment.id, reference: r.appointment.reference, status: r.appointment.status, startAt: r.appointment.startAt, amount: fmt(r.appointment.amount), amountPaid: fmt(r.appointment.amountPaid) }
        : null,
      customer: r.appointment?.customer ? { id: r.appointment.customer.id, name: r.appointment.customer.name, phone: r.appointment.customer.phone } : null,
    })),
  }));
}

router.get("/:id", async (req, res) => {
  const batch = await loadBatch(req);
  const stats = await batchStats(req.user.organizationId, [batch.id]);
  res.json({ ...batchView(batch, statsView(batch, stats.get(batch.id))), codes: await batchCodes(batch) });
});

/** Disable / enable a whole batch (NFR-13 versioned). */
router.patch("/:id", requireModule("promotions", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const batch = await loadBatch(req);
  assertVersion(batch, version);
  if (typeof req.body?.active !== "boolean") throw fail(400, "COUPON_ACTIVE_REQUIRED", "حدد التفعيل أو الإيقاف", "Say whether to enable or disable");
  const row = await versionedUpdate(prisma, "couponBatch", { id: batch.id, version, data: { active: req.body.active }, include: BATCH_INCLUDE });
  await writeAudit({ userId: req.user.sub, action: "COUPON_BATCH_UPDATE", entityType: "CouponBatch", entityId: row.id, summary: `${row.name} active=${row.active}` });
  const stats = await batchStats(req.user.organizationId, [row.id]);
  res.json(batchView(row, statsView(row, stats.get(row.id))));
});

/** Disable / enable one code (NFR-13 versioned). */
router.patch("/codes/:codeId", requireModule("promotions", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const code = await prisma.couponCode.findFirst({ where: { id: req.params.codeId, organizationId: req.user.organizationId } });
  if (!code) throw fail(404, "COUPON_CODE_NOT_FOUND", "القسيمة غير موجودة", "Coupon code not found");
  assertVersion(code, version);
  if (typeof req.body?.active !== "boolean") throw fail(400, "COUPON_ACTIVE_REQUIRED", "حدد التفعيل أو الإيقاف", "Say whether to enable or disable");
  const row = await versionedUpdate(prisma, "couponCode", { id: code.id, version, data: { active: req.body.active } });
  await writeAudit({ userId: req.user.sub, action: "COUPON_CODE_UPDATE", entityType: "CouponCode", entityId: row.id, summary: `${row.code} active=${row.active}` });
  res.json({ id: row.id, version: row.version, code: row.code, active: row.active, usedCount: row.usedCount, maxUses: row.maxUses });
});

/** CSV of every code (and every use) of a batch. */
router.get("/:id/export", requireModule("promotions", "export"), async (req, res) => {
  const batch = await loadBatch(req);
  const codes = await batchCodes(batch);
  const discount = batch.discountType === "PERCENT" ? `${batch.percent}%` : `${fmt(batch.amount)} QAR`;
  const packages = batch.allPackages ? "All packages" : batch.packages.map((p) => p.service?.nameEn || p.service?.name).join(" / ");
  const rows = [];
  for (const c of codes) {
    const base = [c.code, c.status, c.active ? "yes" : "no", c.usedCount, c.maxUses, batch.name, packages, discount, qatarDayKey(new Date(batch.validFrom)), lastValidDay(batch), batch.channel];
    if (!c.uses.length) rows.push([...base, "", "", "", "", "", "", ""]);
    for (const u of c.uses) {
      rows.push([...base, u.status, u.customer?.name || "", u.booking?.reference || "", u.channel, new Date(u.committedAt || u.createdAt).toISOString(), u.discount, u.booking?.amount || ""]);
    }
  }
  const csv = toCsv(
    ["Code", "Status", "Active", "Uses taken", "Uses allowed", "Batch", "Packages", "Discount", "Valid from", "Valid until", "Channel", "Use status", "Customer", "Booking", "Use channel", "Used at", "Discount given (QAR)", "Booking net (QAR)"],
    rows,
  );
  await writeAudit({ userId: req.user.sub, action: "COUPON_BATCH_EXPORT", entityType: "CouponBatch", entityId: batch.id, summary: `${batch.name}: ${codes.length} codes` });
  const safe = (batch.prefix || "coupons").replace(/[^A-Za-z0-9-]/g, "");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}-${qatarDayKey()}.csv"`);
  res.send(csv);
});

export default router;
