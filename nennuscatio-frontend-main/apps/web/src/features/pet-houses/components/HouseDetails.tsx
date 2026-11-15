"use client";
import { useState } from "react";
import { ArrowLeft, Check, Clock, PawPrint, Ruler, ShoppingBag, Truck } from "lucide-react";
import type { Product } from "@/mocks/data/business";
import { housePetTypes, houseCollections } from "@/mocks/data/pet-houses";
import { useCart } from "@/mocks/MockDataProvider";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { formatQatarDay } from "@/shared/lib/format";
import { Photo } from "@/shared/ui/Photo";
import { Field } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
import { CustomInquiry } from "./CustomInquiry";
import { earliestHouseDay, houseOrderable, madeToOrder, quantityLimit } from "../lib/ordering";

/**
 * A Pet House model (PH-2; ordering #14, D268). A model that is ready to order online shows one box
 * that answers "how much, when, and how it arrives" before "Add to cart"; a custom version stays a
 * WhatsApp conversation. A model that is not ready (or priced on request) keeps WhatsApp as its button.
 */
export function HouseDetails({ product: p }: { product: Product }) {
  const c = useCopy(),
    h = p.house!;
  const { source } = useRepositories();
  const { cart, setCart } = useCart();
  const [selectedImage, setSelectedImage] = useState(""),
    [selectedVariant, setSelectedVariant] = useState(""),
    [quantity, setQuantity] = useState(1),
    [added, setAdded] = useState(false);
  const images = [{ id: "primary", src: p.image }, ...(p.gallery ?? [])],
    image = images.find((x) => x.id === selectedImage) ?? images[0],
    v = p.variants.find((x) => x.id === selectedVariant) ?? p.variants[0];
  const collection = houseCollections.find((x) => x.id === h.collection);
  // Every pet it suits (the product's pet types), not only the first.
  const pets = (p.pets?.length ? p.pets : [p.pet])
    .map((id) => housePetTypes.find((x) => x.id === id))
    .filter((pet): pet is (typeof housePetTypes)[number] => Boolean(pet));
  const prices = p.variants.map((x) => x.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  // Ordering works against the real API only; the demo's checkout keeps houses out.
  const orderable = source === "api" && houseOrderable(p);
  const made = madeToOrder(p);
  const limit = v ? quantityLimit(p, v) : 0;
  const inCart = v ? (cart.find((l) => l.productId === p.id && l.variantId === v.id)?.quantity ?? 0) : 0;
  const soldOut = !made && (v?.stock ?? 0) <= 0;
  const lead = h.leadTime;

  function add() {
    if (!v || soldOut || quantity < 1 || quantity + inCart > limit) return;
    setCart(
      cart.some((l) => l.productId === p.id && l.variantId === v.id)
        ? cart.map((l) => (l.productId === p.id && l.variantId === v.id ? { ...l, quantity: l.quantity + quantity } : l))
        : [...cart, { productId: p.id, variantId: v.id, quantity }],
    );
    setAdded(true);
  }

  return (
    <div className="customer-page house-detail-page">
      <Link href={`/pet-houses?pet=${p.pet}&collection=${h.collection}`} className="text-link">
        <ArrowLeft size={16} className="directional" />
        {c.text("Back to pet houses", "العودة لبيوت الحيوانات")}
      </Link>
      <div className="product-detail house-detail">
        <div className="house-gallery">
          <Photo
            src={image.src}
            alt={c.local(p.name)}
            className="house-detail-photo"
            priority
            unavailableLabel={c.text("Model photo unavailable", "صورة التصميم غير متاحة")}
          />
          {images.length > 1 && (
            <div className="house-thumbnails">
              {images.map((photo, i) => (
                <button
                  type="button"
                  key={photo.id}
                  aria-label={c.text(`Show photo ${i + 1}`, `عرض الصورة ${i + 1}`)}
                  aria-pressed={photo.id === image.id}
                  onClick={() => setSelectedImage(photo.id)}
                >
                  <Photo src={photo.src} alt="" sizes="85px" unavailableLabel={c.text("No photo", "لا صورة")} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="house-detail-copy">
          {collection && <p className="eyebrow">{c.local(collection.name)}</p>}
          <h1>{c.local(p.name)}</h1>
          {pets.length > 0 && (
            <p className="house-suits">
              <PawPrint size={16} aria-hidden="true" />
              <span>
                {c.text("Suitable for: ", "مناسب لـ: ")}
                {pets.map((pet) => c.local(pet.name)).join(c.text(", ", "، "))}
              </span>
            </p>
          )}
          <p className="muted">{c.local(p.description)}</p>
          <p className="product-price">
            {h.purchaseMode === "inquiry"
              ? c.text("Price on request", "السعر عند الاستفسار")
              : prices.some((price) => price !== lowest)
                ? c.text(`From ${c.money(lowest)}`, `ابتداءً من ${c.money(lowest)}`)
                : c.money(lowest)}
          </p>
          {h.provisional && (
            <p className="small muted">
              {c.text("Reference price & content · owner confirmation required", "سعر ومحتوى مرجعي · يتطلب تأكيد المالك")}
            </p>
          )}

          {orderable && v ? (
            <>
              {p.variants.length > 1 && (
                <Field label={c.text("Size", "المقاس")}>
                  <select
                    value={v.id}
                    onChange={(e) => {
                      setSelectedVariant(e.target.value);
                      setAdded(false);
                    }}
                  >
                    {p.variants.map((x) => (
                      <option key={x.id} value={x.id}>
                        {c.local(x.label)} · {c.money(x.price)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {/* How much, when, and how it arrives, before the button. */}
              <section className="house-buy-box" aria-label={c.text("Delivery and timing", "التوصيل والمدة")}>
                <p>
                  <Clock size={16} aria-hidden="true" />
                  <span>
                    {soldOut
                      ? c.text("Out of stock at the moment.", "غير متوفر حالياً.")
                      : made
                        ? c.text(
                            `Made to order: ready in about ${lead?.minDays}–${lead?.maxDays} days`,
                            `يُصنع عند الطلب: جاهز خلال ${lead?.minDays}–${lead?.maxDays} يوماً تقريباً`,
                          )
                        : c.text(
                            `In stock: ready in about ${lead?.minDays}–${lead?.maxDays} days`,
                            `متوفر: جاهز خلال ${lead?.minDays}–${lead?.maxDays} يوماً تقريباً`,
                          )}
                  </span>
                </p>
                {!soldOut && lead && (
                  <p>
                    <Check size={16} aria-hidden="true" />
                    <span>
                      {c.text("Earliest delivery: ", "أقرب موعد للتوصيل: ")}
                      <strong>{formatQatarDay(earliestHouseDay(lead.maxDays), c.locale)}</strong>
                    </span>
                  </p>
                )}
                <p>
                  <Truck size={16} aria-hidden="true" />
                  <span>
                    {h.deliveryFee
                      ? c.text(
                          `Delivery: ${c.money(h.deliveryFee)} for this house, plus your area's usual fee`,
                          `التوصيل: ${c.money(h.deliveryFee)} لهذا البيت، إضافة إلى الرسوم المعتادة لمنطقتك`,
                        )
                      : c.text(
                          "Delivery: your area's usual fee, with no extra charge for this house",
                          "التوصيل: الرسوم المعتادة لمنطقتك، دون رسوم إضافية لهذا البيت",
                        )}
                    {h.fulfilment === "both" && c.text(" · or collect it from the shop", " · أو استلمه من المتجر")}
                  </span>
                </p>
              </section>
              {!soldOut && (
                <Field label={c.text("Quantity", "الكمية")}>
                  <NumberInput
                    min={1}
                    max={Math.max(1, limit - inCart)}
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)));
                      setAdded(false);
                    }}
                  />
                </Field>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={add}
                disabled={soldOut || quantity < 1 || quantity + inCart > limit}
              >
                <ShoppingBag size={17} />
                {soldOut ? c.text("Out of stock", "غير متوفر") : c.text("Add to cart", "أضف للسلة")}
              </button>
              {!soldOut && quantity + inCart > limit && (
                <p className="form-error" role="alert">
                  {c.text(`You can have up to ${limit} of this house in your cart.`, `يمكنك إضافة ${limit} من هذا البيت كحد أقصى.`)}
                </p>
              )}
              {added && (
                <p role="status" className="row added-message">
                  <Check size={17} />
                  {c.text("Added to your cart.", "تمت الإضافة للسلة.")}
                  <Link className="text-link" href="/cart">
                    {c.text("View cart", "عرض السلة")}
                  </Link>
                </p>
              )}
              <CustomInquiry model={c.local(p.name)} subtle />
            </>
          ) : (
            <>
              <p className="small muted">
                {h.availability === "made-to-order"
                  ? c.text("Made to order", "يُصنع عند الطلب")
                  : h.availability === "in-stock"
                    ? c.text("In stock", "متوفر")
                    : c.text("Availability awaiting confirmation", "التوفر بانتظار التأكيد")}
              </p>
              {h.purchaseMode === "fixed" && (
                <p className="note-box">
                  {c.text(
                    "This model cannot be ordered online yet. Ask us about it on WhatsApp.",
                    "لا يمكن طلب هذا التصميم عبر الموقع بعد. استفسر عنه عبر واتساب.",
                  )}
                </p>
              )}
              <CustomInquiry model={c.local(p.name)} mode={h.purchaseMode === "inquiry" ? "quote" : "ask"} />
              {h.purchaseMode === "fixed" && <CustomInquiry model={c.local(p.name)} subtle />}
            </>
          )}

          {h.features.length > 0 && (
            <ul className="house-features">
              {h.features.map((f) => (
                <li key={f.id}>
                  <Check size={16} />
                  {c.local(f)}
                </li>
              ))}
            </ul>
          )}
          <div className="house-specs">
            <section>
              <h2>
                <Ruler size={17} />
                {c.text("Dimensions", "الأبعاد")}
              </h2>
              {h.dimensions ? (
                <dl className="house-dimensions">
                  {(["height", "width", "depth"] as const).map((key) => (
                    <div key={key}>
                      <dt>
                        {key === "height"
                          ? c.text("Height", "الارتفاع")
                          : key === "width"
                            ? c.text("Width", "العرض")
                            : c.text("Depth", "العمق")}
                      </dt>
                      <dd>
                        <bdi>{h.dimensions![key]}</bdi> {c.text("cm", "سم")}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>{c.text("Ask us for the exact size on WhatsApp.", "اسألنا عن المقاس الدقيق عبر واتساب.")}</p>
              )}
            </section>
            {!orderable && (
              <>
                <section>
                  <h2>
                    <Clock size={17} />
                    {c.text("Estimated delivery", "مدة التوصيل التقديرية")}
                  </h2>
                  <p>
                    {lead
                      ? c.text(`Ready in about ${lead.minDays}–${lead.maxDays} days`, `جاهز خلال ${lead.minDays}–${lead.maxDays} يوماً تقريباً`)
                      : c.text("We confirm the time when you ask.", "نؤكد المدة عند استفسارك.")}
                  </p>
                </section>
                <section>
                  <h2>
                    <Truck size={17} />
                    {c.text("Delivery charge", "رسوم التوصيل")}
                  </h2>
                  <p>
                    {h.deliveryFee === null
                      ? c.text("We confirm it when you ask.", "نؤكدها عند استفسارك.")
                      : h.deliveryFee === 0
                        ? c.text("No extra charge; your area's usual fee applies.", "لا رسوم إضافية؛ تُطبّق الرسوم المعتادة لمنطقتك.")
                        : c.text(
                            `${c.money(h.deliveryFee)} per house, plus your area's usual fee.`,
                            `${c.money(h.deliveryFee)} لكل بيت، إضافة إلى الرسوم المعتادة لمنطقتك.`,
                          )}
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
