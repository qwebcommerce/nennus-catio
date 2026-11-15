"use client";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/mocks/data/business";
import { houseCollections, housePetTypes } from "@/mocks/data/pet-houses";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { Photo } from "@/shared/ui/Photo";
import { useCopy } from "@/shared/lib/copy";
import { houseOrderable } from "../lib/ordering";

/** A model in the Pet Houses catalogue: its price, how soon, and whether it is ordered online or asked about (#14). */
export function HouseCard({
  product: p,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const c = useCopy(),
    { source } = useRepositories(),
    h = p.house;
  if (!h) return null;
  const pet = housePetTypes.find((x) => x.id === p.pet),
    collection = houseCollections.find((x) => x.id === h.collection);
  const orderable = source === "api" && houseOrderable(p);
  const prices = p.variants.map((v) => v.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  return (
    <Link href={`/pet-houses/${p.id}`} className="house-card">
      <Photo
        src={p.image}
        alt={c.local(p.name)}
        priority={priority}
        sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 24vw"
        unavailableLabel={c.text("Model photo unavailable", "صورة التصميم غير متاحة")}
      />
      <div className="house-card__body">
        <p className="eyebrow">
          {pet && c.local(pet.name)} · {collection && c.local(collection.name)}
        </p>
        <h2>{c.local(p.name)}</h2>
        <div className="row spread">
          <strong>
            {h.purchaseMode === "inquiry"
              ? c.text("Price on request", "السعر عند الاستفسار")
              : prices.some((price) => price !== lowest)
                ? c.text(`From ${c.money(lowest)}`, `ابتداءً من ${c.money(lowest)}`)
                : c.money(lowest)}
          </strong>
          <ArrowRight size={18} className="directional" />
        </div>
        <p className="small muted">
          {h.leadTime
            ? c.text(`Ready in about ${h.leadTime.minDays}–${h.leadTime.maxDays} days`, `جاهز خلال ${h.leadTime.minDays}–${h.leadTime.maxDays} يوماً تقريباً`)
            : c.text("Delivery time on request", "مدة التوصيل عند الاستفسار")}
        </p>
        <span className="house-card__action">
          {orderable ? c.text("Order online", "اطلب عبر الموقع") : c.text("View model & ask on WhatsApp", "عرض التصميم والاستفسار عبر واتساب")}
        </span>
      </div>
    </Link>
  );
}
