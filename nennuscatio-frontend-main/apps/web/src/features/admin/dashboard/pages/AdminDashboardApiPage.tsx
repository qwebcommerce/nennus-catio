"use client";

import { DASHBOARD_PERIODS, type Dashboard, type DashboardOperation } from "@nennus-catio/contracts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  MoreHorizontal,
  Package,
  Scissors,
  ShoppingBag,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { BookingStatusBadge } from "@/features/admin/bookings/components/BookingApiDetail";
import { OrderStatusBadge } from "@/features/admin/orders/components/OrderApiDetail";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useAdminDashboard } from "@/shared/api/admin-dashboard";
import { describeFinanceError } from "@/shared/api/admin-finance";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney, formatSignedMoney } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import { AdminPage } from "@/shared/ui/BusinessUI";
import { useDashboardDate } from "../components/DashboardDate";
import { qatarDay } from "../lib/dashboard";

/** Operations shown in the table; the totals say how many the day has. */
const OPERATIONS_SHOWN = 10;
const LIST_SHOWN = 4;

type OperationFilter = "all" | "orders" | "grooming" | "deliveries";

/**
 * The real Dashboard (#12 part 1, D222-D223). Each part shows only when the role may view its page
 * (answer 3A): sales and performance money need Finance, orders Orders, bookings Bookings, stock
 * Products. Sales, orders and the performance count on the day they were paid; the Bookings and
 * Deliveries cards on the appointment or delivery day. Website sales only: in-store sales stay in the POS (D273/D285).
 */
export function AdminDashboardApiPage() {
  const c = useCopy();
  const access = useAdminAccess();
  const { date } = useDashboardDate();
  const [days, setDays] = useState<1 | 7 | 30>(1);
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [orderFilter, setOrderFilter] = useState<"all" | "products" | "houses">("all");
  const [bookingFilter, setBookingFilter] = useState<"all" | "shop" | "home">("all");
  const dashboard = useAdminDashboard(date, days);
  const data = dashboard.data;
  const selectedToday = date === qatarDay(new Date().toISOString());

  return (
    <div className="reference-dashboard">
      <AdminPage
        module="dashboard"
        title={c.text("Dashboard", "لوحة التحكم")}
        subtitle={c.text("Here’s what’s happening across Nennus Catio.", "إليك آخر العمليات في Nennus Catio.")}
      >
        {dashboard.isError && (
          <div className="inline-state" role="alert">
            <p>{describeFinanceError(dashboard.error, c.text)}</p>
            <button type="button" className="button button--secondary" onClick={() => void dashboard.refetch()}>
              {c.text("Retry", "أعد المحاولة")}
            </button>
          </div>
        )}
        {dashboard.isPending && (
          <p className="muted" role="status" aria-busy="true">
            {c.text("Loading the dashboard…", "جارٍ تحميل لوحة التحكم…")}
          </p>
        )}
        {data && (
          <>
            <Metrics data={data} selectedToday={selectedToday} />
            <div className="dash-main-grid">
              {(data.orders || data.bookings) && (
                <Operations data={data} selectedToday={selectedToday} filter={operationFilter} setFilter={setOperationFilter} />
              )}
              <Attention data={data} canPromotions={access.can("promotions", "view")} />
            </div>
            <div className="dash-lower-grid">
              {data.orders && <RecentOrders orders={data.orders} filter={orderFilter} setFilter={setOrderFilter} />}
              {data.bookings && <UpcomingBookings bookings={data.bookings} date={date} filter={bookingFilter} setFilter={setBookingFilter} />}
              {data.stock && <StockAlerts stock={data.stock} />}
            </div>
            {/* Relocation View alone shows the quotes paid in the period (15d). */}
            {(data.money || data.orders || data.bookings || data.relocation) && (
              <Performance data={data} days={days} setDays={setDays} selectedToday={selectedToday} />
            )}
            <p className="dash-footnote">
              {c.text(
                "QAR · Qatar time. Sales, orders and performance count on the day they were paid; the Bookings and Deliveries cards count the day of the appointment or delivery. Website sales only: in-store sales stay in the POS.",
                "ر.ق · توقيت قطر. تُحسب المبيعات والطلبات والأداء في يوم الدفع؛ وتُحسب بطاقتا الحجوزات والتوصيلات في يوم الموعد أو التوصيل. مبيعات الموقع فقط: تبقى مبيعات المتجر في نظام نقطة البيع.",
              )}
            </p>
          </>
        )}
      </AdminPage>
    </div>
  );
}

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

