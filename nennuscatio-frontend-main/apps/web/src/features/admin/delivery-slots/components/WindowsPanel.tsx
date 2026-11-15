"use client";

import type { AdminDeliveryWindow } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { Link } from "@/i18n/navigation";
import { describeDeliveryError, useCreateWindow, useDeleteWindow, useDeliveryWindows } from "@/shared/api/admin-delivery";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { dateLabel, qatarToday, TIME_CHOICES, timeRange } from "../lib/delivery-labels";
import { NumberInput } from "@/shared/ui/NumberInput";
import { DeliveryWindowDialog } from "./DeliveryWindowDialog";

/** An extra window being added; one window is changed in `DeliveryWindowDialog`. */
type Draft = { date: string; start: string; end: string; capacity: number };

/**
 * Upcoming dated windows (D120). Each date can be closed, reopened or resized on its own; the
 * capacity can never go below the bookings a window already has. Extra windows can be added. A booked
 * window leads to its orders in the Orders page's "Deliveries by day" (D253), for roles that see orders.
 */
export function WindowsPanel() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("deliverySlots", "edit");
  const canDelete = access.can("deliverySlots", "delete");
  const canSeeOrders = access.canView("orders");
  const list = useDeliveryWindows();
  const create = useCreateWindow();
  const remove = useDeleteWindow();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [changing, setChanging] = useState<AdminDeliveryWindow | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  if (list.isPending || list.isError) {
    return <CatalogState status={list.isPending ? "loading" : "error"} retry={() => void list.refetch()} />;
  }

  const byDate = new Map<string, AdminDeliveryWindow[]>();
  for (const window of list.data.windows) byDate.set(window.date, [...(byDate.get(window.date) ?? []), window]);

  function open(next: Draft) {
    setError("");
    setDraft(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      await create.mutateAsync({ date: draft.date, start: draft.start, end: draft.end, capacity: draft.capacity });
      setDraft(null);
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  function askDelete(window: AdminDeliveryWindow) {
    const when = `${timeRange(window.start, window.end)}, ${dateLabel(window.date, c.locale)}`;
    setConfirming({
      title: c.text(`Delete the extra window ${when}?`, `حذف النافذة الإضافية ${when}؟`),
      message: c.text("Customers will no longer be able to choose it. This cannot be undone.", "لن يتمكن العملاء من اختيارها. لا يمكن التراجع عن ذلك."),
      confirmLabel: c.text("Delete window", "حذف النافذة"),
      run: () => del(window),
    });
  }

  async function del(window: AdminDeliveryWindow) {
    try {
      await remove.mutateAsync(window);
      setError("");
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  return (
    <section className="panel form-stack" aria-label={c.text("Upcoming delivery windows", "نوافذ التوصيل القادمة")}>
      <div className="row delivery-panel-head">
        <p className="small muted">
          {c.text(
            `Windows open automatically from the weekly schedule, ${list.data.from} to ${list.data.to}. A change here affects that one date only.`,
            `تُفتح النوافذ تلقائياً من الجدول الأسبوعي من ${list.data.from} إلى ${list.data.to}. التغيير هنا يخص ذلك التاريخ فقط.`,
          )}
        </p>
        {canEdit && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => open({ date: qatarToday(), start: "18:00", end: "21:00", capacity: 5 })}
          >
            {c.text("Add extra window", "إضافة نافذة إضافية")}
          </button>
        )}
      </div>
      <ErrorMessage message={draft ? "" : error} />
      {byDate.size === 0 ? (
        <p className="empty">
          {c.text("No windows yet. Add windows to the weekly schedule first.", "لا توجد نوافذ بعد. أضف نوافذ إلى الجدول الأسبوعي أولاً.")}
        </p>
      ) : (
        [...byDate].map(([date, windows]) => (
          <div key={date}>
            <h3 className="delivery-date">{dateLabel(date, c.locale)}</h3>
            <ul className="role-list">
              {windows.map((window) => {
                const full = window.booked >= window.capacity;
                return (
                  <li key={window.id}>
                    <div>
                      <strong dir="ltr">{timeRange(window.start, window.end)}</strong>
                      <span className="small muted">
                        {" · "}
                        {c.text(`${window.booked} of ${window.capacity} booked`, `${window.booked} من ${window.capacity} محجوزة`)}
                        {window.closed && ` · ${c.text("Closed", "مغلقة")}`}
                        {!window.closed && full && ` · ${c.text("Full", "ممتلئة")}`}
                        {window.source === "manual" && ` · ${c.text("Extra", "إضافية")}`}
                        {window.source === "schedule" && window.overridden && ` · ${c.text("Changed for this date", "معدلة لهذا التاريخ")}`}
                        {canSeeOrders && window.booked > 0 && (
                          <>
                            {" · "}
                            <Link
                              className="text-link"
                              href={`/admin/orders?date=${window.date}&time=${window.start}`}
                              aria-label={c.text(`See the orders for ${window.start} on ${window.date}`, `عرض طلبات ${window.start} في ${window.date}`)}
                            >
                              {c.text("See orders", "عرض الطلبات")}
                            </Link>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="row">
                      {canEdit && (
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`${c.text("Change", "تغيير")} ${date} ${window.start}`}
                          onClick={() => {
                            setError("");
                            setChanging(window);
                          }}
                        >
                          {c.text("Change", "تغيير")}
                        </button>
                      )}
                      {canDelete && window.source === "manual" && window.booked === 0 && (
                        <button type="button" className="text-button" aria-label={`${c.text("Delete", "حذف")} ${date} ${window.start}`} onClick={() => askDelete(window)}>
                          {c.text("Delete", "حذف")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      <Modal open={draft !== null} onOpenChange={(value) => !value && setDraft(null)} title={c.text("Add an extra window", "إضافة نافذة إضافية")}>
        {draft && (
          <form className="form-stack" onSubmit={submit}>
            <Field label={c.text("Date", "التاريخ")}>
              <input type="date" required min={qatarToday()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
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
            <Field label={c.text("Deliveries in this window", "عدد التوصيلات في هذه النافذة")}>
              <NumberInput required min={0} max={500} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} />
            </Field>
            <ErrorMessage message={error} />
            <div className="row">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>
                {c.text("Cancel", "إلغاء")}
              </button>
              <button type="submit" className="button button--primary" disabled={create.isPending}>
                {c.text("Add window", "أضف النافذة")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <DeliveryWindowDialog target={changing} onClose={() => setChanging(null)} />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
