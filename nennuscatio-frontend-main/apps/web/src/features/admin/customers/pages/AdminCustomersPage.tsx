"use client";
import { Suspense, useRef, useState } from "react";
import {
  ArrowUpDown,
  Cat,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Filter,
  Plus,
  RotateCcw,
  Search,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useBusiness } from "@/mocks/MockDataProvider";
import { petCategories } from "@/mocks/data/business";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { AdminPage, Empty, Field } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { bookingDate } from "@/features/admin/bookings/booking-list";
import { CustomerDetailPanel } from "../CustomerDetailPanel";
import { CustomerDialog } from "../CustomerDialogs";
import { AdminCustomersApiPage } from "./AdminCustomersApiPage";
import {
  contactNeedsReview,
  customerDefaults,
  customerHistory,
  customerInitials,
  customerMetrics,
  customerPets,
  customerRows,
  type CustomerFilters,
  type CustomerSort,
} from "../customer-list";

/** API mode: real customer records (10d). Mock mode keeps the demo page below. */
export function AdminCustomersPage() {
  if (useDataSourceOrNull() === "api") return <AdminCustomersApiPage />;
  return (
    <Suspense fallback={<p>…</p>}>
      <Customers />
    </Suspense>
  );
}
function Customers() {
  const c = useCopy(),
    d = useBusiness(),
    q = useSearchParams(),
    { date } = useDashboardDate();
  const [filters, setFilters] = useState({
      ...customerDefaults,
      search: q.get("search") ?? "",
    }),
    [id, setId] = useState(""),
    [initialTab, setInitialTab] = useState("overview"),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [add, setAdd] = useState(false);
  const panelRef = useRef<HTMLElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const guest = d.guests.find((g) => g.id === id),
    rows = customerRows(d, filters),
    metrics = customerMetrics(d, date),
    pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  function filter(patch: Partial<CustomerFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }
  function open(next: string, button?: HTMLButtonElement, tab = "overview") {
    opener.current = button ?? null;
    setId(next);
    setInitialTab(tab);
    setRevision((r) => r + 1);
    requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
  }
  function close() {
    setId("");
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  }
  const headers: { label: string; key?: CustomerSort }[] = [
    { label: c.text("Customer", "العميل"), key: "name" },
    { label: c.text("Contact", "التواصل"), key: "contact" },
    { label: c.text("Pets", "الحيوانات") },
    { label: c.text("Orders", "الطلبات"), key: "orders" },
    { label: c.text("Bookings", "الحجوزات"), key: "bookings" },
    { label: c.text("Last Activity", "آخر نشاط"), key: "activity" },
  ];
  return (
    <AdminPage
      module="customers"
      title={c.text("Customers", "العملاء")}
      subtitle={c.text(
        "View customer details, pets, orders and booking history.",
        "عرض بيانات العملاء والحيوانات وسجل الطلبات والحجوزات.",
      )}
    >
      <div
        className={`orders-layout customers-layout ${guest ? "orders-layout--detail" : ""}`}
      >
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics customers-metrics">
            <AdminMetric
              icon={UsersRound}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Total Customers", "إجمالي العملاء")}
              value={metrics.total}
              note={c.text("All guest contacts", "جميع جهات اتصال الضيوف")}
            />
            <AdminMetric
              icon={UserRoundPlus}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("New Customers", "العملاء الجدد")}
              value={metrics.new}
              note={c.text("First recorded this month", "أول تسجيل هذا الشهر")}
            />
            <AdminMetric
              icon={RotateCcw}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Repeat Customers", "العملاء المتكررون")}
              value={metrics.repeat}
              note={c.text(
                "2+ active orders or bookings",
                "طلبان أو حجزان نشطان فأكثر",
              )}
            />
            <AdminMetric
              icon={Cat}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Pets", "الحيوانات")}
              value={metrics.pets}
              note={c.text("From submitted bookings", "من بيانات الحجوزات")}
            />
          </div>
          <div className="panel orders-records customers-records">
            <div className="customers-tabs-row">
              <fieldset
                className="admin-tabs"
                aria-label={c.text("Customer types", "أنواع العملاء")}
              >
                {[
                  {
                    value: "",
                    label: c.text("All Customers", "جميع العملاء"),
                    count: metrics.total,
                  },
                  {
                    value: "registered",
                    label: c.text("Registered", "المسجلون"),
                    count: 0,
                  },
                  {
                    value: "guests",
                    label: c.text("Guests", "الضيوف"),
                    count: metrics.total,
                  },
                ].map(({ value, label, count }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filters.type === value}
                    onClick={() => filter({ type: value })}
                  >
                    {label} ({count})
                  </button>
                ))}
              </fieldset>
              <details className="customers-add-menu">
                <summary className="button button--primary customers-add">
                  <Plus size={17} />
                  {c.text("Add Customer", "إضافة عميل")}
                  <ChevronDown size={12} />
                </summary>
                <div className="orders-action-menu">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      setAdd(true);
                    }}
                  >
                    {c.text("Add guest contact", "إضافة جهة اتصال ضيف")}
                  </button>
                  <p>
                    {c.text(
                      "Registered accounts are not enabled.",
                      "الحسابات المسجلة غير مفعلة.",
                    )}
                  </p>
                </div>
              </details>
            </div>
            <div className="orders-filter-toolbar customers-filters">
              <label className="orders-search">
                <Search size={17} />
                <input
                  aria-label={c.text("Search customers", "البحث عن العملاء")}
                  placeholder={c.text(
                    "Search name, phone, email, pet…",
                    "ابحث بالاسم أو الهاتف أو البريد أو الحيوان…",
                  )}
                  value={filters.search}
                  onChange={(e) => filter({ search: e.target.value })}
                />
              </label>
              <select
                aria-label={c.text("Customer activity", "نشاط العميل")}
                value={filters.activity}
                onChange={(e) => filter({ activity: e.target.value })}
              >
                {[
                  ["", c.text("Activity", "النشاط")],
                  ["orders", c.text("With orders", "لديهم طلبات")],
                  ["bookings", c.text("With bookings", "لديهم حجوزات")],
                  ["repeat", c.text("Repeat customers", "عملاء متكررون")],
                  ["none", c.text("No history", "بلا سجل")],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                aria-label={c.text("Customer pet type", "نوع حيوان العميل")}
                value={filters.pet}
                onChange={(e) => filter({ pet: e.target.value })}
              >
                <option value="">{c.text("Pet Type", "نوع الحيوان")}</option>
                {petCategories.map((p) => (
                  <option value={p.id} key={p.id}>
                    {c.local(p.name)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button--secondary"
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                <Filter size={17} />
                {c.text("More Filters", "المزيد من الفلاتر")}
              </button>
            </div>
            {more && (
              <div className="customers-more-filters">
                <Field
                  label={c.text("Contact review", "مراجعة بيانات الاتصال")}
                >
                  <select
                    value={filters.review ? "review" : ""}
                    onChange={(e) =>
                      filter({ review: e.target.value === "review" })
                    }
                  >
                    <option value="">
                      {c.text("All contacts", "جميع جهات الاتصال")}
                    </option>
                    <option value="review">
                      {c.text("Shared email or phone", "بريد أو هاتف مشترك")}
                    </option>
                  </select>
                </Field>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => filter(customerDefaults)}
                >
                  {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                </button>
              </div>
            )}
            {selected.length > 0 && (
              <div className="orders-selection-bar">
                <span>
                  {selected.length}{" "}
                  {c.text("customers selected", "عملاء محددون")}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSelected([])}
                >
                  {c.text("Clear selection", "إلغاء التحديد")}
                </button>
              </div>
            )}
            <section
              className="orders-table-scroll"
              aria-label={c.text("Customers table", "جدول العملاء")}
            >
              <table className="orders-table customers-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label={c.text(
                          "Select visible customers",
                          "تحديد العملاء الظاهرين",
                        )}
                        checked={
                          visible.length > 0 &&
                          visible.every((g) => selected.includes(g.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...visible.map((g) => g.id),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) => !visible.some((g) => g.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    {headers.map((header) => (
                      <th
                        key={header.label}
                        scope="col"
                        aria-sort={
                          header.key && filters.sort === header.key
                            ? filters.descending
                              ? "descending"
                              : "ascending"
                            : undefined
                        }
                      >
                        {header.key ? (
                          <button
                            type="button"
                            onClick={() =>
                              filter({
                                sort: header.key,
                                descending:
                                  filters.sort === header.key
                                    ? !filters.descending
                                    : false,
                              })
                            }
                          >
                            {header.label}
                            <ArrowUpDown size={12} />
                          </button>
                        ) : (
                          header.label
                        )}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">
                        {c.text("Actions", "الإجراءات")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((g) => {
                    const pets = customerPets(d, g.id),
                      history = customerHistory(d, g.id),
                      last = history[0];
                    return (
                      <tr
                        key={g.id}
                        className={id === g.id ? "is-selected" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={c.text(
                              `Select ${g.name}`,
                              `تحديد ${g.name}`,
                            )}
                            checked={selected.includes(g.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, g.id]
                                  : selected.filter((id) => id !== g.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <div className="customers-name-cell">
                            <span className="avatar">
                              {customerInitials(g.name)}
                            </span>
                            <div>
                              <button
                                type="button"
                                className="orders-reference-button"
                                aria-label={c.text(
                                  `Open customer ${g.name}`,
                                  `فتح بيانات العميل ${g.name}`,
                                )}
                                aria-expanded={id === g.id}
                                onClick={(e) => open(g.id, e.currentTarget)}
                              >
                                {g.name}
                              </button>
                              <span className="customers-guest-badge">
                                {c.text("Guest", "ضيف")}
                              </span>
                              {contactNeedsReview(d, g) && (
                                <small className="customers-review-label">
                                  {c.text("Review contact", "مراجعة البيانات")}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <bdi>{g.phone}</bdi>
                          <small>
                            <bdi>{g.email}</bdi>
                          </small>
                        </td>
                        <td>
                          <div className="customers-pet-preview">
                            {pets.slice(0, 2).map((p) => (
                              <Photo
                                key={p.key}
                                src={p.image}
                                alt={c.text(
                                  "Illustrative pet image",
                                  "صورة توضيحية للحيوان",
                                )}
                                sizes="30px"
                              />
                            ))}
                          </div>
                          <small>
                            {pets.map((p) => p.name).join(", ") || "—"}
                          </small>
                        </td>
                        <td>
                          <button
                            className="customers-count"
                            type="button"
                            aria-label={c.text(
                              `Orders for ${g.name}`,
                              `طلبات ${g.name}`,
                            )}
                            onClick={(e) =>
                              open(g.id, e.currentTarget, "orders")
                            }
                          >
                            {history.filter((e) => e.kind === "order").length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="customers-count"
                            type="button"
                            aria-label={c.text(
                              `Bookings for ${g.name}`,
                              `حجوزات ${g.name}`,
                            )}
                            onClick={(e) =>
                              open(g.id, e.currentTarget, "bookings")
                            }
                          >
                            {history.filter((e) => e.kind === "booking").length}
                          </button>
                        </td>
                        <td>
                          {last ? (
                            <>
                              <span>
                                {last.kind === "order"
                                  ? c.text(
                                      `Order #${last.id}`,
                                      `طلب #${last.id}`,
                                    )
                                  : c.text(
                                      `Grooming · ${last.booking.petName}`,
                                      `العناية · ${last.booking.petName}`,
                                    )}
                              </span>
                              <small>
                                {bookingDate(last.at, c.locale, true)}
                              </small>
                            </>
                          ) : (
                            <small>
                              {c.text("No activity", "لا يوجد نشاط")}
                            </small>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={c.text(
                              `Details for ${g.name}`,
                              `تفاصيل ${g.name}`,
                            )}
                            onClick={(e) => open(g.id, e.currentTarget)}
                          >
                            <Ellipsis size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            {!rows.length && (
              <Empty>
                {filters.type === "registered"
                  ? c.text(
                      "No registered accounts. Customer sign-in is an optional feature; current contacts are guests.",
                      "لا توجد حسابات مسجلة. دخول العملاء ميزة اختيارية؛ جهات الاتصال الحالية ضيوف.",
                    )
                  : c.text("No matching customers.", "لا يوجد عملاء مطابقون.")}
              </Empty>
            )}
            <div className="orders-pagination">
              <nav aria-label={c.text("Customer pages", "صفحات العملاء")}>
                <button
                  type="button"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                  aria-label={c.text("Previous page", "الصفحة السابقة")}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from(
                  { length: Math.min(5, pages) },
                  (_, i) =>
                    Math.min(Math.max(current - 2, 1), Math.max(pages - 4, 1)) +
                    i,
                ).map((p) => (
                  <button
                    type="button"
                    key={p}
                    aria-current={current === p ? "page" : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                  aria-label={c.text("Next page", "الصفحة التالية")}
                >
                  <ChevronRight size={16} />
                </button>
              </nav>
              <span>
                {c.text(
                  `Showing ${rows.length ? (current - 1) * pageSize + 1 : 0}–${Math.min(current * pageSize, rows.length)} of ${rows.length} customers`,
                  `عرض ${rows.length ? (current - 1) * pageSize + 1 : 0}–${Math.min(current * pageSize, rows.length)} من ${rows.length} عملاء`,
                )}
              </span>
              <select
                aria-label={c.text(
                  "Customers per page",
                  "عدد العملاء في الصفحة",
                )}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} {c.text("per page", "في الصفحة")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="orders-demo-note">
            {c.text(
              "Synthetic guest contacts · No registered accounts · Illustrative pet photos · Linked history remains separate when contact data overlaps",
              "بيانات ضيوف تجريبية · لا حسابات مسجلة · صور حيوانات توضيحية · السجلات المتداخلة تبقى منفصلة",
            )}
          </p>
        </div>
        {guest && (
          <CustomerDetailPanel
            key={`${guest.id}-${revision}`}
            guest={guest}
            initialTab={initialTab}
            close={close}
            panelRef={panelRef}
          />
        )}
      </div>
      {add && (
        <CustomerDialog
          close={() => setAdd(false)}
          saved={(id) => {
            filter(customerDefaults);
            open(id);
          }}
        />
      )}
    </AdminPage>
  );
}
