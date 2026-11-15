"use client";

import { type FormEvent, useRef, useState } from "react";
import type { Product, Variant } from "@/mocks/data/business";
import { describeSaveError, useAdminCatalog } from "@/shared/api/admin-catalog";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { formatStaffDateTime, isolate } from "@/shared/lib/format";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

/**
 * A pack the POS manages, in the product editor (#16 part 2c; the part 2 plan's section 1.7):
 * where its stock, price, on/off and SKU come from and when, the owner's change if one stands, a price
 * waiting for staff, and, for the owner alone, "Edit anyway" (`onEditAnyway` opens `PackOverride`, which
 * the editor renders outside its own form: a form inside a form would save the product too). A new pack
 * made from the POS items list says what happens once saved.
 */
export function PosPackNote({ variant, onEditAnyway }: { variant: Variant; onEditAnyway: () => void }) {
  const c = useCopy();
  const access = useAdminAccess();
  if (variant.fromPos) {
    return (
      <div className="note-box pos-pack-note" role="note">
        <p>
          {c.text(
            `Follows POS item ${variant.fromPos.code} once saved: its stock, price and on/off then come from the POS, as shown here.`,
            `تتبع صنف نقطة البيع ${isolate(variant.fromPos.code)} بعد الحفظ: يأتي مخزونها وسعرها وحالة عرضها من نظام نقطة البيع كما يظهر هنا.`,
          )}
        </p>
        {variant.fromPos.price === 0 && (
          <p>
            {c.text(
              "The POS's price is QAR 0, which cannot be sold at: type the website's price until the POS sends one.",
              "سعر نظام نقطة البيع هو صفر ريال ولا يمكن البيع به: اكتب سعر الموقع إلى أن يرسل نظام نقطة البيع سعراً.",
            )}
          </p>
        )}
      </div>
    );
  }
  const pos = variant.pos;
  if (!pos) return null;
  return (
    <div className="note-box pos-pack-note" role="note">
      <p>
        <strong>{c.text("From the POS", "من نقطة البيع")}</strong> ·{" "}
        {c.text(`item ${pos.code}`, `الصنف ${isolate(pos.code)}`)} ·{" "}
        {pos.appliedAt
          ? c.text(`updated ${formatStaffDateTime(pos.appliedAt, c.locale)}`, `حُدِّث ${formatStaffDateTime(pos.appliedAt, c.locale)}`)
          : c.text("waiting for the POS's next update", "بانتظار التحديث التالي من نظام نقطة البيع")}
      </p>
      <p>
        {variant.active === false
          ? c.text("Switched off in the POS: not sold online.", "متوقفة في نظام نقطة البيع: لا تُباع عبر الموقع.")
          : c.text("On sale in the POS.", "معروضة للبيع في نظام نقطة البيع.")}{" "}
        {c.text(
          "Stock, price, on/off and SKU change only from the POS.",
          "يتغير المخزون والسعر وحالة العرض ورمز المنتج من نظام نقطة البيع فقط.",
        )}
      </p>
      {pos.overriddenAt && (
        <p>
          {c.text(
            `Changed by the owner at ${formatStaffDateTime(pos.overriddenAt, c.locale)}; the POS's next update replaces it.`,
            `غيّرها المالك ${formatStaffDateTime(pos.overriddenAt, c.locale)}؛ يستبدل التحديث التالي من نظام نقطة البيع هذا التغيير.`,
          )}
        </p>
      )}
      {pos.heldPrice !== null && (
        <p>
          {c.text(
            `The POS sent ${c.money(pos.heldPrice)}, less than half the price: it waits for staff on the POS items list.`,
            `أرسل نظام نقطة البيع سعر ${c.money(pos.heldPrice)}، أي أقل من نصف السعر: ينتظر قرار الموظفين في قائمة «أصناف نقطة البيع».`,
          )}
        </p>
      )}
      {access.isOwner && variant.serverId && (
        <button type="button" className="text-button" onClick={onEditAnyway} aria-label={`${c.text("Edit anyway", "تعديل رغم ذلك")} ${c.local(variant.label)}`}>
          {c.text("Edit anyway", "تعديل رغم ذلك")}
        </button>
      )}
    </div>
  );
}

/**
 * The owner's "Edit anyway": first the pop-up (D128) that says what will happen, then the stock (with a
 * reason), the price and on/off. The API refuses anyone but the owner (`@OwnerOnly()`). Cancel at
 * either step sends nothing.
 */
