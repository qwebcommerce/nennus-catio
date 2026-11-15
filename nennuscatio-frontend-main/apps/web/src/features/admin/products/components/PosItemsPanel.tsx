"use client";

import { ADMIN_POS_ITEM_PAGE_SIZES, type AdminPosItem, type AdminPosItemView } from "@nennus-catio/contracts";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { assets } from "@/mocks/data/assets";
import { bi, type Product, type Variant } from "@/mocks/data/business";
import {
  adminPosItemSearch,
  emptyAdminPosItemFilters,
  useAdminPosItems,
  useLinkPosItem,
  useSetPosItemSoldOnline,
  useSettlePosPrice,
} from "@/shared/api/admin-pos";
import { errorMessage } from "@/shared/api/sessions";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { formatStaffDateTime, isolate } from "@/shared/lib/format";
import { Empty, Field, Modal } from "@/shared/ui/BusinessUI";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";

/** A new pack from a POS code: its SKU, count, price and on/off as the POS sent them (they follow the POS once saved). */
export function packFromPos(item: AdminPosItem): Variant {
  return {
    id: crypto.randomUUID(),
    label: bi("", ""),
    sku: item.code,
    price: item.price,
    stock: item.stock,
    unit: "piece",
    active: item.active,
    fromPos: { code: item.code, price: item.price },
  };
}

/** A new product from a POS code, for the editor: staff add the Arabic, photos, category, pet type and pack weight. */
export function productFromPos(item: AdminPosItem, category: string): Product {
  return {
    id: crypto.randomUUID(),
    name: bi(item.name.trim() || item.code, ""),
    description: bi("", ""),
    category,
    pet: "cats",
    image: assets.essentials,
    active: true,
    variants: [packFromPos(item)],
  };
}

const VIEWS: readonly { id: AdminPosItemView; en: string; ar: string; count: "all" | "new" | "linked" | "attention" | "notSoldOnline" }[] = [
  { id: "all", en: "All", ar: "الكل", count: "all" },
  { id: "new", en: "New", ar: "جديدة", count: "new" },
  { id: "linked", en: "Linked", ar: "مربوطة", count: "linked" },
  { id: "attention", en: "Needs attention", ar: "تحتاج متابعة", count: "attention" },
  { id: "not_sold_online", en: "Not sold online", ar: "لا تُباع عبر الموقع", count: "notSoldOnline" },
];

/**
 * The POS items tab of the Catalogue (#16 part 2c; the part 2 plan's section 3): every item
 * code the POS has sent, paged and searched on the server. Staff bring a new code online (a new product,
 * a new pack of a product, or an existing pack linked to it), put one aside, and settle a waiting
 * price; each risky action asks first (D128). Counts and prices are never typed here: a linked pack
 * follows the POS, and only the owner's "Edit anyway" (in the editor) changes one by hand.
 */
