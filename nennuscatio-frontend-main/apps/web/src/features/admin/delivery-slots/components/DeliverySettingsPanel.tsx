"use client";

import type { DeliverySettings } from "@nennus-catio/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { describeDeliveryError, useDeliverySettings, useSaveDeliverySettings } from "@/shared/api/admin-delivery";
import { ApiError } from "@/shared/api/client";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { Button } from "@/shared/ui/Button";
import { CatalogState } from "@/shared/ui/CatalogState";
import { NumberInput } from "@/shared/ui/NumberInput";

/** Hold time, lead time, booking horizon and pickup (D116, D118). Version-checked. */
export function DeliverySettingsPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("deliverySlots", "edit");
  const settings = useDeliverySettings();
  const save = useSaveDeliverySettings();
  const [draft, setDraft] = useState<DeliverySettings | null>(null);
  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data);
  }, [settings.data, draft]);

  if (settings.isPending || settings.isError || !draft) {
    return (
      <CatalogState status={settings.isError ? "error" : "loading"} retry={() => void settings.refetch()} />
    );
  }
  const conflict = save.error instanceof ApiError && save.error.code === "CONFLICT";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft) save.mutate(draft, { onSuccess: (saved) => setDraft(saved) });
  }

  function reload() {
    save.reset();
    setDraft(null);
    void settings.refetch();
  }

  const number = (key: "holdMinutes" | "leadTimeMinutes" | "horizonDays", label: string, hint: string, min: number, max: number) => (
    <Field label={label}>
      <NumberInput
        required
        min={min}
        max={max}
        readOnly={!canEdit}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
      <span className="small muted">{hint}</span>
    </Field>
  );

  return (
    <form className="panel form-stack" onSubmit={submit} aria-label={c.text("Delivery settings", "إعدادات التوصيل")}>
      {!canEdit && (
        <p className="note-box">{c.text("Your role can view these settings but not change them.", "يمكن لدورك عرض هذه الإعدادات دون تعديلها.")}</p>
      )}
      <div className="form-two">
        {number(
          "holdMinutes",
          c.text("Hold an unpaid order (minutes)", "حجز الطلب غير المدفوع (دقائق)"),
          c.text("Stock and the delivery window are kept for this long while the customer pays.", "تُحجز الكمية ونافذة التوصيل لهذه المدة أثناء الدفع."),
          5,
          120,
        )}
        {number(
          "leadTimeMinutes",
          c.text("Earliest window after ordering (minutes)", "أقرب نافذة بعد الطلب (دقائق)"),
          c.text("For example 120 = the first window must start at least 2 hours after the order.", "مثلاً 120 = يجب أن تبدأ أول نافذة بعد ساعتين على الأقل من الطلب."),
          0,
          2880,
        )}
        {number(
          "horizonDays",
          c.text("Days open for booking", "عدد الأيام المتاحة للحجز"),
          c.text("Windows are offered this many days ahead.", "تُعرض النوافذ لهذا العدد من الأيام القادمة."),
          1,
          60,
        )}
      </div>
      <label className="row">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={draft.pickupEnabled}
          onChange={(e) => setDraft({ ...draft, pickupEnabled: e.target.checked })}
        />
        {c.text("Customers can pick up from the shop (no fee, no window)", "يمكن للعملاء الاستلام من المتجر (بلا رسوم ولا نافذة)")}
      </label>
      <div className="form-two">
        {(["en", "ar"] as const).map((lang) => (
          <Field key={lang} label={`${c.text("Pickup instructions", "تعليمات الاستلام")} · ${lang === "en" ? "English" : "العربية"}`}>
            <textarea
              maxLength={500}
              readOnly={!canEdit}
              dir={lang === "ar" ? "rtl" : "ltr"}
              value={draft.pickupInstructions[lang]}
              onChange={(e) => setDraft({ ...draft, pickupInstructions: { ...draft.pickupInstructions, [lang]: e.target.value } })}
            />
          </Field>
        ))}
      </div>
      {save.isError && (
        <div className="form-error" role="alert">
          <p>
            {conflict
              ? c.text(
                  "Someone else saved the delivery settings while you were editing. Reload to see their changes.",
                  "حفظ شخص آخر إعدادات التوصيل أثناء تعديلك. أعد التحميل لرؤية التغييرات.",
                )
              : describeDeliveryError(save.error, c.text)}
          </p>
          {conflict && (
            <Button variant="secondary" onClick={reload}>
              {c.text("Reload settings", "أعد تحميل الإعدادات")}
            </Button>
          )}
        </div>
      )}
      {save.isSuccess && <p role="status">{c.text("Saved.", "تم الحفظ.")}</p>}
      {canEdit && (
        <div>
          <button type="submit" className="button button--primary" disabled={save.isPending}>
            {c.text("Save delivery settings", "احفظ إعدادات التوصيل")}
          </button>
        </div>
      )}
    </form>
  );
}
