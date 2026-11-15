"use client";
import { type Dispatch, type ReactNode, type SetStateAction, useState } from "react";
import { HOUSE_MAX_LEAD_DAYS } from "@nennus-catio/contracts";
import type { Product } from "@/mocks/data/business";
import { bi } from "@/mocks/data/business";
import {
  houseCollections,
  collectionsForPet,
  type HouseMetadata,
} from "@/mocks/data/pet-houses";
import { Field } from "@/shared/ui/BusinessUI";
import { GalleryUpload, ImagePicker } from "@/shared/ui/ImagePicker";
import { Photo } from "@/shared/ui/Photo";
import { useCopy } from "@/shared/lib/copy";
import { NumberInput } from "@/shared/ui/NumberInput";

/**
 * The Pet House editor's parts (#14, D268): the product editor shows them as four numbered steps in
 * plain words (what it is, price and sizes, availability and delivery, ready for online orders).
 */
interface HousePartProps {
  product: Product;
  /** The editor's state setter: photo uploads finish later, so every change updates the latest form. */
  onChange: Dispatch<SetStateAction<Product>>;
}

function useHouseUpdate(onChange: HousePartProps["onChange"]) {
  return (changes: Partial<HouseMetadata>) =>
    onChange((current) => (current.house ? { ...current, house: { ...current.house, ...changes } } : current));
}