export function PackOverride({
  productName,
  variant,
  onClose,
  onSaved,
}: {
  productName: string;
  variant: Variant;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const c = useCopy();
  const [editing, setEditing] = useState(false);
  // The pop-up closes itself after its answer; only a "no" ends the whole flow.
  const confirmed = useRef(false);
  return (
    <>
      <ConfirmDialog
        request={
          !editing
            ? {
                title: c.text("Edit a pack that the POS manages?", "تعديل عبوة يديرها نظام نقطة البيع؟"),
                message: c.text(
                  "This pack's stock, price and on/off come from the POS. Your change applies now, but the POS's next update of this pack replaces it: within minutes if it changes in the POS, and at the latest with tonight's full list. To keep it, make the same change in the POS. Staff cannot do this. It is recorded.",
                  "يأتي مخزون هذه العبوة وسعرها وحالة عرضها من نظام نقطة البيع. يُطبَّق تغييرك الآن، لكن التحديث التالي من نظام نقطة البيع لهذه العبوة يستبدله: خلال دقائق إن تغيّرت في نظام نقطة البيع، وعلى الأكثر مع القائمة الكاملة الليلة. للإبقاء عليه، أجرِ التغيير نفسه في نظام نقطة البيع. لا يستطيع الموظفون فعل ذلك. ويُسجَّل التغيير.",
                ),
                confirmLabel: c.text("Edit anyway", "تعديل رغم ذلك"),
                run: () => {
                  confirmed.current = true;
                  setEditing(true);
                },
              }
            : null
        }
        onClose={() => {
          if (!confirmed.current) onClose();
        }}
      />
      {editing && <OverrideDialog productName={productName} variant={variant} onClose={onClose} onSaved={onSaved} />}
    </>
  );
}

function OverrideDialog({
  productName,
  variant,
  onClose,
  onSaved,
}: {
  productName: string;
  variant: Variant;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const c = useCopy();
  const catalog = useAdminCatalog();
  const [stock, setStock] = useState(String(variant.stock));
  const [price, setPrice] = useState(String(variant.price / 100));
  const [active, setActive] = useState(variant.active !== false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const units = Number(stock);
    const minor = Math.round(Number(price) * 100);
    if (!Number.isInteger(units) || units < 0) {
      setError(c.text("Enter the stock as a whole number, 0 or more.", "أدخل المخزون عدداً صحيحاً، صفراً أو أكثر."));
      return;
    }
    if (!Number.isFinite(minor) || minor <= 0) {
      setError(c.text("Enter a price above 0.", "أدخل سعراً أكبر من صفر."));
      return;
    }
    if (reason.trim().length < 3) {
      setError(c.text("Write a short reason (at least 3 characters).", "اكتب سبباً قصيراً (٣ أحرف على الأقل)."));
      return;
    }
    setSaving(true);
    try {
      onSaved(await catalog.overridePack(variant.serverId ?? "", { stock: units, price: minor, active, reason: reason.trim() }));
      onClose();
    } catch (err) {
      setError(describeSaveError(err, c.text));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={c.text("Edit anyway", "تعديل رغم ذلك")}
      description={`${productName} · ${c.local(variant.label)} · SKU ${variant.sku}`}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-two">
          <Field label={c.text("Stock", "المخزون")}>
            <NumberInput kind="whole" min={0} required value={stock} onChange={(e) => setStock(e.target.value)} />
          </Field>
          <Field label={c.text("Price · QAR", "السعر · ر.ق")}>
            <NumberInput kind="decimal" min={0} required value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <label className="row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {c.text("On sale (sold online)", "معروضة للبيع (عبر الموقع)")}
        </label>
        <Field label={c.text("Reason", "السبب")}>
          <input
            required
            maxLength={200}
            value={reason}
            placeholder={c.text("e.g. Counted the shelf: the POS is behind", "مثال: جرد الرف: نظام نقطة البيع متأخر")}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <p className="small muted">
          {c.text("The POS's next update of this pack replaces these values.", "يستبدل التحديث التالي من نظام نقطة البيع لهذه العبوة هذه القيم.")}
        </p>
        <ErrorMessage message={error} />
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save the change", "احفظ التغيير")}
        </button>
      </form>
    </Modal>
  );
}
