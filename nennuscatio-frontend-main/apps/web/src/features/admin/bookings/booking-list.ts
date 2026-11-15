import type { Booking, DemoState } from "@/mocks/data/business";
import { shiftDay } from "@/features/admin/dashboard/lib/dashboard";

export type BookingSort =
  | "id"
  | "customer"
  | "location"
  | "package"
  | "date"
  | "payment"
  | "status";
export interface BookingFilters {
  search: string;
  location: string;
  status: string;
  packageId: string;
  date: string;
  payment: string;
  sort: BookingSort;
  descending: boolean;
}
export function bookingRows(d: DemoState, f: BookingFilters, day: string) {
  const slotKey = (b: Booking) => {
    const s = d.slots.find((s) => s.id === b.slotId);
    return s ? `${s.date} ${s.time}` : "";
  };
  return d.bookings
    .filter((b) => {
      const guest = d.guests.find((g) => g.id === b.customerId),
        slot = d.slots.find((s) => s.id === b.slotId);
      return (
        (!f.location || b.location === f.location) &&
        (!f.status || b.status === f.status) &&
        (!f.packageId || b.packageId === f.packageId) &&
        (!f.payment || b.payment === f.payment) &&
        (!f.date ||
          (slot &&
            (f.date === "today"
              ? slot.date === day
              : f.date === "week"
                ? slot.date >= day && slot.date < shiftDay(day, 7)
                : slot.date < day))) &&
        `${b.id} ${b.petName} ${guest?.name ?? ""} ${guest?.email ?? ""} ${b.packageName.en} ${b.packageName.ar}`
          .toLowerCase()
          .includes(f.search.trim().toLowerCase())
      );
    })
    .sort((a, b) => {
      const key = (record: Booking) =>
        f.sort === "date"
          ? slotKey(record)
          : f.sort === "customer"
            ? `${d.guests.find((g) => g.id === record.customerId)?.name ?? ""} ${record.petName}`
            : f.sort === "package"
              ? record.packageName.en
              : record[f.sort];
      return (
        (key(a).localeCompare(key(b), undefined, { numeric: true }) ||
          a.id.localeCompare(b.id)) * (f.descending ? -1 : 1)
      );
    });
}
export function bookingMetrics(d: DemoState, day: string) {
  const active = d.bookings.filter((b) => b.status !== "cancelled"),
    forDay = active.filter(
      (b) => d.slots.find((s) => s.id === b.slotId)?.date === day,
    );
  return {
    today: forDay.length,
    remaining: forDay.filter((b) => b.status !== "completed").length,
    upcoming: active.filter(
      (b) =>
        b.status !== "completed" &&
        d.slots.some(
          (s) =>
            s.id === b.slotId && s.date >= day && s.date < shiftDay(day, 7),
        ),
    ).length,
    attention: active.filter(
      (b) => b.status === "pending" || b.payment === "pending",
    ).length,
    completed: forDay.filter((b) => b.status === "completed").length,
  };
}
export function bookingDate(date: string, locale: string, includeTime = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}