function Heading({ icon: Icon, children, href, action }: { icon: LucideIcon; children: ReactNode; href?: string; action?: string }) {
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

function Metric({ icon: Icon, value, label, note, tone }: { icon: LucideIcon; value: string | number; label: string; note: string; tone: string }) {
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
    </article>
  );
}

function Metrics({ data, selectedToday }: { data: Dashboard; selectedToday: boolean }) {
  const c = useCopy();
  return (
    <div className="dash-metrics">
      {data.money && (
        <Metric
          icon={BarChart3}
          value={formatSignedMoney(data.money.day.net, c.locale)}
          label={c.text(selectedToday ? "Today’s online sales" : "Online sales", selectedToday ? "مبيعات الموقع اليوم" : "مبيعات الموقع")}
          note={c.text("Paid less refunds", "المدفوع ناقص الاسترداد")}
          tone="blue"
        />
      )}
      {data.orders && (
        <Metric
          icon={ShoppingBag}
          value={data.orders.paidToday}
          label={c.text(selectedToday ? "Orders paid today" : "Orders paid", selectedToday ? "طلبات مدفوعة اليوم" : "طلبات مدفوعة")}
          note={c.text(`${data.orders.toPrepare} paid and waiting to be prepared`, `${data.orders.toPrepare} مدفوعة بانتظار التجهيز`)}
          tone="orange"
        />
      )}
      {data.bookings && (
        <Metric
          icon={CalendarDays}
          value={data.bookings.today}
          label={c.text(selectedToday ? "Bookings today" : "Bookings", selectedToday ? "حجوزات اليوم" : "الحجوزات")}
          note={c.text("Appointments on this day", "مواعيد في هذا اليوم")}
          tone="green"
        />
      )}
      {data.orders && (
        <Metric
          icon={Truck}
          value={data.orders.deliveriesToday}
          label={c.text(selectedToday ? "Deliveries today" : "Deliveries", selectedToday ? "توصيلات اليوم" : "التوصيلات")}
          note={c.text(`${data.orders.deliveriesNotOut} not out yet · FleetWiz not connected yet`, `${data.orders.deliveriesNotOut} لم تخرج بعد · لم يُربط FleetWiz بعد`)}
          tone="orange"
        />
      )}
    </div>
  );
}

