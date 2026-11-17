import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("promotions", "view"));
const KINDS = ["PERCENT", "FIXED", "PRODUCT", "CATEGORY", "BUNDLE", "BOGO"];
const CHANNELS = ["ALL", "TILL", "WEBSITE", "GROOMING"];

function decimalOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

const BAD_AMOUNT = {
  error: "Enter a valid amount (at most 2 decimals)",
  errorAr: "المبلغ غير صالح (رقمان عشريان كحد أقصى)",
  errorEn: "Enter a valid amount (at most 2 decimals)",
  code: "AMOUNT_INVALID",
};

/** A riyal amount from the form → whole dirhams; null when empty; undefined when invalid. */
function dirhamsOrNull(value) {
  if (value == null || value === "") return null;
  const n = toDirhams(value);
  return n == null ? undefined : n;
}

/** [errorAr, errorEn] when the offer is incomplete for its type, else null. */
async function checkOffer(orgId, kind, body, { amount, bundlePrice }) {
  const percent = body.percent == null || body.percent === "" ? null : Number(body.percent);
  if (percent != null && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
    return ["النسبة يجب أن تكون بين 0 و 100", "The percentage must be more than 0 and at most 100"];
  }
  if (amount != null && amount <= 0) return ["المبلغ يجب أن يكون أكبر من صفر", "The amount must be more than zero"];
  const productOk = async (id) => Boolean(id) && (await prisma.product.count({ where: { id: String(id), organizationId: orgId } })) === 1;
  if (kind === "PERCENT" && percent == null) return ["أدخل نسبة الخصم", "Enter the discount percentage"];
  if (kind === "FIXED" && amount == null) return ["أدخل مبلغ الخصم", "Enter the discount amount"];
  if (kind === "PRODUCT" || kind === "BOGO") {
    if (!(await productOk(body.productId))) return ["اختر منتج العرض", "Choose the offer product"];
  }
  if (kind === "CATEGORY") {
    const ok = body.categoryId && (await prisma.category.count({ where: { id: String(body.categoryId), organizationId: orgId } })) === 1;
    if (!ok) return ["اختر تصنيف العرض", "Choose the offer category"];
  }
  if ((kind === "PRODUCT" || kind === "CATEGORY") && percent == null && amount == null) {
    return ["أدخل نسبة أو مبلغ الخصم", "Enter a discount percentage or amount"];
  }
  if (kind === "BOGO") {
    const buy = Number(body.buyQty), get = Number(body.getQty);
    if (!Number.isInteger(buy) || buy < 1 || !Number.isInteger(get) || get < 1) {
      return ["أدخل كمية الشراء والكمية المجانية", "Enter the buy quantity and the free quantity"];
    }
  }
  if (kind === "BUNDLE") {
    const ids = Array.isArray(body.bundleProductIds) ? [...new Set(body.bundleProductIds.map(String))] : [];
    if (ids.length < 2) return ["اختر منتجين على الأقل للحزمة", "Choose at least two products for the bundle"];
    const found = await prisma.product.count({ where: { id: { in: ids }, organizationId: orgId } });
    if (found !== ids.length) return ["منتج في الحزمة غير موجود", "A bundle product was not found"];
    if (bundlePrice == null || bundlePrice <= 0) return ["أدخل سعر الحزمة", "Enter the bundle price"];
  }
  if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
    return ["تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", "The end date must be after the start date"];
  }
  const code = body.code ? String(body.code).trim() : "";
  if (code) {
    const taken = await prisma.promotion.findFirst({
      where: { organizationId: orgId, code: { equals: code, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) return ["رمز العرض مستخدم لعرض آخر", "This offer code is already used by another offer"];
  }
  return null;
}

router.get("/", async (req, res) => {
  const rows = await prisma.promotion.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  res.json(toApi("Promotion", rows));
});

router.post("/", requireModule("promotions", "create"), async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const kind = String(body.kind || "").toUpperCase();
  if (!name || !KINDS.includes(kind)) return res.status(400).json({ error: "Name and offer type are required" });
  const amount = dirhamsOrNull(body.amount);
  const bundlePrice = dirhamsOrNull(body.bundlePrice);
  const minOrderAmount = dirhamsOrNull(body.minOrderAmount);
  if (amount === undefined || bundlePrice === undefined || minOrderAmount === undefined) return res.status(400).json(BAD_AMOUNT);
  // An offer missing what its type needs was saved and then silently did nothing (or, with a
  // code nobody could tell apart, matched the wrong offer): check it here.
  const offerError = await checkOffer(req.user.organizationId, kind, body, { amount, bundlePrice });
  if (offerError) return res.status(400).json({ error: offerError[1], errorAr: offerError[0], errorEn: offerError[1], code: "OFFER_INVALID" });
  const row = await prisma.promotion.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      nameEn: body.nameEn ? String(body.nameEn).trim() : null,
      kind,
      code: body.code ? String(body.code).trim() : null,
      percent: decimalOrNull(body.percent),
      amount,
      productId: body.productId || null,
      categoryId: body.categoryId || null,
      buyQty: body.buyQty ? Math.floor(Number(body.buyQty)) : null,
      getQty: body.getQty ? Math.floor(Number(body.getQty)) : null,
      bundleProductIds: Array.isArray(body.bundleProductIds) ? body.bundleProductIds : null,
      bundlePrice,
      minOrderAmount,
      startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      active: body.active !== false,
      channel: CHANNELS.includes(String(body.channel || "").toUpperCase()) ? String(body.channel).toUpperCase() : "ALL",
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "PROMOTION_CREATE",
    entityType: "Promotion",
    entityId: row.id,
    summary: row.name,
  });
  res.status(201).json(toApi("Promotion", row));
});

router.patch("/:id", requireModule("promotions", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const existing = await prisma.promotion.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Offer not found" });
  assertVersion(existing, version);
  const data = {};
  if (req.body?.active != null) data.active = Boolean(req.body.active);
  if (req.body?.endsAt !== undefined) data.endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
  const row = await versionedUpdate(prisma, "promotion", { id: existing.id, version, data });
  await writeAudit({
    userId: req.user.sub,
    action: "PROMOTION_UPDATE",
    entityType: "Promotion",
    entityId: row.id,
    summary: `${row.name} active=${row.active}`,
  });
  res.json(toApi("Promotion", row));
});

export default router;
