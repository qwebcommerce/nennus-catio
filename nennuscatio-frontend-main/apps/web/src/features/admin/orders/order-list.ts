import { qatarDay, shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import { csvCell } from "@/mocks/adapters/business-repository";
import type { DemoState, Order } from "@/mocks/data/business";
export type OrderKind = "all" | "products" | "houses";
export type OrderSort =
  | "date"
  | "id"
  | "customer"
  | "type"
  | "items"
  | "total"
  | "fulfilment"
  | "payment"
  | "status";
export interface OrderFilters {
  search: string;
  kind: OrderKind;
  status: string;
  payment: string;
  fulfilment: string;
  channel: string;
  period: string;
  from: string;
  to: string;
  minimum: string;
  maximum: string;
}
export const emptyOrderFilters = (): OrderFilters => ({
  search: "",
  kind: "all",
  status: "",
  payment: "",
  fulfilment: "",
  channel: "",
  period: "",
  from: "",
  to: "",
  minimum: "",
  maximum: "",
});
export function orderKind(
  state: DemoState,
  order: Order,
): Exclude<OrderKind, "all"> {
  return order.items.some(
    (item) => state.products.find((p) => p.id === item.productId)?.house,
  )
    ? "houses"
    : "products";
}
export function filteredOrders(
  state: DemoState,
  filters: OrderFilters,
  today: string,
  sort: OrderSort = "date",
  descending = true,
) {
  const from =
    filters.period === "today"
      ? today
      : filters.period === "7"
        ? shiftDay(today, -6)
        : filters.period === "30"
          ? shiftDay(today, -29)
          : filters.from;
  const to = filters.period ? today : filters.to;
  const search = filters.search.trim().toLowerCase();
  const customer = (o: Order) =>
    state.guests.find((g) => g.id === o.customerId);
  const sortValue = (o: Order): number | string =>
    sort === "date"
      ? o.date
      : sort === "customer"
        ? (customer(o)?.name ?? "")
        : sort === "type"
          ? orderKind(state, o)
          : sort === "items"
            ? o.items.reduce((n, l) => n + l.quantity, 0)
            : o[sort];
  return state.orders
    .filter((o) => {
      const guest = customer(o),
        day = qatarDay(o.date);
      return (
        (filters.kind === "all" || orderKind(state, o) === filters.kind) &&
        (!filters.status || filters.status === o.status) &&
        (!filters.payment || filters.payment === o.payment) &&
        (!filters.fulfilment || filters.fulfilment === o.fulfilment) &&
        (!filters.channel || filters.channel === o.channel) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!filters.minimum || o.total >= Number(filters.minimum) * 100) &&
        (!filters.maximum || o.total <= Number(filters.maximum) * 100) &&
        [
          o.id,
          guest?.name,
          guest?.email,
          guest?.phone,
          ...o.items.flatMap((item) => [item.sku, item.name.en, item.name.ar]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) => {
      const x = sortValue(a),
        y = sortValue(b),
        cmp =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y));
      return (descending ? -cmp : cmp) || a.id.localeCompare(b.id);
    });
}
export function orderCsv(order: Order) {
  const rows = [
    ["Demo order", order.id],
    ["Created (ISO)", order.date],
    ["Payment", order.payment],
    ["Status", order.status],
    ["Fulfilment", order.fulfilment],
    [],
    ["Item", "SKU", "Quantity", "Unit price QAR", "Line total QAR"],
    ...order.items.map((l) => [
      l.name.en,
      l.sku,
      l.quantity,
      (l.price / 100).toFixed(2),
      ((l.price * l.quantity) / 100).toFixed(2),
    ]),
    ["Delivery fee QAR", (order.fee / 100).toFixed(2)],
    ["Total QAR", (order.total / 100).toFixed(2)],
    ["Notice", "Synthetic data only. Not a tax invoice or payment receipt."],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
/** Compact reference presentation, without rounding away fractional QAR. */
export function orderMoney(amount: number, locale: "en" | "ar") {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError("Invalid minor units");
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", {
    style: "currency",
    currency: "QAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