/** A number as a field's text: empty while it is not known. */
function asText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function HouseStep({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="house-editor house-step">
      <legend>
        <span className="house-step-number" aria-hidden="true">
          {step}
        </span>
        {title}
      </legend>
      {hint && <p className="small muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Step 1's house part: the design, its size, its features and more photos. */
export function HouseDesign({ product: p, onChange, onError }: HousePartProps & { onError: (message: string) => void }) {
  const c = useCopy(),
    h = p.house!,
    update = useHouseUpdate(onChange);
  // The three sizes are kept as typed: all three or none (not known yet), never a 0.
  const [size, setSize] = useState(() => ({
    height: asText(h.dimensions?.height),
    width: asText(h.dimensions?.width),
    depth: asText(h.dimensions?.depth),
  }));
  const sizeStarted = Object.values(size).some((value) => value !== "");
  function changeSize(key: keyof typeof size, value: string) {
    const next = { ...size, [key]: value };
    setSize(next);
    const complete = Object.values(next).every((x) => x !== "");
    update({
      dimensions: complete
        ? { height: Number(next.height), width: Number(next.width), depth: Number(next.depth), unit: "cm" }
        : null,
    });
  }
  return (
    <>
      <Field label={c.text("Design", "التصميم")}>
        <select
          value={h.collection}
          onChange={(e) => update({ collection: e.target.value as HouseMetadata["collection"] })}
        >
          {houseCollections
            .filter((x) => collectionsForPet(p.pet).includes(x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {c.local(x.name)}
              </option>
            ))}
        </select>
      </Field>
      <h3>{c.text("Size · cm", "المقاس · سم")}</h3>
      <div className="form-three">
        {(["height", "width", "depth"] as const).map((key) => (
          <Field
            key={key}
            label={
              key === "height"
                ? c.text("Height · cm", "الارتفاع · سم")
                : key === "width"
                  ? c.text("Width · cm", "العرض · سم")
                  : c.text("Depth · cm", "العمق · سم")
            }
          >
            <NumberInput
              // Whole centimetres, as the server stores them (D230).
              min={1}
              max={10_000}
              required={sizeStarted}
              value={size[key]}
              onChange={(e) => changeSize(key, e.target.value)}
            />
          </Field>
        ))}
      </div>
      <p className="small muted">
        {c.text(
          "Leave all three empty while the size is not known: customers are asked to check it on WhatsApp.",
          "اترك الثلاثة فارغة إن لم يُعرف المقاس بعد: يُطلب من العملاء السؤال عنه عبر واتساب.",
        )}
      </p>
      <h3>{c.text("Features", "المميزات")}</h3>
      <p className="small muted">
        {c.text(
          "Short points customers see on the model's page, in English and Arabic.",
          "نقاط قصيرة يراها العملاء في صفحة التصميم، بالإنجليزية والعربية.",
        )}
      </p>
      {h.features.map((f, i) => (
        <div className="variant-editor" key={f.id}>
          <div className="form-two">
            {(["en", "ar"] as const).map((lang) => (
              <Field key={lang} label={`${c.text("Feature", "ميزة")} ${i + 1} · ${lang.toUpperCase()}`}>
                <input
                  required
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={f[lang]}
                  onChange={(e) =>
                    update({
                      features: h.features.map((x, j) => (j === i ? { ...x, [lang]: e.target.value } : x)),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <button
            type="button"
            className="text-button"
            aria-label={c.text(`Remove feature ${i + 1}`, `إزالة الميزة ${i + 1}`)}
            onClick={() => update({ features: h.features.filter((_, j) => j !== i) })}
          >
            {c.text("Remove feature", "إزالة الميزة")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button--secondary"
        onClick={() => update({ features: [...h.features, { ...bi("", ""), id: crypto.randomUUID() }] })}
      >
        {c.text("Add a feature", "إضافة ميزة")}
      </button>
      <h3>{c.text("More photos", "صور إضافية")}</h3>
      <p className="small muted">
        {c.text(
          "Optional: up to eight more photos, shown under the main photo on the model's page.",
          "اختياري: حتى ثماني صور إضافية تظهر أسفل الصورة الرئيسية في صفحة التصميم.",
        )}
      </p>
      {(p.gallery ?? []).map((photo, i) => (
        <fieldset className="variant-editor" key={photo.id}>
          <legend>{c.text(`More photo ${i + 1}`, `صورة إضافية ${i + 1}`)}</legend>
          <Photo
            src={photo.src}
            alt=""
            className="editor-photo"
            unavailableLabel={c.text("Photo unavailable", "صورة غير متاحة")}
          />
          <ImagePicker
            value={photo.src}
            onError={onError}
            onChange={(image) =>
              onChange((current) => ({
                ...current,
                gallery: current.gallery?.map((x) => (x.id === photo.id ? { ...x, src: image } : x)),
              }))
            }
          />
          <button
            type="button"
            className="text-button"
            aria-label={c.text(`Remove photo ${i + 1}`, `إزالة الصورة ${i + 1}`)}
            onClick={() =>
              onChange((current) => ({
                ...current,
                gallery: current.gallery?.filter((x) => x.id !== photo.id),
              }))
            }
          >
            {c.text("Remove photo", "إزالة الصورة")}
          </button>
        </fieldset>
      ))}
      <GalleryUpload
        room={8 - (p.gallery?.length ?? 0)}
        onError={onError}
        onAdd={(sources) =>
          onChange((current) => ({
            ...current,
            gallery: [...(current.gallery ?? []), ...sources.map((src) => ({ id: crypto.randomUUID(), src }))].slice(0, 8),
          }))
        }
      />
      <button
        type="button"
        className="button button--secondary"
        disabled={(p.gallery?.length ?? 0) >= 8}
        onClick={() =>
          onChange((current) => ({
            ...current,
            gallery: [...(current.gallery ?? []), { id: crypto.randomUUID(), src: "" }],
          }))
        }
      >
        {c.text("Add a photo", "أضف صورة")}
      </button>
    </>
  );
}

/** Step 2's first question: a fixed price customers can order at, or a price given on WhatsApp. */
export function HousePricing({ product: p, onChange }: HousePartProps) {
  const c = useCopy(),
    h = p.house!,
    update = useHouseUpdate(onChange);
  return (
    <fieldset className="house-choice">
      <legend>{c.text("How it is priced", "طريقة التسعير")}</legend>
      <label>
        <input type="radio" name="house-price" checked={h.purchaseMode === "fixed"} onChange={() => update({ purchaseMode: "fixed" })} />
        <span>
          <strong>{c.text("Fixed price", "سعر ثابت")}</strong>
          <small>{c.text("Customers can order it online at the price of each size.", "يمكن للعملاء طلبه عبر الموقع بسعر كل مقاس.")}</small>
        </span>
      </label>
      <label>
        <input type="radio" name="house-price" checked={h.purchaseMode === "inquiry"} onChange={() => update({ purchaseMode: "inquiry" })} />
        <span>
          <strong>{c.text("Price on request", "السعر عند الاستفسار")}</strong>
          <small>{c.text("Customers ask on WhatsApp; it is not ordered online.", "يسأل العملاء عبر واتساب؛ لا يُطلب عبر الموقع.")}</small>
        </span>
      </label>
    </fieldset>
  );
}

/** Step 3: in stock or made to order, how soon, the delivery charge, and pickup. */
export function HouseAvailability({ product: p, onChange }: HousePartProps) {
  const c = useCopy(),
    h = p.house!,
    update = useHouseUpdate(onChange);
  // Both numbers or neither (not known yet): a half-typed estimate stops the form, never saves a 0.
  const [days, setDays] = useState(() => ({ min: asText(h.leadTime?.minDays), max: asText(h.leadTime?.maxDays) }));
  const daysStarted = days.min !== "" || days.max !== "";
  function changeDays(key: "min" | "max", value: string) {
    const next = { ...days, [key]: value };
    setDays(next);
    update({
      leadTime: next.min !== "" && next.max !== "" ? { minDays: Number(next.min), maxDays: Number(next.max) } : null,
    });
  }
  return (
    <>
      <fieldset className="house-choice">
        <legend>{c.text("Availability", "التوفر")}</legend>
        <label>
          <input
            type="radio"
            name="house-availability"
            checked={h.availability === "in-stock"}
            onChange={() => update({ availability: "in-stock" })}
          />
          <span>
            <strong>{c.text("In stock", "متوفر في المخزون")}</strong>
            <small>{c.text("Sold from the stock of each size; it sells out at 0.", "يُباع من مخزون كل مقاس؛ ينفد عند 0.")}</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="house-availability"
            checked={h.availability === "made-to-order"}
            onChange={() => update({ availability: "made-to-order" })}
          />
          <span>
            <strong>{c.text("Made to order", "يُصنع عند الطلب")}</strong>
            <small>{c.text("Made after each order, so there is no stock to count.", "يُصنع بعد كل طلب، فلا مخزون يُحسب.")}</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="house-availability"
            checked={h.availability === "unconfirmed"}
            onChange={() => update({ availability: "unconfirmed" })}
          />
          <span>
            <strong>{c.text("Not confirmed yet", "غير مؤكد بعد")}</strong>
            <small>{c.text("Customers ask about it on WhatsApp.", "يسأل العملاء عنه عبر واتساب.")}</small>
          </span>
        </label>
      </fieldset>
      <h3>{c.text("Ready in about … days", "جاهز خلال … يوماً تقريباً")}</h3>
      <div className="form-two">
        <Field label={c.text("Shortest · days", "أقل مدة · أيام")}>
          <NumberInput
            min={0}
            max={HOUSE_MAX_LEAD_DAYS}
            required={daysStarted}
            value={days.min}
            onChange={(e) => changeDays("min", e.target.value)}
          />
        </Field>
        <Field label={c.text("Longest · days", "أطول مدة · أيام")}>
          <NumberInput
            // The longest is never shorter than the shortest.
            min={days.min === "" ? 0 : Number(days.min)}
            max={HOUSE_MAX_LEAD_DAYS}
            required={daysStarted}
            value={days.max}
            onChange={(e) => changeDays("max", e.target.value)}
          />
        </Field>
      </div>
      <p className="small muted">
        {c.text(
          `Made to order: how long making it takes. In stock: how soon it can be delivered. Customers see "ready in about 7–10 days", and checkout offers delivery from today plus the longest number (at most ${HOUSE_MAX_LEAD_DAYS}). Leave both empty while not known.`,
          `يُصنع عند الطلب: مدة صنعه. متوفر: أقرب وقت لتوصيله. يرى العملاء «جاهز خلال 7–10 أيام تقريباً»، ويعرض الدفع التوصيل من اليوم مضافاً إليه أطول مدة (${HOUSE_MAX_LEAD_DAYS} يوماً كحد أقصى). اترك الحقلين فارغين إن لم تُعرف المدة.`,
        )}
      </p>
      <Field label={c.text("Delivery charge for this house · QAR", "رسوم توصيل هذا البيت · ر.ق")}>
        <NumberInput
          kind="decimal"
          min={0}
          max={10_000}
          placeholder={c.text("Not set yet", "لم تُحدد بعد")}
          value={h.deliveryFee === null ? "" : h.deliveryFee / 100}
          onChange={(e) => update({ deliveryFee: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })}
        />
      </Field>
      <p className="small muted">
        {c.text(
          "Charged for each house, on top of the area's usual delivery fee. Enter 0 for no extra charge; leave it empty while not known.",
          "تُحتسب لكل بيت، إضافة إلى رسوم التوصيل المعتادة للمنطقة. أدخل 0 لعدم إضافة رسوم؛ اتركها فارغة إن لم تُعرف.",
        )}
      </p>
      <fieldset className="house-choice">
        <legend>{c.text("How customers get it", "كيف يستلمه العملاء")}</legend>
        <label>
          <input
            type="radio"
            name="house-fulfilment"
            checked={h.fulfilment === "delivery"}
            onChange={() => update({ fulfilment: "delivery" })}
          />
          <span>
            <strong>{c.text("Delivery only", "توصيل فقط")}</strong>
            <small>{c.text("An order with this house cannot choose pickup.", "الطلب الذي يضم هذا البيت لا يمكنه اختيار الاستلام.")}</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="house-fulfilment"
            checked={h.fulfilment === "both"}
            onChange={() => update({ fulfilment: "both" })}
          />
          <span>
            <strong>{c.text("Delivery or pickup from the shop", "توصيل أو استلام من المتجر")}</strong>
            <small>{c.text("Customers choose at checkout.", "يختار العملاء عند الدفع.")}</small>
          </span>
        </label>
      </fieldset>
    </>
  );
}
