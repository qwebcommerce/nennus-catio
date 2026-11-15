"use client";

import {
  type AdminOrder,
  type AdminOrderSort,
  type AdminOrderSummary,
  adminOrderListResponseSchema,
  adminOrderSchema,
  deliveryWindowsResponseSchema,
  type Fulfilment,
  localDateSchema,
  OPEN_ORDER_STATUSES,
  type OrderStatus,
  orderStatusSchema,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff order handling (7c-2) over `/api/admin/orders` (7c-1, D131-D134). API mode only; mock mode
 * keeps the demo Orders page. Every change sends the order's `version`; the API refuses a change
 * made on an out-of-date copy, and the page then reloads the order.
 */
export const adminOrdersKey = ["admin", "orders"] as const;
const listKey = [...adminOrdersKey, "list"] as const;
const detailKey = (reference: string) => [...adminOrdersKey, "detail", reference] as const;
/** One order's detail; the payment actions update it (8b). */
export const adminOrderDetailKey = detailKey;

/**
 * The filters on the page. `status` is "" (all), "open" (still running) or one status. `needsAction`:
 * only orders with "Refund needed" or a payment to check (8b). `houses`: only orders with a Pet House (#14).
 */
export interface AdminOrderFilters {
  q: string;
  status: string;
  fulfilment: "" | Fulfilment;
  area: string;
  needsAction: boolean;
  houses: boolean;
  dateField: "placed" | "window";
  from: string;
  to: string;
  sort: AdminOrderSort;
  page: number;
  pageSize: number;
}

export function emptyAdminOrderFilters(q = ""): AdminOrderFilters {
  return {
    q,
    status: "",
    fulfilment: "",
    area: "",
    needsAction: false,
    houses: false,
    dateField: "placed",
    from: "",
    to: "",
    sort: "newest",
    page: 1,
    pageSize: 25,
  };
}

/**
 * A delivery's way through the day (D253): every status that still holds its window's seat, so each
 * window's count matches the Delivery page's `booked`. Cancelled and expired orders gave theirs back.
 */
export const DELIVERY_DAY_STATUSES: readonly OrderStatus[] = ["awaiting_payment", "confirmed", "preparing", "out_for_delivery", "delivered"];
/** A day asks for its first 50; a note sends staff to the list for the rest. */
export const DELIVERY_DAY_LIMIT = 50;

/** A delivery window's orders on one day. */
export interface DeliveryWindowOrders {
  key: string;
  start: string;
  end: string;
  orders: AdminOrderSummary[];
}

/** A day's delivery orders under each window, earliest first, whatever order they came in. */
export function ordersByWindow(orders: readonly AdminOrderSummary[]): DeliveryWindowOrders[] {
  const windows = new Map<string, DeliveryWindowOrders>();
  for (const order of orders) {
    if (!order.window || !DELIVERY_DAY_STATUSES.includes(order.status)) continue;
    const key = `${order.window.start}-${order.window.end}`;
    const found = windows.get(key);
    if (found) found.orders.push(order);
    else windows.set(key, { key, start: order.window.start, end: order.window.end, orders: [order] });
  }
  return [...windows.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** One day's delivery orders (Orders → Deliveries by day, and the Delivery page's Day overview), in window order. */
export function deliveryDayFilters(day: string): AdminOrderFilters {
  return {
    ...emptyAdminOrderFilters(),
    status: DELIVERY_DAY_STATUSES.join(","),
    fulfilment: "delivery",
    dateField: "window",
    from: day,
    to: day,
    sort: "window",
    pageSize: DELIVERY_DAY_LIMIT,
  };
}

/**
 * The filters a link opens the page with: `search`, and from the Dashboard (#12) `status` (one status or
 * "open"), `needsAction=1`, `houses=1` (#14), and `window=YYYY-MM-DD` (that day's deliveries). Anything else is ignored.
 */
export function linkedOrderFilters(params: { get(name: string): string | null }): AdminOrderFilters {
  const filters = emptyAdminOrderFilters(params.get("search") ?? "");
  const status = params.get("status");
  if (status && (status === "open" || orderStatusSchema.safeParse(status).success)) filters.status = status;
  if (params.get("needsAction") === "1") filters.needsAction = true;
  if (params.get("houses") === "1") filters.houses = true;
  const window = params.get("window");
  if (window && localDateSchema.safeParse(window).success) {
    filters.dateField = "window";
    filters.from = window;
    filters.to = window;
  }
  return filters;
}

/** The query string for the list and the CSV export (the export ignores pages). */
export function adminOrderSearch(filters: AdminOrderFilters, { paged = true } = {}): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.status) params.set("status", filters.status === "open" ? OPEN_ORDER_STATUSES.join(",") : filters.status);
  if (filters.fulfilment) params.set("fulfilment", filters.fulfilment);
  if (filters.area) params.set("area", filters.area);
  if (filters.needsAction) params.set("needsAction", "1");
  if (filters.houses) params.set("houses", "1");
  if (filters.from || filters.to) params.set("dateField", filters.dateField);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  if (paged) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }
  return params.toString();
}

