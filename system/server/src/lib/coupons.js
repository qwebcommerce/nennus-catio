/**
 * fix-re: generated grooming coupons (docs/testing/coupons.md).
 *
 * A CouponBatch holds N unique CouponCodes. Each use of a code on a grooming booking is a
 * CouponRedemption:
 *   - website booking waiting for payment  -> HELD (the use is taken; nobody else can take it)
 *   - paid by the gateway / staff accepted  -> COMMITTED
 *   - desk booking                          -> COMMITTED at once (staff book in front of the customer)
 *   - booking cancelled before any payment  -> RELEASED (exactly once: guarded status update)
 *   - booking cancelled after payment       -> kept (the batch option releaseOnPaidCancel gives it back)
 *
 * Money is whole dirhams (NFR-03). The coupon discounts the PACKAGE price only (never the
 * home-visit fee): percent = price × percent / 100 rounded half away from zero to a whole
 * dirham (lib/money.js percentOf); a QAR amount is capped at the package price, so the
 * discounted package price is never below 0.
 *
 * Stacking: a booking with a coupon gets NO automatic grooming promotion (the coupon replaces it).
 *
 * Concurrency: a use is claimed with one guarded UPDATE ("usedCount" < "maxUses", code and batch
 * active), so parallel bookings can never take more uses than the code has. A one-per-customer
 * batch also writes customerKey = "<batch>:<customer>" on the live use, under a unique index.
 */
import crypto from "crypto";
import { d, percentOf } from "./money.js";
import { qatarDayKey, qatarDayStart } from "./qatarTime.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** No 0/O/1/I: 8 digits + 24 letters = 32 symbols, so crypto.randomInt picks evenly. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_CODES = 1000;
export const MAX_USES_PER_CODE = 1000;

