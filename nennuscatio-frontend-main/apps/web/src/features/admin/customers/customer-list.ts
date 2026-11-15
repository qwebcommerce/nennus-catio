import type { Booking, DemoState, Guest } from "@/mocks/data/business";

export type CustomerSort =
  | "name"
  | "contact"
  | "orders"
  | "bookings"
  | "activity";
export interface CustomerFilters {
  search: string;
  type: string;
  activity: string;
  pet: string;
  review: boolean;
  sort: CustomerSort;
  descending: boolean;
}
export const customerDefaults: CustomerFilters = {
  search: "",
  type: "",
  activity: "",
  pet: "",
  review: false,
  sort: "name",
  descending: false,
};
export function contactNeedsReview(d: DemoState, g: Guest) {
  return d.guests.some(
    (other) =>
      other.id !== g.id &&
      (other.email.trim().toLowerCase() === g.email.trim().toLowerCase() ||
        other.phone.replace(/\D/g, "") === g.phone.replace(/\D/g, "")),
  );
}
export function customerPets(d: DemoState, id: string) {
  const pets = new Map<
    string,
    {
      key: string;
      name: string;
      category: string;
      image: string;
      bookings: Booking[];
    }
  >();
  for (const b of d.bookings.filter((b) => b.customerId === id)) {
    const pkg = d.packages.find((p) => p.id === b.packageId),
      category = pkg?.petCategory ?? "",
      key = `${b.petName.trim().toLowerCase()}|${category}`;
    const pet = pets.get(key);
    if (pet) pet.bookings.push(b);
    else
      pets.set(key, {
        key,
        name: b.petName,
        category,
        image: pkg?.image ?? "",
        bookings: [b],
      });
  }
  return [...pets.values()];
}
export function customerHistory(d: DemoState, id: string) {
  return [
    ...d.orders
      .filter((o) => o.customerId === id)
      .map((o) => ({ id: o.id, kind: "order" as const, at: o.date, order: o })),
    ...d.bookings
      .filter((b) => b.customerId === id)
      .map((b) => ({
        id: b.id,
        kind: "booking" as const,
        at: b.date,
        booking: b,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
export function customerFirstRecorded(d: DemoState, g: Guest) {
  return g.createdAt ?? customerHistory(d, g.id).at(-1)?.at ?? "";
}
export function customerAddresses(d: DemoState, id: string) {
  const addresses = new Map<
    string,
    { text: string; source: string; kind: "order" | "booking" }
  >();
  for (const event of customerHistory(d, id)) {
    const record = event.kind === "order" ? event.order : event.booking;
    if (
      (event.kind === "order" && event.order.fulfilment !== "delivery") ||
      (event.kind === "booking" && event.booking.location !== "home")
    )
      continue;
    const text = record.address.trim(),
      key = text.toLowerCase().replace(/\s+/g, " ");
    if (text && !addresses.has(key))
      addresses.set(key, { text, source: event.id, kind: event.kind });
  }
  return [...addresses.values()];
}
export function customerMetrics(d: DemoState, day: string) {
  const month = day.slice(0, 7),
    qatarMonth = (at: string) =>
      at
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Qatar",
            year: "numeric",
            month: "2-digit",
          })
            .format(new Date(at))
            .slice(0, 7)
        : "";
  return {
    total: d.guests.length,
    new: d.guests.filter(
      (g) => qatarMonth(customerFirstRecorded(d, g)) === month,
    ).length,
    repeat: d.guests.filter(
      (g) =>
        customerHistory(d, g.id).filter(
          (e) =>
            (e.kind === "order" ? e.order.status : e.booking.status) !==
            "cancelled",
        ).length >= 2,
    ).length,
    pets: d.guests.reduce((sum, g) => sum + customerPets(d, g.id).length, 0),
  };
}
export function customerRows(d: DemoState, f: CustomerFilters) {
  return d.guests
    .filter((g) => {
      const history = customerHistory(d, g.id),
        pets = customerPets(d, g.id);
      return (
        f.type !== "registered" &&
        (!f.review || contactNeedsReview(d, g)) &&
        (!f.pet || pets.some((p) => p.category === f.pet)) &&
        (!f.activity ||
          (f.activity === "orders"
            ? history.some((e) => e.kind === "order")
            : f.activity === "bookings"
              ? history.some((e) => e.kind === "booking")
              : f.activity === "repeat"
                ? history.filter(
                    (e) =>
                      (e.kind === "order"
                        ? e.order.status
                        : e.booking.status) !== "cancelled",
                  ).length >= 2
                : !history.length)) &&
        `${g.name} ${g.email} ${g.phone} ${history.map((e) => e.id).join(" ")} ${pets.map((p) => p.name).join(" ")}`
          .toLowerCase()
          .includes(f.search.trim().toLowerCase())
      );
    })
    .sort((a, b) => {
      const key = (g: Guest) =>
        f.sort === "name"
          ? g.name
          : f.sort === "contact"
            ? g.email
            : f.sort === "activity"
              ? (customerHistory(d, g.id)[0]?.at ?? "")
              : d[f.sort].filter((r) => r.customerId === g.id).length;
      const x = key(a),
        y = key(b);
      return (
        ((typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true })) ||
          a.id.localeCompare(b.id)) * (f.descending ? -1 : 1)
      );
    });
}
export function customerInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
}