function Operations({
  data,
  selectedToday,
  filter,
  setFilter,
}: {
  data: Dashboard;
  selectedToday: boolean;
  filter: OperationFilter;
  setFilter: (value: OperationFilter) => void;
}) {
  const c = useCopy();
  const all: DashboardOperation[] = [...(data.orders?.operations ?? []), ...(data.bookings?.operations ?? [])].sort(
    (x, y) => x.time.localeCompare(y.time) || x.reference.localeCompare(y.reference),
  );
  const totals = {
    orders: data.orders?.operationTotals.orders ?? 0,
    deliveries: data.orders?.operationTotals.deliveries ?? 0,
    grooming: data.bookings?.operationTotals.bookings ?? 0,
  };
  const visible = all.filter((row) =>
    filter === "all" ? true : filter === "orders" ? row.kind === "order" : filter === "deliveries" ? row.kind === "delivery" : row.kind === "booking",
  );
  const total =
    filter === "all" ? totals.orders + totals.deliveries + totals.grooming : filter === "orders" ? totals.orders : filter === "deliveries" ? totals.deliveries : totals.grooming;
  const options: { id: OperationFilter; label: string; count: number }[] = [{ id: "all", label: c.text("All", "الكل"), count: totals.orders + totals.deliveries + totals.grooming }];
  if (data.orders) options.push({ id: "orders", label: c.text("Orders", "الطلبات"), count: totals.orders });
  if (data.bookings) options.push({ id: "grooming", label: c.text("Grooming", "العناية"), count: totals.grooming });
  if (data.orders) options.push({ id: "deliveries", label: c.text("Deliveries", "التوصيلات"), count: totals.deliveries });
  return (
    <section className="panel dash-operations">
      <Heading
        icon={CalendarDays}
        href={data.bookings ? "/admin/grooming-calendar" : "/admin/orders"}
        action={data.bookings ? c.text("View calendar", "عرض التقويم") : c.text("View orders", "عرض الطلبات")}
      >
        {c.text(selectedToday ? "Today’s operations" : "Daily operations", selectedToday ? "عمليات اليوم" : "العمليات اليومية")}
      </Heading>
      <Filters label={c.text("Operation type", "نوع العملية")} value={filter} onChange={setFilter} options={options} />
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
                <span className="sr-only">{c.text("Open record", "فتح السجل")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, OPERATIONS_SHOWN).map((row) => (
              <OperationRow key={`${row.kind}-${row.reference}`} row={row} />
            ))}
          </tbody>
        </table>
        {!visible.length && <p className="dash-empty">{c.text("No operations for this selection.", "لا عمليات لهذا الاختيار.")}</p>}
      </div>
      {total > Math.min(visible.length, OPERATIONS_SHOWN) && (
        <p className="dash-footnote">
          {c.text(
            `Showing ${Math.min(visible.length, OPERATIONS_SHOWN)} of ${total}. Open the orders, bookings or calendar for all of them.`,
            `عرض ${Math.min(visible.length, OPERATIONS_SHOWN)} من ${total}. افتح الطلبات أو الحجوزات أو التقويم لعرضها كلها.`,
          )}
        </p>
      )}
    </section>
  );
}

