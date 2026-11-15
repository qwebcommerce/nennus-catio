"use client";

import {
  ADMIN_BOOKING_PAGE_SIZES,
  type AdminBookingSort,
  type AdminBookingSummary,
  type BookingStatus,
  type GroomingLocation,
  localDateSchema,
} from "@nennus-catio/contracts";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Home,
  Scissors,
  Search,
  Store,
  TriangleAlert,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import { dateLabel, qatarToday } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { placedAt } from "@/features/admin/orders/lib/admin-order-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  type AdminBookingFilters,
  adminBookingSearch,
  BOOKING_DAY_LIMIT,
  BOOKING_DAY_STATUSES,
  bookingDayFilters,
  describeAdminBookingError,
  emptyAdminBookingFilters,
  useAdminBookings,
} from "@/shared/api/admin-bookings";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { AdminPage, Empty, ErrorMessage } from "@/shared/ui/BusinessUI";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { BookingApiDetail, BookingStatusBadge } from "../components/BookingApiDetail";
import { ADMIN_BOOKING_STATUS, BOOKING_STATUS_FILTER_ORDER } from "../lib/booking-labels";

/**
 * Real grooming bookings (9f): summary cards, search, filters, sorting and pages from
 * `/api/admin/bookings`, a day view of one date's appointments (the Grooming calendar links each
 * booked time here), a detail panel with the staff actions, and the CSV for roles with Export.
 * Staff do not enter bookings here (plan question 6): customers book on the website.
 */
export function AdminBookingsApiPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <BookingsApi />
    </Suspense>
  );
}

const SORTS: readonly { value: AdminBookingSort; en: string; ar: string }[] = [
  { value: "appointment", en: "Appointment time", ar: "موعد العناية" },
  { value: "newest", en: "Newest first", ar: "الأحدث أولاً" },
  { value: "oldest", en: "Oldest first", ar: "الأقدم أولاً" },
  { value: "total", en: "Highest total", ar: "الأعلى قيمة" },
];

