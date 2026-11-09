import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import {
  getOrCreateLoyaltySettings,
  summarizeLoyaltyProgram,
} from "../lib/loyalty.js";

const router = Router();
router.use(authMiddleware);

/** حالة الولاء لجميع الأدوار (نقطة البيع، إلخ) — لا يغيّر الإعدادات */
router.get("/status", async (req, res, next) => {
  try {
    const row = await getOrCreateLoyaltySettings(prisma, req.user.organizationId);
    res.json(summarizeLoyaltyProgram(row));
  } catch (e) {
    next(e);
  }
});

router.get("/", requirePermission("loyalty"), async (req, res) => {
  const row = await getOrCreateLoyaltySettings(prisma, req.user.organizationId);
  res.json(row);
});

router.get("/ledger", requirePermission("loyalty"), async (req, res) => {
  const take = Math.min(
    500,
    Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
  );
  const rows = await prisma.loyaltyLedger.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      sale: { select: { id: true, total: true, createdAt: true } },
    },
  });
  res.json(rows);
});

router.put("/", requirePermission("loyalty"), async (req, res) => {
  const orgId = req.user.organizationId;
  const b = req.body || {};
  await getOrCreateLoyaltySettings(prisma, orgId);

  const data = {};
  const bool = (k) => {
    if (b[k] === undefined) return;
    data[k] = Boolean(b[k]);
  };
  const num = (k, min, max) => {
    if (b[k] === undefined) return;
    const n = Number(b[k]);
    if (Number.isNaN(n)) return;
    data[k] = min != null && max != null ? Math.min(max, Math.max(min, n)) : n;
  };
  const dec = (k) => {
    if (b[k] === undefined) return;
    const n = Number(b[k]);
    if (Number.isNaN(n) || n < 0) return;
    data[k] = n;
  };

  bool("enabled");
  if (b.earnBase === "PER_ORDER_TOTAL" || b.earnBase === "LIFETIME_SPEND") {
    data.earnBase = b.earnBase;
  }
  dec("earnEveryAmount");
  num("earnPoints", 0, 1_000_000);
  dec("minOrderForEarn");
  bool("excludeWholesale");
  if (b.awardTiming === "ON_PAYMENT" || b.awardTiming === "ON_DELIVERY") {
    data.awardTiming = b.awardTiming;
  }
  bool("redemptionEnabled");
  dec("redeemPointsPerCurrency");
  num("maxRedemptionPercentOfInvoice", 0, 100);
  bool("allowCouponWithPoints");
  bool("guestPhoneRequired");

  const row = await prisma.loyaltyProgramSettings.update({
    where: { organizationId: orgId },
    data,
  });
  res.json(row);
});

export default router;
