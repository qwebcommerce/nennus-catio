"use client";

import type { AdminGroomingSlot, GroomingLocation } from "@nennus-catio/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeGroomingError } from "@/shared/api/grooming";
import { useGroomingSlots, useUpdateGroomingDay } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";
import { GroomingSlotDialog } from "./GroomingSlotDialog";

/** Every time on one date at once; one time is changed in `GroomingSlotDialog`. */
type Draft = { date: string; capacity: number; mostBooked: number; closed: boolean };

/**
 * The dated grooming times (9b): a week overview of every date's booked and free seats, and one date's
 * times. A time or a whole date can be closed, reopened or given fewer or more sections or buses,
 * never below the bookings it already has. Closing asks first (D128).
 */
export function GroomingTimesPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingCalendar", "edit");
  const canSeeBookings = access.canView("bookings");
  const [location, setLocation] = useState<GroomingLocation>("shop");
  const list = useGroomingSlots(location);
  const updateDay = useUpdateGroomingDay();
  const [selected, setSelected] = useState("");
  // The chosen date's times are below the whole overview: bring them into view when a date is clicked.
  const dayHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) dayHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [changing, setChanging] = useState<AdminGroomingSlot | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  const locations = (
    <fieldset className="admin-tabs" aria-label={c.text("Shop or home visits", "المتجر أو الزيارات المنزلية")}>
      {(["shop", "home"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={location === item}
          onClick={() => {
            setLocation(item);
            setSelected("");
          }}
        >
          {item === "shop" ? c.text("Shop", "المتجر") : c.text("Home visits", "الزيارات المنزلية")}
        </button>
      ))}
    </fieldset>
  );

  if (list.isPending || list.isError) {
    return (
      <section className="panel form-stack">
        {locations}
        <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />
      </section>
    );
  }

  const byDate = new Map<string, AdminGroomingSlot[]>();
  for (const slot of list.data.slots) byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), slot]);
  const day = selected || [...byDate.keys()][0] || "";
  const daySlots = byDate.get(day) ?? [];
  const unit = (count: number) =>
    location === "shop" ? c.text(`${count} section${count === 1 ? "" : "s"}`, `${count} قسم`) : c.text(`${count} bus${count === 1 ? "" : "es"}`, `${count} حافلة`);

  function summary(slots: AdminGroomingSlot[]) {
    const open = slots.filter((slot) => !slot.closed);
    const booked = slots.reduce((sum, slot) => sum + slot.booked, 0);
    const seats = open.reduce((sum, slot) => sum + slot.capacity, 0);
    if (open.length === 0) return c.text(`Closed · ${booked} booked`, `مغلق · ${booked} محجوز`);
    return c.text(`${booked} booked · ${Math.max(0, seats - booked)} free`, `${booked} محجوز · ${Math.max(0, seats - booked)} متاح`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      // A closed date stays closed; only its seats change.
      await updateDay.mutateAsync({ location, date: draft.date, closed: draft.closed, capacity: draft.capacity });
      setDraft(null);
      setError("");
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  function askCloseDay(date: string, slots: AdminGroomingSlot[]) {
    const booked = slots.reduce((sum, slot) => sum + slot.booked, 0);
    setConfirming({
      title: c.text(`Close ${dateLabel(date, c.locale)} to new bookings?`, `إغلاق ${dateLabel(date, c.locale)} أمام الحجوزات الجديدة؟`),
      message: c.text(
        booked > 0
          ? `Customers will no longer be able to book any time on this date. The ${booked} bookings already made stay. You can reopen it later.`
          : "Customers will no longer be able to book any time on this date. You can reopen it later.",
        booked > 0
          ? `لن يتمكن العملاء من حجز أي موعد في هذا التاريخ. تبقى الحجوزات القائمة (${booked}). يمكنك إعادة فتحه لاحقاً.`
          : "لن يتمكن العملاء من حجز أي موعد في هذا التاريخ. يمكنك إعادة فتحه لاحقاً.",
      ),
      confirmLabel: c.text("Close date", "إغلاق التاريخ"),
      run: () => setDayClosed(date, true),
    });
  }

  async function setDayClosed(date: string, closed: boolean) {
    try {
      await updateDay.mutateAsync({ location, date, closed, capacity: null });
      setError("");
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  const futureOf = (slots: AdminGroomingSlot[]) => slots.filter((slot) => Date.parse(slot.startsAt) > Date.now());

  return (
    <section className="panel form-stack" aria-label={c.text("Grooming times", "مواعيد العناية")}>
      {locations}
      <p className="small muted">
        {c.text(
          `Times open automatically from the weekly schedule, ${list.data.from} to ${list.data.to}. A change here affects that one date only.`,
          `تُفتح المواعيد تلقائياً من الجدول الأسبوعي من ${list.data.from} إلى ${list.data.to}. التغيير هنا يخص ذلك التاريخ فقط.`,
        )}
      </p>
      <ErrorMessage message={draft ? "" : error} />
      {byDate.size === 0 ? (
        <p className="empty">{c.text("No times yet. Add them to the weekly schedule first.", "لا توجد مواعيد بعد. أضفها إلى الجدول الأسبوعي أولاً.")}</p>
      ) : (
        <>
          <h3 className="delivery-date">{c.text("Week overview", "نظرة على الأسبوع")}</h3>
          <ul className="role-list" aria-label={c.text("Dates", "التواريخ")}>
            {[...byDate].map(([date, slots]) => {
              const future = futureOf(slots);
              const allClosed = future.length > 0 && future.every((slot) => slot.closed);
              return (
                <li key={date} className={date === day ? "is-selected" : undefined}>
                  <div>
                    <button type="button" className="text-button" aria-pressed={date === day} onClick={() => setSelected(date)}>
                      <strong>{dateLabel(date, c.locale)}</strong>
                    </button>
                    <span className="small muted">
                      {" · "}
                      {summary(slots)}
                    </span>
                    {date === day && <span className="small"> · {c.text("Times shown below", "المواعيد معروضة أدناه")}</span>}
                  </div>
                  {canEdit && future.length > 0 && (
                    <div className="row">
                      {allClosed ? (
                        <button type="button" className="text-button" aria-label={`${c.text("Reopen", "إعادة فتح")} ${date}`} onClick={() => void setDayClosed(date, false)}>
                          {c.text("Reopen", "إعادة فتح")}
                        </button>
                      ) : (
                        <button type="button" className="text-button" aria-label={`${c.text("Close", "إغلاق")} ${date}`} onClick={() => askCloseDay(date, future)}>
                          {c.text("Close", "إغلاق")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`${location === "shop" ? c.text("Sections on", "الأقسام في") : c.text("Buses on", "الحافلات في")} ${date}`}
                        onClick={() => {
                          setError("");
                          setDraft({
                            date,
                            capacity: future[0]?.capacity ?? 0,
                            mostBooked: Math.max(0, ...future.map((slot) => slot.booked)),
                            closed: allClosed,
                          });
                        }}
                      >
                        {location === "shop" ? c.text("Sections", "الأقسام") : c.text("Buses", "الحافلات")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="delivery-date grooming-day-heading" ref={dayHeading}>
            {dateLabel(day, c.locale)}
          </h3>
          <ul className="role-list" aria-label={c.text("Times on this date", "المواعيد في هذا التاريخ")}>
            {daySlots.map((slot) => {
              const started = Date.parse(slot.startsAt) <= Date.now();
              return (
                <li key={slot.id}>
                  <div>
                    <strong dir="ltr">{slot.end ? `${slot.start}–${slot.end}` : slot.start}</strong>
                    <span className="small muted">
                      {" · "}
                      {c.text(`${slot.booked} of ${unit(slot.capacity)} booked`, `${slot.booked} من ${unit(slot.capacity)} محجوز`)}
                      {slot.closed && ` · ${c.text("Closed", "مغلق")}`}
                      {!slot.closed && slot.booked >= slot.capacity && ` · ${c.text("Full", "ممتلئ")}`}
                      {slot.overridden && ` · ${c.text("Changed for this date", "معدل لهذا التاريخ")}`}
                      {/* Each booked time leads to its bookings on the Bookings page's day view (9f). */}
                      {canSeeBookings && slot.booked > 0 && (
                        <>
                          {" · "}
                          <Link
                            className="text-link"
                            href={`/admin/bookings?date=${slot.date}&location=${location}&time=${slot.start}`}
                            aria-label={c.text(`See the bookings at ${slot.start} on ${slot.date}`, `عرض حجوزات ${slot.start} في ${slot.date}`)}
                          >
                            {c.text("See bookings", "عرض الحجوزات")}
                          </Link>
                        </>
                      )}
                    </span>
                  </div>
                  {canEdit && !started && (
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`${c.text("Change", "تغيير")} ${slot.date} ${slot.start}`}
                      onClick={() => {
                        setError("");
                        setChanging(slot);
                      }}
                    >
                      {c.text("Change", "تغيير")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        open={draft !== null}
        onOpenChange={(value) => !value && setDraft(null)}
        title={draft ? c.text(`Every time on ${dateLabel(draft.date, "en")}`, `كل المواعيد في ${dateLabel(draft.date, "ar")}`) : ""}
        description={c.text("This changes this date only; the weekly schedule stays as it is.", "يغيّر هذا التاريخ فقط؛ ويبقى الجدول الأسبوعي كما هو.")}
      >
        {draft && (
          <form className="form-stack" onSubmit={submit}>
            <Field label={location === "shop" ? c.text("Grooming sections", "أقسام العناية") : c.text("Buses", "الحافلات")}>
              <NumberInput
                required
                min={draft.mostBooked}
                max={50}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
              />
            </Field>
            {draft.mostBooked > 0 && (
              <p className="small muted">
                {c.text(
                  `${draft.mostBooked} already booked: it cannot go lower, and closing keeps those bookings.`,
                  `${draft.mostBooked} محجوز بالفعل: لا يمكن الخفض أقل من ذلك، والإغلاق يُبقي تلك الحجوزات.`,
                )}
              </p>
            )}
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={updateDay.isPending}>
                {c.text("Save change", "احفظ التغيير")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <GroomingSlotDialog slot={changing} onClose={() => setChanging(null)} />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
