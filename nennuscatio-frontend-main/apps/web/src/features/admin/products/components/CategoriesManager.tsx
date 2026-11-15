"use client";

import type { AdminCategory } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { describeSaveError, useAdminCategories, useDeleteCategory, useSaveCategory } from "@/shared/api/admin-catalog";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

type Draft = { category: AdminCategory | null; en: string; ar: string; sortOrder: number; active: boolean };

/**
 * Product categories (quotation: "Categories and variants"). Hidden categories disappear from the
 * shop together with their products. Pet Houses is fixed; a category with products cannot be deleted.
 */
export function CategoriesManager({ onClose }: { onClose: () => void }) {
  const c = useCopy();
  const access = useAdminAccess();
  const list = useAdminCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  function edit(category: AdminCategory | null) {
    setError("");
    setDraft(
      category
        ? { category, en: category.name.en, ar: category.name.ar, sortOrder: category.sortOrder, active: category.active }
        : { category: null, en: "", ar: "", sortOrder: (list.data?.length ?? 0) * 10, active: true },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      await save.mutateAsync({
        category: draft.category,
        name: { en: draft.en, ar: draft.ar },
        sortOrder: draft.sortOrder,
        active: draft.active,
      });
      setDraft(null);
      setError("");
    } catch (err) {
      setError(describeSaveError(err, c.text));
    }
  }

  async function del(category: AdminCategory) {
    try {
      await remove.mutateAsync(category);
      setError("");
    } catch (err) {
      setError(describeSaveError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={c.text("Product categories", "فئات المنتجات")}
      description={c.text(
        "Hiding a category also hides its products in the shop. A category that still has products cannot be deleted.",
        "إخفاء الفئة يخفي منتجاتها من المتجر. لا يمكن حذف فئة ما زالت تحتوي منتجات.",
      )}
      placement="side"
    >
      <div className="form-stack">
        {list.isPending || list.isError ? (
          <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />
        ) : (
          <ul className="role-list">
            {list.data.map((category) => (
              <li key={category.id}>
                <div>
                  <strong>{c.local(category.name)}</strong>
                  <span className="small muted">
                    {" · "}
                    {c.text(`${category.productCount} products`, `${category.productCount} منتج`)}
                    {!category.active && ` · ${c.text("Hidden", "مخفية")}`}
                  </span>
                </div>
                <div className="row">
                  <button type="button" className="text-button" aria-label={`${c.text("Edit", "تعديل")} ${c.local(category.name)}`} onClick={() => edit(category)}>
                    {c.text("Edit", "تعديل")}
                  </button>
                  {access.can("products", "delete") && !category.isHouseCategory && category.productCount === 0 && (
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`${c.text("Delete", "حذف")} ${c.local(category.name)}`}
                      onClick={() =>
                        setConfirming({
                          title: c.text(`Delete the category "${category.name.en}"?`, `حذف الفئة «${category.name.ar}»؟`),
                          message: c.text(
                            'This cannot be undone. To hide it from the shop for a while, edit it and untick "Show in the shop" instead.',
                            "لا يمكن التراجع عن ذلك. لإخفائها من المتجر مؤقتاً، عدّلها وأزل تحديد «إظهار في المتجر» بدلاً من ذلك.",
                          ),
                          confirmLabel: c.text("Delete category", "حذف الفئة"),
                          run: () => del(category),
                        })
                      }
                    >
                      {c.text("Delete", "حذف")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {draft ? (
          <form className="form-stack panel" onSubmit={submit}>
            <h3>{draft.category ? c.text("Edit category", "تعديل الفئة") : c.text("New category", "فئة جديدة")}</h3>
            <div className="form-two">
              <Field label={c.text("Name · English", "الاسم · الإنجليزية")}>
                <input required maxLength={80} value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
              </Field>
              <Field label={c.text("Name · Arabic", "الاسم · العربية")}>
                <input required maxLength={80} dir="rtl" value={draft.ar} onChange={(e) => setDraft({ ...draft, ar: e.target.value })} />
              </Field>
            </div>
            <Field label={c.text("Order in lists (smaller first)", "الترتيب في القوائم (الأصغر أولاً)")}>
              <NumberInput
                min={0}
                max={1000}
                required
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
              />
            </Field>
            {!draft.category?.isHouseCategory && (
              <label className="row">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                {c.text("Show in the shop", "إظهار في المتجر")}
              </label>
            )}
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {c.text("Save category", "احفظ الفئة")}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="button button--secondary" onClick={() => edit(null)}>
            {c.text("New category", "فئة جديدة")}
          </button>
        )}
        <ErrorMessage message={error} />
        <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
      </div>
    </Modal>
  );
}
