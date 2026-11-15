"use client";
import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useBusiness, repo } from "@/mocks/MockDataProvider";
import { remaining } from "@/mocks/adapters/business-repository";
import type { Slot } from "@/mocks/data/business";
import { useCopy } from "@/shared/lib/copy";
import { Link } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { AdminDeliveryApiPage } from "./AdminDeliveryApiPage";
import {
  AdminPage,
  Modal,
  Field,
  ErrorMessage,
  StatusBadge,
  Empty,
} from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
/** API mode: the real delivery setup (#7a). Mock mode keeps the demo slot editor. */
export function AdminDeliverySlotsPage() {
  const { source } = useRepositories();
  return source === "api" ? <AdminDeliveryApiPage /> : <SlotManager kind="delivery" />;
}
export function SlotManager({ kind }: { kind: Slot["kind"] }) {
  const c = useCopy(),
    d = useBusiness();
  const [edit, setEdit] = useState<Slot | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("week"),
    [offset, setOffset] = useState(0);
  const all = d.slots
    .filter((s) => s.kind === kind)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const dates = [...new Set(all.map((s) => s.date))];
  const visible = dates.slice(offset, offset + (view === "day" ? 1 : 7));
  const shown = all.filter((s) => visible.includes(s.date));
  function create() {
    setError("");
    setEdit({
      id: crypto.randomUUID(),
      kind,
      date: visible[0] ?? dates[0] ?? "",
      time: "19:00",
      capacity: kind === "delivery" ? 4 : 1,
      active: true,
    });
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      repo.saveSlot(edit!);
      setEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry");
    }
  }
  return (
    <AdminPage
      module={kind === "delivery" ? "deliverySlots" : "groomingCalendar"}
      title={c.text(
        kind === "delivery" ? "Delivery Slots" : "Grooming Calendar",
        kind === "delivery" ? "مواعيد التوصيل" : "تقويم العناية",
      )}
      subtitle={c.text(
        kind === "delivery"
          ? "Manual delivery capacity, separate from grooming. Qatar local time."
          : "One demo grooming resource. Two-hour windows allow packages up to 120 minutes. Qatar time.",
        kind === "delivery"
          ? "سعة توصيل يدوية منفصلة عن العناية. توقيت قطر."
          : "مورد عناية واحد تجريبي. فترات ساعتين لباقات حتى ١٢٠ دقيقة. توقيت قطر.",
      )}
      actions={
        <button
          type="button"
          className="button button--primary"
          onClick={create}
        >
          <Plus size={16} />
          {c.text("Add slot", "أضف موعداً")}
        </button>
      }
    >
      <div className="panel">
        <div className="row spread table-toolbar">
          <div className="chips">
            {["week", "day", "list"].map((v) => (
              <button
                type="button"
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => setView(v)}
              >
                {c.text(
                  v === "week" ? "Week" : v === "day" ? "Day" : "List",
                  v === "week" ? "أسبوع" : v === "day" ? "يوم" : "قائمة",
                )}
              </button>
            ))}
          </div>
          <div className="row">
            <button
              type="button"
              className="icon-button"
              disabled={offset === 0}
              aria-label={c.text("Previous dates", "التواريخ السابقة")}
              onClick={() =>
                setOffset(Math.max(0, offset - (view === "day" ? 1 : 7)))
              }
            >
              <ChevronLeft className="directional" size={18} />
            </button>
            <span>
              {visible[0]} — {visible.at(-1)}
            </span>
            <button
              type="button"
              className="icon-button"
              disabled={offset + (view === "day" ? 1 : 7) >= dates.length}
              aria-label={c.text("Next dates", "التواريخ التالية")}
              onClick={() => setOffset(offset + (view === "day" ? 1 : 7))}
            >
              <ChevronRight className="directional" size={18} />
            </button>
          </div>
        </div>
        {view === "list" ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    c.text("Date", "التاريخ"),
                    c.text("Time", "الوقت"),
                    c.text("Capacity", "السعة"),
                    c.text("Remaining", "المتبقي"),
                    c.text("Status", "الحالة"),
                    "",
                  ].map((h, i) => (
                    <th key={h || i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((s) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{s.time}</td>
                    <td>{s.capacity}</td>
                    <td>{remaining(d, s)}</td>
                    <td>
                      <StatusBadge value={s.active ? "available" : "closed"} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setError("");
                          setEdit({ ...s });
                        }}
                      >
                        {c.text("Edit", "تعديل")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`calendar-grid calendar-grid--${view}`}>
            {visible.map((date) => (
              <section key={date} className="calendar-day">
                <h2>
                  {new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-QA", {
                    weekday: "short",
                    timeZone: "Asia/Qatar",
                  }).format(new Date(`${date}T12:00:00Z`))}
                  <small>{date}</small>
                </h2>
                {shown
                  .filter((s) => s.date === date)
                  .map((s) => {
                    const booking = d.bookings.find(
                      (b) => b.slotId === s.id && b.status !== "cancelled",
                    );
                    const orders = d.orders.filter(
                      (o) => o.slotId === s.id && o.status !== "cancelled",
                    );
                    return (
                      <article
                        key={s.id}
                        className={`calendar-slot ${remaining(d, s) === 0 ? "calendar-slot--booked" : ""}`}
                      >
                        <strong>{s.time}</strong>
                        <span className="small">
                          {s.active
                            ? `${remaining(d, s)} ${c.text("available", "متاح")}`
                            : c.text("Closed", "مغلق")}
                        </span>
                        {booking && (
                          <Link
                            className="small text-link"
                            href={`/admin/bookings?search=${booking.id}`}
                          >
                            {booking.petName} · <bdi>{booking.id}</bdi>
                          </Link>
                        )}
                        {orders.map((o) => (
                          <Link
                            key={o.id}
                            className="small text-link"
                            href={`/admin/orders?search=${o.id}`}
                          >
                            <bdi>{o.id}</bdi>
                          </Link>
                        ))}
                        <button
                          type="button"
                          className="text-button small"
                          onClick={() => {
                            setError("");
                            setEdit({ ...s });
                          }}
                        >
                          {c.text("Manage", "إدارة")}
                        </button>
                      </article>
                    );
                  })}
              </section>
            ))}
          </div>
        )}
        {!all.length && (
          <Empty>
            {c.text(
              "No slots yet. Add availability.",
              "لا توجد مواعيد. أضف الإتاحة.",
            )}
          </Empty>
        )}
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) setEdit(null);
        }}
        title={c.text("Manage availability", "إدارة الإتاحة")}
      >
        {edit && (
          <form className="form-stack" onSubmit={save}>
            <div className="form-two">
              <Field label={c.text("Date · Qatar", "التاريخ · قطر")}>
                <input
                  type="date"
                  required
                  value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                />
              </Field>
              <Field label={c.text("Start time · Qatar", "وقت البداية · قطر")}>
                <input
                  type="time"
                  required
                  value={edit.time}
                  onChange={(e) => setEdit({ ...edit, time: e.target.value })}
                />
              </Field>
            </div>
            <Field label={c.text("Capacity", "السعة")}>
              <NumberInput
                min={1}
                max={kind === "grooming" ? 1 : 50}
                required
                value={edit.capacity}
                onChange={(e) =>
                  setEdit({ ...edit, capacity: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={c.text("Status", "الحالة")}>
              <select
                value={edit.active ? "open" : "closed"}
                onChange={(e) =>
                  setEdit({ ...edit, active: e.target.value === "open" })
                }
              >
                <option value="open">{c.text("Open", "مفتوح")}</option>
                <option value="closed">{c.text("Closed", "مغلق")}</option>
              </select>
            </Field>
            <p className="note-box small">
              {c.text(
                "Booked/held slots cannot be moved, reduced or closed. Cancel the associated order/booking first; no silent deletion.",
                "المواعيد المحجوزة لا تُنقل أو تُقلص أو تُغلق. ألغِ الطلب أو الحجز المرتبط أولاً.",
              )}
            </p>
            <ErrorMessage message={error} />
            <button type="submit" className="button button--primary">
              {c.text("Save availability", "احفظ الإتاحة")}
            </button>
          </form>
        )}
      </Modal>
    </AdminPage>
  );
}
