import type { DemoState } from "@/mocks/data/business";
import { financialRows } from "@/mocks/adapters/business-repository";

/** Calendar dates and hours belong to Qatar, never the workstation timezone. */
export function qatarDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
export function shiftDay(date: string, offset: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}
export function qatarTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
export function dashboardItemCount(count: number, locale: "en" | "ar") {
  if (locale === "en") return `${count} ${count === 1 ? "item" : "items"}`;
  if (count === 1) return "قطعة واحدة";
  if (count === 2) return "قطعتان";
  const number = new Intl.NumberFormat("ar-QA").format(count);
  return `${number} ${new Intl.PluralRules("ar").select(count) === "few" || count === 0 ? "قطع" : "قطعة"}`;
}
export function isHouseOrder(
  state: DemoState,
  order: DemoState["orders"][number],
) {
  return order.items.some(
    (item) => state.products.find((p) => p.id === item.productId)?.house,
  );
}
export function stockAlerts(state: DemoState) {
  return state.products
    .filter((p) => p.active && !p.house)
    .flatMap((product) =>
      product.variants
        .filter((variant) => variant.stock <= 5)
        .map((variant) => ({ product, variant })),
    )
    .sort(
      (a, b) =>
        a.variant.stock - b.variant.stock ||
        a.variant.sku.localeCompare(b.variant.sku),
    );
}
export function dashboardSnapshot(
  state: DemoState,
  date: string,
  days: 1 | 7 | 30 = 1,
) {
  const first = shiftDay(date, 1 - days);
  const within = (day: string) => day >= first && day <= date;
  const orders = state.orders.filter(
    (o) => o.status !== "cancelled" && within(qatarDay(o.date)),
  );
  const paidOrders = orders.filter((o) => o.payment === "paid");
  const revenueRows = financialRows(state).filter(
    (r) => r.payment === "paid" && within(qatarDay(r.date)),
  );
  const bookings = state.bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      within(state.slots.find((s) => s.id === b.slotId)?.date ?? ""),
  );
  const deliveries = state.orders.filter(
    (o) =>
      o.fulfilment === "delivery" &&
      o.status !== "cancelled" &&
      o.status !== "completed" &&
      o.payment === "paid" &&
      within(state.slots.find((s) => s.id === o.slotId)?.date ?? ""),
  );
  const series = Array.from({ length: days === 1 ? 24 : days }, (_, index) => {
    const key =
      days === 1 ? String(index).padStart(2, "0") : shiftDay(first, index);
    const value = revenueRows
      .filter((r) =>
        days === 1
          ? qatarTime(r.date).slice(0, 2) === key
          : qatarDay(r.date) === key,
      )
      .reduce((sum, r) => sum + r.amount, 0);
    return { key, value };
  });
  return {
    orders,
    bookings,
    deliveries,
    series,
    revenue: revenueRows.reduce((sum, r) => sum + r.amount, 0),
    averageOrder: paidOrders.length
      ? Math.round(
          paidOrders.reduce((sum, o) => sum + o.total, 0) / paidOrders.length,
        )
      : 0,
  };
}
