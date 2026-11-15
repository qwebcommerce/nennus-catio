"use client";

import { ADMIN_CUSTOMER_PAGE_SIZES, type AdminCustomerSummary } from "@nennus-catio/contracts";
import {
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Search,
  Tags,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  type AdminCustomerFilters,
  adminCustomerSearch,
  describeAdminCustomerError,
  emptyAdminCustomerFilters,
  useAdminCustomers,
  useCrmTags,
} from "@/shared/api/admin-customers";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { AdminPage, Empty, ErrorMessage } from "@/shared/ui/BusinessUI";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { CustomerApiDetail } from "../components/CustomerApiDetail";
import { ManageTagsDialog, TagChip } from "../components/CustomerTags";
import { ACCOUNT_STATUS, CUSTOMER_SORTS, customerInitials, customerLabel, dayLabel } from "../lib/customer-labels";

/**
 * Real customer records (10d; plan BRANCH_10 section 5): the cards, account or guest, search, filters,
 * sorting and pages from `/api/admin/customers`, a record's detail, the owner's tag list, and the CSV for
 * roles with Export. One record per email; staff never add or edit customers here (D186): customers
 * register, order and book on the website.
 */
export function AdminCustomersApiPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <CustomersApi />
    </Suspense>
  );
}

function CustomersApi() {
  const c = useCopy();
  const access = useAdminAccess();
  const canExport = access.can("customers", "export");
  const canManageTags = access.can("customers", "edit") || access.can("customers", "delete");
  const linkedSearch = useSearchParams().get("search") ?? "";
  const [filters, setFilters] = useState<AdminCustomerFilters>(() => emptyAdminCustomerFilters(linkedSearch));
  const [typed, setTyped] = useState(linkedSearch);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const linkHandled = useRef(false);
  const lastLink = useRef(linkedSearch);
  const list = useAdminCustomers(adminCustomerSearch(filters));
  const tags = useCrmTags();
  const selectedId = selected?.id ?? null;

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new link while the page is open (for example from the header search): search for it instead.
  useEffect(() => {
    if (lastLink.current === linkedSearch) return;
    lastLink.current = linkedSearch;
    linkHandled.current = false;
    setTyped(linkedSearch);
    setFilters(emptyAdminCustomerFilters(linkedSearch));
    setSelected(null);
    setDownloadError("");
  }, [linkedSearch]);

  // A link from an order, a booking or the header search names one email: its record opens, once, from
  // that search's own results (never from the previous page still on screen).
  useEffect(() => {
    if (linkHandled.current || !list.data || list.isPlaceholderData || filters.q !== linkedSearch) return;
    linkHandled.current = true;
    const email = linkedSearch.trim().toLowerCase();
    const matches = list.data.customers.filter((row) => row.email === email);
    if (email && matches.length === 1 && matches[0]) setSelected({ id: matches[0].id, label: customerLabel(matches[0]) });
  }, [list.data, list.isPlaceholderData, filters.q, linkedSearch]);

  useEffect(() => {
    if (selectedId && detailRef.current) {
      detailRef.current.focus({ preventScroll: true });
      if (window.innerWidth < 1200) detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [selectedId]);

  function patch(values: Partial<AdminCustomerFilters>) {
    setFilters((current) => ({ ...current, ...values, page: values.page ?? 1 }));
  }

  function open(row: AdminCustomerSummary, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelected({ id: row.id, label: customerLabel(row) });
  }

  function closeDetail() {
    setSelected(null);
    triggerRef.current?.focus();
  }

  const data = list.data;
  const counts = data?.counts;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!filters.q.trim() || !!filters.kind || !!filters.tag || !!filters.has || !!filters.from || !!filters.to;
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to;
  const kinds = [
    { value: "", label: c.text("All", "الكل"), count: counts?.all },
    { value: "account", label: c.text("Accounts", "الحسابات"), count: counts?.accounts },
    { value: "guest", label: c.text("Guests", "الزوار"), count: counts?.guests },
  ] as const;

  return (
    <AdminPage
      module="customers"
      title={c.text("Customers", "العملاء")}
      subtitle={c.text(
        "One record per email address, for accounts and guests, with their orders, bookings, notes and tags. Customers change their own details on the website.",
        "سجل واحد لكل بريد إلكتروني، للحسابات والزوار، مع طلباتهم وحجوزاتهم وملاحظاتهم ووسومهم. يغيّر العملاء بياناتهم بأنفسهم عبر الموقع.",
      )}
      actions={
        <>
          {canManageTags && (
            <button type="button" className="button button--secondary" onClick={() => setManagingTags(true)}>
              <Tags size={16} aria-hidden="true" />
              {c.text("Manage tags", "إدارة الوسوم")}
            </button>
          )}
          {canExport && (
            <DownloadMenu path="/admin/customers" search={adminCustomerSearch(filters, { paged: false })} onError={setDownloadError} />
          )}
        </>
      }
    >
      <ErrorMessage message={downloadError} />
      <div className={`orders-layout customers-layout${selected ? " orders-layout--detail" : ""}`}>
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics customers-metrics">
            <AdminMetric icon={UsersRound} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("All customers", "جميع العملاء")} value={counts?.all ?? "–"} />
            <AdminMetric icon={UserRoundCheck} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("With an account", "لديهم حساب")} value={counts?.accounts ?? "–"} />
            <AdminMetric icon={UserRound} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Guests", "الزوار")} value={counts?.guests ?? "–"} />
            <AdminMetric icon={UserRoundPlus} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("New this month", "الجدد هذا الشهر")} value={counts?.newThisMonth ?? "–"} />
          </div>
          <div className="panel orders-records customers-records">
            <div className="customers-tabs-row">
              <fieldset className="admin-tabs" aria-label={c.text("Account or guest", "حساب أو زائر")}>
                {kinds.map((kind) => (
                  <button key={kind.value} type="button" aria-pressed={filters.kind === kind.value} onClick={() => patch({ kind: kind.value })}>
                    {kind.label} ({kind.count ?? "–"})
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="orders-filter-toolbar orders-filter-toolbar--real customers-filters">
              <label className="orders-search">
                <Search size={16} aria-hidden="true" />
                <input
                  aria-label={c.text("Search by name, email or phone", "ابحث بالاسم أو البريد أو الهاتف")}
                  placeholder={c.text("Search by name, email or phone…", "ابحث بالاسم أو البريد أو الهاتف…")}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <select aria-label={c.text("Tag", "الوسم")} value={filters.tag} onChange={(e) => patch({ tag: e.target.value })}>
                <option value="">{c.text("All tags", "كل الوسوم")}</option>
                {(tags.data?.tags ?? []).map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {c.local(tag.name)}
                  </option>
                ))}
              </select>
              <select aria-label={c.text("Activity", "النشاط")} value={filters.has} onChange={(e) => patch({ has: e.target.value as AdminCustomerFilters["has"] })}>
                <option value="">{c.text("Any activity", "أي نشاط")}</option>
                <option value="orders">{c.text("With orders", "لديهم طلبات")}</option>
                <option value="bookings">{c.text("With bookings", "لديهم حجوزات")}</option>
              </select>
              <select aria-label={c.text("Sort", "الترتيب")} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as AdminCustomerFilters["sort"] })}>
                {CUSTOMER_SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {c.text(sort.en, sort.ar)}
                  </option>
                ))}
              </select>
            </div>
            <div className="orders-filter-toolbar orders-filter-toolbar--real orders-date-filters">
              <label className="orders-date">
                {c.text("Last active from", "آخر نشاط من")}
                <input type="date" value={filters.from} onChange={(e) => patch({ from: e.target.value })} />
              </label>
              <label className="orders-date">
                {c.text("Last active to", "آخر نشاط إلى")}
                <input type="date" value={filters.to} onChange={(e) => patch({ to: e.target.value })} />
              </label>
              {filtered && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setTyped("");
                    setFilters(emptyAdminCustomerFilters());
                  }}
                >
                  {c.text("Reset filters", "إعادة المرشحات")}
                </button>
              )}
            </div>
            {badRange && (
              <p className="form-error" role="alert">
                {c.text("The start date is after the end date, so no customers can match.", "تاريخ البداية بعد تاريخ النهاية، لذا لا يمكن أن يتطابق أي عميل.")}
              </p>
            )}
            {list.isError && (
              <div className="inline-state" role="alert">
                <p>{describeAdminCustomerError(list.error, c.text)}</p>
                <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                  {c.text("Retry", "أعد المحاولة")}
                </button>
              </div>
            )}
            {list.isPending && (
              <p className="muted" role="status" aria-busy="true">
                {c.text("Loading customers…", "جارٍ تحميل العملاء…")}
              </p>
            )}
            {data && (
              <>
                <div className="orders-table-scroll">
                  <table className="orders-table orders-table--real customers-table" aria-busy={list.isFetching}>
                    <thead>
                      <tr>
                        <th>{c.text("Customer", "العميل")}</th>
                        <th>{c.text("Contact", "التواصل")}</th>
                        <th>{c.text("Orders", "الطلبات")}</th>
                        <th>{c.text("Bookings", "الحجوزات")}</th>
                        <th>{c.text("Total paid", "إجمالي المدفوع")}</th>
                        <th>{c.text("Last activity", "آخر نشاط")}</th>
                        <th>
                          <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.map((row) => {
                        const label = customerLabel(row);
                        return (
                          <tr key={row.id} className={selectedId === row.id ? "is-selected" : ""}>
                            <td>
                              <div className="customers-name-cell">
                                <span className="avatar" aria-hidden="true">
                                  {customerInitials(label)}
                                </span>
                                <div>
                                  <button type="button" className="orders-reference-button" onClick={(e) => open(row, e.currentTarget)}>
                                    <bdi>{label}</bdi>
                                  </button>
                                  <span className="customers-guest-badge">{c.local(ACCOUNT_STATUS[row.account])}</span>
                                  {row.tags.length > 0 && (
                                    <span className="customers-tags-row">
                                      {row.tags.map((tag) => (
                                        <TagChip key={tag.id} tag={tag} />
                                      ))}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              {row.phone ? <bdi>{row.phone}</bdi> : "—"}
                              <small>
                                <bdi>{row.email}</bdi>
                              </small>
                            </td>
                            <td>{row.orders}</td>
                            <td>{row.bookings}</td>
                            <td>
                              <bdi>{formatMoney(row.totalPaid, c.locale)}</bdi>
                            </td>
                            <td>
                              <time dateTime={row.lastActivityAt}>{dayLabel(row.lastActivityAt, c.locale)}</time>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={c.text(`View customer ${label}`, `عرض العميل ${label}`)}
                                onClick={(e) => open(row, e.currentTarget)}
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
                {data.customers.length === 0 && (
                  <Empty>
                    {filtered
                      ? c.text("No customers match these filters.", "لا يوجد عملاء مطابقون لهذه المرشحات.")
                      : c.text(
                          "No customers yet. Customers appear here when they register, order or book on the website.",
                          "لا يوجد عملاء بعد. يظهر العملاء هنا عندما يسجّلون أو يطلبون أو يحجزون عبر الموقع.",
                        )}
                  </Empty>
                )}
                <div className="orders-pagination">
                  <nav aria-label={c.text("Customer pages", "صفحات العملاء")}>
                    <button type="button" aria-label={c.text("Previous page", "الصفحة السابقة")} disabled={data.page <= 1} onClick={() => patch({ page: data.page - 1 })}>
                      <ChevronLeft size={16} />
                    </button>
                    <span aria-current="page">{c.text(`Page ${data.page} of ${pages}`, `صفحة ${data.page} من ${pages}`)}</span>
                    <button type="button" aria-label={c.text("Next page", "الصفحة التالية")} disabled={data.page >= pages} onClick={() => patch({ page: data.page + 1 })}>
                      <ChevronRight size={16} />
                    </button>
                  </nav>
                  <span>
                    {data.total === 0
                      ? c.text("0 customers", "٠ عملاء")
                      : c.text(
                          `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} customers`,
                          `عرض ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} من ${data.total} عميلاً`,
                        )}
                  </span>
                  <select aria-label={c.text("Customers per page", "عملاء لكل صفحة")} value={filters.pageSize} onChange={(e) => patch({ pageSize: Number(e.target.value) })}>
                    {ADMIN_CUSTOMER_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {c.text(`${size} per page`, `${size} لكل صفحة`)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
        {selected && <CustomerApiDetail key={selected.id} id={selected.id} label={selected.label} close={closeDetail} panelRef={detailRef} />}
      </div>
      <ManageTagsDialog open={managingTags} onClose={() => setManagingTags(false)} />
    </AdminPage>
  );
}
