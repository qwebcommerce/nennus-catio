"use client";

import { ArrowRight, Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useFeaturedOffers } from "@/shared/api/offers";
import { useCopy } from "@/shared/lib/copy";
import { offerConditions, offerKey, offerText } from "@/shared/lib/offers";
import { Photo } from "@/shared/ui/Photo";

/**
 * The home page's strip of featured offers (11e): up to 3, marked "Feature on homepage" by the owner.
 * Nothing shows while there are none, while loading, or if they cannot be read: the page stays as it was.
 */
export function FeaturedOffers() {
  const c = useCopy();
  const offers = useFeaturedOffers();
  if (!offers.data?.length) return null;
  return (
    <section className="ref-section ref-section--offers" aria-labelledby="ref-offers-title">
      <div className="ref-section__heading">
        <div>
          <h2 id="ref-offers-title">{c.text("Current offers", "العروض الحالية")}</h2>
        </div>
      </div>
      <div className="ref-offer-cards">
        {offers.data.map((offer) => {
          const conditions = offerConditions(offer, c.text, c.locale);
          const grooming = offer.scope === "grooming";
          return (
            <article className="ref-offer-card" key={offerKey(offer)}>
              {offer.image ? (
                <Photo src={offer.image} alt="" className="ref-offer-card__photo" sizes="(max-width: 650px) 100vw, 33vw" />
              ) : (
                <span className="ref-offer-card__photo ref-offer-card__photo--plain" aria-hidden="true">
                  <Tag size={30} />
                </span>
              )}
              <div>
                <span className="offer-badge">{offerText(offer, c.text, c.locale)}</span>
                <h3>{c.local(offer.name)}</h3>
                {c.local(offer.description) && <p>{c.local(offer.description)}</p>}
                {conditions.length > 0 && <p className="ref-offer-card__conditions">{conditions.join(" · ")}</p>}
                {offer.code && (
                  <p className="ref-offer-card__code">
                    {c.text("Use code ", "استخدم الرمز ")}
                    <bdi>
                      <strong>{offer.code}</strong>
                    </bdi>
                  </p>
                )}
                <Link href={grooming ? "/grooming/book" : "/shop"} className="ref-inline-link">
                  {grooming ? c.text("Book grooming", "احجز العناية") : c.text("Shop now", "تسوق الآن")}
                  <ArrowRight size={16} className="directional" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
