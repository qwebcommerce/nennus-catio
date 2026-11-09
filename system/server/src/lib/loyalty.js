/**
 * @param {Pick<import("@prisma/client").PrismaClient, "loyaltyProgramSettings">} db
 * @param {string} organizationId
 */
export async function getOrCreateLoyaltySettings(db, organizationId) {
  let row = await db.loyaltyProgramSettings.findUnique({
    where: { organizationId },
  });
  if (!row) {
    row = await db.loyaltyProgramSettings.create({
      data: { organizationId, enabled: true },
    });
  }
  return row;
}

/** ملخص للواجهة ولـ API العام — برنامج الولاء غير مرتبط بمجال النشاط، يُعطَّل يدوياً من الإعدادات */
export function summarizeLoyaltyProgram(settingsRow) {
  const enabled = Boolean(settingsRow?.enabled);
  return {
    loyaltyProgramEnabled: enabled,
    loyaltyRedemptionEnabled: enabled && Boolean(settingsRow?.redemptionEnabled),
  };
}

export async function getLoyaltyFlagsForOrganization(db, organizationId) {
  const row = await getOrCreateLoyaltySettings(db, organizationId);
  return summarizeLoyaltyProgram(row);
}

/**
 * @param {string} raw
 */
export function normalizeCouponCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * @param {string} raw
 */
export function normalizePhone(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

/**
 * هل تُؤجَّل منحة النقاط؟ (استلام / دفع عند الاستلام)
 * الدفع المقسّم يُعامل كدفع مكتمل فوراً للولاء.
 * @param {{ awardTiming: string }} settings
 * @param {string} paymentMethod
 * @param {boolean} [isSplit]
 */
export function shouldDeferLoyaltyEarn(settings, paymentMethod, isSplit = false) {
  if (isSplit) return false;
  if (paymentMethod === "SPLIT") return false;
  if (paymentMethod === "ON_DELIVERY") return true;
  if (settings.awardTiming === "ON_DELIVERY") return true;
  return false;
}

/**
 * @param {number} amount
 * @param {{ kind: string, value: unknown }} coupon
 * @param {number} maxCap — سقف الخصم (مثلاً بعد الكوبون)
 */
export function couponDiscountMoney(amount, coupon, maxCap) {
  const v = Number(coupon.value);
  if (Number.isNaN(v) || v <= 0) return 0;
  let d = 0;
  if (coupon.kind === "PERCENT") {
    d = (amount * Math.min(100, v)) / 100;
  } else {
    d = v;
  }
  if (coupon.maxDiscountAmount != null) {
    const cap = Number(coupon.maxDiscountAmount);
    if (!Number.isNaN(cap) && cap > 0) d = Math.min(d, cap);
  }
  d = Math.min(d, maxCap);
  return Math.round(d * 100) / 100;
}

/**
 * نقاط الكسب: لكل فاتورة أو فرق سلم المجموع
 * @param {{ earnBase: string, earnEveryAmount: unknown, earnPoints: number }} settings
 * @param {number} eligibleBase — صافٍ مؤهل
 * @param {number} lifetimeSpendBefore
 */
export function computeEarnPoints(settings, eligibleBase, lifetimeSpendBefore) {
  const A = Math.max(0.000001, Number(settings.earnEveryAmount));
  const P = Math.max(0, settings.earnPoints | 0);
  const x = Math.max(0, eligibleBase);
  if (x <= 0 || P <= 0) return 0;
  if (settings.earnBase === "LIFETIME_SPEND") {
    const before = Math.max(0, lifetimeSpendBefore);
    const after = before + x;
    const totalAfter = Math.floor(after / A) * P;
    const totalBefore = Math.floor(before / A) * P;
    return Math.max(0, totalAfter - totalBefore);
  }
  return Math.floor(x / A) * P;
}

/**
 * @param {number} pointsRequested
 * @param {number} customerBalance
 * @param {{ redeemPointsPerCurrency: unknown, maxRedemptionPercentOfInvoice: number }} settings
 * @param {number} afterCouponAmount — سقف النسبة المئوية
 */
export function loyaltyRedeemMoney(
  pointsRequested,
  customerBalance,
  settings,
  afterCouponAmount
) {
  const use = Math.min(
    Math.max(0, Math.floor(pointsRequested)),
    Math.max(0, customerBalance)
  );
  if (use <= 0) return { pointsUsed: 0, money: 0 };
  const rpc = Math.max(0.000001, Number(settings.redeemPointsPerCurrency));
  const pct = Math.min(100, Math.max(0, settings.maxRedemptionPercentOfInvoice || 0));
  const maxByPct = (Math.max(0, afterCouponAmount) * pct) / 100;
  const rawMoney = use / rpc;
  const money = Math.round(
    Math.min(Math.max(0, afterCouponAmount), maxByPct, rawMoney) * 100
  ) / 100;
  let pointsUsed = Math.round(money * rpc);
  if (pointsUsed > use) {
    pointsUsed = use;
  }
  const moneyFinal = Math.round((pointsUsed / rpc) * 100) / 100;
  return { pointsUsed, money: Math.min(moneyFinal, afterCouponAmount) };
}
