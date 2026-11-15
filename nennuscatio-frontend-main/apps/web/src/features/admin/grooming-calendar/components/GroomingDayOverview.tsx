"use client";

import type { AdminBookingSummary, AdminGroomingSlot, GroomingLocation, GroomingSettings } from "@nennus-catio/contracts";
import { useState } from "react";
import { BookingStatusBadge } from "@/features/admin/bookings/components/BookingApiDetail";
import { dateLabel, qatarToday } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  adminBookingSearch,
  BOOKING_DAY_LIMIT,
  BOOKING_DAY_STATUSES,
  bookingDayFilters,
  describeAdminBookingError,
  useAdminBookings,
} from "@/shared/api/admin-bookings";
import { useGroomingSettings, useGroomingSlots } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { petLabel } from "@/shared/lib/pet-label";
import { Empty } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { DaySchedule, type DayScheduleRow } from "@/shared/ui/DaySchedule";
import { DayStepper } from "@/shared/ui/DayStepper";
import { GroomingSlotDialog } from "./GroomingSlotDialog";

type Steps = Pick<GroomingSettings, "stepMinutes" | "cleaningGapMinutes">;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/**
 * The times a booking holds, worked out as the server takes them (`takeSeats`, 9c): a shop booking holds
 * every step its package and the cleaning time after it need, from its start (without cleaning time, a
 * 45-minute booking at 10:00 also holds 10:30); a home visit holds its own time only. A booking made
 * before the step or the cleaning time was changed may hold one time more or fewer than this says.
 */
function heldTimes(booking: AdminBookingSummary, settings: Steps): string[] {
  const { appointment } = booking;
  if (booking.location !== "shop" || appointment.end === null) return [appointment.start];
  const start = minutes(appointment.start);
  const steps = Math.max(1, Math.ceil((minutes(appointment.end) - start + settings.cleaningGapMinutes) / settings.stepMinutes));
  return Array.from({ length: steps }, (_, index) => clock(start + index * settings.stepMinutes));
}

interface TimeRow {
  start: string;
  end: string | null;
  slot: AdminGroomingSlot | null;
  bookings: AdminBookingSummary[];
}

/**
 * The day's times with the bookings holding each. Bookings at a time the calendar no longer lists (a past
 * date) are shown under their start time, without an end, since each may end at a different time.
 */