function OperationRow({ row }: { row: DashboardOperation }) {
  const c = useCopy();
  const href = row.kind === "booking" ? `/admin/bookings?search=${encodeURIComponent(row.reference)}` : `/admin/orders?search=${encodeURIComponent(row.reference)}`;
  const Icon = row.kind === "booking" ? Scissors : row.kind === "delivery" ? Truck : ShoppingBag;
  const activity =
    row.kind === "booking" ? c.text("Grooming", "عناية") : row.kind === "delivery" ? c.text("Delivery", "توصيل") : c.text("Order paid", "طلب مدفوع");
  const details =
    row.kind === "booking"
      ? `${c.local(row.packageName)} · ${row.location === "home" ? c.text("Home visit", "زيارة منزلية") : c.text("In the shop", "في المتجر")}`
      : row.kind === "delivery"
        ? `${row.area ? c.local(row.area) : c.text("Delivery", "توصيل")} · ${row.time}–${row.end}`
        : `${row.fulfilment === "pickup" ? c.text("Pickup", "استلام") : c.text("Delivery", "توصيل")} · ${formatMoney(row.total, c.locale)}`;
  return (
    <tr>
      <td>
        <bdi>{row.time}</bdi>
      </td>
      <td>
        <Link className="dash-person" href={href}>
          <Icon size={22} aria-hidden="true" />
          <span>
            <strong>
              <bdi>{row.kind === "booking" ? petLabel(row.pet, c.local) : row.reference}</bdi>
            </strong>
            <small>{row.customerName}</small>
          </span>
        </Link>
      </td>
      <td>
        <span className="dash-activity">
          <Icon size={16} aria-hidden="true" />
          {activity}
        </span>
      </td>
      <td className="dash-operation-detail">{details}</td>
      <td>{row.kind === "booking" ? <BookingStatusBadge status={row.status} /> : <OrderStatusBadge status={row.status} />}</td>
      <td>
        <Link className="dash-record-action" href={href} aria-label={c.text(`Open ${row.reference}`, `فتح ${row.reference}`)}>
          <MoreHorizontal size={15} aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function Attention({ data, canPromotions }: { data: Dashboard; canPromotions: boolean }) {
  const c = useCopy();
  const items: { key: string; count: number; label: string; href: string; tone: string }[] = [];
  if (data.orders) {
    items.push({
      key: "prepare",
      count: data.orders.toPrepare,
      label: c.text("Paid orders waiting to be prepared", "طلبات مدفوعة بانتظار التجهيز"),
      href: "/admin/orders?status=confirmed",
      tone: "blue",
    });
    items.push({
      key: "deliveries",
      count: data.orders.deliveriesNotOut,
      label: c.text("This day’s deliveries not out yet", "توصيلات هذا اليوم التي لم تخرج بعد"),
      href: `/admin/orders?window=${data.date}`,
      tone: "amber",
    });
  }
  if (data.attention.payments !== null) {
    items.push({
      key: "payments",
      count: data.attention.payments,
      label: c.text("Payments to check (late, twice or a wrong amount)", "دفعات تحتاج مراجعة (متأخرة أو مكررة أو بمبلغ خاطئ)"),
      href: data.orders ? "/admin/orders?needsAction=1" : data.bookings ? "/admin/bookings" : "/admin/relocation?needsAction=1",
      tone: "red",
    });
  }
  if (data.relocation) {
    // New, documents to review, a quote to issue, paid and waiting to start (15d): the team's turn.
    const waiting = data.relocation.waiting;
    items.push({
      key: "relocation",
      count: waiting.submitted + waiting.documentsReceived + waiting.underReview + waiting.paid,
      label: c.text("Relocation requests waiting for the team", "طلبات نقل بانتظار الفريق"),
      href: "/admin/relocation",
      tone: "blue",
    });
  }
  if (data.attention.refunds !== null) {
    items.push({
      key: "refunds",
      count: data.attention.refunds,
      label: c.text("Orders, bookings and relocation requests owing money back", "طلبات وحجوزات وطلبات نقل عليها مبالغ للاسترداد"),
      href: "/admin/finance",
      tone: "red",
    });
  }
  if (data.stock) {
    items.push({
      key: "stock",
      count: data.stock.outOfStock + data.stock.low,
      label: c.text("Packs low or out of stock", "عبوات منخفضة أو نافدة المخزون"),
      href: "/admin/products",
      tone: "amber",
    });
  }
  return (
    <section className="panel dash-attention">
      <Heading icon={AlertTriangle}>{c.text("Needs attention", "يحتاج إلى متابعة")}</Heading>
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="dash-attention-item">
          <strong className={`dash-count dash-count--${item.tone}`}>{item.count}</strong>
          <span>{item.label}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      ))}
      {!items.length && <p className="dash-empty">{c.text("Nothing here for your role.", "لا شيء هنا لدورك.")}</p>}
      {canPromotions && (
        <Link className="dash-promotion" href="/admin/promotions">
          <Tag size={19} aria-hidden="true" />
          <span>{c.text("Review promotions", "مراجعة العروض")}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function RecentOrders({
  orders,
  filter,
  setFilter,
}: {
  orders: NonNullable<Dashboard["orders"]>;
  filter: "all" | "products" | "houses";
  setFilter: (value: "all" | "products" | "houses") => void;
}) {
  const c = useCopy();
  const shown = orders.recent.filter((order) => filter === "all" || order.type === filter);
  return (
    <section className="panel">
      <Heading icon={ShoppingBag} href="/admin/orders" action={c.text("View all orders", "كل الطلبات")}>
        {c.text("Recent paid orders", "أحدث الطلبات المدفوعة")}
      </Heading>
      <Filters
        label={c.text("Order category", "فئة الطلب")}
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: c.text("All", "الكل"), count: orders.recent.length },
          { id: "products", label: c.text("Products", "المنتجات"), count: orders.recent.filter((order) => order.type === "products").length },
          { id: "houses", label: c.text("Houses", "البيوت"), count: orders.recent.filter((order) => order.type === "houses").length },
        ]}
      />
      {shown.slice(0, LIST_SHOWN).map((order) => (
        <Link key={order.reference} href={`/admin/orders?search=${encodeURIComponent(order.reference)}`} className="dash-order-row dash-order-row--real">
          <bdi>{order.reference}</bdi>
          <span>{order.type === "houses" ? c.text("Houses", "البيوت") : c.text("Products", "المنتجات")}</span>
          <bdi>{formatMoney(order.total, c.locale)}</bdi>
          <OrderStatusBadge status={order.status} />
        </Link>
      ))}
      {!shown.length && (
        <p className="dash-empty">
          {filter === "houses"
            ? c.text("No paid Pet House orders yet.", "لا طلبات بيوت حيوانات مدفوعة بعد.")
            : c.text("No paid orders yet.", "لا طلبات مدفوعة بعد.")}
        </p>
      )}
    </section>
  );
}

