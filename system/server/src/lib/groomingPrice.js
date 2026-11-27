/**
 * fix-re: the price of one grooming booking (whole dirhams), with a generated coupon or the
 * automatic grooming promotions — never both (docs/testing/coupons.md, "Stacking").
 *
 *  - A typed code that is a generated coupon: the coupon discount on the package price; no
 *    automatic promotion is applied on top.
 *  - Website, no coupon: the automatic GROOMING promotions (and an old shared promotion code)
 *    exactly as before (lib/promotions.js quotePromotions). A typed code that matches neither a
 *    coupon nor a promotion is refused (COUPON_INVALID) instead of being silently ignored.
 *  - Desk: no automatic promotions (as before); only a coupon.
 */
import { d } from "./money.js";
import { quotePromotions } from "./promotions.js";
import { checkCoupon, couponError, findCode } from "./coupons.js";

/**
 * @returns {Promise<{ price, homeFee, gross, discount, amount, coupon: object|null, promotionIds: string[] }>}
 */
export async function priceGrooming(db, { organizationId, service, homeFee = 0, code, channel, customerId = null, now = new Date() }) {
  const price = d(service.price);
  const fee = d(homeFee);
  const gross = price + fee;
  const typed = String(code || "").trim();
  if (typed && (await findCode(db, organizationId, typed))) {
    const checked = await checkCoupon(db, {
      organizationId,
      input: typed,
      serviceId: service.id,
      packagePrice: price,
      gross,
      channel,
      customerId,
      now,
    });
    return { price, homeFee: fee, gross, discount: checked.discount, amount: Math.max(0, gross - checked.discount), coupon: checked, promotionIds: [] };
  }
  if (channel === "DESK") {
    if (typed) throw couponError("COUPON_INVALID");
    return { price, homeFee: fee, gross, discount: 0, amount: gross, coupon: null, promotionIds: [] };
  }
  const promo = await quotePromotions(db, { organizationId, channel: "GROOMING", lines: [], goods: gross, code: typed || undefined });
  if (typed && !promo.codeApplied) throw couponError("COUPON_INVALID");
  return { price, homeFee: fee, gross, discount: promo.discount, amount: Math.max(0, gross - promo.discount), coupon: null, promotionIds: promo.ids };
}

/** API shape of a price (riyals). */
export function priceBody(p, riyals) {
  return {
    price: riyals(p.price),
    homeFee: riyals(p.homeFee),
    gross: riyals(p.gross),
    discount: riyals(p.discount),
    total: riyals(p.amount),
    coupon: p.coupon
      ? {
          code: p.coupon.codeRow.code,
          batch: p.coupon.batch.name,
          batchEn: p.coupon.batch.nameEn || p.coupon.batch.name,
          discountType: p.coupon.batch.discountType,
          percent: p.coupon.batch.percent,
          amount: p.coupon.batch.amount != null ? riyals(p.coupon.batch.amount) : null,
          discount: riyals(p.discount),
        }
      : null,
    promotion: !p.coupon && p.discount > 0,
  };
}
