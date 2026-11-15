"use client";

import { ADMIN_ORDER_PAGE_SIZES, type AdminOrderSort, localDateSchema, type OrderStatus } from "@nennus-catio/contracts";
import {
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  House,
  Search,
  Settings,
  ShoppingBag,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { dateLabel, qatarToday, timeRange } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  type AdminOrderFilters,
  adminOrderSearch,
  DELIVERY_DAY_LIMIT,
  type DeliveryWindowOrders,
  deliveryDayFilters,
  describeAdminOrderError,
  emptyAdminOrderFilters,
  linkedOrderFilters,
  ordersByWindow,
  useAdminOrders,
} from "@/shared/api/admin-orders";
import { useDeliveryOptions } from "@/shared/api/orders";
import { useCopy } from "@/shared/lib/copy";
import { areasByCity } from "@/shared/lib/delivery-areas";
import { formatMoney } from "@/shared/lib/format";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { AdminPage, Empty, ErrorMessage } from "@/shared/ui/BusinessUI";
import { DaySchedule } from "@/shared/ui/DaySchedule";
import { DayStepper } from "@/shared/ui/DayStepper";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { OrderApiDetail, OrderStatusBadge } from "../components/OrderApiDetail";
import { orderDayCells, orderDayColumns } from "../components/OrderDayCells";
import { ADMIN_ORDER_STATUS, placedAt, STATUS_FILTER_ORDER } from "../lib/admin-order-labels";

/**
 * Real orders (7c-2, D131-D134): summary cards, search, filters, sorting and pages from
 * `/api/admin/orders`, a detail panel with the staff actions, and the operations CSV for roles with
 * Export. Staff do not enter orders here (D101): customers order on the website. "Deliveries by day"
 * (D253) shows one day's deliveries under each delivery window, as Bookings' Day view does for
 * grooming; the Delivery page's booked windows link to it (`?date=&time=`).
 */
export function AdminOrdersApiPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <OrdersApi />
    </Suspense>
  );
}

const SORTS: readonly { value: AdminOrderSort; en: string; ar: string }[] = [
  { value: "newest", en: "Newest first", ar: "الأحدث أولاً" },
  { value: "oldest", en: "Oldest first", ar: "الأقدم أولاً" },
  { value: "window", en: "Delivery time", ar: "موعد التوصيل" },
  { value: "total", en: "Highest total", ar: "الأعلى قيمة" },
];

