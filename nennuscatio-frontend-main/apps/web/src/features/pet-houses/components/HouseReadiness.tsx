"use client";
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { Product } from "@/mocks/data/business";
import { useCopy } from "@/shared/lib/copy";
import { formatQatarDay } from "@/shared/lib/format";
import { earliestHouseDay } from "../lib/ordering";
import { houseReadiness } from "../lib/readiness";

/**
 * Step 4 of the house editor (#14, D268): "Ready for online orders". One line per thing the model
 * needs, by the same rule checkout uses (`houseGaps`), the "Details checked" tick (the stored
 * `provisional` flag, reversed), and what customers will see once it is saved.
 */
export function HouseReadiness({
  product: p,
  onChange,
  categoryShown,
}: {
  product: Product;
  onChange: Dispatch<SetStateAction<Product>>;
  /** The Pet Houses category is shown in the shop (a hidden category hides every model). */
  categoryShown: boolean;
}) {
  const c = useCopy(),
    h = p.house!;
  const readiness = houseReadiness(p, categoryShown),
    missing = new Set(readiness.gaps),
    lead = h.leadTime;
  const items = [
    {
      key: "price",
      done: !missing.has("price"),
      label: c.text("A price for each size", "سعر لكل مقاس"),
      fix:
        h.purchaseMode === "inquiry"
          ? c.text("Choose Fixed price in step 2: Price on request is only discussed on WhatsApp.", "اختر «سعر ثابت» في الخطوة 2: «السعر عند الاستفسار» يُناقش عبر واتساب فقط.")
          : c.text("Enter a price above 0 for every size in step 2.", "أدخل سعراً أكبر من 0 لكل مقاس في الخطوة 2."),
    },
    {
      key: "availability",
      done: !missing.has("availability"),
      label:
        h.availability === "made-to-order"
          ? c.text("Available: Made to order", "التوفر: يُصنع عند الطلب")
          : h.availability === "in-stock"
            ? c.text("Available: In stock", "التوفر: متوفر في المخزون")
            : c.text("Available: In stock or Made to order", "التوفر: متوفر أو يُصنع عند الطلب"),
      fix: c.text("Choose In stock or Made to order in step 3.", "اختر «متوفر» أو «يُصنع عند الطلب» في الخطوة 3."),
    },
    {
      key: "leadTime",
      done: !missing.has("leadTime"),
      label: lead
        ? c.text(`Ready in about ${lead.minDays}–${lead.maxDays} days`, `جاهز خلال ${lead.minDays}–${lead.maxDays} يوماً تقريباً`)
        : c.text("Ready in about … days", "جاهز خلال … يوماً تقريباً"),
      fix: c.text("Add the days in step 3.", "أضف المدة في الخطوة 3."),
    },
    {
      key: "deliveryFee",
      done: !missing.has("deliveryFee"),
      label:
        h.deliveryFee === null
          ? c.text("Delivery charge", "رسوم التوصيل")
          : h.deliveryFee === 0
            ? c.text("Delivery charge: no extra charge", "رسوم التوصيل: بلا رسوم إضافية")
            : c.text(`Delivery charge: ${c.money(h.deliveryFee)} per house`, `رسوم التوصيل: ${c.money(h.deliveryFee)} لكل بيت`),
      fix: c.text("Add it in step 3 (0 = no extra charge).", "أضفها في الخطوة 3 (0 = بلا رسوم إضافية)."),
    },
  ];
  const left = readiness.gaps.length + (readiness.hidden ? 1 : 0);
  const soldOut = h.availability === "in-stock" && p.variants.every((variant) => variant.stock <= 0);
  return (
    <div className="house-readiness">
      <p className={`house-ready-status${readiness.ready ? " is-ready" : ""}`}>
        {readiness.ready
          ? c.text("Ready: customers can order it online once you save.", "جاهز: يمكن للعملاء طلبه عبر الموقع بعد الحفظ.")
          : c.text(`Not ready: ${left} left`, `غير جاهز: ${left} متبقية`)}
      </p>
      <ul className="house-checklist">
        {items.map((item) => (
          <li key={item.key} data-done={item.done}>
            {item.done ? <CheckCircle2 size={17} aria-hidden="true" /> : <Circle size={17} aria-hidden="true" />}
            <span>
              <span className="sr-only">{item.done ? c.text("Done: ", "تم: ") : c.text("Missing: ", "ناقص: ")}</span>
              {item.label}
              {!item.done && <small>{item.fix}</small>}
            </span>
          </li>
        ))}
        <li data-done={!h.provisional}>
          {h.provisional ? <Circle size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
          <label className="house-checked">
            <input
              type="checkbox"
              checked={!h.provisional}
              onChange={(e) =>
                onChange((current) => (current.house ? { ...current, house: { ...current.house, provisional: !e.target.checked } } : current))
              }
            />
            <span>
              {c.text("Details checked", "تمت مراجعة التفاصيل")}
              <small>
                {c.text(
                  "Tick it once the photos, sizes, prices and days are right for this model. Untick it to stop online orders while you check again.",
                  "ضع علامة بعد التأكد من صحة الصور والمقاسات والأسعار والمدة لهذا التصميم. أزلها لإيقاف الطلب عبر الموقع أثناء المراجعة.",
                )}
              </small>
            </span>
          </label>
        </li>
        <li data-done={p.active}>
          {p.active ? <CheckCircle2 size={17} aria-hidden="true" /> : <Circle size={17} aria-hidden="true" />}
          <span>
            <span className="sr-only">{p.active ? c.text("Done: ", "تم: ") : c.text("Missing: ", "ناقص: ")}</span>
            {c.text("Shown in the shop", "ظاهر في المتجر")}
            {!p.active && <small>{c.text("Set Store visibility to Active below.", "اجعل «الظهور في المتجر» نشطاً أدناه.")}</small>}
          </span>
        </li>
        {!categoryShown && (
          <li data-done={false}>
            <Circle size={17} aria-hidden="true" />
            <span>
              <span className="sr-only">{c.text("Missing: ", "ناقص: ")}</span>
              {c.text("The Pet Houses category is shown", "فئة بيوت الحيوانات ظاهرة")}
              <small>{c.text("It is hidden: show it under Catalogue → Categories.", "إنها مخفية: أظهرها من الكتالوج ← الفئات.")}</small>
            </span>
          </li>
        )}
      </ul>
      <div className="note-box house-preview">
        <strong>{c.text("Customers will see", "سيرى العملاء")}</strong>
        {readiness.ready && lead ? (
          <ul>
            <li>
              {soldOut
                ? c.text("Out of stock at the moment (add stock with Adjust stock).", "غير متوفر حالياً (أضف مخزوناً عبر «تعديل المخزون»).")
                : h.availability === "made-to-order"
                  ? c.text(`Made to order: ready in about ${lead.minDays}–${lead.maxDays} days`, `يُصنع عند الطلب: جاهز خلال ${lead.minDays}–${lead.maxDays} يوماً تقريباً`)
                  : c.text(`In stock: ready in about ${lead.minDays}–${lead.maxDays} days`, `متوفر: جاهز خلال ${lead.minDays}–${lead.maxDays} يوماً تقريباً`)}
            </li>
            {!soldOut && (
              <li>
                {c.text("Earliest delivery if ordered today: ", "أقرب توصيل إن طُلب اليوم: ")}
                {formatQatarDay(earliestHouseDay(lead.maxDays), c.locale)}
              </li>
            )}
            <li>
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
            </li>
            {!soldOut && <li>{c.text("and the Add to cart button.", "وزر «أضف للسلة».")}</li>}
          </ul>
        ) : (
          <p>
            {h.purchaseMode === "inquiry"
              ? c.text(
                  "“Price on request” and “Ask for a price on WhatsApp”, with no Add to cart.",
                  "«السعر عند الاستفسار» و«استفسر عن السعر عبر واتساب»، بدون «أضف للسلة».",
                )
              : c.text(
                  "The model's page with “Ask about it on WhatsApp” instead of Add to cart, until every line above is ticked.",
                  "صفحة التصميم مع «استفسر عنه عبر واتساب» بدلاً من «أضف للسلة»، حتى تكتمل كل البنود أعلاه.",
                )}
          </p>
        )}
      </div>
    </div>
  );
}
