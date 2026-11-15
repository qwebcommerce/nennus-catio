"use client";

import {
  type AdminPromotion,
  PROMOTION_LIMITS,
  type PromotionEligibility,
  type PromotionOffer,
  type PromotionOptions,
  type PromotionTargetKind,
  type PromotionType,
  type SavePromotionRequest,
  savePromotionRequestSchema,
} from "@nennus-catio/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { describeAdminPromotionError, promotionFieldErrors, uploadPromotionImage, usePromotionOptions, useSavePromotion } from "@/shared/api/admin-promotions";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { PROMOTION_ELIGIBILITY, PROMOTION_TARGETS, PROMOTION_TYPES, promotionMoney } from "../lib/promotion-labels";
import { NumberInput } from "@/shared/ui/NumberInput";

/** What the form holds: numbers as typed, so a half-typed amount is never lost. */
interface Draft {
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  type: PromotionType;
  offer: PromotionOffer;
  percent: string;
  amount: string;
  buy: string;
  get: string;
  getPercent: string;
  targetKind: PromotionTargetKind;
  targetIds: string[];
  bundleItems: { variantId: string; quantity: string }[];
  code: string;
  minSpend: string;
  eligibility: PromotionEligibility;
  usageLimit: string;
  perCustomerLimit: string;
  startsOn: string;
  endsOn: string;
  enabled: boolean;
  visible: boolean;
  featured: boolean;
  image: string | null;
}

const qar = (minor: number) => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));

function draftOf(promotion: AdminPromotion | null, today: string): Draft {
  if (!promotion) {
    return {
      name: { en: "", ar: "" },
      description: { en: "", ar: "" },
      type: "discount",
      offer: "percent",
      percent: "10",
      amount: "",
      buy: "1",
      get: "1",
      getPercent: "100",
      targetKind: "all_products",
      targetIds: [],
      bundleItems: [
        { variantId: "", quantity: "1" },
        { variantId: "", quantity: "1" },
      ],
      code: "",
      minSpend: "0",
      eligibility: "all",
      usageLimit: "0",
      perCustomerLimit: "0",
      startsOn: today,
      endsOn: "",
      enabled: true,
      visible: true,
      featured: false,
      image: null,
    };
  }
  return {
    name: promotion.name,
    description: promotion.description,
    type: promotion.type,
    offer: promotion.offer,
    percent: promotion.offer === "percent" ? String(promotion.value) : "10",
    amount: promotion.offer === "fixed" || promotion.offer === "bundle_price" ? qar(promotion.value) : "",
    buy: String(promotion.buyGet?.buy ?? 1),
    get: String(promotion.buyGet?.get ?? 1),
    getPercent: String(promotion.buyGet?.percent ?? 100),
    targetKind: promotion.targetKind,
    targetIds: promotion.targets.map((target) => target.id),
    // A pack deleted since cannot be saved again: staff choose another (the warning says so).
    bundleItems: promotion.bundleItems.flatMap((item) => (item.variantId ? [{ variantId: item.variantId, quantity: String(item.quantity) }] : [])),
    code: promotion.code ?? "",
    minSpend: qar(promotion.minSpend),
    eligibility: promotion.eligibility,
    usageLimit: String(promotion.usageLimit),
    perCustomerLimit: String(promotion.perCustomerLimit),
    startsOn: promotion.startsOn,
    endsOn: promotion.endsOn ?? "",
    enabled: promotion.enabled,
    visible: promotion.visible,
    featured: promotion.featured,
    image: promotion.image,
  };
}

/** The target kinds a type and offer allow (D202; the API refuses the rest). */
function targetKinds(type: PromotionType, offer: PromotionOffer): PromotionTargetKind[] {
  if (type === "bundle") return ["bundle"];
  if (offer === "buy_get") return ["all_products", "categories", "products"];
  return ["all_products", "categories", "products", "order", "all_grooming", "grooming_packages"];
}

/** The offers a type allows. */
function offersFor(type: PromotionType): PromotionOffer[] {
  if (type === "bundle") return ["bundle_price"];
  if (type === "code") return ["percent", "fixed"];
  return ["percent", "fixed", "buy_get"];
}

/** Dirhams from what was typed in QAR, or NaN. */
function minorOf(typed: string): number {
  const trimmed = typed.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}