function OrdersApi() {
  const c = useCopy();
  const canExport = useAdminAccess().can("orders", "export");
  const searchParams = useSearchParams();
  const linkedSearch = searchParams.get("search") ?? "";
  // The whole link: a header search, or a Dashboard link with filters (#12).
  const linkKey = searchParams.toString();
  // A Delivery page window (D253): that date's deliveries, the window marked. A date that does not exist
  // (2026-02-30, typed into the address) is ignored.
  const dateParam = searchParams.get("date") ?? "";
  const linkedDate = localDateSchema.safeParse(dateParam).success ? dateParam : "";
  const linkedTime = searchParams.get("time") ?? "";
  const [view, setView] = useState<"list" | "day">(linkedDate ? "day" : "list");
  const [day, setDay] = useState(linkedDate || qatarToday());
  const [filters, setFilters] = useState<AdminOrderFilters>(() => linkedOrderFilters(searchParams));
  const [typed, setTyped] = useState(linkedSearch);
  const [reference, setReference] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastLink = useRef(linkKey);
  const list = useAdminOrders(adminOrderSearch(filters));
  const dayFilters = deliveryDayFilters(day);
  const dayList = useAdminOrders(adminOrderSearch(dayFilters), { enabled: view === "day" });
  // Another day is loading: the list query keeps the previous answer as a placeholder, which must never
  // show under the new date.
  const dayShown = dayList.isPlaceholderData ? undefined : dayList.data;
  const dayLoading = dayList.isPending || dayList.isPlaceholderData;
  const dayWindows = ordersByWindow(dayShown?.orders ?? []);
  /** The window a Delivery page link points at: that date and start only, wherever the view goes. */
  const isLinkedWindow = (group: DeliveryWindowOrders) => !!linkedDate && !!linkedTime && day === linkedDate && group.start === linkedTime;
  const areas = useDeliveryOptions();

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new link while the page is open (the header search, Back/Forward): it keeps the page mounted, so
  // search for it here and show what a fresh visit shows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the link's text (linkKey) decides; searchParams is read with it.
  useEffect(() => {
    if (lastLink.current === linkKey) return;
    lastLink.current = linkKey;
    setView(linkedDate ? "day" : "list");
    setDay(linkedDate || qatarToday());
    setTyped(linkedSearch);
    setFilters(linkedOrderFilters(searchParams));
    setReference(null);
    setDownloadError("");
  }, [linkKey]);

  useEffect(() => {
    if (reference && detailRef.current) {
      detailRef.current.focus({ preventScroll: true });
      if (window.innerWidth < 1200) detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [reference]);

  function patch(values: Partial<AdminOrderFilters>) {
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
  const count = (...statuses: OrderStatus[]) => (counts ? statuses.reduce((sum, status) => sum + counts[status], 0) : "–");
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered =
    !!filters.q.trim() ||
    !!filters.status ||
    !!filters.fulfilment ||
    !!filters.area ||
    filters.needsAction ||
    filters.houses ||
    !!filters.from ||
    !!filters.to;
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to;

  return (
    <AdminPage
      module="orders"
      title={c.text("Orders", "الطلبات")}
      subtitle={c.text(
        "Website orders from payment to delivery or pickup. Customers place orders on the website.",
        "طلبات الموقع من الدفع حتى التوصيل أو الاستلام. يطلب العملاء عبر الموقع.",
      )}
      actions={
        canExport && (
          // What is on screen: the day in "Deliveries by day", the list's filters in the List.
          <DownloadMenu
            path="/admin/orders"
            search={adminOrderSearch(view === "day" ? dayFilters : filters, { paged: false })}
            onError={setDownloadError}
            name={view === "day" ? (format) => c.text(`Download this day (${format})`, `تنزيل هذا اليوم (${format})`) : undefined}
          />
        )
      }
    >
      <ErrorMessage message={downloadError} />
      <div className={`orders-layout${reference ? " orders-layout--detail" : ""}`}>
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics">
            <AdminMetric
              icon={ShoppingBag}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("All orders", "جميع الطلبات")}
              value={count(...STATUS_FILTER_ORDER)}
            />
            <AdminMetric
              icon={TriangleAlert}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Paid, to prepare", "مدفوعة للتجهيز")}
              value={count("confirmed")}
            />
            <AdminMetric
              icon={Settings}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Preparing", "قيد التجهيز")}
              value={count("preparing")}
            />
            <AdminMetric
              icon={Truck}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Out for delivery or ready", "خرجت للتوصيل أو جاهزة")}
              value={count("out_for_delivery", "ready_for_pickup")}
            />
          </div>
          <fieldset className="admin-tabs" aria-label={c.text("Orders view", "عرض الطلبات")}>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              {c.text("List", "القائمة")}
            </button>
            <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>
              {c.text("Deliveries by day", "التوصيلات حسب اليوم")}
            </button>
          </fieldset>

          {view === "day" ? (
            <div className="panel orders-records">
              <DayStepper day={day} onChange={setDay} />
              <h3 className="delivery-date">{dateLabel(day, c.locale)}</h3>
              {dayList.isError && (
                <div className="inline-state" role="alert">
                  <p>{describeAdminOrderError(dayList.error, c.text)}</p>
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
              {/* The same day table as the Delivery page's Day overview (D255, D257), with every window open to start;
                  here each order opens its panel. It stays while a day loads, so Show all or Hide all carries on. */}
              <DaySchedule
                label={c.text("Delivery windows on this day", "نوافذ التوصيل في هذا اليوم")}
                timeHeader={c.text("Window", "النافذة")}
                countHeader={c.text("Count", "العدد")}
                details={{ columns: orderDayColumns(c), label: (time) => c.text(`Orders at ${time}`, `طلبات ${time}`), startOpen: true }}
                rows={dayWindows.map((group) => ({
                  key: group.key,
                  time: timeRange(group.start, group.end),
                  count: String(group.orders.length),
                  marked: isLinkedWindow(group),
                  details: group.orders.map((order) => ({
                    key: order.reference,
                    cells: orderDayCells(
                      order,
                      <button type="button" className="orders-reference-button" onClick={(e) => open(order.reference, e.currentTarget)}>
                        <bdi>{order.reference}</bdi>
                      </button>,
                      c,
                    ),
                  })),
                }))}
                dayKey={day}
                empty={dayShown && <Empty>{c.text("No deliveries on this day.", "لا توجد توصيلات في هذا اليوم.")}</Empty>}
              />
              {dayShown && dayShown.total > DELIVERY_DAY_LIMIT && (
                <p className="small muted">{c.text(`Showing the first ${DELIVERY_DAY_LIMIT}; use the list for the rest.`, `عرض أول ${DELIVERY_DAY_LIMIT}؛ استخدم القائمة للباقي.`)}</p>
              )}
              <p className="small muted">
                {c.text(
                  "Pickups, and cancelled or expired orders, are not shown here; find them in the list.",
                  "لا تظهر هنا طلبات الاستلام ولا الطلبات الملغاة أو المنتهية؛ تجدها في القائمة.",
                )}
              </p>
            </div>
          ) : (
            <div className="panel orders-records">
              <div className="orders-filter-toolbar orders-filter-toolbar--real">
                <label className="orders-search">
                  <Search size={16} />
                  <input
                    aria-label={c.text("Search by order, name, email, phone or SKU", "ابحث بالطلب أو الاسم أو البريد أو الهاتف أو رمز المنتج")}
                    placeholder={c.text("Search by order, name, email, phone or SKU…", "ابحث بالطلب أو الاسم أو البريد أو الهاتف أو رمز المنتج…")}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </label>
                <select aria-label={c.text("Status", "الحالة")} value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
                  <option value="">{c.text("All statuses", "كل الحالات")}</option>
                  <option value="open">{c.text("Still open", "ما زالت مفتوحة")}</option>
                  {STATUS_FILTER_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {c.local(ADMIN_ORDER_STATUS[status])}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={c.text("Delivery or pickup", "توصيل أو استلام")}
                  value={filters.fulfilment}
                  onChange={(e) => patch({ fulfilment: e.target.value as AdminOrderFilters["fulfilment"] })}
                >
                  <option value="">{c.text("Delivery and pickup", "التوصيل والاستلام")}</option>
                  <option value="delivery">{c.text("Delivery", "توصيل")}</option>
                  <option value="pickup">{c.text("Pickup", "استلام")}</option>
                </select>
                <select aria-label={c.text("Area", "المنطقة")} value={filters.area} onChange={(e) => patch({ area: e.target.value })}>
                  <option value="">{c.text("All areas", "كل المناطق")}</option>
                  {areasByCity(areas.data?.areas ?? []).map((group) => (
                    <optgroup key={group.cityId} label={c.local(group.city)}>
                      {group.areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {c.local(area.name)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select aria-label={c.text("Sort", "الترتيب")} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as AdminOrderSort })}>
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
                  onChange={(e) => patch({ dateField: e.target.value as AdminOrderFilters["dateField"] })}
                >
                  <option value="placed">{c.text("Order date", "تاريخ الطلب")}</option>
                  <option value="window">{c.text("Delivery date", "تاريخ التوصيل")}</option>
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
                <label className="row">
                  <input type="checkbox" checked={filters.houses} onChange={(e) => patch({ houses: e.target.checked })} />
                  {c.text("Pet House orders only", "طلبات بيوت الحيوانات فقط")}
                </label>
                {filtered && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setTyped("");
                      setFilters(emptyAdminOrderFilters());
                    }}
                  >
                    {c.text("Reset filters", "إعادة المرشحات")}
                  </button>
                )}
              </div>
              {badRange && (
                <p className="form-error" role="alert">
                  {c.text("The start date is after the end date, so no orders can match.", "تاريخ البداية بعد تاريخ النهاية، لذا لا يمكن أن تتطابق أي طلبات.")}
                </p>
              )}
              {list.isError && (
                <div className="inline-state" role="alert">
                  <p>{describeAdminOrderError(list.error, c.text)}</p>
                  <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                    {c.text("Retry", "أعد المحاولة")}
                  </button>
                </div>
              )}
              {list.isPending && (
                <p className="muted" role="status" aria-busy="true">
                  {c.text("Loading orders…", "جارٍ تحميل الطلبات…")}
                </p>
              )}
              {data && (
                <>
                  <div className="orders-table-scroll">
                    <table className="orders-table orders-table--real" aria-busy={list.isFetching}>
                      <thead>
                        <tr>
                          <th>{c.text("Order", "الطلب")}</th>
                          <th>{c.text("Customer", "العميل")}</th>
                          <th>{c.text("Delivery or pickup", "التوصيل أو الاستلام")}</th>
                          <th>{c.text("Items", "العناصر")}</th>
                          <th>{c.text("Total", "الإجمالي")}</th>
                          <th>{c.text("Status", "الحالة")}</th>
                          <th>
                            <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((order) => (
                          <tr key={order.reference} className={reference === order.reference ? "is-selected" : ""}>
                            <td>
                              <button type="button" className="orders-reference-button" onClick={(e) => open(order.reference, e.currentTarget)}>
                                <bdi>{order.reference}</bdi>
                              </button>
                              <small>{placedAt(order.placedAt, c.locale)}</small>
                            </td>
                            <td>
                              <strong>{order.contactName}</strong>
                              <small>
                                <bdi>{order.contactPhone}</bdi>
                              </small>
                            </td>
                            <td>
                              <span className="orders-fulfilment-cell">
                                {order.fulfilment === "delivery" ? <Truck size={17} /> : <ShoppingBag size={16} />}
                                {order.fulfilment === "delivery"
                                  ? order.area
                                    ? c.local(order.area)
                                    : c.text("Delivery", "توصيل")
                                  : c.text("Pickup", "استلام")}
                              </span>
                              {order.window && (
                                <small>
                                  {dateLabel(order.window.date, c.locale)}, <bdi dir="ltr">{`${order.window.start}–${order.window.end}`}</bdi>
                                </small>
                              )}
                            </td>
                            <td>
                              {order.itemCount}
                              {/* A big item to plan for (#14). */}
                              {order.hasHouse && (
                                <small className="orders-house-mark">
                                  <House size={12} aria-hidden="true" />
                                  {c.text("Pet House", "بيت حيوان")}
                                </small>
                              )}
                            </td>
                            <td>
                              <bdi>{formatMoney(order.total, c.locale)}</bdi>
                            </td>
                            <td>
                              <OrderStatusBadge status={order.status} />
                              {order.refundNeeded && <small className="orders-refund">{c.text("Refund needed", "يحتاج استرداداً")}</small>}
                              {order.attention && (
                                <small className="orders-refund">{c.text("Payment to check", "دفعة تحتاج مراجعة")}</small>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={c.text(`View order ${order.reference}`, `عرض الطلب ${order.reference}`)}
                                onClick={(e) => open(order.reference, e.currentTarget)}
                              >
                                <Ellipsis size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.orders.length === 0 && (
                    <Empty>
                      {filtered
                        ? c.text("No orders match these filters.", "لا توجد طلبات مطابقة لهذه المرشحات.")
                        : c.text("No orders yet. Orders placed on the website appear here.", "لا توجد طلبات بعد. تظهر هنا الطلبات المرسلة عبر الموقع.")}
                    </Empty>
                  )}
                  <div className="orders-pagination">
                    <nav aria-label={c.text("Order pages", "صفحات الطلبات")}>
                      <button
                        type="button"
                        aria-label={c.text("Previous page", "الصفحة السابقة")}
                        disabled={data.page <= 1}
                        onClick={() => patch({ page: data.page - 1 })}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span aria-current="page">{c.text(`Page ${data.page} of ${pages}`, `صفحة ${data.page} من ${pages}`)}</span>
                      <button
                        type="button"
                        aria-label={c.text("Next page", "الصفحة التالية")}
                        disabled={data.page >= pages}
                        onClick={() => patch({ page: data.page + 1 })}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </nav>
                    <span>
                      {data.total === 0
                        ? c.text("0 orders", "٠ طلبات")
                        : c.text(
                            `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} orders`,
                            `عرض ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} من ${data.total} طلباً`,
                          )}
                    </span>
                    <select
                      aria-label={c.text("Orders per page", "طلبات لكل صفحة")}
                      value={filters.pageSize}
                      onChange={(e) => patch({ pageSize: Number(e.target.value) })}
                    >
                      {ADMIN_ORDER_PAGE_SIZES.map((size) => (
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
        {reference && <OrderApiDetail key={reference} reference={reference} close={closeDetail} panelRef={detailRef} />}
      </div>
    </AdminPage>
  );
}
