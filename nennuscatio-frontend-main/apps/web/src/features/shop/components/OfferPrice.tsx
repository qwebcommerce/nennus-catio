"use client";

import type { ProductOffer } from "@nennus-catio/contracts";
import { useCopy } from "@/shared/lib/copy";
import { offerConditions, offerKey, offerText } from "@/shared/lib/offers";

/**
 * A price with its offer (11e): the price after the offer, then the list price crossed out. Screen
 * readers do not announce crossed-out text, so both prices are named. Only a display: the cart and
 * checkout ask the server for the price.
 */
export function OfferPrice({ price, salePrice, className = "" }: { price: number; salePrice?: number | null; className?: string }) {
  const c = useCopy();
  if (salePrice === undefined || salePrice === null || salePrice >= price) return <strong className={className}>{c.money(price)}</strong>;
  return (
    <span className={`offer-price ${className}`}>
      <strong>
        <span className="sr-only">{c.text("Offer price ", "سعر العرض ")}</span>
        {c.money(salePrice)}
      </strong>
      <del>
        <span className="sr-only">{c.text("was ", "بدلاً من ")}</span>
        {c.money(price)}
      </del>
    </span>
  );
}

/** One offer in a few words, with who and when: "Buy 2, get 1 free · Members · Until 30 Oct". */
export function useOfferLabel() {
  const c = useCopy();
  return (offer: ProductOffer) => [offerText(offer, c.text, c.locale), ...offerConditions(offer, c.text, c.locale)].join(" · ");
}

/** A card's offer badges (shop, home): the first two offers, then "+ N more". */
export function OfferBadges({ offers, className = "" }: { offers: readonly ProductOffer[] | undefined; className?: string }) {
  const c = useCopy();
  const label = useOfferLabel();
  if (!offers?.length) return null;
  const more = offers.length - 2;
  return (
    <ul className={`offer-badges ${className}`} aria-label={c.text("Offers", "العروض")}>
      {offers.slice(0, 2).map((offer) => (
        <li key={offerKey(offer)}>{label(offer)}</li>
      ))}
      {more > 0 && <li>{c.text(`+ ${more} more`, `+ ${more} أخرى`)}</li>}
    </ul>
  );
}

/**
 * A product page's offers in full (11e): each offer's name, what it gives, and who and when. Offers for
 * members, new customers, once per customer, with a minimum spend, buy-get offers and bundles are only
 * labels here; the cart shows what they take off.
 */
export function OfferList({ offers, packName }: { offers: readonly ProductOffer[] | undefined; packName: (product: string, variant: string) => string | null }) {
  const c = useCopy();
  if (!offers?.length) return null;
  return (
    <section className="offer-list" aria-label={c.text("Offers", "العروض")}>
      <h2>{c.text("Offers", "العروض")}</h2>
      <ul>
        {offers.map((offer) => {
          const conditions = offerConditions(offer, c.text, c.locale);
          const packs = offer.bundle?.map((item) => `${item.quantity} × ${packName(item.product, item.variant) ?? item.variant}`);
          return (
            <li key={offerKey(offer)}>
              <span className="offer-badge">{offerText(offer, c.text, c.locale)}</span>
              <span>
                <strong>{c.local(offer.name)}</strong>
                {packs?.length ? <span className="offer-list__packs">{packs.join(" + ")}</span> : null}
                {conditions.length > 0 && <small>{conditions.join(" · ")}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