function UpcomingBookings({
  bookings,
  date,
  filter,
  setFilter,
}: {
  bookings: NonNullable<Dashboard["bookings"]>;
  date: string;
  filter: "all" | "shop" | "home";
  setFilter: (value: "all" | "shop" | "home") => void;
}) {
  const c = useCopy();
  const shown = bookings.upcoming.filter((booking) => filter === "all" || booking.location === filter);
  return (
    <section className="panel">
      <Heading icon={CalendarDays} href="/admin/bookings" action={c.text("View all bookings", "كل الحجوزات")}>
        {c.text("Upcoming bookings", "الحجوزات القادمة")}
      </Heading>
      <Filters
        label={c.text("Booking location", "مكان العناية")}
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: c.text("All", "الكل"), count: bookings.upcoming.length },
          { id: "shop", label: c.text("In-store", "في المتجر"), count: bookings.upcoming.filter((booking) => booking.location === "shop").length },
          { id: "home", label: c.text("Home service", "خدمة منزلية"), count: bookings.upcoming.filter((booking) => booking.location === "home").length },
        ]}
      />
      {shown.slice(0, LIST_SHOWN).map((booking) => {
        const day = qatarDay(booking.startsAt);
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(booking.startsAt));
        return (
          <Link key={booking.reference} href={`/admin/bookings?search=${encodeURIComponent(booking.reference)}`} className="dash-booking-row">
            <span className="dash-booking-time">
              <bdi>{time}</bdi>
              {day !== date && (
                <small>
                  <bdi>{day.slice(5)}</bdi>
                </small>
              )}
            </span>
            <span className="dash-person">
              <span>
                <strong>{petLabel(booking.pet, c.local)}</strong>
                <small>{booking.customerName}</small>
              </span>
            </span>
            <span className="dash-package">{c.local(booking.packageName)}</span>
            <BookingStatusBadge status={booking.status} />
          </Link>
        );
      })}
      {!shown.length && <p className="dash-empty">{c.text("No upcoming bookings for this selection.", "لا حجوزات قادمة لهذا الاختيار.")}</p>}
    </section>
  );
}

function StockAlerts({ stock }: { stock: NonNullable<Dashboard["stock"]> }) {
  const c = useCopy();
  return (
    <section className="panel">
      <Heading icon={Package} href="/admin/products" action={c.text("View catalogue", "عرض الكتالوج")}>
        {c.text("Stock alerts", "تنبيهات المخزون")}
      </Heading>
      <div className="dash-stock-summary">
        <div>
          <strong>{stock.outOfStock}</strong>
          <small>{c.text("Out of stock", "نفد المخزون")}</small>
        </div>
        <div>
          <strong>{stock.low}</strong>
          <small>{c.text("Low stock", "مخزون منخفض")}</small>
        </div>
      </div>
      {stock.alerts.slice(0, LIST_SHOWN).map((alert) => (
        <Link key={alert.sku} href="/admin/products" className="dash-stock-row">
          <Package size={22} aria-hidden="true" />
          <span>
            <strong>
              <bdi>{alert.sku}</bdi>
            </strong>
            <small>
              {c.local(alert.product)} · {c.local(alert.label)}
            </small>
          </span>
          <span className={alert.stock <= 0 ? "dash-stock-out" : "dash-stock-low"}>
            {alert.stock <= 0 ? c.text("Out of stock", "نفد المخزون") : c.text(`${alert.stock} left`, `المتبقي ${alert.stock}`)}
          </span>
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      ))}
      {!stock.alerts.length && <p className="dash-empty">{c.text("No stock alerts.", "لا تنبيهات مخزون.")}</p>}
    </section>
  );
}

