import type {
  DemoState,
  Package,
  Product,
  Variant,
} from "@/mocks/data/business";
export function stockState(variants: Variant[]) {
  if (variants.every((v) => v.stock === 0)) return "out";
  if (variants.some((v) => v.stock <= (v.lowStock ?? 5))) return "low";
  return "in";
}
export function cataloguePerformance(
  data: Pick<DemoState, "orders" | "bookings">,
  record: Product | Package,
  date: string,
  days = 30,
) {
  const end = new Date(`${date}T23:59:59.999+03:00`).getTime(),
    start = end - days * 86400000 + 1;
  const matches = (day: string) => {
    const time = new Date(
      day.length === 10 ? `${day}T12:00:00+03:00` : day,
    ).getTime();
    return time >= start && time <= end;
  };
  let units = 0,
    revenue = 0,
    last = "";
  if ("variants" in record) {
    for (const order of data.orders.filter(
      (o) =>
        o.payment === "paid" && o.status !== "cancelled" && matches(o.date),
    )) {
      for (const line of order.items.filter((x) => x.productId === record.id)) {
        units += line.quantity;
        revenue += line.quantity * line.price;
        if (order.date > last) last = order.date;
      }
    }
  } else {
    for (const booking of data.bookings.filter(
      (b) =>
        b.packageId === record.id &&
        b.payment === "paid" &&
        b.status !== "cancelled" &&
        matches(b.date),
    )) {
      units++;
      revenue += booking.price;
      if (booking.date > last) last = booking.date;
    }
  }
  return { units, revenue, last };
}
