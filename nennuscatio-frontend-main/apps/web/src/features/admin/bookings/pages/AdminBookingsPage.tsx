"use client";
import { Suspense, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  CalendarCheck,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Filter,
  Home,
  Search,
  Store,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { Photo } from "@/shared/ui/Photo";
import { AdminPage, Empty, Field, StatusBadge } from "@/shared/ui/BusinessUI";
import { Link } from "@/i18n/navigation";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import { useBookingsWorkspace } from "../BookingsWorkspace";
import { BookingDetailPanel, BookingStatus } from "../BookingDetailPanel";
import { AdminBookingsApiPage } from "./AdminBookingsApiPage";
import { NewBookingDialog } from "../BookingDialogs";
import {
  bookingDate,
  bookingMetrics,
  bookingRows,
  type BookingFilters,
  type BookingSort,
} from "../booking-list";

/** API mode: real bookings (9f). Mock mode keeps the demo page below. */
export function AdminBookingsPage() {
  if (useDataSourceOrNull() === "api") return <AdminBookingsApiPage />;
  return (
    <Suspense fallback={<p>…</p>}>
      <Bookings />
    </Suspense>
  );
}
function Bookings() {
  const c = useCopy(),
    d = useBusiness(),
    q = useSearchParams(),
    { date, setDate } = useDashboardDate(),
    { view, newOpen, setNewOpen } = useBookingsWorkspace();
  const defaults: BookingFilters = {
    search: q.get("search") ?? "",
    location: "",
    status: "",
    packageId: "",
    date: "",
    payment: "",
    sort: "date",
    descending: false,
  };
  const [filters, setFilters] = useState(defaults),
    [id, setId] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const panelRef = useRef<HTMLElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const b = d.bookings.find((b) => b.id === id),
    rows = bookingRows(d, filters, date),
    metrics = bookingMetrics(d, date),
    pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  function filter(patch: Partial<BookingFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }
  function open(next: string, button?: HTMLButtonElement) {
    opener.current = button ?? null;
    setId(next);
    requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
  }
  function close() {
    setId("");
    requestAnimationFrame(() => opener.current?.focus());
  }
  const headers: { name: string; key?: BookingSort }[] = [
    { name: c.text("Booking", "الحجز"), key: "id" },
    { name: c.text("Customer / Pet", "العميل / الحيوان"), key: "customer" },
    { name: c.text("Location", "الموقع"), key: "location" },
    { name: c.text("Package", "الباقة"), key: "package" },
    { name: c.text("Date & Time", "التاريخ والوقت"), key: "date" },
    { name: c.text("Assigned To", "الموظف المسؤول") },
    { name: c.text("Payment", "الدفع"), key: "payment" },
    { name: c.text("Status", "الحالة"), key: "status" },
  ];
  return (
    <AdminPage
      module="bookings"
      title={c.text("Bookings", "الحجوزات")}
      subtitle={c.text(
        "Manage grooming appointments, schedules and availability.",
        "إدارة مواعيد العناية والجداول والتوفر.",
      )}
    >
      <div
        className={`orders-layout bookings-layout ${b ? "orders-layout--detail" : ""}`}
      >
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics bookings-metrics">
            <AdminMetric
              icon={CalendarCheck}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Bookings Today", "حجوزات اليوم")}
              value={metrics.today}
              note={c.text(
                `${metrics.remaining} remaining today`,
                `${metrics.remaining} متبقية اليوم`,
              )}
            />
            <AdminMetric
              icon={CalendarClock}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Upcoming Bookings", "الحجوزات القادمة")}
              value={metrics.upcoming}
              note={c.text("Next 7 days", "الأيام السبعة القادمة")}
            />
            <AdminMetric
              icon={TriangleAlert}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Needs Action", "تحتاج إلى إجراء")}
              value={metrics.attention}
              note={c.text(
                `${metrics.attention} require attention`,
                `${metrics.attention} تحتاج إلى متابعة`,
              )}
            />
            <AdminMetric
              icon={CheckCircle2}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Completed Today", "المكتملة اليوم")}
              value={metrics.completed}
              note={c.text("Completed", "مكتملة")}
            />
          </div>
          <div className="panel orders-records bookings-records">
            <div className="bookings-tabs-row">
              <fieldset
                className="admin-tabs"
                aria-label={c.text("Booking locations", "مواقع الحجوزات")}
              >
                {[
                  ["", c.text("All Bookings", "جميع الحجوزات")],
                  ["in-store", c.text("In-Store", "في المتجر")],
                  ["home", c.text("Home Service", "خدمة منزلية")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filters.location === value}
                    onClick={() => filter({ location: value })}
                  >
                    {label} (
                    {
                      d.bookings.filter((b) => !value || b.location === value)
                        .length
                    }
                    )
                  </button>
                ))}
              </fieldset>
              <Link
                href="/admin/grooming-calendar"
                className="bookings-availability"
              >
                {c.text("Manage Availability", "إدارة التوفر")}
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="orders-filter-toolbar bookings-filters">
              <label className="orders-search">
                <Search size={16} />
                <input
                  aria-label={c.text(
                    "Search booking, customer, pet",
                    "ابحث عن الحجز أو العميل أو الحيوان",
                  )}
                  placeholder={c.text(
                    "Search booking, customer, pet…",
                    "ابحث عن الحجز أو العميل أو الحيوان…",
                  )}
                  value={filters.search}
                  onChange={(e) => filter({ search: e.target.value })}
                />
              </label>
              <select
                aria-label={c.text("Booking status", "حالة الحجز")}
                value={filters.status}
                onChange={(e) => filter({ status: e.target.value })}
              >
                <option value="">{c.text("Status", "الحالة")}</option>
                {[
                  ["confirmed", c.text("Confirmed", "مؤكد")],
                  ["pending", c.text("Pending", "قيد الانتظار")],
                  ["processing", c.text("In Progress", "قيد التنفيذ")],
                  ["completed", c.text("Completed", "مكتمل")],
                  ["cancelled", c.text("Cancelled", "ملغي")],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label={c.text("Booking package", "باقة الحجز")}
                value={filters.packageId}
                onChange={(e) => filter({ packageId: e.target.value })}
              >
                <option value="">{c.text("Package", "الباقة")}</option>
                {d.packages.map((p) => (
                  <option value={p.id} key={p.id}>
                    {c.local(p.name)}
                  </option>
                ))}
              </select>
              <select
                aria-label={c.text("Booking date range", "فترة الحجوزات")}
                value={filters.date}
                onChange={(e) => filter({ date: e.target.value })}
              >
                <option value="">{c.text("Date", "التاريخ")}</option>
                <option value="today">
                  {c.text("Selected day", "اليوم المحدد")}
                </option>
                <option value="week">
                  {c.text("Next 7 days", "الأيام السبعة القادمة")}
                </option>
                <option value="past">
                  {c.text("Before selected day", "قبل اليوم المحدد")}
                </option>
              </select>
              <button
                type="button"
                className="button button--secondary"
                aria-expanded={more}
                aria-controls="booking-more-filters"
                onClick={() => setMore(!more)}
              >
                <Filter size={15} />
                {c.text("More Filters", "فلاتر إضافية")}
              </button>
            </div>
            {more && (
              <div id="booking-more-filters" className="bookings-more-filters">
                <Field label={c.text("Payment", "الدفع")}>
                  <select
                    value={filters.payment}
                    onChange={(e) => filter({ payment: e.target.value })}
                  >
                    <option value="">{c.text("All", "الكل")}</option>
                    <option value="paid">{c.text("Paid", "مدفوع")}</option>
                    <option value="pending">
                      {c.text("Pending", "قيد الانتظار")}
                    </option>
                  </select>
                </Field>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFilters({ ...defaults, search: "" });
                    setPage(1);
                  }}
                >
                  {c.text("Reset filters", "إعادة تعيين الفلاتر")}
                </button>
              </div>
            )}
            {selected.length > 0 && (
              <div className="orders-selection-bar">
                {c.text(
                  `${selected.length} selected · No bulk changes`,
                  `${selected.length} محددة · دون تغييرات جماعية`,
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSelected([])}
                >
                  {c.text("Clear selection", "إلغاء التحديد")}
                </button>
              </div>
            )}
            {view === "list" ? (
              <>
                <section
                  className="orders-table-scroll"
                  aria-label={c.text("Bookings table", "جدول الحجوزات")}
                >
                  <table className="orders-table bookings-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={c.text(
                              "Select visible bookings",
                              "تحديد الحجوزات الظاهرة",
                            )}
                            checked={
                              visible.length > 0 &&
                              visible.every((b) => selected.includes(b.id))
                            }
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [
                                      ...new Set([
                                        ...selected,
                                        ...visible.map((b) => b.id),
                                      ]),
                                    ]
                                  : selected.filter(
                                      (id) => !visible.some((b) => b.id === id),
                                    ),
                              )
                            }
                          />
                        </th>
                        {headers.map((h) => (
                          <th
                            key={h.name}
                            aria-sort={
                              h.key === filters.sort
                                ? filters.descending
                                  ? "descending"
                                  : "ascending"
                                : undefined
                            }
                          >
                            {h.key ? (
                              <button
                                type="button"
                                onClick={() =>
                                  filter({
                                    sort: h.key,
                                    descending:
                                      h.key === filters.sort
                                        ? !filters.descending
                                        : false,
                                  })
                                }
                              >
                                {h.name}
                                <ArrowUpDown size={11} />
                              </button>
                            ) : (
                              h.name
                            )}
                          </th>
                        ))}
                        <th>
                          <span className="sr-only">
                            {c.text("Actions", "إجراءات")}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((booking) => {
                        const slot = d.slots.find(
                            (s) => s.id === booking.slotId,
                          ),
                          pkg = d.packages.find(
                            (p) => p.id === booking.packageId,
                          ),
                          guest = d.guests.find(
                            (g) => g.id === booking.customerId,
                          ),
                          LocationIcon =
                            booking.location === "home" ? Home : Store;
                        return (
                          <tr
                            key={booking.id}
                            className={id === booking.id ? "is-selected" : ""}
                          >
                            <td>
                              <input
                                type="checkbox"
                                aria-label={c.text(
                                  `Select ${booking.id}`,
                                  `تحديد ${booking.id}`,
                                )}
                                checked={selected.includes(booking.id)}
                                onChange={(e) =>
                                  setSelected(
                                    e.target.checked
                                      ? [...selected, booking.id]
                                      : selected.filter(
                                          (id) => id !== booking.id,
                                        ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="orders-reference-button"
                                aria-label={c.text(
                                  `Open booking ${booking.id}`,
                                  `فتح الحجز ${booking.id}`,
                                )}
                                onClick={(e) =>
                                  open(booking.id, e.currentTarget)
                                }
                              >
                                <bdi>{booking.id}</bdi>
                              </button>
                              <small>
                                {slot ? bookingDate(slot.date, c.locale) : "—"}
                                {slot && (
                                  <>
                                    {" "}
                                    · <bdi>{slot.time}</bdi>
                                  </>
                                )}
                              </small>
                            </td>
                            <td>
                              <div className="booking-pet-cell">
                                <Photo
                                  src={pkg?.image ?? ""}
                                  alt=""
                                  sizes="36px"
                                />
                                <span>
                                  <strong>{booking.petName}</strong>
                                  <small>
                                    {guest?.name ??
                                      c.text("Unavailable", "غير متوفر")}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="orders-fulfilment-cell">
                                <LocationIcon size={17} />
                                {booking.location === "home"
                                  ? c.text("Home Service", "خدمة منزلية")
                                  : c.text("In-Store", "في المتجر")}
                              </span>
                            </td>
                            <td>
                              {pkg
                                ? pkg.tier === "basic"
                                  ? c.text("Basic", "أساسية")
                                  : c.text("Full", "كاملة")
                                : c.local(booking.packageName)}
                            </td>
                            <td>
                              {slot ? (
                                <>
                                  <span>
                                    {bookingDate(slot.date, c.locale)}
                                  </span>
                                  <small>
                                    <bdi>{slot.time}</bdi>{" "}
                                    {c.text("(Qatar)", "(قطر)")}
                                  </small>
                                </>
                              ) : (
                                c.text("Unavailable", "غير متوفر")
                              )}
                            </td>
                            <td>
                              <span className="booking-assignee">
                                <UserRound size={15} />
                                <span>{c.text("Unassigned", "غير معيّن")}</span>
                              </span>
                            </td>
                            <td>
                              <StatusBadge value={booking.payment} />
                            </td>
                            <td>
                              <BookingStatus booking={booking} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={c.text(
                                  `Details for ${booking.id}`,
                                  `تفاصيل ${booking.id}`,
                                )}
                                onClick={(e) =>
                                  open(booking.id, e.currentTarget)
                                }
                              >
                                <Ellipsis size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
                {!rows.length && (
                  <Empty>
                    {c.text(
                      "No matching bookings. Try resetting the filters.",
                      "لا توجد حجوزات مطابقة. جرّب إعادة تعيين الفلاتر.",
                    )}
                  </Empty>
                )}
                <div className="orders-pagination">
                  <nav aria-label={c.text("Booking pages", "صفحات الحجوزات")}>
                    <button
                      type="button"
                      aria-label={c.text("Previous page", "الصفحة السابقة")}
                      disabled={current <= 1}
                      onClick={() => setPage(current - 1)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: pages }, (_, i) => i + 1)
                      .filter(
                        (n) =>
                          n === 1 || n === pages || Math.abs(n - current) <= 1,
                      )
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-current={current === n ? "page" : undefined}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </button>
                      ))}
                    <button
                      type="button"
                      aria-label={c.text("Next page", "الصفحة التالية")}
                      disabled={current >= pages}
                      onClick={() => setPage(current + 1)}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </nav>
                  <span>
                    {c.text(
                      `Showing ${rows.length ? (current - 1) * pageSize + 1 : 0}–${Math.min(current * pageSize, rows.length)} of ${rows.length} bookings`,
                      `عرض ${rows.length ? (current - 1) * pageSize + 1 : 0}–${Math.min(current * pageSize, rows.length)} من ${rows.length} حجز`,
                    )}
                  </span>
                  <select
                    aria-label={c.text(
                      "Bookings per page",
                      "الحجوزات لكل صفحة",
                    )}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 20].map((n) => (
                      <option key={n} value={n}>
                        {c.text(`${n} per page`, `${n} لكل صفحة`)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <section
                className="bookings-calendar"
                aria-label={c.text("Booking calendar", "تقويم الحجوزات")}
              >
                <div className="bookings-calendar-heading">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={c.text("Previous week", "الأسبوع السابق")}
                    onClick={() => setDate(shiftDay(date, -7))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <strong>
                    {bookingDate(date, c.locale)} –{" "}
                    {bookingDate(shiftDay(date, 6), c.locale)}
                  </strong>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={c.text("Next week", "الأسبوع القادم")}
                    onClick={() => setDate(shiftDay(date, 7))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="bookings-calendar-grid">
                  {Array.from({ length: 7 }, (_, i) => shiftDay(date, i)).map(
                    (day) => (
                      <section key={day}>
                        <h3>{bookingDate(day, c.locale)}</h3>
                        {rows
                          .filter(
                            (b) =>
                              d.slots.find((s) => s.id === b.slotId)?.date ===
                              day,
                          )
                          .map((b) => (
                            <button
                              type="button"
                              key={b.id}
                              aria-label={c.text(
                                `Open booking ${b.id}`,
                                `فتح الحجز ${b.id}`,
                              )}
                              onClick={(e) => open(b.id, e.currentTarget)}
                            >
                              <bdi>
                                {d.slots.find((s) => s.id === b.slotId)?.time}
                              </bdi>
                              <strong>{b.petName}</strong>
                              <small>{c.local(b.packageName)}</small>
                              <BookingStatus booking={b} />
                            </button>
                          ))}
                        {!rows.some(
                          (b) =>
                            d.slots.find((s) => s.id === b.slotId)?.date ===
                            day,
                        ) && <p>{c.text("No bookings", "لا توجد حجوزات")}</p>}
                      </section>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
          <p className="orders-demo-note">
            {c.text(
              "Synthetic booking records · Qatar time · Images are illustrative · Staff assignment is not connected",
              "حجوزات تجريبية · توقيت قطر · الصور توضيحية · تعيين الموظفين غير متصل",
            )}
          </p>
        </div>
        {b && (
          <BookingDetailPanel
            key={b.id}
            booking={b}
            close={close}
            panelRef={panelRef}
          />
        )}
      </div>
      {newOpen && (
        <NewBookingDialog
          close={() => setNewOpen(false)}
          onCreated={(id) => {
            setFilters({ ...defaults, search: "", descending: true });
            setPage(1);
            open(id);
          }}
        />
      )}
    </AdminPage>
  );
}
