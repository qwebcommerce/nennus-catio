"use client";

import type { DeliveryScheduleRule } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { describeDeliveryError, useDeleteRule, useDeliverySchedule, useSaveRule } from "@/shared/api/admin-delivery";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { TIME_CHOICES, timeRange, WEEK_ORDER, weekdayName } from "../lib/delivery-labels";
import { NumberInput } from "@/shared/ui/NumberInput";

type Draft = {
  rule: DeliveryScheduleRule | null;
  weekday: number;
  start: string;
  end: string;
  capacity: number;
  active: boolean;
};

/**
 * The weekly pattern (D120): set once, it opens the dated windows automatically. Changing a
 * window here updates the coming dates nobody changed by hand; dates with bookings keep them.
 */
export function SchedulePanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("deliverySlots", "edit");
  const canDelete = access.can("deliverySlots", "delete");
  const list = useDeliverySchedule();
  const save = useSaveRule();
  const remove = useDeleteRule();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  if (list.isPending || list.isError) {
    return <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />;
  }

  function edit(rule: DeliveryScheduleRule | null, weekday = 7) {
    setError("");
    setDraft(
      rule
        ? { rule, weekday: rule.weekday, start: rule.start, end: rule.end, capacity: rule.capacity, active: rule.active }
        : { rule: null, weekday, start: "09:00", end: "12:00", capacity: 10, active: true },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      await save.mutateAsync({
        rule: draft.rule,
        request: { weekday: draft.weekday, start: draft.start, end: draft.end, capacity: draft.capacity, active: draft.active },
      });
      setDraft(null);
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  function askDelete(rule: DeliveryScheduleRule) {
    const when = `${weekdayName(rule.weekday, c.locale)} ${timeRange(rule.start, rule.end)}`;
    setConfirming({
      title: c.text(`Delete the weekly window ${when}?`, `حذف النافذة الأسبوعية ${when}؟`),
      message: c.text(
        "It stops opening on future dates. Future dates without bookings are removed; dates that already have bookings keep them but close to new orders. To stop it for a while, edit it and untick \"In use\" instead.",
        "لن تُفتح في التواريخ القادمة. تُحذف التواريخ القادمة غير المحجوزة؛ وتحتفظ التواريخ المحجوزة بحجوزاتها لكنها تُغلق أمام الطلبات الجديدة. لإيقافها مؤقتاً، عدّلها وأزل تحديد «مفعلة» بدلاً من ذلك.",
      ),
      confirmLabel: c.text("Delete window", "حذف النافذة"),
      run: () => del(rule),
    });
  }

  async function del(rule: DeliveryScheduleRule) {
    try {
      await remove.mutateAsync(rule);
      setError("");
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  return (
    <section className="panel form-stack" aria-label={c.text("Weekly delivery schedule", "جدول التوصيل الأسبوعي")}>
      <div className="row delivery-panel-head">
        <p className="small muted">
          {c.text(
            "Set each day's windows once. Changes reach the coming dates that were not changed by hand; dates that already have bookings keep them.",
            "حدّد نوافذ كل يوم مرة واحدة. تصل التغييرات إلى التواريخ القادمة غير المعدلة يدوياً؛ وتحتفظ التواريخ المحجوزة بحجوزاتها.",
          )}
        </p>
        {canEdit && (
          <button type="button" className="button button--secondary" onClick={() => edit(null)}>
            {c.text("Add window", "إضافة نافذة")}
          </button>
        )}
      </div>
      <ErrorMessage message={draft ? "" : error} />
      {WEEK_ORDER.map((weekday) => {
        const rules = list.data.filter((rule) => rule.weekday === weekday);
        return (
          <div key={weekday}>
            <h3 className="delivery-date">{weekdayName(weekday, c.locale)}</h3>
            {rules.length === 0 ? (
              <p className="small muted">{c.text("No deliveries on this day.", "لا توصيل في هذا اليوم.")}</p>
            ) : (
              <ul className="role-list">
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <div>
                      <strong dir="ltr">{timeRange(rule.start, rule.end)}</strong>
                      <span className="small muted">
                        {" · "}
                        {c.text(`${rule.capacity} deliveries`, `${rule.capacity} توصيلات`)}
                        {!rule.active && ` · ${c.text("Paused", "متوقفة")}`}
                      </span>
                    </div>
                    <div className="row">
                      {canEdit && (
                        <button type="button" className="text-button" aria-label={`${c.text("Edit", "تعديل")} ${weekdayName(weekday, c.locale)} ${rule.start}`} onClick={() => edit(rule)}>
                          {c.text("Edit", "تعديل")}
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="text-button" aria-label={`${c.text("Delete", "حذف")} ${weekdayName(weekday, c.locale)} ${rule.start}`} onClick={() => askDelete(rule)}>
                          {c.text("Delete", "حذف")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <Modal
        open={draft !== null}
        onOpenChange={(value) => !value && setDraft(null)}
        title={draft?.rule ? c.text("Edit weekly window", "تعديل النافذة الأسبوعية") : c.text("New weekly window", "نافذة أسبوعية جديدة")}
      >
        {draft && (
          <form className="form-stack" onSubmit={submit}>
            <Field label={c.text("Day", "اليوم")}>
              <select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                {WEEK_ORDER.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {weekdayName(weekday, c.locale)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-two">
              <Field label={c.text("From", "من")}>
                <select value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })}>
                  {TIME_CHOICES.slice(0, -1).map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </Field>
              <Field label={c.text("To", "إلى")}>
                <select value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })}>
                  {TIME_CHOICES.slice(1).map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={c.text("Deliveries per window", "عدد التوصيلات لكل نافذة")}>
              <NumberInput
                required
                min={0}
                max={500}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
              />
            </Field>
            <label className="row">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              {c.text("In use (untick to pause this window)", "مفعلة (أزل التحديد لإيقاف هذه النافذة)")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {c.text("Save window", "احفظ النافذة")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
