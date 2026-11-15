"use client";

import type { GroomingSettings } from "@nennus-catio/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { ApiError } from "@/shared/api/client";
import { describeGroomingError } from "@/shared/api/grooming";
import { useGroomingSettings, useSaveGroomingSettings } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { Button } from "@/shared/ui/Button";
import { CatalogState } from "@/shared/ui/CatalogState";
import { NumberInput } from "@/shared/ui/NumberInput";

type NumberKey = "holdMinutes" | "leadTimeMinutes" | "horizonDays" | "cleaningGapMinutes" | "cancelHours";

/** Hold time, lead time, booking range, start-time step, cleaning gap and cancellation deadline (9b). Version-checked. */
export function GroomingSettingsPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingCalendar", "edit");
  const settings = useGroomingSettings();
  const save = useSaveGroomingSettings();
  const [draft, setDraft] = useState<GroomingSettings | null>(null);
  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data);
  }, [settings.data, draft]);

  if (settings.isPending || settings.isError || !draft) {
    return <CatalogState status={settings.isError ? "error" : "loading"} retry={() => void settings.refetch()} />;
  }
  const conflict = save.error instanceof ApiError && save.error.code === "CONFLICT" && /Someone else/.test(save.error.message);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft) save.mutate(draft, { onSuccess: (saved) => setDraft(saved) });
  }

  function reload() {
    save.reset();
    setDraft(null);
    void settings.refetch();
  }

  const number = (key: NumberKey, label: string, hint: string, min: number, max: number) => (
    <Field label={label}>
      <NumberInput required min={min} max={max} readOnly={!canEdit} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} />
      <span className="small muted">{hint}</span>
    </Field>
  );

  return (
    <form className="panel form-stack" onSubmit={submit} aria-label={c.text("Grooming settings", "إعدادات العناية")}>
      {!canEdit && <p className="note-box">{c.text("Your role can view these settings but not change them.", "يمكن لدورك عرض هذه الإعدادات دون تعديلها.")}</p>}
      <div className="form-two">
        {number(
          "holdMinutes",
          c.text("Hold an unpaid booking (minutes)", "حجز الموعد غير المدفوع (دقائق)"),
          c.text("The time is kept for this long while the customer pays.", "يُحجز الموعد لهذه المدة أثناء الدفع."),
          5,
          120,
        )}
        {number(
          "leadTimeMinutes",
          c.text("Earliest booking after now (minutes)", "أقرب موعد من الآن (دقائق)"),
          c.text("For example 120 = the first time offered starts at least 2 hours from now.", "مثلاً 120 = أول موعد معروض يبدأ بعد ساعتين على الأقل."),
          0,
          2880,
        )}
        {number(
          "horizonDays",
          c.text("Days open for booking", "عدد الأيام المتاحة للحجز"),
          c.text("Times are offered this many days ahead.", "تُعرض المواعيد لهذا العدد من الأيام القادمة."),
          1,
          60,
        )}
        <Field label={c.text("Shop start times every", "مواعيد بدء المتجر كل")}>
          <select disabled={!canEdit} value={draft.stepMinutes} onChange={(e) => setDraft({ ...draft, stepMinutes: Number(e.target.value) as GroomingSettings["stepMinutes"] })}>
            {[15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {c.text(`${minutes} minutes`, `${minutes} دقيقة`)}
              </option>
            ))}
          </select>
          <span className="small muted">
            {c.text(
              "Changes only while no future shop time has bookings or changes made by hand.",
              "يتغير فقط ما دام لا يوجد حجز أو تغيير يدوي على مواعيد المتجر القادمة.",
            )}
          </span>
        </Field>
        {number(
          "cleaningGapMinutes",
          c.text("Cleaning time after each shop booking (minutes)", "وقت التنظيف بعد كل حجز في المتجر (دقائق)"),
          c.text("The section stays busy this much longer. 0 = none.", "يبقى القسم مشغولاً هذه المدة الإضافية. 0 = بلا.") ,
          0,
          120,
        )}
        {number(
          "cancelHours",
          c.text("Customers can cancel online until (hours before)", "يمكن للعملاء الإلغاء عبر الموقع حتى (ساعات قبل الموعد)"),
          c.text("After that they contact the shop.", "بعد ذلك يتواصلون مع المتجر."),
          0,
          168,
        )}
      </div>
      {save.isError && (
        <div className="form-error" role="alert">
          <p>
            {conflict
              ? c.text(
                  "Someone else saved the grooming settings while you were editing. Reload to see their changes.",
                  "حفظ شخص آخر إعدادات العناية أثناء تعديلك. أعد التحميل لرؤية التغييرات.",
                )
              : describeGroomingError(save.error, c.text)}
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
            {c.text("Save grooming settings", "احفظ إعدادات العناية")}
          </button>
        </div>
      )}
    </form>
  );
}
