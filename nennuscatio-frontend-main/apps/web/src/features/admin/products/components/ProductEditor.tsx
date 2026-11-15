"use client";
import { type ChangeEvent, useState, type FormEvent } from "react";
import { GalleryUpload, ImagePicker } from "@/shared/ui/ImagePicker";
import { HouseAvailability, HouseDesign, HousePricing, HouseStep } from "@/features/pet-houses/components/HouseEditor";
import { HouseReadiness } from "@/features/pet-houses/components/HouseReadiness";
import {
  emptyHouseMetadata,
  housePetTypes,
  collectionsForPet,
} from "@/mocks/data/pet-houses";
import { MockError } from "@/mocks/adapters/business-repository";
import {
  cataloguePetTypes as petTypes,
  bi,
  type Pet,
  type Product,
  type Variant,
} from "@/mocks/data/business";
import { describeSaveError, useAdminCatalog, useAdminCategories, useCategoryOptions } from "@/shared/api/admin-catalog";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { Modal, Field, ErrorMessage } from "@/shared/ui/BusinessUI";
import { PackOverride, PosPackNote } from "./PosPack";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { NumberInput } from "@/shared/ui/NumberInput";
export function ProductEditor({
  initial,
  addPack,
  onClose,
}: {
  initial: Product;
  /** A new pack to start with, added to the product (#16 part 2c: "Add as a pack" from the POS items list). */
  addPack?: Variant;
  onClose: () => void;
}) {
  const c = useCopy(),
    catalog = useAdminCatalog(),
    access = useAdminAccess(),
    categoryOptions = useCategoryOptions(),
    adminCategories = useAdminCategories(),
    [edit, setEdit] = useState(() => {
      const copy = structuredClone(initial);
      return addPack ? { ...copy, variants: [...copy.variants, structuredClone(addPack)] } : copy;
    }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [adjusting, setAdjusting] = useState<Product["variants"][number] | null>(null),
    [overriding, setOverriding] = useState<Product["variants"][number] | null>(null);
  const api = catalog.source === "api";
  // Only packs already saved on the server are "existing": a new product's first pack is not,
  // so its starting stock can be typed in (a 2026-10-07 test found it locked at 0).
  const existingPacks = new Set(api && initial.serverId ? initial.variants.map((variant) => variant.id) : []);
  // A Pet House is edited in four plain steps (#14, D268); its sizes count stock only when In stock.
  const house = edit.category === "pet-houses" && edit.house ? edit.house : null;
  const countsStock = !house || house.availability === "in-stock";
  const housesShown = !api || (adminCategories.data?.find((category) => category.isHouseCategory)?.active ?? true);
  // The owner's "Edit anyway" answers the product as saved: this pack takes its new stock, price and
  // on/off (and the owner's mark), and the rest of the form stays as typed (#16 part 2c).
  function takeOverride(saved: Product, packId: string) {
    const next = saved.variants.find((variant) => variant.id === packId);
    if (!next) return;
    setEdit((current) => ({
      ...current,
      variants: current.variants.map((x) =>
        x.id === packId ? { ...x, stock: next.stock, price: next.price, active: next.active, pos: next.pos } : x,
      ),
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const missingWeight = edit.variants.findIndex((variant) => variant.unit === "weight" && !variant.weightGrams);
    if (api && missingWeight >= 0) {
      setError(c.text("Enter the pack weight in grams for every fixed-weight pack.", "أدخل وزن العبوة بالغرام لكل عبوة بوزن ثابت."));
      return;
    }
    setSaving(true);
    try {
      await catalog.saveProduct(edit, initial.serverId ? initial : null);
      onClose();
    } catch (err) {
      setError(
        c.ar && err instanceof MockError && err.code === "HOUSE"
          ? "تحقق من نوع البيت والأبعاد والمميزات باللغتين والسعر ومدة التوصيل والرسوم."
          : describeSaveError(err, c.text),
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setSaving(true);
    try {
      await catalog.deleteProduct(edit);
      onClose();
    } catch (err) {
      setError(describeSaveError(err, c.text));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }
  const nameFields = (
    <div className="form-two">
      {(["en", "ar"] as const).map((lang) => (
        <div key={lang}>
          <Field
            label={`${c.text("Name", "الاسم")} · ${lang.toUpperCase()}`}
          >
            <input
              required
              dir={lang === "ar" ? "rtl" : "ltr"}
              value={edit.name[lang]}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  name: { ...edit.name, [lang]: e.target.value },
                })
              }
            />
          </Field>
          <Field
            label={`${c.text("Description", "الوصف")} · ${lang.toUpperCase()}`}
          >
            <textarea
              required
              dir={lang === "ar" ? "rtl" : "ltr"}
              value={edit.description[lang]}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  description: {
                    ...edit.description,
                    [lang]: e.target.value,
                  },
                })
              }
            />
          </Field>
        </div>
      ))}
    </div>
  );
  const categoryFields = (
    <div className="form-two">
      <Field label={c.text("Category", "الفئة")}>
        <select
          value={edit.category}
          onChange={(e) =>
            setEdit({
              ...edit,
              category: e.target.value,
              house:
                e.target.value === "pet-houses"
                  ? (edit.house ?? {
                      ...emptyHouseMetadata(),
                      collection: collectionsForPet(
                        edit.pet === "pets" ? "cats" : edit.pet,
                      )[0],
                    })
                  : undefined,
              pet: !(
                e.target.value === "pet-houses" ? housePetTypes : petTypes
              ).some((p) => p.id === edit.pet)
                ? "cats"
                : edit.pet,
            })
          }
        >
          {categoryOptions.map((x) => (
            <option key={x.id} value={x.id}>
              {c.local(x.name)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={
          edit.house
            ? c.text("Suitable for", "مناسب لـ")
            : c.text(api ? "Main pet type" : "Pet type", api ? "نوع الحيوان الرئيسي" : "نوع الحيوان")
        }
      >
        <select
          value={edit.pet}
          onChange={(e) =>
            setEdit({
              ...edit,
              pet: e.target.value as Product["pet"],
              // The main pet always stays among the suitable pets.
              pets: [
                e.target.value as Pet,
                ...(edit.pets ?? []).filter((pet) => pet !== e.target.value && pet !== edit.pet),
              ],
              ...(edit.house
                ? {
                    house: {
                      ...edit.house,
                      collection: collectionsForPet(e.target.value)[0],
                    },
                  }
                : {}),
            })
          }
        >
          {(edit.house ? housePetTypes : petTypes).map((x) => (
            <option key={x.id} value={x.id}>
              {c.local(x.name)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
  const mainPhoto = (
    <>
      <Photo
        src={edit.image}
        alt={c.text("Product image preview", "معاينة صورة المنتج")}
        className="editor-photo"
        unavailableLabel={
          edit.house
            ? c.text("Photo unavailable", "صورة غير متاحة")
            : undefined
        }
      />
      {/* Photo changes use the latest form: an upload can finish after other edits (2026-10-07). */}
      <ImagePicker
        value={edit.image}
        onChange={(image) => setEdit((current) => ({ ...current, image }))}
        onError={setError}
      />
    </>
  );
  const variantsBlock = (
    <>
      <h3>{house ? c.text("Sizes and prices", "المقاسات والأسعار") : c.text("SKU options", "خيارات رمز المنتج")}</h3>
      {house && (
        <p className="small muted">
          {c.text(
            "One size is enough: name it “Standard”, for example. Add more when the model comes in several sizes.",
            "يكفي مقاس واحد: سمّه «قياسي» مثلاً. أضف مقاسات أخرى إن كان التصميم بأكثر من مقاس.",
          )}
        </p>
      )}
      {edit.variants.map((v, index) => {
        // A pack the POS manages, or a new one made from a POS code (#16 part 2c, plan section 1.7):
        // its SKU, price, stock and on/off follow the POS, so they are shown, never typed.
        const managed = api && !!v.pos;
        const fromPos = api ? (v.fromPos ?? null) : null;
        return (
        <div className="variant-editor" key={v.id}>
          <div className="form-two">
            {(["en", "ar"] as const).map((lang) => (
              <Field
                key={lang}
                label={
                  house
                    ? `${c.text("Size name", "اسم المقاس")} · ${lang.toUpperCase()}`
                    : `${c.text("Variant label", "اسم الخيار")} · ${lang}`
                }
              >
                <input
                  required
                  value={v.label[lang]}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      variants: edit.variants.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              label: {
                                ...x.label,
                                [lang]: e.target.value,
                              },
                            }
                          : x,
                      ),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="form-four">
            {[
              { key: "sku", label: "SKU", type: "text" },
              {
                key: "price",
                label: c.text("Price · QAR", "السعر · ر.ق"),
                type: "number",
              },
              {
                key: "stock",
                label: c.text("Stock", "المخزون"),
                type: "number",
              },
            ]
              // A made-to-order (or not yet confirmed) house has no stock to count.
              .filter((f) => countsStock || f.key !== "stock")
              .map((f) => {
              const setByPos =
                managed || (fromPos !== null && (f.key !== "price" || fromPos.price > 0));
              const field = {
                  required: true,
                  title: setByPos
                    ? c.text("From the POS: only the POS changes it (the owner can use “Edit anyway”).", "من نقطة البيع: لا يغيّره إلا نظام نقطة البيع (ويمكن للمالك استخدام «تعديل رغم ذلك»).")
                    : api && f.key === "stock" && existingPacks.has(v.id)
                      ? c.text("Use “Adjust stock” in the details panel, with a reason.", "استخدم «تعديل المخزون» في لوحة التفاصيل مع ذكر السبب.")
                      : undefined,
                  disabled:
                    setByPos ||
                    (f.key === "price" &&
                      edit.house?.purchaseMode === "inquiry") ||
                    // Stock of existing packs only changes through an adjustment with a reason (6b).
                    (api && f.key === "stock" && existingPacks.has(v.id)),
                  value:
                    f.key === "price" &&
                    edit.house?.purchaseMode === "inquiry"
                      ? ""
                      : f.key === "price"
                        ? v.price / 100
                        : f.key === "stock"
                          ? v.stock
                          : v.sku,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setEdit({
                      ...edit,
                      variants: edit.variants.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              [f.key]:
                                f.key === "sku"
                                  ? e.target.value
                                  : f.key === "price"
                                    ? Math.round(Number(e.target.value) * 100)
                                    : Number(e.target.value),
                            }
                          : x,
                      ),
                    }),
              };
              return (
                <Field key={f.key} label={f.label}>
                  {f.type === "number" ? (
                    <NumberInput {...field} kind={f.key === "price" ? "decimal" : "whole"} min={0} />
                  ) : (
                    <input {...field} />
                  )}
                </Field>
              );
            })}
            {/* A house is sold by the piece, never by weight. */}
            {!house && (
              <Field label={c.text("Sold as", "يباع كـ")}>
                <select
                  value={v.unit}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      variants: edit.variants.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              unit: e.target.value as "piece" | "weight",
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="piece">{c.text("Piece", "قطعة")}</option>
                  <option value="weight">
                    {c.text("Fixed-weight pack", "عبوة بوزن ثابت")}
                  </option>
                </select>
              </Field>
            )}
            {!house && v.unit === "weight" && (
              <Field label={c.text("Pack weight · grams", "وزن العبوة · غرام")}>
                <NumberInput
                  min={1}
                  required={api}
                  value={v.weightGrams ?? ""}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      variants: edit.variants.map((x, i) =>
                        i === index
                          ? { ...x, weightGrams: e.target.value ? Number(e.target.value) : null }
                          : x,
                      ),
                    })
                  }
                />
              </Field>
            )}
          </div>
          {(managed || fromPos) && (
            <PosPackNote variant={v} onEditAnyway={() => setOverriding(v)} />
          )}
          {api && countsStock && existingPacks.has(v.id) && !managed && (
            <p className="small muted row">
              {c.text(
                "Stock changes are recorded with a reason.",
                "تُسجَّل تغييرات المخزون مع السبب.",
              )}
              <button
                type="button"
                className="text-button"
                disabled={!v.serverId}
                onClick={() => setAdjusting(v)}
              >
                {c.text("Adjust stock", "تعديل المخزون")}
                <span className="sr-only"> {c.local(v.label)}</span>
              </button>
            </p>
          )}
          {countsStock && (
            <Field label={c.text("Low-stock threshold", "حد المخزون المنخفض")}>
              <NumberInput
                min={0}
                required
                value={v.lowStock ?? 5}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    variants: edit.variants.map((x) =>
                      x.id === v.id
                        ? { ...x, lowStock: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </Field>
          )}
          {edit.variants.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setEdit({
                  ...edit,
                  variants: edit.variants.filter((x) => x.id !== v.id),
                })
              }
            >
              {house ? c.text("Remove size", "إزالة المقاس") : c.text("Remove variant", "إزالة الخيار")}
            </button>
          )}
        </div>
        );
      })}
      <button
        type="button"
        className="button button--secondary"
        onClick={() =>
          setEdit({
            ...edit,
            variants: [
              ...edit.variants,
              {
                id: crypto.randomUUID(),
                label: bi("", ""),
                sku: "",
                price: 0,
                stock: 0,
                unit: "piece",
              },
            ],
          })
        }
      >
        {house ? c.text("Add a size", "أضف مقاساً") : c.text("Add variant", "أضف خياراً")}
      </button>
    </>
  );
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={c.text(
        edit.house ? "Pet House editor" : "Product editor",
        edit.house ? "محرر بيت الحيوان" : "محرر المنتج",
      )}
    >
      <form className="form-stack" onSubmit={save}>
        {house ? (
          <>
            <HouseStep step={1} title={c.text("What it is", "ما هو")}>
              {nameFields}
              {categoryFields}
              {mainPhoto}
              <HouseDesign product={edit} onChange={setEdit} onError={setError} />
            </HouseStep>
            <HouseStep step={2} title={c.text("Price and sizes", "السعر والمقاسات")}>
              <HousePricing product={edit} onChange={setEdit} />
              {variantsBlock}
            </HouseStep>
            <HouseStep step={3} title={c.text("Availability and delivery", "التوفر والتوصيل")}>
              <HouseAvailability product={edit} onChange={setEdit} />
            </HouseStep>
            <HouseStep
              step={4}
              title={c.text("Ready for online orders", "جاهز للطلب عبر الموقع")}
              hint={c.text(
                "Customers can order the model online once every line is ticked. Until then its page offers WhatsApp.",
                "يمكن للعملاء طلب التصميم عبر الموقع عند اكتمال كل البنود. حتى ذلك الحين تعرض صفحته واتساب.",
              )}
            >
              <HouseReadiness product={edit} onChange={setEdit} categoryShown={housesShown} />
            </HouseStep>
          </>
        ) : (
          <>
            {nameFields}
            {categoryFields}
            {api && !edit.house && (
              <fieldset className="pet-suitability">
                <legend>{c.text("Also suitable for", "مناسب أيضاً لـ")}</legend>
                {petTypes
                  .filter((x) => x.id !== edit.pet)
                  .map((x) => (
                    <label key={x.id} className="row">
                      <input
                        type="checkbox"
                        checked={(edit.pets ?? []).includes(x.id as Pet)}
                        onChange={(e) => {
                          const others = (edit.pets ?? []).filter((pet) => pet !== edit.pet && pet !== x.id);
                          setEdit({
                            ...edit,
                            pets: [edit.pet, ...others, ...(e.target.checked ? [x.id as Pet] : [])],
                          });
                        }}
                      />
                      {c.local(x.name)}
                    </label>
                  ))}
              </fieldset>
            )}
            <Field label={c.text("Brand", "العلامة التجارية")}>
              <input
                value={edit.brand ?? ""}
                maxLength={80}
                onChange={(event) =>
                  setEdit({ ...edit, brand: event.target.value })
                }
                placeholder={c.text(
                  "Brand name (optional)",
                  "اسم العلامة التجارية (اختياري)",
                )}
              />
            </Field>
            {mainPhoto}
            {!edit.house && (
              <div className="form-stack">
                <h3>{c.text("Product gallery", "صور المنتج")}</h3>
                <p className="small muted">
                  {c.text(
                    "Optional: up to 8 extra photos, shown as thumbnails under the main photo on the product page.",
                    "اختياري: حتى ٨ صور إضافية تظهر أسفل الصورة الرئيسية في صفحة المنتج.",
                  )}
                </p>
                {(edit.gallery ?? []).map((photo) => (
                  <div className="variant-editor" key={photo.id}>
                    <Photo src={photo.src} alt="" className="editor-photo" />
                    <ImagePicker
                      value={photo.src}
                      onChange={(src) =>
                        setEdit((current) => ({
                          ...current,
                          gallery: current.gallery?.map((x) =>
                            x.id === photo.id ? { ...x, src } : x,
                          ),
                        }))
                      }
                      onError={setError}
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setEdit((current) => ({
                          ...current,
                          gallery: current.gallery?.filter((x) => x.id !== photo.id),
                        }))
                      }
                    >
                      {c.text("Remove image", "إزالة الصورة")}
                    </button>
                  </div>
                ))}
                <GalleryUpload
                  room={8 - (edit.gallery?.length ?? 0)}
                  onError={setError}
                  onAdd={(sources) =>
                    setEdit((current) => ({
                      ...current,
                      gallery: [
                        ...(current.gallery ?? []),
                        ...sources.map((src) => ({ id: crypto.randomUUID(), src })),
                      ].slice(0, 8),
                    }))
                  }
                />
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={(edit.gallery?.length ?? 0) >= 8}
                  onClick={() =>
                    setEdit((current) => ({
                      ...current,
                      gallery: [
                        ...(current.gallery ?? []),
                        { id: crypto.randomUUID(), src: "" },
                      ],
                    }))
                  }
                >
                  {c.text("Add gallery image", "إضافة صورة")}
                </button>
              </div>
            )}
            {variantsBlock}
          </>
        )}
        <Field label={c.text("Store visibility", "الظهور في المتجر")}>
          <select
            value={edit.active ? "active" : "inactive"}
            onChange={(e) =>
              setEdit({ ...edit, active: e.target.value === "active" })
            }
          >
            <option value="active">{c.text("Active", "نشط")}</option>
            <option value="inactive">{c.text("Inactive", "غير نشط")}</option>
          </select>
        </Field>
        <ErrorMessage message={error} />
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving
            ? c.text("Saving…", "جارٍ الحفظ…")
            : house
              ? c.text("Save Pet House", "احفظ بيت الحيوان")
              : c.text("Save product", "احفظ المنتج")}
        </button>
        {api && edit.serverId && access.can("products", "delete") && (
          confirmDelete ? (
            <div className="note-box" role="alert">
              <p>
                {c.text(
                  "Delete this product for good? It disappears from the shop and cannot be restored. To only hide it, set Store visibility to Inactive instead.",
                  "حذف هذا المنتج نهائياً؟ سيختفي من المتجر ولا يمكن استعادته. لإخفائه فقط اجعل الظهور «غير نشط».",
                )}
              </p>
              <div className="row">
                <button type="button" className="button button--secondary" onClick={() => setConfirmDelete(false)}>
                  {c.text("Keep it", "إبقاء")}
                </button>
                <button type="button" className="button button--primary" disabled={saving} onClick={() => void remove()}>
                  {c.text("Delete for good", "حذف نهائي")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirmDelete(true)}>
              {c.text("Delete product", "حذف المنتج")}
            </button>
          )
        )}
      </form>
      {/* Outside the form, as Adjust stock: the owner's change is its own save (#16 part 2c). */}
      {overriding && (
        <PackOverride
          productName={c.local(edit.name)}
          variant={overriding}
          onClose={() => setOverriding(null)}
          onSaved={(saved) => takeOverride(saved, overriding.id)}
        />
      )}
      {adjusting && (
        <StockAdjustDialog
          productName={c.local(edit.name)}
          variant={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjust={async (change, reason) => {
            await catalog.adjustStock(adjusting.serverId ?? "", change, reason);
            // Show the new number here too; product saves never change existing stock.
            setEdit((current) => ({
              ...current,
              variants: current.variants.map((x) =>
                x.id === adjusting.id ? { ...x, stock: x.stock + change } : x,
              ),
            }));
          }}
        />
      )}
    </Modal>
  );
}