const wholeOf = (typed: string) => (/^\d+$/.test(typed.trim()) ? Number(typed.trim()) : Number.NaN);

/**
 * Create or edit a promotion (11d; plan BRANCH_11 section 6, 11d): every type the API accepts, the real
 * categories, products, packs and grooming packages to choose from, an image upload, and each refusal
 * next to its field. Saving an edit sends the version the editor started from (a change by someone else
 * in between is refused, D203). A normal Save does not ask again (D128).
 */
export function PromotionApiEditor({
  promotion,
  today,
  onSaved,
  onCancel,
}: {
  promotion: AdminPromotion | null;
  today: string;
  onSaved: (promotion: AdminPromotion) => void;
  onCancel: () => void;
}) {
  const c = useCopy();
  const options = usePromotionOptions();
  const save = useSavePromotion();
  // The promotion as it was when the editor opened: its version guards the save.
  const [initial] = useState(promotion);
  const [draft, setDraft] = useState<Draft>(() => draftOf(promotion, today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [suggested, setSuggested] = useState(false);
  const droppedPacks = (promotion?.bundleItems ?? []).filter((item) => !item.variantId).length;

  function set(values: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...values }));
    setMessage("");
  }

  function chooseType(type: PromotionType) {
    const offer = offersFor(type).includes(draft.offer) ? draft.offer : (offersFor(type)[0] ?? "percent");
    const kinds = targetKinds(type, offer);
    const targetKind = kinds.includes(draft.targetKind) ? draft.targetKind : (kinds[0] ?? "all_products");
    set({ type, offer, targetKind, targetIds: targetKind === draft.targetKind ? draft.targetIds : [] });
  }

  function chooseOffer(offer: PromotionOffer) {
    const kinds = targetKinds(draft.type, offer);
    const targetKind = kinds.includes(draft.targetKind) ? draft.targetKind : (kinds[0] ?? "all_products");
    set({ offer, targetKind, targetIds: targetKind === draft.targetKind ? draft.targetIds : [] });
  }

  function chooseEligibility(eligibility: PromotionEligibility) {
    // An offer for new customers is best limited to once each, or two unpaid first orders could both get it (D205).
    const suggest = eligibility === "new" && draft.perCustomerLimit.trim() === "0";
    set({ eligibility, ...(suggest ? { perCustomerLimit: "1" } : {}) });
    setSuggested(suggest);
  }

  function toggle(id: string, checked: boolean) {
    set({ targetIds: checked ? [...draft.targetIds, id] : draft.targetIds.filter((value) => value !== id) });
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErrors((current) => ({ ...current, image: "" }));
    try {
      set({ image: await uploadPromotionImage(file) });
    } catch (error) {
      setErrors((current) => ({ ...current, image: error instanceof ApiError ? error.message : c.text("The image could not be uploaded.", "تعذّر رفع الصورة.") }));
    } finally {
      setUploading(false);
    }
  }

  /** The request, or the problems to fix first. */
  function request(): { body: SavePromotionRequest } | { problems: Record<string, string> } {
    const problems: Record<string, string> = {};
    const amountProblem = c.text("Enter an amount in QAR, for example 20 or 42.50.", "أدخل مبلغاً بالريال، مثلاً 20 أو 42.50.");
    const countProblem = c.text("Enter a whole number, 0 for no limit.", "أدخل عدداً صحيحاً، 0 لعدم التحديد.");
    let value = 0;
    if (draft.offer === "percent") value = wholeOf(draft.percent);
    else if (draft.offer === "fixed" || draft.offer === "bundle_price") value = minorOf(draft.amount);
    if (Number.isNaN(value)) problems.value = draft.offer === "percent" ? c.text("Use a whole percentage from 1 to 100.", "استخدم نسبة صحيحة من 1 إلى 100.") : amountProblem;
    const minSpend = minorOf(draft.minSpend || "0");
    if (Number.isNaN(minSpend)) problems.minSpend = amountProblem;
    const usageLimit = wholeOf(draft.usageLimit || "0");
    if (Number.isNaN(usageLimit)) problems.usageLimit = countProblem;
    const perCustomerLimit = wholeOf(draft.perCustomerLimit || "0");
    if (Number.isNaN(perCustomerLimit)) problems.perCustomerLimit = countProblem;
    const buyGet =
      draft.offer === "buy_get" ? { buy: wholeOf(draft.buy), get: wholeOf(draft.get), percent: wholeOf(draft.getPercent) } : null;
    if (buyGet && Object.values(buyGet).some(Number.isNaN)) problems.buyGet = c.text("Enter whole numbers.", "أدخل أعداداً صحيحة.");
    const bundleItems =
      draft.type === "bundle"
        ? draft.bundleItems.map((item) => ({ variantId: item.variantId, quantity: wholeOf(item.quantity) }))
        : [];
    if (bundleItems.some((item) => !item.variantId)) problems.bundleItems = c.text("Choose a pack in every row, or remove the row.", "اختر عبوة في كل صف، أو احذف الصف.");
    else if (bundleItems.some((item) => Number.isNaN(item.quantity))) problems.bundleItems = c.text("Enter a whole quantity in every row.", "أدخل كمية صحيحة في كل صف.");
    if (Object.keys(problems).length > 0) return { problems };
    const parsed = savePromotionRequestSchema.safeParse({
      name: draft.name,
      description: draft.description,
      type: draft.type,
      offer: draft.offer,
      value,
      buyGet,
      targetKind: draft.targetKind,
      targetIds: ["categories", "products", "grooming_packages"].includes(draft.targetKind) ? draft.targetIds : [],
      bundleItems,
      code: draft.type === "code" ? draft.code : null,
      minSpend,
      eligibility: draft.eligibility,
      usageLimit,
      perCustomerLimit,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn || null,
      enabled: draft.enabled,
      visible: draft.visible,
      featured: draft.featured,
      image: draft.image,
    });
    if (!parsed.success) {
      return { problems: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.map(String).join("."), issue.message])) };
    }
    return { body: parsed.data };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || uploading) return;
    const result = request();
    if ("problems" in result) {
      setErrors(result.problems);
      setMessage(c.text("Please check the highlighted fields.", "يرجى مراجعة الحقول المحددة."));
      return;
    }
    setErrors({});
    try {
      const saved = await save.mutateAsync({ promotion: initial, body: result.body });
      onSaved(saved.promotion);
    } catch (error) {
      setErrors(promotionFieldErrors(error));
      setMessage(
        error instanceof ApiError && error.code === "CONFLICT" && initial
          ? c.text(
              "Someone else changed this promotion while you were editing. Close the editor and open it again to see their changes.",
              "غيّر شخص آخر هذا العرض أثناء تعديلك. أغلق المحرر وافتحه مجدداً لرؤية التغييرات.",
            )
          : describeAdminPromotionError(error, c.text),
      );
    }
  }

  /** The problem for a field (or any part of it, for example "name.en" under "name"). */
  const problem = (...paths: string[]) => {
    const found = Object.entries(errors).find(([path, text]) => text && paths.some((wanted) => path === wanted || path.startsWith(`${wanted}.`)));
    return found ? (
      <p className="form-error" role="alert">
        {found[1]}
      </p>
    ) : null;
  };

  const data: PromotionOptions | undefined = options.data;
  const kinds = targetKinds(draft.type, draft.offer);
  const hidden = c.text(" (hidden)", " (مخفي)");
  const packs = (data?.products ?? []).flatMap((product) =>
    product.packs.map((pack) => ({
      id: pack.id,
      price: pack.price,
      label: `${c.local(product.name)} · ${c.local(pack.label)} · ${promotionMoney(pack.price, c.locale)}${product.active && pack.active ? "" : hidden}`,
    })),
  );
  const setTotal = draft.bundleItems.reduce((sum, item) => sum + (packs.find((pack) => pack.id === item.variantId)?.price ?? 0) * (wholeOf(item.quantity) || 0), 0);
  const categoryName = (id: string) => c.local(data?.categories.find((category) => category.id === id)?.name ?? { en: "", ar: "" });
  const filter = productFilter.trim().toLowerCase();

  return (
    <form className="promo-editor" onSubmit={(event) => void submit(event)} noValidate>
      <div className="promo-form-grid">
        <Field label={c.text("Name (English)", "الاسم (الإنجليزية)")}>
          <input value={draft.name.en} maxLength={PROMOTION_LIMITS.maxNameLength} onChange={(e) => set({ name: { ...draft.name, en: e.target.value } })} />
        </Field>
        <Field label={c.text("Name (Arabic)", "الاسم (العربية)")}>
          <input dir="rtl" value={draft.name.ar} maxLength={PROMOTION_LIMITS.maxNameLength} onChange={(e) => set({ name: { ...draft.name, ar: e.target.value } })} />
        </Field>
      </div>
      {problem("name")}
      <div className="promo-form-grid">
        <Field label={c.text("Promotion type", "نوع العرض")}>
          <select value={draft.type} onChange={(e) => chooseType(e.target.value as PromotionType)}>
            {(Object.keys(PROMOTION_TYPES) as PromotionType[]).map((type) => (
              <option key={type} value={type}>
                {c.local(PROMOTION_TYPES[type])}
              </option>
            ))}
          </select>
        </Field>
        {draft.type === "code" && (
          <Field label={c.text("Promo code", "الرمز الترويجي")}>
            <input value={draft.code} maxLength={32} autoCapitalize="characters" onChange={(e) => set({ code: e.target.value })} />
          </Field>
        )}
        {draft.type !== "bundle" && (
          <Field label={c.text("Offer", "العرض")}>
            <select value={draft.offer} onChange={(e) => chooseOffer(e.target.value as PromotionOffer)}>
              {offersFor(draft.type).map((offer) => (
                <option key={offer} value={offer}>
                  {offer === "percent"
                    ? c.text("Percentage off", "خصم بنسبة")
                    : offer === "fixed"
                      ? c.text("Amount off each item (QAR)", "خصم مبلغ عن كل عنصر (ر.ق)")
                      : c.text("Buy some, get some off", "اشترِ واحصل على خصم")}
                </option>
              ))}
            </select>
          </Field>
        )}
        {draft.offer === "percent" && (
          <Field label={c.text("Discount (%)", "الخصم (%)")}>
            <NumberInput value={draft.percent} onChange={(e) => set({ percent: e.target.value })} />
          </Field>
        )}
        {(draft.offer === "fixed" || draft.offer === "bundle_price") && (
          <Field label={draft.offer === "bundle_price" ? c.text("Price of one set (QAR)", "سعر المجموعة الواحدة (ر.ق)") : c.text("Amount off (QAR)", "مبلغ الخصم (ر.ق)")}>
            <NumberInput kind="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
        )}
      </div>
      {problem("code")}
      {problem("offer", "value")}
      {draft.offer === "fixed" && draft.targetKind === "order" && (
        <p className="small muted">{c.text("On the entire order, the amount comes off the order once.", "على الطلب بالكامل، يُخصم المبلغ مرة واحدة من الطلب.")}</p>
      )}
      {draft.offer === "buy_get" && (
        <>
          <div className="promo-form-grid promo-form-grid--three">
            <Field label={c.text("Customer buys", "يشتري العميل")}>
              <NumberInput value={draft.buy} onChange={(e) => set({ buy: e.target.value })} />
            </Field>
            <Field label={c.text("And gets", "ويحصل على")}>
              <NumberInput value={draft.get} onChange={(e) => set({ get: e.target.value })} />
            </Field>
            <Field label={c.text("At this % off (100 = free)", "بهذه النسبة من الخصم (100 = مجاناً)")}>
              <NumberInput value={draft.getPercent} onChange={(e) => set({ getPercent: e.target.value })} />
            </Field>
          </div>
          <p className="small muted">{c.text("The cheapest items in each group get the discount.", "تحصل أرخص العناصر في كل مجموعة على الخصم.")}</p>
          {problem("buyGet")}
        </>
      )}

      {draft.type !== "bundle" && (
        <div className="promo-form-grid">
          <Field label={c.text("Applies to", "ينطبق على")}>
            <select value={draft.targetKind} onChange={(e) => set({ targetKind: e.target.value as PromotionTargetKind, targetIds: [] })}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {c.local(PROMOTION_TARGETS[kind])}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {problem("targetKind")}
      {options.isError && (
        <div className="inline-state" role="alert">
          <p>{describeAdminPromotionError(options.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void options.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {["categories", "products", "grooming_packages"].includes(draft.targetKind) && (
        <fieldset className="promo-product-picker">
          <legend>
            {draft.targetKind === "categories"
              ? c.text("Categories", "الفئات")
              : draft.targetKind === "products"
                ? c.text("Products", "المنتجات")
                : c.text("Grooming packages", "باقات العناية")}
          </legend>
          {options.isPending && <p className="muted">{c.text("Loading choices…", "جارٍ تحميل الخيارات…")}</p>}
          {draft.targetKind === "products" && (
            <input
              className="promo-picker-filter"
              aria-label={c.text("Find a product", "ابحث عن منتج")}
              placeholder={c.text("Find a product…", "ابحث عن منتج…")}
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            />
          )}
          {draft.targetKind === "categories" &&
            (data?.categories ?? []).map((category) => (
              <label key={category.id}>
                <input type="checkbox" checked={draft.targetIds.includes(category.id)} onChange={(e) => toggle(category.id, e.target.checked)} />
                {c.local(category.name)}
                {category.active ? "" : hidden}
              </label>
            ))}
          {draft.targetKind === "products" &&
            (data?.products ?? [])
              .filter((product) => draft.targetIds.includes(product.id) || !filter || `${product.name.en} ${product.name.ar}`.toLowerCase().includes(filter))
              .map((product) => (
                <label key={product.id}>
                  <input type="checkbox" checked={draft.targetIds.includes(product.id)} onChange={(e) => toggle(product.id, e.target.checked)} />
                  {c.local(product.name)}
                  <small>
                    {categoryName(product.categoryId)}
                    {product.active ? "" : hidden}
                  </small>
                </label>
              ))}
          {draft.targetKind === "grooming_packages" &&
            (data?.groomingPackages ?? []).map((item) => (
              <label key={item.id}>
                <input type="checkbox" checked={draft.targetIds.includes(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} />
                {`${c.local(item.group)} · ${c.local(item.name)}`}
                <small>
                  {promotionMoney(item.price, c.locale)}
                  {item.active ? "" : hidden}
                </small>
              </label>
            ))}
        </fieldset>
      )}
      {problem("targetIds")}

      {draft.type === "bundle" && (
        <fieldset className="promo-bundle-items">
          <legend>{c.text("Items in one set", "عناصر المجموعة الواحدة")}</legend>
          {droppedPacks > 0 && (
            <p className="form-error" role="alert">
              {c.text(
                `${droppedPacks} pack(s) in this bundle were deleted from the catalogue. Choose replacements before saving.`,
                `حُذفت ${droppedPacks} عبوة من هذه المجموعة من الكتالوج. اختر بدائل قبل الحفظ.`,
              )}
            </p>
          )}
          {draft.bundleItems.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved; the index is their identity here.
            <div className="promo-bundle-row" key={index}>
              <select
                aria-label={c.text(`Pack ${index + 1}`, `العبوة ${index + 1}`)}
                value={item.variantId}
                onChange={(e) => set({ bundleItems: draft.bundleItems.map((row, at) => (at === index ? { ...row, variantId: e.target.value } : row)) })}
              >
                <option value="">{c.text("Choose a pack", "اختر عبوة")}</option>
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.label}
                  </option>
                ))}
              </select>
              <NumberInput
                aria-label={c.text(`Quantity of pack ${index + 1}`, `كمية العبوة ${index + 1}`)}
                value={item.quantity}
                onChange={(e) => set({ bundleItems: draft.bundleItems.map((row, at) => (at === index ? { ...row, quantity: e.target.value } : row)) })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={c.text(`Remove pack ${index + 1}`, `احذف العبوة ${index + 1}`)}
                onClick={() => set({ bundleItems: draft.bundleItems.filter((_, at) => at !== index) })}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {draft.bundleItems.length < PROMOTION_LIMITS.maxBundleItems && (
            <button type="button" className="text-button" onClick={() => set({ bundleItems: [...draft.bundleItems, { variantId: "", quantity: "1" }] })}>
              <Plus size={14} aria-hidden="true" />
              {c.text("Add a pack", "أضف عبوة")}
            </button>
          )}
          {setTotal > 0 && (
            <p className="small muted">
              {c.text(
                `These items cost ${promotionMoney(setTotal, c.locale)} today; the set price must be lower.`,
                `تكلف هذه العناصر ${promotionMoney(setTotal, c.locale)} اليوم؛ يجب أن يكون سعر المجموعة أقل.`,
              )}
            </p>
          )}
        </fieldset>
      )}
      {problem("bundleItems")}

      <div className="promo-form-grid">
        <Field label={c.text("Minimum spend (QAR, 0 = none)", "الحد الأدنى للإنفاق (ر.ق، 0 = بلا حد)")}>
          <NumberInput kind="decimal" value={draft.minSpend} onChange={(e) => set({ minSpend: e.target.value })} />
        </Field>
        <Field label={c.text("Who can use it", "من يمكنه استخدامه")}>
          <select value={draft.eligibility} onChange={(e) => chooseEligibility(e.target.value as PromotionEligibility)}>
            {(Object.keys(PROMOTION_ELIGIBILITY) as PromotionEligibility[]).map((value) => (
              <option key={value} value={value}>
                {c.local(PROMOTION_ELIGIBILITY[value])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Total uses (0 = no limit)", "إجمالي الاستخدامات (0 = بلا حد)")}>
          <NumberInput value={draft.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} />
        </Field>
        <Field label={c.text("Uses per customer (0 = no limit)", "الاستخدامات لكل عميل (0 = بلا حد)")}>
          <NumberInput value={draft.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} />
        </Field>
      </div>
      {problem("minSpend")}
      {problem("usageLimit")}
      {problem("perCustomerLimit")}
      {suggested && draft.perCustomerLimit === "1" && (
        <p className="small muted" role="status">
          {c.text(
            "Set to once per customer: an offer for new customers is meant for a first order or booking.",
            "حُدد بمرة واحدة لكل عميل: عرض العملاء الجدد مخصص للطلب أو الحجز الأول.",
          )}
        </p>
      )}
      <div className="promo-form-grid">
        <Field label={c.text("From (Qatar date)", "من (تاريخ قطر)")}>
          <input type="date" value={draft.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
        </Field>
        <Field label={c.text("Until (optional, inclusive)", "حتى (اختياري، شامل)")}>
          <input type="date" min={draft.startsOn} value={draft.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
        </Field>
      </div>
      {problem("startsOn", "endsOn")}
      <div className="promo-editor-switches">
        <label className="promo-toggle">
          <input type="checkbox" role="switch" aria-checked={draft.enabled} checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span>{c.text("Switched on", "مفعّل")}</span>
        </label>
        {draft.type !== "code" && (
          <label className="promo-toggle">
            <input type="checkbox" role="switch" aria-checked={draft.visible} checked={draft.visible} onChange={(e) => set({ visible: e.target.checked })} />
            <span>{c.text("Visible on store", "ظاهر في المتجر")}</span>
          </label>
        )}
        <label className="promo-toggle">
          <input type="checkbox" role="switch" aria-checked={draft.featured} checked={draft.featured} onChange={(e) => set({ featured: e.target.checked })} />
          <span>{c.text("Feature on homepage", "عرض في الصفحة الرئيسية")}</span>
        </label>
      </div>
      <div className="promo-editor-image">
        {draft.image && <Photo src={draft.image} alt="" sizes="96px" />}
        <Field label={draft.image ? c.text("Replace the image", "استبدل الصورة") : c.text("Image (optional)", "صورة (اختياري)")}>
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(e) => void chooseImage(e.target.files?.[0])} />
        </Field>
        {draft.image && (
          <button type="button" className="text-button" onClick={() => set({ image: null })}>
            {c.text("Remove the image", "أزل الصورة")}
          </button>
        )}
        {uploading && <span className="muted">{c.text("Uploading…", "جارٍ الرفع…")}</span>}
      </div>
      {problem("image")}
      <div className="promo-form-grid">
        <Field label={c.text("Description (English)", "الوصف (الإنجليزية)")}>
          <textarea maxLength={PROMOTION_LIMITS.maxDescriptionLength} value={draft.description.en} onChange={(e) => set({ description: { ...draft.description, en: e.target.value } })} />
        </Field>
        <Field label={c.text("Description (Arabic)", "الوصف (العربية)")}>
          <textarea dir="rtl" maxLength={PROMOTION_LIMITS.maxDescriptionLength} value={draft.description.ar} onChange={(e) => set({ description: { ...draft.description, ar: e.target.value } })} />
        </Field>
      </div>
      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
      <div className="row confirm-actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={save.isPending}>
          {c.text("Cancel", "إلغاء")}
        </button>
        <button type="submit" className="button button--primary" disabled={save.isPending || uploading}>
          {save.isPending ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save promotion", "حفظ العرض")}
        </button>
      </div>
    </form>
  );
}
