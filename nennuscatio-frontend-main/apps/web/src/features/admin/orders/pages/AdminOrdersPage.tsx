"use client";
import {
  ArrowUpDown,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ListFilter,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  dashboardItemCount,
  qatarDay,
} from "@/features/admin/dashboard/lib/dashboard";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import {
  AdminPage,
  Empty,
  ErrorMessage,
  Field,
  Modal,
  StatusBadge,
} from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { NewOrderDialog } from "../NewOrderDialog";
import { OrderDetailPanel } from "../OrderDetailPanel";
import {
  emptyOrderFilters,
  filteredOrders,
  type OrderFilters,
  type OrderSort,
  orderKind,
  orderMoney,
} from "../order-list";
import { AdminOrdersApiPage } from "./AdminOrdersApiPage";
import { NumberInput } from "@/shared/ui/NumberInput";
/** API mode: real orders (7c-2). Mock mode keeps the demo page below. */
export function AdminOrdersPage() {
  if (useDataSourceOrNull() === "api") return <AdminOrdersApiPage />;
  return (
    <Suspense fallback={<p>…</p>}>
      <Orders />
    </Suspense>
  );
}
function Orders() {
  const c = useCopy(),
    d = useBusiness(),
    q = useSearchParams(),
    querySearch = q.get("search") ?? "";
  const [filters, setFilters] = useState<OrderFilters>(() => ({
    ...emptyOrderFilters(),
    search: querySearch,
  }));
  const [id, setId] = useState(""),
    [sort, setSort] = useState<OrderSort>("date"),
    [descending, setDescending] = useState(true),
    [page, setPage] = useState(1),
    [perPage, setPerPage] = useState(10),
    [selected, setSelected] = useState<string[]>([]),
    [more, setMore] = useState(false),
    [moreDraft, setMoreDraft] = useState(filters),
    [filterError, setFilterError] = useState(""),
    [newOpen, setNewOpen] = useState(false);
  const detailRef = useRef<HTMLElement>(null),
    triggerRef = useRef<HTMLButtonElement | null>(null),
    selectionRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setFilters((current) => ({ ...current, search: querySearch }));
    setPage(1);
  }, [querySearch]);
  useEffect(() => {
    if (id && detailRef.current && triggerRef.current) {
      detailRef.current.focus({ preventScroll: true });
      if (window.innerWidth < 1200)
        detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [id]);
  const today = qatarDay(new Date().toISOString()),
    rows = filteredOrders(d, filters, today, sort, descending),
    order = d.orders.find((o) => o.id === id);
  const pages = Math.max(1, Math.ceil(rows.length / perPage)),
    currentPage = Math.min(page, pages),
    visible = rows.slice((currentPage - 1) * perPage, currentPage * perPage);
  const visibleSelected = visible.filter((o) => selected.includes(o.id)).length;
  useEffect(() => {
    if (selectionRef.current)
      selectionRef.current.indeterminate =
        visibleSelected > 0 && visibleSelected < visible.length;
  }, [visibleSelected, visible.length]);
  const count = (kind: "products" | "houses") =>
    d.orders.filter((o) => orderKind(d, o) === kind).length;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", {
      timeZone: "Asia/Qatar",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  function patch(values: Partial<OrderFilters>) {
    setFilters((current) => ({ ...current, ...values }));
    setPage(1);
    setSelected([]);
  }
  function sortBy(key: OrderSort) {
    setDescending(sort === key ? !descending : false);
    setSort(key);
    setPage(1);
  }
  function closeDetail() {
    setId("");
    triggerRef.current?.focus();
  }
  const activeFilters = !!Object.entries(filters).some(([key, value]) =>
    key === "kind" ? value !== "all" : !!value,
  );
  const select = (
    key: "status" | "payment" | "fulfilment" | "channel" | "period",
    label: string,
    options: [string, string][],
  ) => (
    <select
      aria-label={label}
      value={filters[key]}
      onChange={(e) =>
        patch({
          [key]: e.target.value,
          ...(key === "period" ? { from: "", to: "" } : {}),
        })
      }
    >
      <option value="">{label}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
  return (
    <AdminPage
      module="orders"
      title={c.text("Orders", "الطلبات")}
      subtitle={c.text(
        "Manage product and pet house orders from purchase to fulfilment.",
        "إدارة طلبات المنتجات وبيوت الحيوانات من الشراء إلى التسليم.",
      )}
      actions={
        <button
          type="button"
          className="button button--primary"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={18} />
          {c.text("New Order", "طلب جديد")}
        </button>
      }
    >
      <div className={`orders-layout${order ? " orders-layout--detail" : ""}`}>
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics">
            <AdminMetric
              icon={ShoppingBag}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("All Orders", "جميع الطلبات")}
              value={d.orders.length}
            />
            <AdminMetric
              icon={TriangleAlert}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Needs Action", "يحتاج إجراء")}
              value={d.orders.filter((o) => o.status === "pending").length}
            />
            <AdminMetric
              icon={Settings}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("In Fulfilment", "قيد التجهيز")}
              value={d.orders.filter((o) => o.status === "processing").length}
            />
            <AdminMetric
              icon={Truck}
              trailingIcon={ChartNoAxesColumnIncreasing}
              label={c.text("Ready to Fulfil", "جاهز للتسليم")}
              value={d.orders.filter((o) => o.status === "ready").length}
            />
          </div>
          <div className="panel orders-records">
            <fieldset
              className="admin-tabs"
              aria-label={c.text("Order views", "عروض الطلبات")}
            >
              {(["all", "products", "houses"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={filters.kind === kind}
                  onClick={() => patch({ kind })}
                >
                  {c.text(
                    kind === "all"
                      ? "All Orders"
                      : kind === "products"
                        ? "Products"
                        : "Houses",
                    kind === "all"
                      ? "جميع الطلبات"
                      : kind === "products"
                        ? "المنتجات"
                        : "البيوت",
                  )}{" "}
                  ({kind === "all" ? d.orders.length : count(kind)})
                </button>
              ))}
            </fieldset>
            <div className="orders-filter-toolbar">
              <label className="orders-search">
                <Search size={16} />
                <input
                  aria-label={c.text(
                    "Search orders, customer, SKU, product or house",
                    "ابحث عن الطلب أو العميل أو SKU أو المنتج أو البيت",
                  )}
                  placeholder={c.text(
                    "Search orders, customer, SKU, product or house…",
                    "ابحث عن الطلب أو العميل أو SKU أو المنتج أو البيت…",
                  )}
                  value={filters.search}
                  onChange={(e) => patch({ search: e.target.value })}
                />
              </label>
              {select("status", c.text("Status", "الحالة"), [
                ["pending", c.text("Pending", "قيد الانتظار")],
                ["processing", c.text("Processing", "قيد التجهيز")],
                ["ready", c.text("Ready", "جاهز")],
                ["completed", c.text("Completed", "مكتمل")],
                ["cancelled", c.text("Cancelled", "ملغي")],
              ])}
              {select("payment", c.text("Payment", "الدفع"), [
                ["paid", c.text("Paid", "مدفوع")],
                ["pending", c.text("Pending", "قيد الانتظار")],
              ])}
              {select("fulfilment", c.text("Fulfilment", "التسليم"), [
                ["delivery", c.text("Delivery", "توصيل")],
                ["pickup", c.text("Pickup", "استلام")],
              ])}
              {select("channel", c.text("Channel", "القناة"), [
                ["website", c.text("Website · demo", "الموقع · تجريبي")],
                ["admin", c.text("Admin · demo", "الإدارة · تجريبي")],
              ])}
              {select("period", c.text("Date", "التاريخ"), [
                ["today", c.text("Today", "اليوم")],
                ["7", c.text("Last 7 days", "آخر ٧ أيام")],
                ["30", c.text("Last 30 days", "آخر ٣٠ يوماً")],
              ])}
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setMoreDraft({ ...filters });
                  setFilterError("");
                  setMore(true);
                }}
              >
                <ListFilter size={15} />
                {c.text("More Filters", "مرشحات إضافية")}
              </button>
            </div>
            {(activeFilters || selected.length > 0) && (
              <div className="orders-selection-bar">
                <span>
                  {selected.length
                    ? selected.length +
                      c.text(
                        " selected · no bulk changes applied",
                        " محدد · لم تُطبق تغييرات جماعية",
                      )
                    : rows.length + c.text(" matching orders", " طلبات مطابقة")}
                </span>
                {selected.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelected([])}
                  >
                    {c.text("Clear selection", "مسح التحديد")}
                  </button>
                )}
                {activeFilters && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setFilters(emptyOrderFilters());
                      setPage(1);
                      setSelected([]);
                    }}
                  >
                    {c.text("Reset filters", "إعادة المرشحات")}
                  </button>
                )}
              </div>
            )}
            <div className="orders-table-scroll">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        ref={selectionRef}
                        type="checkbox"
                        aria-label={c.text(
                          "Select orders on this page",
                          "تحديد طلبات هذه الصفحة",
                        )}
                        checked={
                          visible.length > 0 &&
                          visibleSelected === visible.length
                        }
                        disabled={!visible.length}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? Array.from(
                                  new Set([
                                    ...selected,
                                    ...visible.map((o) => o.id),
                                  ]),
                                )
                              : selected.filter(
                                  (value) =>
                                    !visible.some((o) => o.id === value),
                                ),
                          )
                        }
                      />
                    </th>
                    {(
                      [
                        ["id", "Order", "الطلب"],
                        ["customer", "Customer", "العميل"],
                        ["type", "Type", "النوع"],
                        ["items", "Items", "العناصر"],
                        ["total", "Total", "الإجمالي"],
                        ["fulfilment", "Fulfilment", "التسليم"],
                        ["payment", "Payment", "الدفع"],
                        ["status", "Status", "الحالة"],
                      ] as const
                    ).map(([key, en, ar]) => (
                      <th
                        key={key}
                        aria-sort={
                          sort === key
                            ? descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button type="button" onClick={() => sortBy(key)}>
                          {c.text(en, ar)}
                          <ArrowUpDown size={11} />
                        </button>
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">
                        {c.text("Actions", "الإجراءات")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const guest = d.guests.find((g) => g.id === o.customerId),
                      kind = orderKind(d, o);
                    return (
                      <tr
                        key={o.id}
                        className={id === o.id ? "is-selected" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={c.text("Select ", "تحديد ") + o.id}
                            checked={selected.includes(o.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, o.id]
                                  : selected.filter((value) => value !== o.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="orders-reference-button"
                            onClick={(e) => {
                              triggerRef.current = e.currentTarget;
                              setId(o.id);
                            }}
                          >
                            <bdi>{o.id}</bdi>
                          </button>
                          <small>{date(o.date)}</small>
                        </td>
                        <td>
                          <strong>{guest?.name}</strong>
                          <small>
                            <bdi>{guest?.email}</bdi>
                          </small>
                        </td>
                        <td>
                          <span className={`orders-type orders-type--${kind}`}>
                            {c.text(
                              kind === "houses" ? "House" : "Products",
                              kind === "houses" ? "بيت" : "منتجات",
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="orders-items-preview">
                            {o.items.slice(0, 2).map((item) => (
                              <Photo
                                key={item.variantId}
                                src={
                                  d.products.find(
                                    (p) => p.id === item.productId,
                                  )?.image ?? ""
                                }
                                alt={c.local(item.name)}
                                sizes="30px"
                              />
                            ))}
                            <span>
                              {o.items.length > 2
                                ? `+${o.items.length - 2}`
                                : dashboardItemCount(
                                    o.items.reduce(
                                      (sum, item) => sum + item.quantity,
                                      0,
                                    ),
                                    c.locale,
                                  )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <bdi>{orderMoney(o.total, c.locale)}</bdi>
                        </td>
                        <td>
                          <span className="orders-fulfilment-cell">
                            {o.fulfilment === "delivery" ? (
                              <Truck size={17} />
                            ) : (
                              <ShoppingBag size={16} />
                            )}
                            {c.text(
                              o.fulfilment === "delivery"
                                ? "Delivery"
                                : "Pickup",
                              o.fulfilment === "delivery" ? "توصيل" : "استلام",
                            )}
                          </span>
                        </td>
                        <td>
                          <StatusBadge value={o.payment} />
                        </td>
                        <td>
                          <StatusBadge value={o.status} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={
                              c.text("View order ", "عرض الطلب ") + o.id
                            }
                            onClick={(e) => {
                              triggerRef.current = e.currentTarget;
                              setId(o.id);
                            }}
                          >
                            <Ellipsis size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <Empty>
                {filters.kind === "houses"
                  ? c.text(
                      "No house orders. Pet House checkout is not enabled yet.",
                      "لا طلبات بيوت. طلب بيوت الحيوانات غير مفعّل بعد.",
                    )
                  : c.text("No matching orders.", "لا طلبات مطابقة.")}
              </Empty>
            )}
            <div className="orders-pagination">
              <nav aria-label={c.text("Order pages", "صفحات الطلبات")}>
                <button
                  type="button"
                  aria-label={c.text("Previous page", "الصفحة السابقة")}
                  disabled={currentPage === 1}
                  onClick={() => {
                    setPage(currentPage - 1);
                    setSelected([]);
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 || p === pages || Math.abs(currentPage - p) <= 1,
                  )
                  .map((p) => (
                    <button
                      type="button"
                      key={p}
                      aria-current={p === currentPage ? "page" : undefined}
                      onClick={() => {
                        setPage(p);
                        setSelected([]);
                      }}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  type="button"
                  aria-label={c.text("Next page", "الصفحة التالية")}
                  disabled={currentPage === pages}
                  onClick={() => {
                    setPage(currentPage + 1);
                    setSelected([]);
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </nav>
              <span>
                {c.text("Showing ", "عرض ")}
                {rows.length ? (currentPage - 1) * perPage + 1 : 0}–
                {Math.min(currentPage * perPage, rows.length)}{" "}
                {c.text("of ", "من ")}
                {rows.length} {c.text("orders", "طلباً")}
              </span>
              <select
                aria-label={c.text("Orders per page", "طلبات لكل صفحة")}
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                  setSelected([]);
                }}
              >
                {[5, 10, 25].map((n) => (
                  <option key={n} value={n}>
                    {n} {c.text("per page", "لكل صفحة")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="orders-demo-note">
            {c.text(
              "Synthetic orders. Counts use this same demo dataset; house ordering is gated and fleet/promotion integrations are not live.",
              "طلبات تجريبية. الأعداد من نفس البيانات؛ طلب البيوت غير مفعّل وتكاملات الأسطول والعروض ليست مباشرة.",
            )}
          </p>
        </div>
        {order && (
          <OrderDetailPanel
            key={order.id}
            order={order}
            close={closeDetail}
            panelRef={detailRef}
          />
        )}
      </div>
      <NewOrderDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(newId) => {
          setFilters(emptyOrderFilters());
          setPage(1);
          setId(newId);
        }}
      />
      <Modal
        open={more}
        onOpenChange={setMore}
        title={c.text("More Order Filters", "مرشحات الطلبات الإضافية")}
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              (moreDraft.from &&
                moreDraft.to &&
                moreDraft.from > moreDraft.to) ||
              (moreDraft.minimum &&
                moreDraft.maximum &&
                Number(moreDraft.minimum) > Number(moreDraft.maximum))
            ) {
              setFilterError(
                c.text(
                  "The start must not exceed the end.",
                  "يجب ألا تتجاوز البداية النهاية.",
                ),
              );
              return;
            }
            patch({
              from: moreDraft.from,
              to: moreDraft.to,
              minimum: moreDraft.minimum,
              maximum: moreDraft.maximum,
              period: "",
            });
            setMore(false);
          }}
        >
          <div className="form-two">
            <Field label={c.text("From date (Qatar)", "من تاريخ (قطر)")}>
              <input
                type="date"
                value={moreDraft.from}
                onChange={(e) =>
                  setMoreDraft({ ...moreDraft, from: e.target.value })
                }
              />
            </Field>
            <Field label={c.text("To date (Qatar)", "إلى تاريخ (قطر)")}>
              <input
                type="date"
                value={moreDraft.to}
                onChange={(e) =>
                  setMoreDraft({ ...moreDraft, to: e.target.value })
                }
              />
            </Field>
            <Field label={c.text("Minimum total (QAR)", "أقل إجمالي (ر.ق)")}>
              <NumberInput
                kind="decimal"
                min={0}
                value={moreDraft.minimum}
                onChange={(e) =>
                  setMoreDraft({ ...moreDraft, minimum: e.target.value })
                }
              />
            </Field>
            <Field label={c.text("Maximum total (QAR)", "أعلى إجمالي (ر.ق)")}>
              <NumberInput
                kind="decimal"
                min={0}
                value={moreDraft.maximum}
                onChange={(e) =>
                  setMoreDraft({ ...moreDraft, maximum: e.target.value })
                }
              />
            </Field>
          </div>
          <ErrorMessage message={filterError} />
          <button type="submit" className="button button--primary">
            {c.text("Apply Filters", "تطبيق المرشحات")}
          </button>
        </form>
      </Modal>
    </AdminPage>
  );
}
export function CustomerContact({ id }: { id: string }) {
  const d = useBusiness(),
    g = d.guests.find((guest) => guest.id === id);
  return (
    <div className="note-box">
      <strong>{g?.name}</strong>
      <p>
        <bdi>{g?.email}</bdi> · <bdi>{g?.phone}</bdi>
      </p>
    </div>
  );
}