export function PosItemsPanel({
  products,
  categories,
  onCreate,
  onAddPack,
  onOpen,
}: {
  products: readonly Product[];
  categories: readonly { id: string }[];
  onCreate: (product: Product) => void;
  onAddPack: (product: Product, pack: Variant) => void;
  onOpen: (product: Product) => void;
}) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("products", "edit");
  const [filters, setFilters] = useState(emptyAdminPosItemFilters);
  const [typed, setTyped] = useState("");
  const list = useAdminPosItems(adminPosItemSearch(filters));
  const link = useLinkPosItem();
  const soldOnline = useSetPosItemSoldOnline();
  const settle = useSettlePosPrice();
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [picking, setPicking] = useState<{ item: AdminPosItem; mode: "add" | "link" } | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  // Search after a short pause in typing, not on every key; a new search starts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  async function act(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error: unknown) {
      setActionError(error);
    }
  }

  const defaultCategory = categories.find((category) => category.id !== "pet-houses")?.id ?? "food";
  const productOf = (item: AdminPosItem) => (item.pack ? products.find((product) => product.serverId === item.pack?.productId) : undefined);
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const shown = data && data.total > 0 ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}` : "0";

  function askNotSold(item: AdminPosItem) {
    setConfirming({
      title: c.text(`Put ${item.code} aside as not sold online?`, `وضع ${isolate(item.code)} جانباً كصنف لا يُباع عبر الموقع؟`),
      message: c.text(
        "It leaves the main list (the Not sold online view keeps it) and updates from the POS still arrive. You can bring it back at any time.",
        "يخرج من القائمة الرئيسية (ويبقى في عرض «لا تُباع عبر الموقع») وتستمر تحديثات نظام نقطة البيع بالوصول. يمكنك إعادته في أي وقت.",
      ),
      confirmLabel: c.text("Not sold online", "لا يُباع عبر الموقع"),
      run: () => act(() => soldOnline.mutateAsync({ item, notSoldOnline: true })),
    });
  }

  function askPrice(item: AdminPosItem, decision: "accept" | "refuse") {
    const pack = item.pack;
    if (!pack || item.heldPrice === null) return;
    const name = `${c.local(pack.productName)} · ${c.local(pack.label)}`;
    setConfirming(
      decision === "accept"
        ? {
            title: c.text(`Sell ${name} at ${c.money(item.heldPrice)}?`, `بيع ${name} بسعر ${c.money(item.heldPrice)}؟`),
            message: c.text(
              `The pack's price drops from ${c.money(pack.price)} to ${c.money(item.heldPrice)} at once, as the POS sent it.`,
              `ينخفض سعر العبوة من ${c.money(pack.price)} إلى ${c.money(item.heldPrice)} فوراً، كما أرسله نظام نقطة البيع.`,
            ),
            confirmLabel: c.text("Accept the price", "قبول السعر"),
            run: () => act(() => settle.mutateAsync({ item, decision })),
          }
        : {
            title: c.text(`Keep ${c.money(pack.price)} for ${name}?`, `الإبقاء على ${c.money(pack.price)} لـ ${name}؟`),
            message: c.text(
              `The price from the POS, ${c.money(item.heldPrice)}, is refused: the pack keeps its price, and this price is not asked about again until the POS sends a different one.`,
              `يُرفض السعر ${c.money(item.heldPrice)} المرسل من نظام نقطة البيع: تحتفظ العبوة بسعرها، ولا يُسأل عن هذا السعر مجدداً إلى أن يرسل نظام نقطة البيع سعراً آخر.`,
            ),
            confirmLabel: c.text("Refuse the price", "رفض السعر"),
            run: () => act(() => settle.mutateAsync({ item, decision })),
          },
    );
  }

  function askLink(item: AdminPosItem, product: Product, pack: Variant) {
    setPicking(null);
    setConfirming({
      title: c.text(`Link ${item.code} to ${c.local(product.name)} · ${c.local(pack.label)}?`, `ربط ${isolate(item.code)} بـ ${c.local(product.name)} · ${c.local(pack.label)}؟`),
      message: c.text(
        `The pack's SKU becomes ${item.code}, and from now on its stock, price and on/off come from the POS: the POS counts ${item.stock} at ${c.money(item.price)}${item.active ? "" : ", switched off"}. Later orders carry the new SKU; orders already placed keep theirs. Only deleting the pack undoes the link.`,
        `يصبح رمز العبوة ${isolate(item.code)}، ومن الآن يأتي مخزونها وسعرها وحالة عرضها من نظام نقطة البيع: الكمية في نظام نقطة البيع ${item.stock} بسعر ${c.money(item.price)}${item.active ? "" : "، وهي متوقفة"}. تحمل الطلبات اللاحقة الرمز الجديد، وتحتفظ الطلبات السابقة برمزها. لا يُلغى الربط إلا بحذف العبوة.`,
      ),
      confirmLabel: c.text("Link the pack", "ربط العبوة"),
      run: () => act(() => link.mutateAsync({ item, variantId: pack.serverId ?? "" })),
    });
  }

  return (
    <section className="admin-catalogue-card pos-items" aria-label={c.text("POS items", "أصناف نقطة البيع")}>
      <h2>
        {c.text("POS items", "أصناف نقطة البيع")} ({data?.counts.all ?? "…"})
      </h2>
      <p className="admin-catalogue-subtitle">
        {c.text(
          "Every item code the POS has sent. Bring new codes online as a product or a pack, or link one to an existing pack. A linked pack's stock, price and on/off come from the POS; nothing appears online by itself.",
          "كل رموز الأصناف التي أرسلها نظام نقطة البيع. اعرض الرموز الجديدة عبر الموقع كمنتج أو عبوة، أو اربط رمزاً بعبوة موجودة. يأتي مخزون العبوة المربوطة وسعرها وحالة عرضها من نظام نقطة البيع؛ ولا يظهر شيء عبر الموقع من تلقاء نفسه.",
        )}
      </p>
      <div className="admin-catalogue-filters">
        <label className="admin-catalogue-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label={c.text("Search POS codes", "ابحث في رموز نقطة البيع")}
            placeholder={c.text("Search by code, name or product…", "ابحث بالرمز أو الاسم أو المنتج…")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      </div>
      <nav className="pos-views" aria-label={c.text("POS code views", "عروض رموز نقطة البيع")}>
        {VIEWS.map((view) => (
          <button
            type="button"
            key={view.id}
            aria-pressed={filters.view === view.id}
            onClick={() => setFilters((current) => ({ ...current, view: view.id, page: 1 }))}
          >
            {c.text(view.en, view.ar)} ({data?.counts[view.count] ?? "…"})
          </button>
        ))}
      </nav>
      {actionError !== null && (
        <p className="form-error" role="alert">
          {errorMessage(actionError, c.text)}
        </p>
      )}
      {list.isError && (
        <div className="form-error" role="alert">
          <p>{errorMessage(list.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      )}
      {!data ? (
        !list.isError && (
          <p role="status" aria-busy="true" className="muted">
            {c.text("Loading POS codes…", "جارٍ تحميل رموز نقطة البيع…")}
          </p>
        )
      ) : (
        <>
          <div className="admin-catalogue-table-scroll">
            <table className="admin-catalogue-table pos-items-table">
              <thead>
                <tr>
                  <th>{c.text("POS code", "رمز نقطة البيع")}</th>
                  <th>{c.text("POS count", "كمية نقطة البيع")}</th>
                  <th>{c.text("POS price", "سعر نقطة البيع")}</th>
                  <th>{c.text("Status", "الحالة")}</th>
                  <th>{c.text("Website pack", "عبوة الموقع")}</th>
                  <th>{c.text("Last sent", "آخر إرسال")}</th>
                  <th>
                    <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const product = productOf(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          <bdi dir="ltr">{item.code}</bdi>
                        </strong>
                        {item.name && <small className="pos-item-name">{item.name}</small>}
                      </td>
                      <td>{item.stock}</td>
                      <td>
                        {c.money(item.price)}
                        {!item.active && <small className="pos-item-name">{c.text("Off in the POS", "متوقف في نقطة البيع")}</small>}
                      </td>
                      <td>
                        <PosItemStatus item={item} />
                      </td>
                      <td>
                        {item.pack ? (
                          <span className="pos-item-pack">
                            <strong>{c.local(item.pack.productName)}</strong>
                            <small>
                              {c.local(item.pack.label)} · <bdi dir="ltr">{item.pack.sku}</bdi>
                            </small>
                            <small>
                              {c.text(`Online: ${item.pack.stock} at ${c.money(item.pack.price)}`, `عبر الموقع: ${item.pack.stock} بسعر ${c.money(item.pack.price)}`)}
                              {!item.pack.active || !item.pack.productActive ? ` · ${c.text("not shown", "غير معروض")}` : ""}
                            </small>
                          </span>
                        ) : item.linkable ? (
                          "—"
                        ) : (
                          <small className="pos-item-name">
                            {c.text(
                              "This code has characters a website SKU cannot have, so no pack can follow it.",
                              "يحتوي هذا الرمز على أحرف لا يقبلها رمز منتج في الموقع، لذا لا يمكن أن تتبعه عبوة.",
                            )}
                          </small>
                        )}
                      </td>
                      <td>{formatStaffDateTime(item.lastSeenAt, c.locale)}</td>
                      <td>
                        <div className="pos-item-actions">
                          {item.status === "linked" && product && (
                            <button type="button" className="text-button" onClick={() => onOpen(product)}>
                              {c.text("Open product", "افتح المنتج")}
                            </button>
                          )}
                          {canEdit && item.status === "linked" && item.heldPrice !== null && (
                            <>
                              <button type="button" className="text-button" onClick={() => askPrice(item, "accept")} aria-label={`${c.text("Accept price", "قبول السعر")} ${item.code}`}>
                                {c.text("Accept price", "قبول السعر")}
                              </button>
                              <button type="button" className="text-button" onClick={() => askPrice(item, "refuse")} aria-label={`${c.text("Refuse price", "رفض السعر")} ${item.code}`}>
                                {c.text("Refuse price", "رفض السعر")}
                              </button>
                            </>
                          )}
                          {canEdit && item.status === "new" && item.linkable && (
                            <>
                              <button type="button" className="text-button" onClick={() => onCreate(productFromPos(item, defaultCategory))} aria-label={`${c.text("Create product", "إنشاء منتج")} ${item.code}`}>
                                {c.text("Create product", "إنشاء منتج")}
                              </button>
                              <button type="button" className="text-button" onClick={() => setPicking({ item, mode: "add" })} aria-label={`${c.text("Add as a pack", "إضافة كعبوة")} ${item.code}`}>
                                {c.text("Add as a pack", "إضافة كعبوة")}
                              </button>
                              <button type="button" className="text-button" onClick={() => setPicking({ item, mode: "link" })} aria-label={`${c.text("Link to a pack", "ربط بعبوة")} ${item.code}`}>
                                {c.text("Link to a pack", "ربط بعبوة")}
                              </button>
                            </>
                          )}
                          {canEdit && item.status === "new" && (
                            <button type="button" className="text-button" onClick={() => askNotSold(item)} aria-label={`${c.text("Not sold online", "لا يُباع عبر الموقع")} ${item.code}`}>
                              {c.text("Not sold online", "لا يُباع عبر الموقع")}
                            </button>
                          )}
                          {canEdit && item.status === "not_sold_online" && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void act(() => soldOnline.mutateAsync({ item, notSoldOnline: false }))}
                              aria-label={`${c.text("Back on the list", "إعادة إلى القائمة")} ${item.code}`}
                            >
                              {c.text("Back on the list", "إعادة إلى القائمة")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && (
            <Empty>
              {data.counts.all === 0 && filters.view === "all" && !filters.q
                ? c.text(
                    "The POS has not sent any item yet. Codes appear here once the POS sends its stock.",
                    "لم يرسل نظام نقطة البيع أي صنف بعد. تظهر الرموز هنا عندما يرسل نظام نقطة البيع المخزون.",
                  )
                : c.text("No matching codes. Try another view or search.", "لا رموز مطابقة. جرّب عرضاً أو بحثاً آخر.")}
            </Empty>
          )}
          <footer className="admin-catalogue-pagination">
            <div>
              <button
                type="button"
                aria-label={c.text("Previous page of POS codes", "الصفحة السابقة من رموز نقطة البيع")}
                disabled={data.page <= 1}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={c.text("Next page of POS codes", "الصفحة التالية من رموز نقطة البيع")}
                disabled={data.page >= pages}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <span>{c.text(`Showing ${shown} of ${data.total} codes`, `عرض ${shown} من ${data.total} رمزاً`)}</span>
            <select
              aria-label={c.text("POS codes per page", "عدد رموز نقطة البيع في الصفحة")}
              value={filters.pageSize}
              onChange={(event) => setFilters((current) => ({ ...current, pageSize: Number(event.target.value), page: 1 }))}
            >
              {ADMIN_POS_ITEM_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {c.text(`${size} per page`, `${size} لكل صفحة`)}
                </option>
              ))}
            </select>
          </footer>
        </>
      )}
      {picking && (
        <PackPicker
          item={picking.item}
          mode={picking.mode}
          products={products}
          onClose={() => setPicking(null)}
          onAdd={(product) => {
            setPicking(null);
            onAddPack(product, packFromPos(picking.item));
          }}
          onLink={(product, pack) => askLink(picking.item, product, pack)}
        />
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}

/** New, linked or put aside, with what needs staff: a waiting or refused price, a shortage, a code not heard of, the owner's change. */
function PosItemStatus({ item }: { item: AdminPosItem }) {
  const c = useCopy();
  const flags: { key: string; text: string; tone: "low" | "out" | "inactive" }[] = [];
  if (item.heldPrice !== null) flags.push({ key: "held", text: c.text(`Price waiting: ${c.money(item.heldPrice)}`, `سعر بانتظار القرار: ${c.money(item.heldPrice)}`), tone: "low" });
  if (item.priceRefused) {
    flags.push({
      key: "refused",
      text: item.price === 0 ? c.text("QAR 0: cannot be sold at", "صفر ريال: لا يمكن البيع به") : c.text("Price refused", "السعر مرفوض"),
      tone: "out",
    });
  }
  if (item.short > 0) flags.push({ key: "short", text: c.text(`Short by ${item.short}`, `نقص ${item.short}`), tone: "out" });
  if (item.silent) flags.push({ key: "silent", text: c.text("Not heard of for a day", "لم يُرسل منذ يوم"), tone: "low" });
  if (item.overriddenAt) flags.push({ key: "owner", text: c.text("Changed by the owner", "غيّرها المالك"), tone: "inactive" });
  const status =
    item.status === "linked"
      ? { text: c.text("Linked", "مربوط"), tone: "in" }
      : item.status === "not_sold_online"
        ? { text: c.text("Not sold online", "لا يُباع عبر الموقع"), tone: "inactive" }
        : { text: c.text("New", "جديد"), tone: "low" };
  return (
    <span className="pos-flags">
      <span className={`admin-catalogue-badge admin-catalogue-badge--${status.tone}`}>
        <i />
        {status.text}
      </span>
      {flags.map((flag) => (
        <span key={flag.key} className={`admin-catalogue-badge admin-catalogue-badge--${flag.tone}`}>
          {flag.text}
        </span>
      ))}
    </span>
  );
}

/**
 * Choosing where a code goes: a product to add it to as a new pack, or a product and one of its packs
 * to link. Packs that already follow a POS code are not offered (a pack follows one code).
 */
function PackPicker({
  item,
  mode,
  products,
  onClose,
  onAdd,
  onLink,
}: {
  item: AdminPosItem;
  mode: "add" | "link";
  products: readonly Product[];
  onClose: () => void;
  onAdd: (product: Product) => void;
  onLink: (product: Product, pack: Variant) => void;
}) {
  const c = useCopy();
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [packId, setPackId] = useState("");
  const term = query.trim().toLowerCase();
  const choices = products
    .filter((product) => product.serverId && (mode === "add" || product.variants.some((pack) => !pack.pos && pack.serverId)))
    .filter((product) => !term || [product.name.en, product.name.ar, product.brand ?? "", ...product.variants.map((pack) => pack.sku)].join(" ").toLowerCase().includes(term))
    .slice(0, 100);
  const product = choices.find((choice) => choice.serverId === productId) ?? null;
  const packs = product?.variants.filter((pack) => !pack.pos && pack.serverId) ?? [];
  const pack = packs.find((choice) => choice.serverId === packId) ?? null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    if (mode === "add") onAdd(product);
    else if (pack) onLink(product, pack);
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={mode === "add" ? c.text(`Add ${item.code} as a pack`, `إضافة ${isolate(item.code)} كعبوة`) : c.text(`Link ${item.code} to a pack`, `ربط ${isolate(item.code)} بعبوة`)}
      description={
        mode === "add"
          ? c.text(
              "Choose the product it is a pack of, for example the 4 kg pack of a food whose 2 kg pack is already online. The editor opens with the new pack, for its label and weight.",
              "اختر المنتج الذي تُعد عبوةً منه، مثل عبوة ٤ كغ لطعام عبوته ٢ كغ معروضة بالفعل. يفتح المحرر مع العبوة الجديدة لكتابة اسمها ووزنها.",
            )
          : c.text(
              "Choose the pack that is this POS item. Its SKU becomes the code, and the POS's stock, price and on/off apply at once.",
              "اختر العبوة التي تمثل صنف نقطة البيع هذا. يصبح رمزها هو الرمز، ويُطبَّق مخزون نظام نقطة البيع وسعره وحالة عرضه فوراً.",
            )
      }
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Find a product", "ابحث عن منتج")}>
          <input value={query} placeholder={c.text("Name, brand or SKU", "الاسم أو العلامة أو الرمز")} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <Field label={c.text("Product", "المنتج")}>
          <select
            required
            value={product ? productId : ""}
            onChange={(event) => {
              setProductId(event.target.value);
              setPackId("");
            }}
          >
            <option value="">{choices.length ? c.text("Choose a product", "اختر منتجاً") : c.text("No matching product", "لا منتج مطابق")}</option>
            {choices.map((choice) => (
              <option key={choice.serverId} value={choice.serverId}>
                {c.local(choice.name)}
              </option>
            ))}
          </select>
        </Field>
        {mode === "link" && product && (
          <Field label={c.text("Pack", "العبوة")}>
            <select required value={pack ? packId : ""} onChange={(event) => setPackId(event.target.value)}>
              <option value="">{c.text("Choose a pack", "اختر عبوة")}</option>
              {packs.map((choice) => (
                <option key={choice.serverId} value={choice.serverId}>
                  {`${c.local(choice.label)} · ${choice.sku} · ${c.money(choice.price)}`}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button type="submit" className="button button--primary" disabled={!product || (mode === "link" && !pack)}>
          {mode === "add" ? c.text("Open the editor", "افتح المحرر") : c.text("Continue", "متابعة")}
        </button>
      </form>
    </Modal>
  );
}