function Performance({
  data,
  days,
  setDays,
  selectedToday,
}: {
  data: Dashboard;
  days: 1 | 7 | 30;
  setDays: (value: 1 | 7 | 30) => void;
  selectedToday: boolean;
}) {
  const c = useCopy();
  const series = data.money?.series ?? [];
  const max = Math.max(1, ...series.map((bucket) => Math.max(0, bucket.net)));
  const summary: { label: string; value: string | number }[] = [];
  if (data.money) summary.push({ label: c.text("Online sales", "مبيعات الموقع"), value: formatSignedMoney(data.money.period.net, c.locale) });
  if (data.orders) summary.push({ label: c.text("Orders paid", "طلبات مدفوعة"), value: data.orders.paidInPeriod });
  if (data.bookings) summary.push({ label: c.text("Bookings paid", "حجوزات مدفوعة"), value: data.bookings.paidInPeriod });
  // Relocation quotes first paid in the period (15d), for Relocation View.
  if (data.relocation) summary.push({ label: c.text("Relocation quotes paid", "عروض نقل مدفوعة"), value: data.relocation.paidInPeriod });
  if (data.money) {
    summary.push({
      label: c.text("Average order", "متوسط الطلب"),
      value: data.money.period.averageOrder === null ? "–" : formatMoney(data.money.period.averageOrder, c.locale),
    });
    summary.push({ label: c.text("Discounts given", "الخصومات الممنوحة"), value: formatMoney(data.money.period.discounts, c.locale) });
  }
  return (
    <section className="panel dash-performance">
      <Heading icon={BarChart3} href={data.money ? "/admin/finance" : undefined} action={c.text("Open Finance", "فتح المالية")}>
        {c.text("Performance", "الأداء")}
      </Heading>
      <Filters
        label={c.text("Performance period", "فترة الأداء")}
        value={String(days) as "1" | "7" | "30"}
        onChange={(value) => setDays(Number(value) as 1 | 7 | 30)}
        options={DASHBOARD_PERIODS.map((period) => ({
          id: String(period) as "1" | "7" | "30",
          label:
            period === 1
              ? c.text(selectedToday ? "Today" : "Selected day", selectedToday ? "اليوم" : "اليوم المحدد")
              : c.text(`${period} days`, period === 7 ? "7 أيام" : "30 يوماً"),
        }))}
      />
      <div className="dash-performance-body">
        {data.money && (
          <div className="dash-chart" role="img" aria-label={c.text("Online sales by Qatar hour or date", "مبيعات الموقع حسب ساعة أو تاريخ قطر")}>
            <div className="dash-chart-axis">
              {[1, 0.5, 0].map((ratio) => (
                <span key={ratio}>{Math.round((max * ratio) / 100)}</span>
              ))}
            </div>
            <div className="dash-chart-series">
              {series.map((bucket, index) => (
                <div className="dash-chart-column" key={bucket.key}>
                  <div className="dash-chart-track">
                    <span
                      style={{ height: `${(Math.max(0, bucket.net) / max) * 100}%` }}
                      title={`${bucket.key}: ${formatSignedMoney(bucket.net, c.locale)}`}
                    />
                  </div>
                  <small>
                    {days === 1 ? (index % 4 === 0 ? `${bucket.key}:00` : "") : days === 7 || index % 5 === 0 ? bucket.key.slice(5) : ""}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="dash-performance-summary">
          {summary.map((item) => (
            <div key={item.label}>
              <strong>
                <bdi>{item.value}</bdi>
              </strong>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
