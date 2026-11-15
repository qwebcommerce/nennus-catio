"use client";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Package,
  Scissors,
  ShoppingBag,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useDashboardDate } from "../components/DashboardDate";
import { AdminDashboardApiPage } from "./AdminDashboardApiPage";
import {
  dashboardSnapshot,
  dashboardItemCount,
  isHouseOrder,
  qatarDay,
  qatarTime,
  shiftDay,
  stockAlerts,
} from "../lib/dashboard";

function Filters<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="dash-filters" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          aria-pressed={value === option.id}
          aria-label={`${option.label}${option.count !== undefined ? ` (${option.count})` : ""}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span> ({option.count})</span>}
        </button>
      ))}
    </fieldset>
  );
}
function Heading({
  icon: Icon,
  children,
  href,
  action,
}: {
  icon: LucideIcon;
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="dash-panel-heading">
      <h2>
        <Icon size={18} aria-hidden="true" />
        {children}
      </h2>
      {href && (
        <Link href={href}>
          {action}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
function MiniChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="dash-spark" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={shiftDay("2000-01-01", index)}
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}
function Metric({
  icon: Icon,
  value,
  label,
  note,
  tone,
  history,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  note: string;
  tone: string;
  history: number[];
}) {
  return (
    <article className={`dash-metric dash-metric--${tone}`}>
      <span className="dash-metric-icon">
        <Icon size={25} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <div className="dash-metric-copy">
        <strong>
          <bdi>{value}</bdi>
        </strong>
        <span>{label}</span>
        <small>{note}</small>
      </div>
      <MiniChart values={history} />
    </article>
  );
}
/** API mode: the real Dashboard (#12 part 1). Mock mode keeps the demo page below. */
export function AdminDashboardPage() {
  if (useDataSourceOrNull() === "api") return <AdminDashboardApiPage />;
  return <DashboardDemo />;
}

function DashboardDemo() {
  const c = useCopy(),
    d = useBusiness(),
    { date } = useDashboardDate();
  const [operationFilter, setOperationFilter] = useState<
    "all" | "orders" | "grooming" | "deliveries"
  >("all");
  const [orderFilter, setOrderFilter] = useState<"all" | "products" | "houses">(
    "all",
  );
  const [bookingFilter, setBookingFilter] = useState<
    "all" | "in-store" | "home"
  >("all");
  const [period, setPeriod] = useState<"1" | "7" | "30">("1");
  const [showRequests, setShowRequests] = useState(false);
  const today = dashboardSnapshot(d, date);
  const performance = dashboardSnapshot(d, date, Number(period) as 1 | 7 | 30);
  const history = Array.from({ length: 7 }, (_, i) =>
    dashboardSnapshot(d, shiftDay(date, i - 6)),
  );
  const openOrders = d.orders.filter((o) =>
    ["pending", "processing", "ready"].includes(o.status),
  );
  const pendingBookings = d.bookings.filter((b) => b.status === "pending");
  const activeDeliveries = openOrders.filter(
    (o) => o.fulfilment === "delivery" && o.payment === "paid",
  );
  const alerts = stockAlerts(d);
  const customer = (id: string) =>
    d.guests.find((g) => g.id === id)?.name ?? c.text("Guest", "ضيف");
  const bookingPhoto = (id: string) =>
    d.packages.find((p) => p.id === id)?.image ?? "";
  const orderPhoto = (id: string) =>
    d.products.find((p) => p.id === id)?.image ?? "";
  const operations = [
    ...today.bookings.map((b) => ({
      key: b.id,
      kind: "grooming" as const,
      id: b.id,
      time: d.slots.find((s) => s.id === b.slotId)?.time ?? "—",
      name: b.petName,
      customer: customer(b.customerId),
      image: bookingPhoto(b.packageId),
      icon: Scissors,
      activity: c.text("Grooming", "عناية"),
      details: `${b.location === "home" ? c.text("Home", "المنزل") : c.text("In-store", "في المتجر")} · ${c.local(b.packageName)}`,
      status: b.status,
      href: `/admin/bookings?search=${b.id}`,
    })),
    ...today.orders.map((o) => ({
      key: o.id,
      kind: "orders" as const,
      id: o.id,
      time: qatarTime(o.date),
      name: o.id,
      customer: customer(o.customerId),
      image: orderPhoto(o.items[0]?.productId),
      icon: Package,
      activity: c.text("Product order", "طلب منتجات"),
      details: dashboardItemCount(
        o.items.reduce((sum, item) => sum + item.quantity, 0),
        c.locale,
      ),
      status: o.status,
      href: `/admin/orders?search=${o.id}`,
    })),
    ...today.deliveries.map((o) => ({
      key: `delivery-${o.id}`,
      kind: "deliveries" as const,
      id: o.id,
      time: d.slots.find((s) => s.id === o.slotId)?.time ?? "—",
      name: o.id,
      customer: customer(o.customerId),
      image: "",
      icon: Truck,
      activity: c.text("Delivery", "توصيل"),
      details: c.text("Fleet connection pending", "بانتظار ربط الأسطول"),
      status: o.status,
      href: `/admin/orders?search=${o.id}`,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key));
  const visibleOperations = operations.filter(
    (r) => operationFilter === "all" || r.kind === operationFilter,
  );
  const orders = [...d.orders].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const filteredOrders = orders.filter(
    (o) =>
      orderFilter === "all" ||
      (orderFilter === "houses" ? isHouseOrder(d, o) : !isHouseOrder(d, o)),
  );
  const upcoming = d.bookings
    .filter(
      (b) =>
        ["confirmed", "pending", "processing"].includes(b.status) &&
        (d.slots.find((s) => s.id === b.slotId)?.date ?? "") >= date,
    )
    .sort((a, b) => {
      const aSlot = d.slots.find((s) => s.id === a.slotId),
        bSlot = d.slots.find((s) => s.id === b.slotId);
      return (
        `${aSlot?.date}${aSlot?.time}`.localeCompare(
          `${bSlot?.date}${bSlot?.time}`,
        ) || a.id.localeCompare(b.id)
      );
    });
  const filteredBookings = upcoming.filter(
    (b) => bookingFilter === "all" || b.location === bookingFilter,
  );
  const attention = [
    {
      label: c.text("Orders awaiting fulfilment", "طلبات بانتظار التجهيز"),
      count: openOrders.length,
      href: "/admin/orders",
      tone: "red",
    },
    {
      label: c.text("Bookings awaiting confirmation", "حجوزات بانتظار التأكيد"),
      count: pendingBookings.length,
      href: "/admin/bookings",
      tone: "orange",
    },
    {
      label: c.text("Delivery orders to review", "طلبات توصيل تحتاج للمراجعة"),
      count: activeDeliveries.length,
      href: "/admin/dispatch",
      tone: "orange",
    },
    {
      label: c.text("SKUs low or out of stock", "أصناف بمخزون منخفض أو منعدم"),
      count: alerts.length,
      href: "/admin/products",
      tone: "amber",
    },
  ];
  const selectedToday = date === qatarDay(new Date().toISOString());
  const maxRevenue = Math.max(100, ...performance.series.map((b) => b.value));
  const compactMoney = (minor: number) =>
    c.ar
      ? c.money(minor)
      : `QAR ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(minor / 100)}`;
  const revenueNote = c.text(
    "Paid Shop + Grooming",
    "المتجر والعناية المدفوعان",
  );

  return (
    <div className="reference-dashboard">
      <AdminPage
        module="dashboard"
        title={c.text("Dashboard", "لوحة التحكم")}
        subtitle={c.text(
          "Good day, Admin. Here’s what’s happening across Nennus Catio.",
          "مرحباً، إليك آخر العمليات في Nennus Catio.",
        )}
      >
        <div className="dash-metrics">
          <Metric
            icon={BarChart3}
            value={compactMoney(today.revenue)}
            label={c.text(
              selectedToday ? "Today’s revenue" : "Revenue",
              selectedToday ? "إيرادات اليوم" : "الإيرادات",
            )}
            note={revenueNote}
            tone="blue"
            history={history.map((s) => s.revenue)}
          />
          <Metric
            icon={ShoppingBag}
            value={today.orders.length}
            label={c.text(
              selectedToday ? "Orders today" : "Orders",
              selectedToday ? "طلبات اليوم" : "الطلبات",
            )}
            note={c.text(
              `${openOrders.length} open orders overall`,
              `${openOrders.length} طلبات مفتوحة إجمالاً`,
            )}
            tone="orange"
            history={history.map((s) => s.orders.length)}
          />
          <Metric
            icon={CalendarDays}
            value={today.bookings.length}
            label={c.text(
              selectedToday ? "Bookings today" : "Bookings",
              selectedToday ? "حجوزات اليوم" : "الحجوزات",
            )}
            note={c.text(
              `${upcoming.length} upcoming from this date`,
              `${upcoming.length} حجوزات قادمة من هذا التاريخ`,
            )}
            tone="green"
            history={history.map((s) => s.bookings.length)}
          />
          <Metric
            icon={Truck}
            value={today.deliveries.length}
            label={c.text(
              selectedToday ? "Deliveries today" : "Deliveries",
              selectedToday ? "توصيلات اليوم" : "التوصيلات",
            )}
            note={c.text("FleetWiz connection pending", "بانتظار ربط FleetWiz")}
            tone="orange"
            history={history.map((s) => s.deliveries.length)}
          />
        </div>

        <div className="dash-main-grid">
          <section className="panel dash-operations">
            <Heading
              icon={CalendarDays}
              href="/admin/grooming-calendar"
              action={c.text("View calendar", "عرض التقويم")}
            >
              {c.text(
                selectedToday ? "Today’s operations" : "Daily operations",
                selectedToday ? "عمليات اليوم" : "العمليات اليومية",
              )}
            </Heading>
            <Filters
              label={c.text("Operation type", "نوع العملية")}
              value={operationFilter}
              onChange={setOperationFilter}
              options={[
                {
                  id: "all",
                  label: c.text("All", "الكل"),
                  count: operations.length,
                },
                {
                  id: "orders",
                  label: c.text("Orders", "الطلبات"),
                  count: today.orders.length,
                },
                {
                  id: "grooming",
                  label: c.text("Grooming", "العناية"),
                  count: today.bookings.length,
                },
                {
                  id: "deliveries",
                  label: c.text("Deliveries", "التوصيلات"),
                  count: today.deliveries.length,
                },
              ]}
            />
            <div className="dash-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{c.text("Time", "الوقت")}</th>
                    <th>{c.text("Customer / Pet", "العميل / الحيوان")}</th>
                    <th>{c.text("Activity", "النشاط")}</th>
                    <th>{c.text("Details", "التفاصيل")}</th>
                    <th>{c.text("Status", "الحالة")}</th>
                    <th>
                      <span className="sr-only">
                        {c.text("Open record", "فتح السجل")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOperations.slice(0, 5).map((row) => (
                    <tr key={row.key}>
                      <td>
                        <bdi>{row.time}</bdi>
                      </td>
                      <td>
                        <Link className="dash-person" href={row.href}>
                          {row.image ? (
                            <Photo src={row.image} alt="" sizes="30px" />
                          ) : (
                            <row.icon size={22} aria-hidden="true" />
                          )}
                          <span>
                            <strong>
                              <bdi>{row.name}</bdi>
                            </strong>
                            <small>{row.customer}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="dash-activity">
                          <row.icon size={16} aria-hidden="true" />
                          {row.activity}
                        </span>
                      </td>
                      <td className="dash-operation-detail">{row.details}</td>
                      <td>
                        <StatusBadge value={row.status} />
                      </td>
                      <td>
                        <Link
                          className="dash-record-action"
                          href={row.href}
                          aria-label={c.text(`Open ${row.id}`, `فتح ${row.id}`)}
                        >
                          <MoreHorizontal size={15} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleOperations.length && (
                <p className="dash-empty">
                  {c.text(
                    "No operations for this selection.",
                    "لا عمليات لهذا الاختيار.",
                  )}
                </p>
              )}
            </div>
            {visibleOperations.length > 5 && (
              <p className="sr-only">
                {c.text(
                  `Showing 5 of ${visibleOperations.length}. Open the calendar or record lists for all operations.`,
                  `عرض 5 من ${visibleOperations.length}. افتح التقويم أو قوائم السجلات لعرض جميع العمليات.`,
                )}
              </p>
            )}
          </section>
          <section className="panel dash-attention">
            <Heading icon={AlertTriangle}>
              {c.text("Needs attention", "يحتاج إلى متابعة")}
            </Heading>
            {attention.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="dash-attention-item"
              >
                <strong className={`dash-count dash-count--${item.tone}`}>
                  {item.count}
                </strong>
                <span>{item.label}</span>
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            ))}
            <button
              type="button"
              className="dash-attention-item"
              onClick={() => setShowRequests(true)}
            >
              <strong className="dash-count dash-count--amber">—</strong>
              <span>
                {c.text("Custom house requests", "طلبات البيوت المخصصة")}
              </span>
              <ChevronRight size={13} aria-hidden="true" />
            </button>
            <Link className="dash-promotion" href="/admin/promotions">
              <Tag size={19} aria-hidden="true" />
              <span>
                {c.text(
                  "Review promotions · preview",
                  "مراجعة العروض · معاينة",
                )}
              </span>
              <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </section>
        </div>

        <div className="dash-lower-grid">
          <section className="panel">
            <Heading
              icon={ShoppingBag}
              href="/admin/orders"
              action={c.text("View all orders", "كل الطلبات")}
            >
              {c.text("Recent orders", "الطلبات الأخيرة")}
            </Heading>
            <Filters
              label={c.text("Order category", "فئة الطلب")}
              value={orderFilter}
              onChange={setOrderFilter}
              options={[
                {
                  id: "all",
                  label: c.text("All", "الكل"),
                  count: orders.length,
                },
                {
                  id: "products",
                  label: c.text("Products", "المنتجات"),
                  count: orders.filter((o) => !isHouseOrder(d, o)).length,
                },
                {
                  id: "houses",
                  label: c.text("Houses", "البيوت"),
                  count: orders.filter((o) => isHouseOrder(d, o)).length,
                },
              ]}
            />
            {filteredOrders.slice(0, 4).map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders?search=${o.id}`}
                className="dash-order-row"
              >
                <bdi>{o.id}</bdi>
                {orderPhoto(o.items[0]?.productId) && (
                  <Photo
                    src={orderPhoto(o.items[0]?.productId)}
                    alt=""
                    sizes="30px"
                  />
                )}
                <span>
                  {c.text(
                    isHouseOrder(d, o) ? "Houses" : "Products",
                    isHouseOrder(d, o) ? "البيوت" : "المنتجات",
                  )}
                </span>
                <bdi>{compactMoney(o.total)}</bdi>
                <StatusBadge value={o.status} />
              </Link>
            ))}
            {!filteredOrders.length && (
              <p className="dash-empty">
                {c.text(
                  orderFilter === "houses"
                    ? "No house orders. House checkout is not enabled yet."
                    : "No orders to show.",
                  orderFilter === "houses"
                    ? "لا طلبات بيوت. لم يُفعّل شراء البيوت بعد."
                    : "لا طلبات للعرض.",
                )}
              </p>
            )}
          </section>
          <section className="panel">
            <Heading
              icon={CalendarDays}
              href="/admin/bookings"
              action={c.text("View all bookings", "كل الحجوزات")}
            >
              {c.text("Upcoming bookings", "الحجوزات القادمة")}
            </Heading>
            <Filters
              label={c.text("Booking location", "مكان العناية")}
              value={bookingFilter}
              onChange={setBookingFilter}
              options={[
                {
                  id: "all",
                  label: c.text("All", "الكل"),
                  count: upcoming.length,
                },
                {
                  id: "in-store",
                  label: c.text("In-store", "في المتجر"),
                  count: upcoming.filter((b) => b.location === "in-store")
                    .length,
                },
                {
                  id: "home",
                  label: c.text("Home service", "خدمة منزلية"),
                  count: upcoming.filter((b) => b.location === "home").length,
                },
              ]}
            />
            {filteredBookings.slice(0, 4).map((b) => {
              const slot = d.slots.find((s) => s.id === b.slotId);
              return (
                <Link
                  key={b.id}
                  href={`/admin/bookings?search=${b.id}`}
                  className="dash-booking-row"
                >
                  <span className="dash-booking-time">
                    <bdi>{slot?.time ?? "—"}</bdi>
                    {slot?.date !== date && (
                      <small>
                        <bdi>{slot?.date.slice(5)}</bdi>
                      </small>
                    )}
                  </span>
                  <span className="dash-person">
                    {bookingPhoto(b.packageId) && (
                      <Photo
                        src={bookingPhoto(b.packageId)}
                        alt=""
                        sizes="30px"
                      />
                    )}
                    <span>
                      <strong>{b.petName}</strong>
                      <small>{customer(b.customerId)}</small>
                    </span>
                  </span>
                  <span className="dash-package">{c.local(b.packageName)}</span>
                  <StatusBadge value={b.status} />
                </Link>
              );
            })}
            {!filteredBookings.length && (
              <p className="dash-empty">
                {c.text(
                  "No upcoming bookings for this selection.",
                  "لا حجوزات قادمة لهذا الاختيار.",
                )}
              </p>
            )}
          </section>
          <section className="panel">
            <Heading
              icon={Package}
              href="/admin/products"
              action={c.text("View catalogue", "عرض الكتالوج")}
            >
              {c.text("Stock alerts", "تنبيهات المخزون")}
            </Heading>
            <div className="dash-stock-summary">
              <div>
                <strong>
                  {alerts.filter((a) => a.variant.stock === 0).length}
                </strong>
                <small>{c.text("Out of stock", "نفد المخزون")}</small>
              </div>
              <div>
                <strong>
                  {alerts.filter((a) => a.variant.stock > 0).length}
                </strong>
                <small>{c.text("Low stock", "مخزون منخفض")}</small>
              </div>
            </div>
            {alerts.slice(0, 4).map(({ product, variant }) => (
              <Link
                key={variant.id}
                href="/admin/products"
                className="dash-stock-row"
              >
                <Photo src={product.image} alt="" sizes="30px" />
                <span>
                  <strong>
                    <bdi>{variant.sku}</bdi>
                  </strong>
                  <small>
                    {c.local(product.name)} · {c.local(variant.label)}
                  </small>
                </span>
                <span
                  className={
                    variant.stock === 0 ? "dash-stock-out" : "dash-stock-low"
                  }
                >
                  {variant.stock === 0
                    ? c.text("Out of stock", "نفد المخزون")
                    : c.text(
                        `${variant.stock} left`,
                        `المتبقي ${variant.stock}`,
                      )}
                </span>
                <ChevronRight size={12} aria-hidden="true" />
              </Link>
            ))}
            {!alerts.length && (
              <p className="dash-empty">
                {c.text("No stock alerts.", "لا تنبيهات مخزون.")}
              </p>
            )}
          </section>
        </div>

        <section className="panel dash-performance">
          <Heading
            icon={BarChart3}
            href="/admin/finance"
            action={c.text("Open Finance", "فتح المالية")}
          >
            {c.text("Performance", "الأداء")}
          </Heading>
          <Filters
            label={c.text("Performance period", "فترة الأداء")}
            value={period}
            onChange={setPeriod}
            options={[
              {
                id: "1",
                label: c.text(
                  selectedToday ? "Today" : "Selected day",
                  selectedToday ? "اليوم" : "اليوم المحدد",
                ),
              },
              { id: "7", label: c.text("7 days", "7 أيام") },
              { id: "30", label: c.text("30 days", "30 يوماً") },
            ]}
          />
          <div className="dash-performance-body">
            <div
              className="dash-chart"
              role="img"
              aria-label={c.text(
                "Paid demo revenue by Qatar hour or date",
                "الإيرادات التجريبية المدفوعة حسب ساعة أو تاريخ قطر",
              )}
            >
              <div className="dash-chart-axis">
                {[1, 0.5, 0].map((ratio) => (
                  <span key={ratio}>
                    {Math.round((maxRevenue * ratio) / 100)}
                  </span>
                ))}
              </div>
              <div className="dash-chart-series">
                {performance.series.map((bucket, i) => (
                  <div className="dash-chart-column" key={bucket.key}>
                    <div className="dash-chart-track">
                      <span
                        style={{
                          height: `${(bucket.value / maxRevenue) * 100}%`,
                        }}
                        title={`${bucket.key}: ${compactMoney(bucket.value)}`}
                      />
                    </div>
                    <small>
                      {period === "1"
                        ? i % 4 === 0
                          ? `${bucket.key}:00`
                          : ""
                        : period === "7" || i % 5 === 0
                          ? bucket.key.slice(5)
                          : ""}
                    </small>
                  </div>
                ))}
              </div>
            </div>
            <div className="dash-performance-summary">
              {[
                {
                  label: c.text("Revenue", "الإيرادات"),
                  value: compactMoney(performance.revenue),
                },
                {
                  label: c.text("Orders", "الطلبات"),
                  value: performance.orders.length,
                },
                {
                  label: c.text("Bookings", "الحجوزات"),
                  value: performance.bookings.length,
                },
                {
                  label: c.text("Average order", "متوسط الطلب"),
                  value: compactMoney(performance.averageOrder),
                },
              ].map((item) => (
                <div key={item.label}>
                  <strong>
                    <bdi>{item.value}</bdi>
                  </strong>
                  <small>{item.label}</small>
                  <span>
                    <Clock3 size={11} aria-hidden="true" />
                    {c.text("Demo", "تجريبي")}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="dash-footnote">
            {c.text(
              "QAR · Qatar time. Revenue and orders use creation dates; bookings use appointment dates. Synthetic records only, not live analytics.",
              "ر.ق · توقيت قطر. الإيرادات والطلبات حسب تاريخ الإنشاء؛ الحجوزات حسب تاريخ الموعد. سجلات تجريبية وليست تحليلات مباشرة.",
            )}
          </p>
        </section>
      </AdminPage>
      <Modal
        open={showRequests}
        onOpenChange={setShowRequests}
        title={c.text("Custom house requests", "طلبات البيوت المخصصة")}
      >
        <p>
          {c.text(
            "Custom-request tracking is not set up yet. WhatsApp inquiries are not imported automatically, so a request count is unavailable. Contact settings control where customers send their inquiries.",
            "لم يُعدّ تتبع الطلبات المخصصة بعد. لا تُستورد استفسارات واتساب تلقائياً، لذلك لا يتوفر عدد للطلبات. تحدد إعدادات التواصل الوجهة التي يرسل إليها العملاء استفساراتهم.",
          )}
        </p>
        <Link
          href="/admin/settings"
          onClick={() => setShowRequests(false)}
          className="text-link"
        >
          {c.text("Review contact settings", "مراجعة إعدادات التواصل")}
          <ArrowRight size={14} />
        </Link>
      </Modal>
    </div>
  );
}
