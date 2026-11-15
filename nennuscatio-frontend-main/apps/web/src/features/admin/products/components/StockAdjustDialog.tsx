"use client";

import { type FormEvent, useState } from "react";
import type { Variant } from "@/mocks/data/business";
import { describeSaveError } from "@/shared/api/admin-catalog";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";

/**
 * Adds or removes units of one pack with a reason (6b). The server applies the change atomically,
 * refuses to go below zero and records who, when, before/after and why.
 */
export function StockAdjustDialog({
  productName,
  variant,
  onClose,
  onAdjust,
}: {
  productName: string;
  variant: Variant;
  onClose: () => void;
  onAdjust: (change: number, reason: string) => Promise<void>;
}) {
  const c = useCopy();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const units = Number(amount);
  const change = direction === "add" ? units : -units;
  const after = variant.stock + (Number.isInteger(units) ? change : 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(units) || units <= 0) {
      setError(c.text("Enter a whole number of units above zero.", "أدخل عدداً صحيحاً من الوحدات أكبر من صفر."));
      return;
    }
    if (reason.trim().length < 3) {
      setError(c.text("Write a short reason (at least 3 characters).", "اكتب سبباً قصيراً (٣ أحرف على الأقل)."));
      return;
    }
    setSaving(true);
    try {
      await onAdjust(change, reason.trim());
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
      title={c.text("Adjust stock", "تعديل المخزون")}
      description={`${productName} · ${c.local(variant.label)} · SKU ${variant.sku}`}
    >
      <form className="form-stack" onSubmit={submit}>
        <p>
          {c.text("Now in stock:", "المخزون الحالي:")} <strong>{variant.stock}</strong>
        </p>
        <fieldset className="row">
          <legend className="sr-only">{c.text("Add or remove", "إضافة أو إزالة")}</legend>
          <label className="row">
            <input type="radio" name="direction" checked={direction === "add"} onChange={() => setDirection("add")} />
            {c.text("Add units (delivery, return)", "إضافة وحدات (توريد، إرجاع)")}
          </label>
          <label className="row">
            <input type="radio" name="direction" checked={direction === "remove"} onChange={() => setDirection("remove")} />
            {c.text("Remove units (damaged, counted less)", "إزالة وحدات (تالف، جرد أقل)")}
          </label>
        </fieldset>
        <Field label={c.text("How many units", "عدد الوحدات")}>
          <NumberInput min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={c.text("Reason", "السبب")}>
          <input
            required
            maxLength={200}
            value={reason}
            placeholder={c.text("e.g. Delivery from supplier", "مثال: توريد من المورد")}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {amount !== "" && Number.isInteger(units) && units > 0 && (
          <p className="small muted" role="status">
            {c.text("After this change:", "بعد هذا التعديل:")} <strong>{after}</strong>
          </p>
        )}
        <ErrorMessage message={error} />
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save stock change", "احفظ تعديل المخزون")}
        </button>
      </form>
    </Modal>
  );
}
