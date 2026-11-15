"use client";
import { useState } from "react";
import type { Promotion, PromotionDraft } from "@/mocks/data/promotions";
import { mockPromotionsRepository } from "@/mocks/adapters/promotions-repository";
import { useBusiness } from "@/mocks/MockDataProvider";
import { assets } from "@/mocks/data/assets";
import { Field } from "@/shared/ui/BusinessUI";
import { useCopy } from "@/shared/lib/copy";
import { promotionTargets, promotionTypes } from "./promotion-view";
import { NumberInput } from "@/shared/ui/NumberInput";

export function PromotionEditor({
  promotion,
  date,
  saved,
}: {
  promotion: Promotion | null;
  date: string;
  saved: (promotion: Promotion) => void;
}) {
  const c = useCopy(),
    business = useBusiness();
  const [draft, setDraft] = useState<PromotionDraft>(() =>
    promotion
      ? { ...promotion }
      : {
          name: { en: "", ar: "" },
          description: { en: "", ar: "" },
          type: "discount",
          target: "products",
          offer: "percent",
          value: 10,
          code: "",
          from: date,
          to: "",
          minimumSpend: 0,
          eligibility: "all",
          limit: 0,
          perCustomer: 0,
          productIds: [],
          image: assets.catFood,
          enabled: true,
          visible: true,
          featured: false,
        },
  );
  const [error, setError] = useState("");
  const errors: Record<string, string> = {
    name: c.text(
      "Enter both names, up to 100 characters each.",
      "أدخل الاسمين، بحد أقصى 100 حرف لكل اسم.",
    ),
    dates: c.text(
      "Enter a valid start date and an end date on or after it.",
      "أدخل تاريخ بداية صالحاً وتاريخ نهاية لا يسبقه.",
    ),
    offer: c.text(
      "Enter a positive offer. Percentage cannot exceed 100%.",
      "أدخل قيمة موجبة. لا يمكن أن تتجاوز النسبة 100٪.",
    ),
    code: c.text(
      "Use a unique code of 3–32 letters, numbers, hyphens or underscores.",
      "استخدم رمزاً فريداً من 3–32 حرفاً لاتينياً أو رقماً أو شرطة.",
    ),
    limits: c.text(
      "Use non-negative whole limits. Total limit cannot be below existing redemptions.",
      "استخدم حدوداً صحيحة غير سالبة. لا يقل الحد الإجمالي عن الاستخدامات المسجلة.",
    ),
    products: c.text(
      "Choose at least one selected product, or two products for a bundle.",
      "اختر منتجاً واحداً على الأقل، أو منتجين للمجموعة.",
    ),
    missing: c.text(
      "This promotion no longer exists. Close and reopen the editor.",
      "لم يعد هذا العرض موجوداً. أغلق المحرر وأعد فتحه.",
    ),
  };
  function field<K extends keyof PromotionDraft>(
    key: K,
    value: PromotionDraft[K],
  ) {
    setDraft((old) => ({ ...old, [key]: value }));
    setError("");
  }
  const images = [
    ...new Map(
      [...business.products, ...business.packages].map((p) => [
        p.image,
        c.local(p.name),
      ]),
    ).entries(),
  ];
  return (
    <form
      className="promo-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const result = mockPromotionsRepository.save(draft, promotion?.id);
        if (result.error) setError(errors[result.error]);
        else saved(result.promotion);
      }}
    >
      <div className="promo-form-grid">
        <Field label={c.text("Name (English)", "الاسم (الإنجليزية)")}>
          <input
            required
            maxLength={100}
            value={draft.name.en}
            onChange={(e) =>
              field("name", { ...draft.name, en: e.target.value })
            }
          />
        </Field>
        <Field label={c.text("Name (Arabic)", "الاسم (العربية)")}>
          <input
            required
            maxLength={100}
            dir="rtl"
            value={draft.name.ar}
            onChange={(e) =>
              field("name", { ...draft.name, ar: e.target.value })
            }
          />
        </Field>
        <Field label={c.text("Promotion type", "نوع العرض")}>
          <select
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as Promotion["type"];
              setDraft((old) => ({
                ...old,
                type,
                offer:
                  type === "bundle"
                    ? "bundle"
                    : old.offer === "bundle"
                      ? "percent"
                      : old.offer,
                value: type === "bundle" ? 10000 : 10,
              }));
            }}
          >
            {Object.entries(promotionTypes[c.locale]).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Applies to", "ينطبق على")}>
          <select
            value={draft.target}
            onChange={(e) =>
              field("target", e.target.value as Promotion["target"])
            }
          >
            {Object.entries(promotionTargets[c.locale]).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        {draft.type === "code" && (
          <Field label={c.text("Promotion code", "الرمز الترويجي")}>
            <input
              required
              maxLength={32}
              value={draft.code}
              onChange={(e) => field("code", e.target.value)}
            />
          </Field>
        )}
        {draft.type !== "bundle" && (
          <Field label={c.text("Offer format", "صيغة العرض")}>
            <select
              value={draft.offer}
              onChange={(e) => {
                const offer = e.target.value as Promotion["offer"];
                setDraft((old) => ({
                  ...old,
                  offer,
                  value: offer === "percent" ? 10 : 2000,
                }));
                setError("");
              }}
            >
              <option value="percent">
                {c.text("Percentage off", "خصم بنسبة")}
              </option>
              <option value="fixed">
                {c.text("Amount off (QAR)", "خصم مبلغ (ر.ق)")}
              </option>
            </select>
          </Field>
        )}
        <Field
          label={
            draft.offer === "percent"
              ? c.text("Discount (%)", "الخصم (%)")
              : draft.type === "bundle"
                ? c.text("Bundle price (QAR)", "سعر المجموعة (ر.ق)")
                : c.text("Discount (QAR)", "الخصم (ر.ق)")
          }
        >
          <NumberInput
            kind="decimal"
            required
            min={0.01}
            max={draft.offer === "percent" ? 100 : undefined}
            value={draft.offer === "percent" ? draft.value : draft.value / 100}
            onChange={(e) =>
              field(
                "value",
                draft.offer === "percent"
                  ? Number(e.target.value)
                  : Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </Field>
        <Field
          label={c.text("Minimum spend (QAR)", "الحد الأدنى للإنفاق (ر.ق)")}
        >
          <NumberInput
            kind="decimal"
            min={0}
            value={draft.minimumSpend / 100}
            onChange={(e) =>
              field("minimumSpend", Math.round(Number(e.target.value) * 100))
            }
          />
        </Field>
        <Field label={c.text("Valid from (Qatar)", "صالح من (قطر)")}>
          <input
            type="date"
            required
            value={draft.from}
            onChange={(e) => field("from", e.target.value)}
          />
        </Field>
        <Field label={c.text("Valid until (optional)", "صالح حتى (اختياري)")}>
          <input
            type="date"
            min={draft.from}
            value={draft.to}
            onChange={(e) => field("to", e.target.value)}
          />
        </Field>
        <Field label={c.text("Customer eligibility", "أهلية العميل")}>
          <select
            value={draft.eligibility}
            onChange={(e) =>
              field("eligibility", e.target.value as Promotion["eligibility"])
            }
          >
            <option value="all">
              {c.text("All customers", "جميع العملاء")}
            </option>
            <option value="registered">
              {c.text("Registered customers", "العملاء المسجلون")}
            </option>
            <option value="new">
              {c.text("New customers", "العملاء الجدد")}
            </option>
          </select>
        </Field>
        <Field
          label={c.text(
            "Total usage limit (0 = unlimited)",
            "حد الاستخدام الإجمالي (0 = بلا حد)",
          )}
        >
          <NumberInput
            min={0}
            value={draft.limit}
            onChange={(e) => field("limit", Number(e.target.value))}
          />
        </Field>
        <Field
          label={c.text(
            "Per-customer limit (0 = unlimited)",
            "حد الاستخدام لكل عميل (0 = بلا حد)",
          )}
        >
          <NumberInput
            min={0}
            value={draft.perCustomer}
            onChange={(e) => field("perCustomer", Number(e.target.value))}
          />
        </Field>
        <Field label={c.text("Promotion image", "صورة العرض")}>
          <select
            value={draft.image}
            onChange={(e) => field("image", e.target.value)}
          >
            <option value={draft.image}>
              {c.text("Current image", "الصورة الحالية")}
            </option>
            {images
              .filter(([src]) => src !== draft.image)
              .map(([src, name]) => (
                <option value={src} key={src}>
                  {name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {(draft.target === "selected-products" || draft.type === "bundle") && (
        <fieldset className="promo-product-picker">
          <legend>{c.text("Included products", "المنتجات المشمولة")}</legend>
          {business.products
            .filter((p) => p.active)
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={draft.productIds.includes(p.id)}
                  onChange={(e) =>
                    field(
                      "productIds",
                      e.target.checked
                        ? [...draft.productIds, p.id]
                        : draft.productIds.filter((id) => id !== p.id),
                    )
                  }
                />
                {c.local(p.name)}
              </label>
            ))}
        </fieldset>
      )}
      <div className="promo-form-grid">
        <Field label={c.text("Description (English)", "الوصف (الإنجليزية)")}>
          <textarea
            maxLength={1000}
            value={draft.description.en}
            onChange={(e) =>
              field("description", { ...draft.description, en: e.target.value })
            }
          />
        </Field>
        <Field label={c.text("Description (Arabic)", "الوصف (العربية)")}>
          <textarea
            dir="rtl"
            maxLength={1000}
            value={draft.description.ar}
            onChange={(e) =>
              field("description", { ...draft.description, ar: e.target.value })
            }
          />
        </Field>
      </div>
      <p className="promo-note">
        {c.text(
          "Prototype rules only. Saving does not change checkout prices or send campaigns.",
          "قواعد نموذج أولي فقط. الحفظ لا يغير أسعار الدفع ولا يرسل حملات.",
        )}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="button button--primary">
        {c.text("Save Promotion", "حفظ العرض")}
      </button>
    </form>
  );
}