function BookingsApi() {
  const c = useCopy();
  const canExport = useAdminAccess().can("bookings", "export");
  const params = useSearchParams();
  const link = params.toString();
  const linkedSearch = params.get("search") ?? "";
  // A real calendar date only: an impossible one typed into the address (2026-02-30) is ignored.
  const dateParam = params.get("date") ?? "";
  const linkedDate = localDateSchema.safeParse(dateParam).success ? dateParam : "";
  const linkedLocation = params.get("location");
  const linkedDayLocation: "" | GroomingLocation = linkedLocation === "shop" || linkedLocation === "home" ? linkedLocation : "";
  const linkedTime = params.get("time") ?? "";
  const [view, setView] = useState<"list" | "day">(linkedDate ? "day" : "list");
  const [day, setDay] = useState(linkedDate || qatarToday());
  const [dayLocation, setDayLocation] = useState<"" | GroomingLocation>(linkedDayLocation);
  const [filters, setFilters] = useState<AdminBookingFilters>(() => emptyAdminBookingFilters(linkedSearch));
  const [typed, setTyped] = useState(linkedSearch);
  const [reference, setReference] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastLink = useRef(link);
  const list = useAdminBookings(adminBookingSearch(filters));
  // The day view leaves out bookings that no longer hold a time; asked from the server, so the day's
  // first 50, its "more" note and its CSV are the bookings it shows (shared with the Grooming calendar, D255).
  const dayFilters = bookingDayFilters(day, dayLocation);
  const dayList = useAdminBookings(adminBookingSearch(dayFilters));
  // Another day or place is loading: the list query keeps the previous answer as a placeholder, which
  // must never show under the new date.
  const dayShown = dayList.isPlaceholderData ? undefined : dayList.data;
  const dayLoading = dayList.isPending || dayList.isPlaceholderData;

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new link while the page is open (the header search, Back/Forward): it keeps the page mounted, so
  // show what a fresh visit shows. A search shows the list (the only view with the search); a calendar
  // date shows that day.
  useEffect(() => {
    if (lastLink.current === link) return;
    lastLink.current = link;
    setView(linkedDate ? "day" : "list");
    setDay(linkedDate || qatarToday());
    setDayLocation(linkedDayLocation);
    setTyped(linkedSearch);
    setFilters(emptyAdminBookingFilters(linkedSearch));
    setReference(null);
    setDownloadError("");
  }, [link, linkedDate, linkedDayLocation, linkedSearch]);

  useEffect(() => {
    if (reference && detailRef.current) {
      detailRef.current.focus({ preventScroll: true });
      if (window.innerWidth < 1200) detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [reference]);

  function patch(values: Partial<AdminBookingFilters>) {
    setFilters((current) => ({ ...current, ...values, page: values.page ?? 1 }));
  }

  function open(next: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setReference(next);
  }

  function closeDetail() {
    setReference(null);
    triggerRef.current?.focus();
  }

  const data = list.data;
  const counts = data?.counts;
  const count = (...statuses: BookingStatus[]) => (counts ? statuses.reduce((sum, status) => sum + counts[status], 0) : "–");
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!filters.q.trim() || !!filters.status || !!filters.location || filters.needsAction || !!filters.from || !!filters.to;
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to;
  const where = (booking: AdminBookingSummary) =>
    booking.location === "home" ? (booking.area ? c.local(booking.area) : c.text("Home visit", "زيارة منزلية")) : c.text("Shop", "المتجر");
  const time = (booking: AdminBookingSummary) =>
    booking.appointment.end ? `${booking.appointment.start}–${booking.appointment.end}` : booking.appointment.start;
  const onTheDay = (dayShown?.bookings ?? []).filter((booking) => BOOKING_DAY_STATUSES.includes(booking.status));
  /** The time a Grooming calendar link points at: that date, place and start only, wherever the view goes. */
  const isLinkedTime = (booking: AdminBookingSummary) =>
    !!linkedDate &&
    !!linkedTime &&
    booking.appointment.date === linkedDate &&
    booking.appointment.start === linkedTime &&
    (!linkedDayLocation || booking.location === linkedDayLocation);

  return (
    <AdminPage
      module="bookings"
      title={c.text("Bookings", "الحجوزات")}
      subtitle={c.text(
        "Grooming booked on the website, from payment to the appointment. Customers book on the website.",
        "العناية المحجوزة عبر الموقع، من الدفع حتى الموعد. يحجز العملاء عبر الموقع.",
      )}
      actions={
        canExport && (
          // What is on screen: the day in the Day view, the list's filters in the List view.
          <DownloadMenu
            path="/admin/bookings"
            search={adminBookingSearch(view === "day" ? dayFilters : filters, { paged: false })}
            onError={setDownloadError}
            name={
              view === "day"
                ? (format) => c.text(`Download this day (${format})`, `تنزيل هذا اليوم (${format})`)
                : undefined
            }
          />
        )
      }
    >
      <ErrorMessage message={downloadError} />
      <div className={`orders-layout${reference ? " orders-layout--detail" : ""}`}>
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics">
            <AdminMetric icon={CalendarDays} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("All bookings", "جميع الحجوزات")} value={count(...BOOKING_STATUS_FILTER_ORDER)} />
            <AdminMetric icon={TriangleAlert} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Awaiting payment", "بانتظار الدفع")} value={count("awaiting_payment")} />
            <AdminMetric icon={Scissors} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Confirmed, to groom", "مؤكدة للعناية")} value={count("confirmed")} />
            <AdminMetric icon={Store} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("In progress", "قيد التنفيذ")} value={count("in_progress")} />
          </div>
          <fieldset className="admin-tabs" aria-label={c.text("Bookings view", "عرض الحجوزات")}>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              {c.text("List", "القائمة")}
            </button>
            <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>
              {c.text("Day", "اليوم")}
            </button>
          </fieldset>

          {view === "day" ? (
            <div className="panel orders-records">
              <div className="orders-filter-toolbar orders-filter-toolbar--real">
                <button type="button" className="icon-button" aria-label={c.text("Previous day", "اليوم السابق")} onClick={() => setDay(shiftDay(day, -1))}>
                  <ChevronLeft size={16} />
                </button>
                <label className="orders-date">
                  {c.text("Day", "اليوم")}
                  <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
                </label>
                <button type="button" className="icon-button" aria-label={c.text("Next day", "اليوم التالي")} onClick={() => setDay(shiftDay(day, 1))}>
                  <ChevronRight size={16} />
                </button>
                <select aria-label={c.text("Shop or home", "المتجر أو المنزل")} value={dayLocation} onChange={(e) => setDayLocation(e.target.value as "" | GroomingLocation)}>
                  <option value="">{c.text("Shop and home visits", "المتجر والزيارات المنزلية")}</option>
                  <option value="shop">{c.text("Shop", "المتجر")}</option>
                  <option value="home">{c.text("Home visits", "الزيارات المنزلية")}</option>
                </select>
              </div>
              <h3 className="delivery-date">{dateLabel(day, c.locale)}</h3>
              {dayList.isError && (
                <div className="inline-state" role="alert">
                  <p>{describeAdminBookingError(dayList.error, c.text)}</p>
                  <button type="button" className="button button--secondary" onClick={() => void dayList.refetch()}>
                    {c.text("Retry", "أعد المحاولة")}
                  </button>
                </div>
              )}
              {dayLoading && !dayList.isError && (
                <p className="muted" role="status" aria-busy="true">
                  {c.text("Loading the day…", "جارٍ تحميل اليوم…")}
                </p>
              )}
              {dayShown &&
                (onTheDay.length === 0 ? (
                  <Empty>{c.text("No appointments on this day.", "لا توجد مواعيد في هذا اليوم.")}</Empty>
                ) : (
                  <ol className="orders-history bookings-day-list" aria-label={c.text("Appointments on this day", "مواعيد هذا اليوم")}>
                    {onTheDay.map((booking) => (
                      <li
                        key={booking.reference}
                        className={isLinkedTime(booking) ? "is-selected" : undefined}
                        aria-current={isLinkedTime(booking) ? "true" : undefined}
                      >
                        <strong dir="ltr">{time(booking)}</strong>{" "}
                        <button type="button" className="orders-reference-button" onClick={(e) => open(booking.reference, e.currentTarget)}>
                          <bdi>{booking.reference}</bdi>
                        </button>{" "}
                        <BookingStatusBadge status={booking.status} />
                        <p className="small">
                          {where(booking)} · {petLabel(booking.pet, c.local)} · {c.local(booking.package.name)} · {booking.contactName}
                        </p>
                      </li>
                    ))}
                  </ol>
                ))}
              {dayShown && dayShown.total > BOOKING_DAY_LIMIT && (
                <p className="small muted">{c.text(`Showing the first ${BOOKING_DAY_LIMIT}; use the list for the rest.`, `عرض أول ${BOOKING_DAY_LIMIT}؛ استخدم القائمة للباقي.`)}</p>
              )}
              <p className="small muted">
                {c.text("Cancelled and expired bookings are not shown here; find them in the list.", "لا تظهر هنا الحجوزات الملغاة والمنتهية؛ تجدها في القائمة.")}
              </p>
            </div>
          ) : (
            <div className="panel orders-records">
              <div className="orders-filter-toolbar orders-filter-toolbar--real">
                <label className="orders-search">
                  <Search size={16} />
                  <input
                    aria-label={c.text("Search by booking, name, email or phone", "ابحث بالحجز أو الاسم أو البريد أو الهاتف")}
                    placeholder={c.text("Search by booking, name, email or phone…", "ابحث بالحجز أو الاسم أو البريد أو الهاتف…")}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </label>
                <select aria-label={c.text("Status", "الحالة")} value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
                  <option value="">{c.text("All statuses", "كل الحالات")}</option>
                  <option value="open">{c.text("Still open", "ما زالت مفتوحة")}</option>
                  {BOOKING_STATUS_FILTER_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {c.local(ADMIN_BOOKING_STATUS[status])}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={c.text("Shop or home", "المتجر أو المنزل")}
                  value={filters.location}
                  onChange={(e) => patch({ location: e.target.value as AdminBookingFilters["location"] })}
                >
                  <option value="">{c.text("Shop and home visits", "المتجر والزيارات المنزلية")}</option>
                  <option value="shop">{c.text("Shop", "المتجر")}</option>
                  <option value="home">{c.text("Home visits", "الزيارات المنزلية")}</option>
                </select>
                <select aria-label={c.text("Sort", "الترتيب")} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as AdminBookingSort })}>
                  {SORTS.map((sort) => (
                    <option key={sort.value} value={sort.value}>
                      {c.text(sort.en, sort.ar)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orders-filter-toolbar orders-filter-toolbar--real orders-date-filters">
                <select
                  aria-label={c.text("Dates apply to", "التواريخ تخص")}
                  value={filters.dateField}
                  onChange={(e) => patch({ dateField: e.target.value as AdminBookingFilters["dateField"] })}
                >
                  <option value="appointment">{c.text("Appointment date", "تاريخ الموعد")}</option>
                  <option value="placed">{c.text("Booking date", "تاريخ الحجز")}</option>
                </select>
                <label className="orders-date">
                  {c.text("From", "من")}
                  <input type="date" value={filters.from} onChange={(e) => patch({ from: e.target.value })} />
                </label>
                <label className="orders-date">
                  {c.text("To", "إلى")}
                  <input type="date" value={filters.to} onChange={(e) => patch({ to: e.target.value })} />
                </label>
                <label className="row">
                  <input type="checkbox" checked={filters.needsAction} onChange={(e) => patch({ needsAction: e.target.checked })} />
                  {c.text("Only refund needed or payment to check", "فقط ما يحتاج استرداداً أو مراجعة دفع")}
                </label>
                {filtered && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setTyped("");
                      setFilters(emptyAdminBookingFilters());
                    }}
                  >
                    {c.text("Reset filters", "إعادة المرشحات")}
                  </button>
                )}
              </div>
              {badRange && (
                <p className="form-error" role="alert">
                  {c.text("The start date is after the end date, so no bookings can match.", "تاريخ البداية بعد تاريخ النهاية، لذا لا يمكن أن تتطابق أي حجوزات.")}
                </p>
              )}
              {list.isError && (
                <div className="inline-state" role="alert">
                  <p>{describeAdminBookingError(list.error, c.text)}</p>
                  <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                    {c.text("Retry", "أعد المحاولة")}
                  </button>
                </div>
              )}
              {list.isPending && (
                <p className="muted" role="status" aria-busy="true">
                  {c.text("Loading bookings…", "جارٍ تحميل الحجوزات…")}
                </p>
              )}
              {data && (
                <>
                  <div className="orders-table-scroll">
                    <table className="orders-table orders-table--real" aria-busy={list.isFetching}>
                      <thead>
                        <tr>
                          <th>{c.text("Booking", "الحجز")}</th>
                          <th>{c.text("Customer", "العميل")}</th>
                          <th>{c.text("Appointment", "الموعد")}</th>
                          <th>{c.text("Pet", "الحيوان")}</th>
                          <th>{c.text("Total", "الإجمالي")}</th>
                          <th>{c.text("Status", "الحالة")}</th>
                          <th>
                            <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bookings.map((booking) => (
                          <tr key={booking.reference} className={reference === booking.reference ? "is-selected" : ""}>
                            <td>
                              <button type="button" className="orders-reference-button" onClick={(e) => open(booking.reference, e.currentTarget)}>
                                <bdi>{booking.reference}</bdi>
                              </button>
                              <small>{placedAt(booking.placedAt, c.locale)}</small>
                            </td>
                            <td>
                              <strong>{booking.contactName}</strong>
                              <small>
                                <bdi>{booking.contactPhone}</bdi>
                              </small>
                            </td>
                            <td>
                              <span className="orders-fulfilment-cell">
                                {booking.location === "home" ? <Home size={16} /> : <Store size={16} />}
                                {where(booking)}
                              </span>
                              <small>
                                {dateLabel(booking.appointment.date, c.locale)}, <bdi dir="ltr">{time(booking)}</bdi>
                              </small>
                            </td>
                            <td>
                              {/* The pet as its group and breed (D246); the group is no longer repeated below. */}
                              <strong>{petLabel(booking.pet, c.local)}</strong>
                              <small>{c.local(booking.package.name)}</small>
                            </td>
                            <td>
                              <bdi>{formatMoney(booking.total, c.locale)}</bdi>
                            </td>
                            <td>
                              <BookingStatusBadge status={booking.status} />
                              {booking.refundNeeded && <small className="orders-refund">{c.text("Refund needed", "يحتاج استرداداً")}</small>}
                              {booking.attention && <small className="orders-refund">{c.text("Payment to check", "دفعة تحتاج مراجعة")}</small>}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={c.text(`View booking ${booking.reference}`, `عرض الحجز ${booking.reference}`)}
                                onClick={(e) => open(booking.reference, e.currentTarget)}
                              >
                                <Ellipsis size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.bookings.length === 0 && (
                    <Empty>
                      {filtered
                        ? c.text("No bookings match these filters.", "لا توجد حجوزات مطابقة لهذه المرشحات.")
                        : c.text("No bookings yet. Grooming booked on the website appears here.", "لا توجد حجوزات بعد. تظهر هنا العناية المحجوزة عبر الموقع.")}
                    </Empty>
                  )}
                  <div className="orders-pagination">
                    <nav aria-label={c.text("Booking pages", "صفحات الحجوزات")}>
                      <button type="button" aria-label={c.text("Previous page", "الصفحة السابقة")} disabled={data.page <= 1} onClick={() => patch({ page: data.page - 1 })}>
                        <ChevronLeft size={16} />
                      </button>
                      <span aria-current="page">{c.text(`Page ${data.page} of ${pages}`, `صفحة ${data.page} من ${pages}`)}</span>
                      <button type="button" aria-label={c.text("Next page", "الصفحة التالية")} disabled={data.page >= pages} onClick={() => patch({ page: data.page + 1 })}>
                        <ChevronRight size={16} />
                      </button>
                    </nav>
                    <span>
                      {data.total === 0
                        ? c.text("0 bookings", "٠ حجوزات")
                        : c.text(
                            `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} bookings`,
                            `عرض ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} من ${data.total} حجزاً`,
                          )}
                    </span>
                    <select aria-label={c.text("Bookings per page", "حجوزات لكل صفحة")} value={filters.pageSize} onChange={(e) => patch({ pageSize: Number(e.target.value) })}>
                      {ADMIN_BOOKING_PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {c.text(`${size} per page`, `${size} لكل صفحة`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {reference && <BookingApiDetail key={reference} reference={reference} close={closeDetail} panelRef={detailRef} />}
      </div>
    </AdminPage>
  );
}
