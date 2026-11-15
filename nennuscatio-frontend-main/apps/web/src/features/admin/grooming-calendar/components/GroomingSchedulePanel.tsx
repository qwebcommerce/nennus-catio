"use client";

import type { GroomingLocation, GroomingScheduleRule } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { TIME_CHOICES, WEEK_ORDER, weekdayName } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeGroomingError } from "@/shared/api/grooming";
import { useDeleteGroomingRule, useGroomingSchedule, useSaveGroomingRule } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

type Draft = {
  rule: GroomingScheduleRule | null;
  location: GroomingLocation;
  weekday: number;
  start: string;
  end: string;
  capacity: number;
  active: boolean;
};

/**
 * The weekly grooming schedule (9b): the shop's opening hours with their sections, and the home visit
 * times with their buses (D112, D114). Set once, it opens the dated times automatically; a change
 * updates the coming dates nobody changed by hand, and times with bookings keep them.
 */
export function GroomingSchedulePanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingCalendar", "edit");
  const canDelete = access.can("groomingCalendar", "delete");
  const list = useGroomingSchedule();
  const save = useSaveGroomingRule();
  const remove = useDeleteGroomingRule();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  if (list.isPending || list.isError) {
    return <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />;
  }
  const rules = list.data;
  const describe = (rule: GroomingScheduleRule) =>
    `${weekdayName(rule.weekday, c.locale)} ${rule.end ? `${rule.start}–${rule.end}` : rule.start}`;
  const seats = (rule: { location: GroomingLocation; capacity: number }) =>
    rule.location === "shop"
      ? c.text(`${rule.capacity} section${rule.capacity === 1 ? "" : "s"}`, `${rule.capacity} قسم`)
      : c.text(`${rule.capacity} bus${rule.capacity === 1 ? "" : "es"}`, `${rule.capacity} حافلة`);

  function edit(rule: GroomingScheduleRule | null, location: GroomingLocation, weekday = 7) {
    setError("");
    setDraft(
      rule
        ? { rule, location: rule.location, weekday: rule.weekday, start: rule.start, end: rule.end ?? "", capacity: rule.capacity, active: rule.active }
        : location === "shop"
          ? { rule: null, location, weekday, start: "10:00", end: "20:00", capacity: 3, active: true }
          : { rule: null, location, weekday, start: "09:00", end: "", capacity: 4, active: true },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const current = draft;
    // Turning a line off removes its coming times (booked ones stay, closed), so it asks first (D128).
    if (current.rule?.active && !current.active) {
      setConfirming({
        title: c.text(`Stop ${describe(current.rule)}?`, `إيقاف ${describe(current.rule)}؟`),
        message: c.text(
          "Its coming times without bookings are removed; times that already have bookings keep them but close to new bookings. You can turn it on again later.",
          "تُحذف مواعيده القادمة غير المحجوزة؛ وتحتفظ المواعيد المحجوزة بحجوزاتها لكنها تُغلق أمام الحجوزات الجديدة. يمكنك تشغيله لاحقاً.",
        ),
        confirmLabel: c.text("Stop it", "إيقافه"),
        run: () => persist(current),
      });
      return;
    }
    await persist(current);
  }

  async function persist(current: Draft) {
    try {
      await save.mutateAsync({
        rule: current.rule,
        request: {
          location: current.location,
          weekday: current.weekday,
          start: current.start,
          end: current.location === "shop" ? current.end : null,
          capacity: current.capacity,
          active: current.active,
        },
      });
      setDraft(null);
      setError("");
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  function askDelete(rule: GroomingScheduleRule) {
    setConfirming({
      title: c.text(`Delete ${describe(rule)}?`, `حذف ${describe(rule)}؟`),
      message: c.text(
        "It stops opening on future dates. Coming times without bookings are removed; times that already have bookings keep them but close to new bookings. To stop it for a while, edit it and untick \"In use\" instead.",
        "لن يُفتح في التواريخ القادمة. تُحذف المواعيد القادمة غير المحجوزة؛ وتحتفظ المواعيد المحجوزة بحجوزاتها لكنها تُغلق أمام الحجوزات الجديدة. لإيقافه مؤقتاً، عدّله وأزل تحديد «مستخدم» بدلاً من ذلك.",
      ),
      confirmLabel: c.text("Delete", "حذف"),
      run: async () => {
        try {
          await remove.mutateAsync(rule);
          setError("");
        } catch (err) {
          setError(describeGroomingError(err, c.text));
        }
      },
    });
  }

  const section = (location: GroomingLocation) => {
    const own = rules.filter((rule) => rule.location === location);
    const title = location === "shop" ? c.text("Shop opening hours", "ساعات عمل المتجر") : c.text("Home visit times", "مواعيد الزيارات المنزلية");
    return (
      <section className="delivery-city" aria-label={title}>
        <div className="row delivery-city__head">
          <div>
            <h3 className="delivery-date">{title}</h3>
            <span className="small muted">
              {location === "shop"
                ? c.text("A booking takes one section for the package's length.", "يأخذ الحجز قسماً واحداً طوال مدة الباقة.")
                : c.text("Each visit time takes one booking per bus. Leave enough time between visits for grooming and travel.", "يأخذ كل موعد زيارة حجزاً واحداً لكل حافلة. اترك وقتاً كافياً بين الزيارات للعناية والتنقل.")}
            </span>
          </div>
          {canEdit && (
            <button type="button" className="button button--secondary" onClick={() => edit(null, location)}>
              {location === "shop" ? c.text("Add opening hours", "إضافة ساعات عمل") : c.text("Add visit time", "إضافة موعد زيارة")}
            </button>
          )}
        </div>
        {own.length === 0 ? (
          <p className="small muted">{c.text("Nothing yet: customers cannot book these.", "لا شيء بعد: لا يمكن للعملاء الحجز.")}</p>
        ) : (
          WEEK_ORDER.map((weekday) => {
            const day = own.filter((rule) => rule.weekday === weekday);
            if (day.length === 0) return null;
            return (
              <div key={weekday}>
                <strong>{weekdayName(weekday, c.locale)}</strong>
                <ul className="role-list">
                  {day.map((rule) => (
                    <li key={rule.id}>
                      <div>
                        <strong dir="ltr">{rule.end ? `${rule.start}–${rule.end}` : rule.start}</strong>
                        <span className="small muted">
                          {" · "}
                          {seats(rule)}
                          {!rule.active && ` · ${c.text("Not in use", "غير مستخدم")}`}
                        </span>
                      </div>
                      <div className="row">
                        {canEdit && (
                          <button type="button" className="text-button" aria-label={`${c.text("Edit", "تعديل")} ${describe(rule)}`} onClick={() => edit(rule, location)}>
                            {c.text("Edit", "تعديل")}
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="text-button" aria-label={`${c.text("Delete", "حذف")} ${describe(rule)}`} onClick={() => askDelete(rule)}>
                            {c.text("Delete", "حذف")}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    );
  };

  return (
    <section className="panel form-stack" aria-label={c.text("Weekly grooming schedule", "الجدول الأسبوعي للعناية")}>
      <ErrorMessage message={draft ? "" : error} />
      {section("shop")}
      {section("home")}
      <Modal
        open={draft !== null}
        onOpenChange={(value) => !value && setDraft(null)}
        title={
          draft?.location === "home"
            ? draft.rule
              ? c.text("Edit visit time", "تعديل موعد الزيارة")
              : c.text("New visit time", "موعد زيارة جديد")
            : draft?.rule
              ? c.text("Edit opening hours", "تعديل ساعات العمل")
              : c.text("New opening hours", "ساعات عمل جديدة")
        }
        description={c.text(
          "Coming dates nobody changed by hand follow this at once; times with bookings keep them.",
          "تتبع التواريخ القادمة التي لم يغيّرها أحد يدوياً هذا فوراً؛ وتحتفظ المواعيد المحجوزة بحجوزاتها.",
        )}
      >
        {draft && (
          <form className="form-stack" onSubmit={submit}>
            <Field label={c.text("Day of the week", "يوم الأسبوع")}>
              <select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                {WEEK_ORDER.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {weekdayName(weekday, c.locale)}
                  </option>
                ))}
              </select>
            </Field>
            {draft.location === "shop" ? (
              <div className="form-two">
                <Field label={c.text("Opens", "يفتح")}>
                  <select value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })}>
                    {TIME_CHOICES.slice(0, -1).map((time) => (
                      <option key={time}>{time}</option>
                    ))}
                  </select>
                </Field>
                <Field label={c.text("Closes", "يغلق")}>
                  <select value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })}>
                    {TIME_CHOICES.slice(1).map((time) => (
                      <option key={time}>{time}</option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <Field label={c.text("Visit time", "موعد الزيارة")}>
                <input type="time" required step={300} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </Field>
            )}
            <Field label={draft.location === "shop" ? c.text("Grooming sections", "أقسام العناية") : c.text("Buses", "الحافلات")}>
              <NumberInput required min={0} max={50} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} />
            </Field>
            <label className="row">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              {c.text("In use", "مستخدم")}
            </label>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {c.text("Save", "احفظ")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
