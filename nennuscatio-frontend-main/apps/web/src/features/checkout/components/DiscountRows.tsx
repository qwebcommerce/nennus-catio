"use client";

import type { OrderPromotion } from "@nennus-catio/contracts";
import { useCopy } from "@/shared/lib/copy";
import { offerKey } from "@/shared/lib/offers";

/**
 * The promotions that took something off (11e), one row each with its code, as "− QAR 6.35". A promotion
 * the QAR 1 floor brought down to nothing has no row. Used by the cart, checkout and the order page.
 */
export function DiscountRows({ promotions }: { promotions: readonly OrderPromotion[] }) {
  const c = useCopy();
  return (
    <>
      {promotions
        .filter((promotion) => promotion.discount > 0)
        .map((promotion) => (
          <div className="row spread discount-row" key={offerKey(promotion)}>
            <span>
              {c.local(promotion.name)}
              {promotion.code && (
                <>
                  {" · "}
                  <bdi>{promotion.code}</bdi>
                </>
              )}
            </span>
            <strong>{c.discount(promotion.discount)}</strong>
          </div>
        ))}
    </>
  );
}