export function useAdminOrders(search: string, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...listKey, search],
    queryFn: ({ signal }) => api.get(`/admin/orders?${search}`, adminOrderListResponseSchema, { signal }),
    // Keep the old page on screen while the next one loads, so the table does not jump.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

export function useAdminOrder(reference: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: detailKey(reference ?? ""),
    queryFn: ({ signal }) => api.get(`/admin/orders/${encodeURIComponent(reference ?? "")}`, adminOrderSchema, { signal }),
    enabled: reference !== null,
  });
}

/** One step forward or back (D132). */
export function useOrderStep() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ order, direction }: { order: AdminOrder; direction: "next" | "back" }) =>
      api.post(
        `/admin/orders/${encodeURIComponent(order.reference)}/${direction === "next" ? "advance" : "move-back"}`,
        { version: order.version },
        adminOrderSchema,
      ),
    onSuccess: (order) => queryClient.setQueryData(detailKey(order.reference), order),
    onError: (_error, { order }) => queryClient.invalidateQueries({ queryKey: detailKey(order.reference) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });
}

/** Staff cancel (D131). Stock and delivery seats change, so every open admin list refreshes. */
export function useStaffCancelOrder() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ order, reason, returnStock }: { order: AdminOrder; reason: string; returnStock: boolean }) =>
      api.post(
        `/admin/orders/${encodeURIComponent(order.reference)}/cancel`,
        { version: order.version, reason, returnStock },
        adminOrderSchema,
      ),
    onSuccess: (order) => queryClient.setQueryData(detailKey(order.reference), order),
    onError: (_error, { order }) => queryClient.invalidateQueries({ queryKey: detailKey(order.reference) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

/**
 * The times an order can move to (#14): "Change delivery time" and "Confirm with a new delivery time".
 * Further ahead for an order with a Pet House; never the order's own time while it holds that seat.
 */
export function useOrderDeliveryWindows(reference: string, enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminOrdersKey, "windows", reference],
    queryFn: async ({ signal }) =>
      (await api.get(`/admin/orders/${encodeURIComponent(reference)}/delivery-windows`, deliveryWindowsResponseSchema, { signal })).windows,
    enabled,
  });
}

/** "Change delivery time" (#14, D268): the seat moves to the new window and the customer gets an email. */
export function useChangeDeliveryTime() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ order, windowId }: { order: AdminOrder; windowId: string }) =>
      api.post(`/admin/orders/${encodeURIComponent(order.reference)}/delivery-time`, { version: order.version, windowId }, adminOrderSchema),
    onSuccess: (order) => queryClient.setQueryData(detailKey(order.reference), order),
    onError: (_error, { order }) => queryClient.invalidateQueries({ queryKey: detailKey(order.reference) }),
    // Two windows' seats changed: the Delivery page and the day views refresh too.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

/** One readable line for a failed order action. */
export function describeAdminOrderError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "CONFLICT":
      return text(
        "Someone else changed this order a moment ago. It has been reloaded: please check it and try again.",
        "غيّر شخص آخر هذا الطلب للتو. تمت إعادة تحميله: راجعه ثم حاول مرة أخرى.",
      );
    case "FORBIDDEN":
      return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This order could not be found.", "تعذّر العثور على هذا الطلب.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