/** What a typed code is matched on: upper case, letters and digits only (case and dashes ignored). */
export function codeKey(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Prefix as printed: upper-case letters and digits, at most 10. */
export function cleanPrefix(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function randomGroup(len) {
  let out = "";
  for (let i = 0; i < len; i += 1) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** e.g. GROOM-7KQ4-X9PM (8 random symbols = 40 bits). */
export function randomCode(prefix) {
  const body = `${randomGroup(4)}-${randomGroup(4)}`;
  return prefix ? `${prefix}-${body}` : body;
}

// ── Errors ─────────────────────────────────────────────────────────────────────────────────
export const COUPON_ERRORS = {
  COUPON_INVALID: ["رمز القسيمة غير صحيح", "This coupon code is not valid"],
  COUPON_DISABLED: ["هذه القسيمة موقوفة", "This coupon has been disabled"],
  COUPON_NOT_STARTED: ["هذه القسيمة لم يبدأ العمل بها بعد", "This coupon is not valid yet"],
  COUPON_EXPIRED: ["انتهت صلاحية هذه القسيمة", "This coupon has expired"],
  COUPON_WRONG_PACKAGE: ["هذه القسيمة غير صالحة لهذه الباقة", "This coupon is not valid for this package"],
  COUPON_WRONG_CHANNEL: ["هذه القسيمة غير صالحة هنا: تُستخدم في مكان حجز آخر", "This coupon cannot be used here (wrong booking channel)"],
  COUPON_WEBSITE_ONLY: ["هذه القسيمة للحجز عبر الموقع فقط", "This coupon is for website bookings only"],
  COUPON_DESK_ONLY: ["هذه القسيمة للحجز في المحل فقط", "This coupon is for bookings at the shop desk only"],
  COUPON_USED: ["تم استخدام هذه القسيمة بالفعل", "This coupon has already been used"],
  COUPON_CUSTOMER_USED: ["استخدم هذا العميل قسيمة من هذه المجموعة من قبل", "This customer has already used a coupon from this batch"],
  COUPON_CUSTOMER_REQUIRED: ["اختر العميل: هذه القسيمة مرة واحدة لكل عميل", "Choose the customer: this coupon is one use per customer"],
  COUPON_MIN_AMOUNT: ["قيمة الحجز أقل من الحد الأدنى لهذه القسيمة", "The booking is below this coupon's minimum amount"],
  COUPON_NEEDS_PACKAGE: ["اختر الباقة لاستخدام القسيمة", "Choose a package to use a coupon"],
};

export function couponError(code, status = 400, extra = {}) {
  const [ar, en] = COUPON_ERRORS[code] || COUPON_ERRORS.COUPON_INVALID;
  const err = new Error(en);
  err.status = status;
  err.code = code;
  err.errorAr = ar;
  err.errorEn = en;
  Object.assign(err, extra);
  return err;
}

export function isCouponError(e) {
  return Boolean(e?.code && COUPON_ERRORS[e.code]);
}

/** The JSON body for a coupon error (bilingual, with the reason code). */
export function couponErrorBody(e) {
  return { error: e.errorEn || e.message, errorAr: e.errorAr, errorEn: e.errorEn || e.message, code: e.code, ...(e.minAmount != null ? { minAmount: e.minAmount } : {}) };
}

// ── Validity window (Qatar days) ─────────────────────────────────────────────────────────────
/** "YYYY-MM-DD" Qatar days -> [validFrom, validUntil) instants. */
export function validityWindow(fromDay, untilDay) {
  return { validFrom: qatarDayStart(fromDay), validUntil: new Date(qatarDayStart(untilDay).getTime() + DAY_MS) };
}

/** The last Qatar day a batch is valid on (validUntil is exclusive). */
export function lastValidDay(batch) {
  return qatarDayKey(new Date(new Date(batch.validUntil).getTime() - 1));
}

export function batchExpired(batch, now = new Date()) {
  return now >= new Date(batch.validUntil);
}

// ── Discount maths ──────────────────────────────────────────────────────────────────────────
/** Discount in whole dirhams on a package price (dirhams); never more than the price. */
export function couponDiscount(batch, packagePrice) {
  const price = Math.max(0, d(packagePrice));
  const raw = batch.discountType === "PERCENT" ? percentOf(price, Number(batch.percent) || 0) : d(batch.amount);
  return Math.max(0, Math.min(price, raw));
}

function channelAllowed(batch, channel) {
  return batch.channel === "BOTH" || batch.channel === channel;
}

/** Finds the code row (with its batch and packages) for a typed code, or null. */
export async function findCode(db, organizationId, input) {
  const key = codeKey(input);
  if (!key) return null;
  return db.couponCode.findUnique({
    where: { organizationId_codeKey: { organizationId, codeKey: key } },
    include: { batch: { include: { packages: { select: { serviceId: true } } } } },
  });
}

/**
 * Checks a typed code for one booking without taking a use. Throws a coupon error with the
 * specific reason, else returns { codeRow, batch, discount }.
 * gross = booking value before the coupon (package + home fee), for the minimum.
 */
export async function checkCoupon(db, { organizationId, input, serviceId, packagePrice, gross, channel, customerId = null, now = new Date() }) {
  const row = await findCode(db, organizationId, input);
  if (!row) throw couponError("COUPON_INVALID");
  const batch = row.batch;
  if (!batch.active || !row.active) throw couponError("COUPON_DISABLED");
  if (now < new Date(batch.validFrom)) throw couponError("COUPON_NOT_STARTED");
  if (batchExpired(batch, now)) throw couponError("COUPON_EXPIRED");
  if (!serviceId) throw couponError("COUPON_NEEDS_PACKAGE");
  if (!batch.allPackages && !batch.packages.some((p) => p.serviceId === serviceId)) throw couponError("COUPON_WRONG_PACKAGE");
  if (!channelAllowed(batch, channel)) throw couponError(batch.channel === "WEBSITE" ? "COUPON_WEBSITE_ONLY" : batch.channel === "DESK" ? "COUPON_DESK_ONLY" : "COUPON_WRONG_CHANNEL");
  if (batch.minAmount != null && d(gross) < d(batch.minAmount)) throw couponError("COUPON_MIN_AMOUNT", 400, { minAmount: batch.minAmount });
  if (row.usedCount >= row.maxUses) throw couponError("COUPON_USED");
  if (batch.onePerCustomer) {
    if (!customerId) {
      if (channel === "DESK") throw couponError("COUPON_CUSTOMER_REQUIRED");
    } else {
      const live = await db.couponRedemption.count({ where: { customerKey: `${batch.id}:${customerId}` } });
      if (live) throw couponError("COUPON_CUSTOMER_USED");
    }
  }
  return { codeRow: row, batch, discount: couponDiscount(batch, packagePrice) };
}

function isUniqueViolation(e) {
  return e?.code === "P2002" || /unique constraint/i.test(String(e?.message || ""));
}

/**
 * Takes one use of a checked code for a booking, inside the booking's transaction (so a failed
 * slot or booking rolls the use back). The guarded UPDATE is the concurrency guard.
 */
export async function claimCoupon(tx, { checked, appointmentId, customerId = null, channel, status, gross, userId = null }) {
  const { codeRow, batch, discount } = checked;
  const taken = await tx.$executeRaw`
    UPDATE "CouponCode" c SET "usedCount" = c."usedCount" + 1, "updatedAt" = now()
    WHERE c.id = ${codeRow.id} AND c.active AND c."usedCount" < c."maxUses"
      AND EXISTS (SELECT 1 FROM "CouponBatch" b WHERE b.id = c."batchId" AND b.active)`;
  if (taken !== 1) {
    const fresh = await tx.couponCode.findUnique({ where: { id: codeRow.id }, include: { batch: true } });
    if (!fresh?.active || !fresh?.batch?.active) throw couponError("COUPON_DISABLED");
    throw couponError("COUPON_USED");
  }
  try {
    return await tx.couponRedemption.create({
      data: {
        organizationId: batch.organizationId,
        batchId: batch.id,
        codeId: codeRow.id,
        appointmentId,
        customerId,
        channel,
        status,
        grossAmount: d(gross),
        discount,
        customerKey: batch.onePerCustomer && customerId ? `${batch.id}:${customerId}` : null,
        userId,
        committedAt: status === "COMMITTED" ? new Date() : null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw couponError("COUPON_CUSTOMER_USED");
    throw e;
  }
}

/**
 * A booking's held use becomes committed (payment confirmed). If the hold had already been
 * released (late payment that staff accepted), the use is taken again even past the limit: the
 * customer paid the discounted price, so the count must show it (see docs, open point).
 */
export async function commitCoupon(tx, appointmentId) {
  const use = await tx.couponRedemption.findUnique({ where: { appointmentId } });
  if (!use || use.status === "COMMITTED") return use;
  if (use.status === "HELD") {
    await tx.couponRedemption.updateMany({ where: { id: use.id, status: "HELD" }, data: { status: "COMMITTED", committedAt: new Date() } });
    return use;
  }
  const moved = await tx.couponRedemption.updateMany({
    where: { id: use.id, status: "RELEASED" },
    data: { status: "COMMITTED", committedAt: new Date(), releasedAt: null, releaseReason: null },
  });
  if (moved.count === 1) {
    await tx.$executeRaw`UPDATE "CouponCode" SET "usedCount" = "usedCount" + 1, "updatedAt" = now() WHERE id = ${use.codeId}`;
  }
  return use;
}

/**
 * Gives a use back after its booking was cancelled: a held use always; a committed use only
 * when nothing was paid (desk booking cancelled) or the batch says releaseOnPaidCancel.
 * Exactly once: the status move is guarded, and only a move that happened decrements the code.
 * Returns true when a use was released.
 */
export async function releaseCouponFor(db, appointmentId, reason = "CANCELLED") {
  const use = await db.couponRedemption.findUnique({
    where: { appointmentId },
    include: { batch: { select: { releaseOnPaidCancel: true } }, appointment: { select: { status: true, amountPaid: true, paidAt: true } } },
  });
  if (!use || use.status === "RELEASED") return false;
  if (use.appointment?.status !== "CANCELLED") return false;
  const paid = d(use.appointment.amountPaid) > 0 || Boolean(use.appointment.paidAt);
  if (use.status === "COMMITTED" && paid && !use.batch.releaseOnPaidCancel) return false;
  const run = async (tx) => {
    const moved = await tx.couponRedemption.updateMany({
      where: { id: use.id, status: use.status },
      data: { status: "RELEASED", releasedAt: new Date(), releaseReason: String(reason).slice(0, 60), customerKey: null },
    });
    if (moved.count !== 1) return false;
    await tx.$executeRaw`UPDATE "CouponCode" SET "usedCount" = "usedCount" - 1, "updatedAt" = now() WHERE id = ${use.codeId} AND "usedCount" > 0`;
    return true;
  };
  return db.$transaction ? db.$transaction(run) : run(db);
}

/**
 * Sweep: every live use whose booking is now cancelled (hold expired, gateway failed, staff
 * cancel, rejected review) is checked against the release rule. Called from the hold sweep.
 */
export async function sweepCouponUses(db) {
  const rows = await db.couponRedemption.findMany({
    where: {
      appointment: { status: "CANCELLED" },
      OR: [
        { status: "HELD" },
        { status: "COMMITTED", appointment: { amountPaid: 0, paidAt: null } },
        { status: "COMMITTED", batch: { releaseOnPaidCancel: true } },
      ],
    },
    select: { appointmentId: true, status: true },
    take: 500,
  });
  let released = 0;
  for (const row of rows) {
    if (await releaseCouponFor(db, row.appointmentId, row.status === "HELD" ? "HOLD_ENDED" : "CANCELLED")) released += 1;
  }
  return released;
}

/** Status of one code for the staff screen. */
export function codeStatus(code, batch, uses = [], now = new Date()) {
  const committed = uses.filter((u) => u.status === "COMMITTED").length;
  const held = uses.filter((u) => u.status === "HELD").length;
  if (!batch.active || !code.active) return "DISABLED";
  if (code.usedCount >= code.maxUses) return held && !committed ? "HELD" : "USED";
  if (batchExpired(batch, now)) return "EXPIRED";
  if (held) return "HELD";
  if (committed) return "PART_USED";
  return "UNUSED";
}
