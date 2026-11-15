"use client";

import type { AdminOrderPromotion } from "@nennus-catio/contracts";
import { PROMOTION_USE_STATUSES } from "@/features/admin/promotions/lib/promotion-labels";
import { useCopy } from "@/shared/lib/copy";
import { formatDiscount } from "@/shared/lib/format";

/**
 * An order's or booking's promotions in the staff summary (11e), from its own copy (D203): the name and
 * code, whether the use counts (awaiting payment or paid) or was given back, and what it took off.
 */
export function PromotionSummaryRows({ promotions }: { promotions: readonly AdminOrderPromotion[] }) {
  const c = useCopy();
  return (
    <>
      {promotions.map((promotion) => (
        <div key={promotion.promotionId} className="orders-summary-discount">
          <dt>
            {c.local(promotion.name)}
            {promotion.code && (
              <>
                {" · "}
                <bdi>{promotion.code}</bdi>
              </>
            )}
            <small className={`orders-promotion-use orders-promotion-use--${promotion.status}`}>
              {c.local(PROMOTION_USE_STATUSES[promotion.status])}
            </small>
          </dt>
          <dd>
            <bdi>{formatDiscount(promotion.discount, c.locale)}</bdi>
          </dd>
        </div>
      ))}
    </>
  );
}