function timeRows(slots: readonly AdminGroomingSlot[], bookings: readonly AdminBookingSummary[], settings: Steps): TimeRow[] {
  const held = new Map(bookings.map((booking) => [booking.reference, heldTimes(booking, settings)]));
  const holds = (booking: AdminBookingSummary, start: string) => held.get(booking.reference)?.includes(start) ?? false;
  const rows: TimeRow[] = slots.map((slot) => ({ start: slot.start, end: slot.end, slot, bookings: bookings.filter((booking) => holds(booking, slot.start)) }));
  for (const booking of bookings) {
    if (rows.some((row) => row.slot !== null && holds(booking, row.start))) continue;
    const found = rows.find((row) => row.slot === null && row.start === booking.appointment.start);
    if (found) found.bookings.push(booking);
    else rows.push({ start: booking.appointment.start, end: null, slot: null, bookings: [booking] });
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The owner's "day overview" (D255): one day's grooming times, at the shop or for home visits, as a
 * table: each time's booked places, the bookings holding it (for roles that may see Bookings), whether
 * it is open, full or closed, and its Change dialog. A time with bookings opens on a click to list them,
 * one line each (D257). A booking opens on the Bookings page.
 */
export function GroomingDayOverview() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("groomingCalendar", "edit");
  const canSeeBookings = access.canView("bookings");
  const [location, setLocation] = useState<GroomingLocation>("shop");
  const [day, setDay] = useState(qatarToday());
  const [changing, setChanging] = useState<AdminGroomingSlot | null>(null);
  const slots = useGroomingSlots(location);
  // The step and the cleaning time decide which times a booking holds.
  const settings = useGroomingSettings();
  const bookings = useAdminBookings(adminBookingSearch(bookingDayFilters(day, location)), { enabled: canSeeBookings });
  // Another day or place is loading: the previous answer must never show under the new date.
  const shown = bookings.isPlaceholderData ? undefined : bookings.data;

  const locations = (
    <fieldset className="admin-tabs" aria-label={c.text("Shop or home visits", "المتجر أو الزيارات المنزلية")}>
      {(["shop", "home"] as const).map((item) => (
        <button key={item} type="button" aria-pressed={location === item} onClick={() => setLocation(item)}>
          {item === "shop" ? c.text("Shop", "المتجر") : c.text("Home visits", "الزيارات المنزلية")}
        </button>
      ))}
    </fieldset>
  );

  const toolbar = (
    <>
      {locations}
      <DayStepper day={day} onChange={setDay} />
    </>
  );

  if (slots.isPending || slots.isError || settings.isPending || settings.isError) {
    return (
      <section className="panel form-stack" aria-label={c.text("Day overview", "نظرة على اليوم")}>
        {toolbar}
        <CatalogState
          status={slots.isError || settings.isError ? "error" : "loading"}
          retry={() => void Promise.all([slots.refetch(), settings.refetch()])}
        />
      </section>
    );
  }

  const daySlots = slots.data.slots.filter((slot) => slot.date === day).sort((a, b) => a.start.localeCompare(b.start));
  const dayBookings = (shown?.bookings ?? []).filter((booking) => booking.appointment.date === day && BOOKING_DAY_STATUSES.includes(booking.status));
  const rows = timeRows(daySlots, dayBookings, settings.data);
  const timeText = (start: string, end: string | null) => (end ? `${start}–${end}` : start);

  const tableRows: DayScheduleRow[] = rows.map((row) => {
    const slot = row.slot;
    const started = slot ? Date.parse(slot.startsAt) <= Date.now() : true;
    return {
      key: row.start,
      time: timeText(row.start, row.end),
      count: slot ? c.text(`${slot.booked} of ${slot.capacity}`, `${slot.booked} من ${slot.capacity}`) : String(row.bookings.length),
      status: slot
        ? slot.closed
          ? { label: c.text("Closed", "مغلق"), tone: "closed" as const }
          : slot.booked >= slot.capacity
            ? { label: c.text("Full", "ممتلئ"), tone: "full" as const }
            : { label: c.text("Open", "مفتوح"), tone: "open" as const }
        : null,
      details: row.bookings.map((booking) => ({
        key: booking.reference,
        cells: {
          booking: (
            <Link className="text-link" href={`/admin/bookings?search=${encodeURIComponent(booking.reference)}`}>
              <bdi>{booking.reference}</bdi>
            </Link>
          ),
          customer: booking.contactName,
          phone: <bdi dir="ltr">{booking.contactPhone}</bdi>,
          time: <bdi dir="ltr">{timeText(booking.appointment.start, booking.appointment.end)}</bdi>,
          area: booking.area ? c.local(booking.area) : "—",
          pet: petLabel(booking.pet, c.local),
          package: c.local(booking.package.name),
          total: <bdi>{c.money(booking.total)}</bdi>,
          status: (
            <>
              <BookingStatusBadge status={booking.status} />
              {booking.refundNeeded && <small className="orders-refund">{c.text("Refund needed", "يحتاج استرداداً")}</small>}
              {booking.attention && <small className="orders-refund">{c.text("Payment to check", "دفعة تحتاج مراجعة")}</small>}
            </>
          ),
        },
      })),
      action:
        canEdit && slot && !started ? (
          <button type="button" className="text-button" aria-label={`${c.text("Change", "تغيير")} ${slot.date} ${slot.start}`} onClick={() => setChanging(slot)}>
            {c.text("Change", "تغيير")}
          </button>
        ) : null,
    };
  });

  return (
    <section className="panel form-stack" aria-label={c.text("Day overview", "نظرة على اليوم")}>
      {toolbar}
      <div className="row spread">
        <h3 className="delivery-date">{dateLabel(day, c.locale)}</h3>
        {canSeeBookings && (
          <Link className="text-link small" href={`/admin/bookings?date=${day}&location=${location}`}>
            {c.text("Open this day in Bookings", "افتح هذا اليوم في الحجوزات")}
          </Link>
        )}
      </div>
      {bookings.isError && (
        <div className="inline-state" role="alert">
          <p>{describeAdminBookingError(bookings.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void bookings.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {canSeeBookings && (bookings.isPending || bookings.isPlaceholderData) && !bookings.isError && (
        <p className="muted small" role="status" aria-busy="true">
          {c.text("Loading the day's bookings…", "جارٍ تحميل حجوزات اليوم…")}
        </p>
      )}
      <DaySchedule
        label={c.text("Grooming times on this day", "مواعيد العناية في هذا اليوم")}
        timeHeader={c.text("Time", "الوقت")}
        countHeader={location === "shop" ? c.text("Sections booked", "الأقسام المحجوزة") : c.text("Buses booked", "الحافلات المحجوزة")}
        details={
          canSeeBookings
            ? {
                // A shop booking's own time (it may cover several times); a home visit's area instead.
                columns: [
                  { key: "booking", header: c.text("Booking", "الحجز") },
                  { key: "customer", header: c.text("Customer", "العميل") },
                  { key: "phone", header: c.text("Phone", "الهاتف") },
                  location === "shop" ? { key: "time", header: c.text("Time", "الوقت") } : { key: "area", header: c.text("Area", "المنطقة") },
                  { key: "pet", header: c.text("Pet", "الحيوان") },
                  { key: "package", header: c.text("Package", "الباقة") },
                  { key: "total", header: c.text("Total", "الإجمالي") },
                  { key: "status", header: c.text("Status", "الحالة") },
                ],
                label: (time) => c.text(`Bookings at ${time}`, `حجوزات ${time}`),
              }
            : null
        }
        rows={tableRows}
        dayKey={`${location}:${day}`}
        empty={<Empty>{c.text("No grooming times on this day.", "لا توجد مواعيد عناية في هذا اليوم.")}</Empty>}
        withStatus
        withActions={canEdit}
      />
      {shown && shown.total > BOOKING_DAY_LIMIT && (
        <p className="small muted">
          {c.text(`Showing the first ${BOOKING_DAY_LIMIT} bookings; open the day in Bookings for the rest.`, `عرض أول ${BOOKING_DAY_LIMIT} حجزاً؛ افتح اليوم في الحجوزات للباقي.`)}
        </p>
      )}
      {canSeeBookings && (
        <p className="small muted">
          {location === "shop" &&
            (settings.data.cleaningGapMinutes > 0
              ? c.text(
                  "A booking is listed in every time it takes up, including the cleaning time after it. ",
                  "يظهر الحجز في كل وقت يشغله، بما في ذلك وقت التنظيف بعده. ",
                )
              : c.text("A booking is listed in every time its package takes up. ", "يظهر الحجز في كل وقت تشغله باقته. "))}
          {c.text("Cancelled and expired bookings are not shown.", "لا تظهر الحجوزات الملغاة أو المنتهية.")}
        </p>
      )}
      <GroomingSlotDialog slot={changing} onClose={() => setChanging(null)} />
    </section>
  );
}
