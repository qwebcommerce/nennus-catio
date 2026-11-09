import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { normalizeCouponCode } from "../lib/loyalty.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("loyalty"), async (req, res) => {
  const list = await prisma.coupon.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(list);
});

router.post("/", requirePermission("loyalty"), async (req, res) => {
  const orgId = req.user.organizationId;
  const b = req.body || {};
  const code = normalizeCouponCode(b.code);
  if (!code) return res.status(400).json({ error: "رمز الكوبون مطلوب" });
  const kind = b.kind === "FIXED" ? "FIXED" : "PERCENT";
  const value = Number(b.value);
  if (Number.isNaN(value) || value <= 0) {
    return res.status(400).json({ error: "قيمة الكوبون غير صالحة" });
  }
  if (kind === "PERCENT" && value > 100) {
    return res.status(400).json({ error: "النسبة يجب ألا تتجاوز 100" });
  }
  let channel = "BOTH";
  if (b.channel === "RETAIL" || b.channel === "WHOLESALE" || b.channel === "BOTH") {
    channel = b.channel;
  }
  try {
    const row = await prisma.coupon.create({
      data: {
        organizationId: orgId,
        code,
        kind,
        value,
        minOrderAmount:
          b.minOrderAmount != null && b.minOrderAmount !== ""
            ? Number(b.minOrderAmount)
            : null,
        maxDiscountAmount:
          b.maxDiscountAmount != null && b.maxDiscountAmount !== ""
            ? Number(b.maxDiscountAmount)
            : null,
        maxUsesTotal:
          b.maxUsesTotal != null && b.maxUsesTotal !== ""
            ? Math.floor(Number(b.maxUsesTotal))
            : null,
        maxUsesPerCustomer:
          b.maxUsesPerCustomer != null && b.maxUsesPerCustomer !== ""
            ? Math.floor(Number(b.maxUsesPerCustomer))
            : null,
        validFrom: b.validFrom ? new Date(String(b.validFrom)) : undefined,
        validUntil: b.validUntil ? new Date(String(b.validUntil)) : null,
        active: b.active !== false,
        channel,
        note: b.note != null && String(b.note).trim() ? String(b.note).trim() : null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "هذا الرمز مستخدم بالفعل" });
    }
    throw e;
  }
});

router.patch("/:id", requirePermission("loyalty"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.coupon.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).json({ error: "غير موجود" });
  const b = req.body || {};
  const data = {};
  if (b.code != null) {
    const code = normalizeCouponCode(b.code);
    if (!code) return res.status(400).json({ error: "رمز غير صالح" });
    data.code = code;
  }
  if (b.kind === "FIXED" || b.kind === "PERCENT") data.kind = b.kind;
  if (b.value != null) {
    const value = Number(b.value);
    if (Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ error: "قيمة غير صالحة" });
    }
    data.value = value;
  }
  if (b.minOrderAmount !== undefined) {
    data.minOrderAmount =
      b.minOrderAmount != null && b.minOrderAmount !== ""
        ? Number(b.minOrderAmount)
        : null;
  }
  if (b.maxDiscountAmount !== undefined) {
    data.maxDiscountAmount =
      b.maxDiscountAmount != null && b.maxDiscountAmount !== ""
        ? Number(b.maxDiscountAmount)
        : null;
  }
  if (b.maxUsesTotal !== undefined) {
    data.maxUsesTotal =
      b.maxUsesTotal != null && b.maxUsesTotal !== ""
        ? Math.floor(Number(b.maxUsesTotal))
        : null;
  }
  if (b.maxUsesPerCustomer !== undefined) {
    data.maxUsesPerCustomer =
      b.maxUsesPerCustomer != null && b.maxUsesPerCustomer !== ""
        ? Math.floor(Number(b.maxUsesPerCustomer))
        : null;
  }
  if (b.validFrom != null) data.validFrom = new Date(String(b.validFrom));
  if (b.validUntil !== undefined) {
    data.validUntil =
      b.validUntil != null && b.validUntil !== ""
        ? new Date(String(b.validUntil))
        : null;
  }
  if (b.active !== undefined) data.active = Boolean(b.active);
  if (b.channel === "RETAIL" || b.channel === "WHOLESALE" || b.channel === "BOTH") {
    data.channel = b.channel;
  }
  if (b.note !== undefined) {
    data.note = b.note != null && String(b.note).trim() ? String(b.note).trim() : null;
  }
  try {
    const row = await prisma.coupon.update({
      where: { id: existing.id },
      data,
    });
    res.json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "هذا الرمز مستخدم بالفعل" });
    }
    throw e;
  }
});

router.delete("/:id", requirePermission("loyalty"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.coupon.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).end();
  await prisma.coupon.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
