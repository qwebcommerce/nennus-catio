"use client";

import { ADMIN_RELOCATION_PAGE_SIZES, type AdminRelocationSort, type RelocationStatus, relocationStatusSchema } from "@nennus-catio/contracts";
import { ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight, Ellipsis, FileCheck2, Inbox, Plane, Receipt, Search, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { placedAt } from "@/features/admin/orders/lib/admin-order-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  type AdminRelocationFilters,
  adminRelocationSearch,
  describeAdminRelocationError,
  emptyAdminRelocationFilters,
  useAdminRelocationList,
} from "@/shared/api/admin-relocation";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { AdminPage, Empty, ErrorMessage } from "@/shared/ui/BusinessUI";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { RelocationApiDetail, RelocationStatusBadge } from "../components/RelocationApiDetail";
import { RelocationSettingsDialog } from "../components/RelocationSettingsDialog";
import { ADMIN_RELOCATION_STATUS, plannedLabel, RELOCATION_STATUS_FILTER_ORDER } from "../lib/relocation-labels";

/**
 * Pet relocation requests for staff (15d; plan section 4.7): the cards (New, Documents to review, Quote
 * to issue, Paid waiting to start, In progress), search by reference, name, email, phone or pet, filters,
 * pages, the downloads, the detail panel with its tabs, and the owner's settings. Customers send requests
 * on the website; staff never create one (D279 answer 4).
 */
export function AdminRelocationApiPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <RelocationApi />
    </Suspense>
  );
}

const SORTS: readonly { value: AdminRelocationSort; en: string; ar: string }[] = [
  { value: "newest", en: "Newest first", ar: "الأحدث أولاً" },
  { value: "oldest", en: "Oldest first", ar: "الأقدم أولاً" },
  { value: "updated", en: "Recently changed", ar: "المتغيّرة مؤخراً" },
  { value: "planned", en: "Planned date", ar: "التاريخ المخطط" },
];

/** A status from the address (the Dashboard's and the bell's links), or "open"; anything else is ignored. */
function linkedStatus(value: string | null): string {
  if (value === "open") return value;
  return relocationStatusSchema.safeParse(value).success ? (value as string) : "";
}

function RelocationApi() {
  const c = useCopy();
  const access = useAdminAccess();
  const canExport = access.can("relocation", "export");
  const canEdit = access.can("relocation", "edit");
  const params = useSearchParams();
  const link = params.toString();
  const linkedSearch = params.get("search") ?? "";
  const linkedState = linkedStatus(params.get("status"));
  const linkedNeedsAction = params.get("needsAction") === "1";
  const [filters, setFilters] = useState<AdminRelocationFilters>(() => emptyAdminRelocationFilters(linkedSearch, linkedState, linkedNeedsAction));
  const [typed, setTyped] = useState(linkedSearch);
  const [reference, setReference] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastLink = useRef(link);
  const list = useAdminRelocationList(adminRelocationSearch(filters));

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new link while the page is open (the header search, the bell, Back/Forward): show what a fresh visit shows.
  useEffect(() => {
    if (lastLink.current === link) return;
    lastLink.current = link;
    setTyped(linkedSearch);
    setFilters(emptyAdminRelocationFilters(linkedSearch, linkedState, linkedNeedsAction));
    setReference(null);
    setDownloadError("");
  }, [link, linkedSearch, linkedState, linkedNeedsAction]);

  useEffect(() => {
    if (reference && detailRef.current) {
      detailRef.current.focus({ preventScroll: true });
      if (window.innerWidth < 1200) detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [reference]);

  function patch(values: Partial<AdminRelocationFilters>) {
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
  const count = (...statuses: RelocationStatus[]) => (counts ? statuses.reduce((sum, status) => sum + counts[status], 0) : "–");
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!filters.q.trim() || !!filters.status || filters.needsAction || !!filters.from || !!filters.to;
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to;

  return (
    <AdminPage
      module="relocation"
      title={c.text("Relocation", "النقل")}
      subtitle={c.text(
        "Pet relocation requests sent on the website: documents, the quote, payment and progress. Customers send them; staff never create one.",
        "طلبات نقل الحيوانات المرسلة عبر الموقع: المستندات وعرض السعر والدفع والتقدم. يرسلها العملاء؛ ولا ينشئها الموظفون.",
      )}
      actions={
        <>
          {canEdit && (
            <button type="button" className="button button--secondary" onClick={() => setSettingsOpen(true)}>
              {c.text("Settings", "الإعدادات")}
            </button>
          )}
          {canExport && <DownloadMenu path="/admin/relocation" search={adminRelocationSearch(filters, { paged: false })} onError={setDownloadError} />}
        </>
      }
    >
      <ErrorMessage message={downloadError} />
      <div className={`orders-layout${reference ? " orders-layout--detail" : ""}`}>
        <div className="orders-workspace">
          <div className="admin-metrics orders-metrics relocation-metrics">
            <AdminMetric icon={Inbox} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("New", "جديدة")} value={count("submitted")} />
            <AdminMetric icon={FileCheck2} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Documents to review", "مستندات للمراجعة")} value={count("documents_received")} />
            <AdminMetric icon={Receipt} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Quote to issue", "عرض سعر للإصدار")} value={count("under_review")} />
            <AdminMetric icon={Wallet} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("Paid, waiting to start", "مدفوعة بانتظار البدء")} value={count("paid")} />
            <AdminMetric icon={Plane} trailingIcon={ChartNoAxesColumnIncreasing} label={c.text("In progress", "قيد التنفيذ")} value={count("in_progress")} />
          </div>
          <div className="panel orders-records">
            <div className="orders-filter-toolbar orders-filter-toolbar--real">
              <label className="orders-search">
                <Search size={16} />
                <input
                  aria-label={c.text("Search by request, name, email, phone or pet", "ابحث بالطلب أو الاسم أو البريد أو الهاتف أو الحيوان")}
                  placeholder={c.text("Search by request, name, email, phone or pet…", "ابحث بالطلب أو الاسم أو البريد أو الهاتف أو الحيوان…")}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <select aria-label={c.text("Status", "الحالة")} value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
                <option value="">{c.text("All statuses", "كل الحالات")}</option>
                <option value="open">{c.text("Still open", "ما زالت مفتوحة")}</option>
                {RELOCATION_STATUS_FILTER_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {c.local(ADMIN_RELOCATION_STATUS[status])}
                  </option>
                ))}
              </select>
              <select aria-label={c.text("Sort", "الترتيب")} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as AdminRelocationSort })}>
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {c.text(sort.en, sort.ar)}
                  </option>
                ))}
              </select>
            </div>
            <div className="orders-filter-toolbar orders-filter-toolbar--real orders-date-filters">
              <label className="orders-date">
                {c.text("Sent from", "أُرسلت من")}
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
              {filtered && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setTyped("");
                    setFilters(emptyAdminRelocationFilters());
                  }}
                >
                  {c.text("Reset filters", "إعادة المرشحات")}
                </button>
              )}
            </div>
            {badRange && (
              <p className="form-error" role="alert">
                {c.text("The start date is after the end date, so no requests can match.", "تاريخ البداية بعد تاريخ النهاية، لذا لا يمكن أن تتطابق أي طلبات.")}
              </p>
            )}
            {list.isError && (
              <div className="inline-state" role="alert">
                <p>{describeAdminRelocationError(list.error, c.text)}</p>
                <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                  {c.text("Retry", "أعد المحاولة")}
                </button>
              </div>
            )}
            {list.isPending && (
              <p className="muted" role="status" aria-busy="true">
                {c.text("Loading relocation requests…", "جارٍ تحميل طلبات النقل…")}
              </p>
            )}
            {data && (
              <>
                <div className="orders-table-scroll">
                  <table className="orders-table orders-table--real relocation-table" aria-busy={list.isFetching}>
                    <thead>
                      <tr>
                        <th>{c.text("Request", "الطلب")}</th>
                        <th>{c.text("Customer", "العميل")}</th>
                        <th>{c.text("Pets and destination", "الحيوانات والوجهة")}</th>
                        <th>{c.text("Documents", "المستندات")}</th>
                        <th>{c.text("Quote", "عرض السعر")}</th>
                        <th>{c.text("Status", "الحالة")}</th>
                        <th>
                          <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.requests.map((request) => (
                        <tr key={request.reference} className={reference === request.reference ? "is-selected" : ""}>
                          <td>
                            <button type="button" className="orders-reference-button" onClick={(e) => open(request.reference, e.currentTarget)}>
                              <bdi>{request.reference}</bdi>
                            </button>
                            <small>{placedAt(request.placedAt, c.locale)}</small>
                          </td>
                          <td>
                            <strong>{request.contactName}</strong>
                            <small>
                              <bdi>{request.contactPhone}</bdi>
                            </small>
                          </td>
                          <td>
                            <strong>{request.pets.join(c.text(", ", "، "))}</strong>
                            <small>
                              {c.text("To ", "إلى ")}
                              {c.local(request.destination)}
                              {request.plannedDate && ` · ${plannedLabel(request.plannedDate, c.locale)}`}
                            </small>
                          </td>
                          <td>
                            {request.documentsToReview > 0 && <strong>{c.text(`${request.documentsToReview} to review`, `${request.documentsToReview} للمراجعة`)}</strong>}
                            {request.documentsMissing > 0 && <small>{c.text(`${request.documentsMissing} missing`, `${request.documentsMissing} ناقصة`)}</small>}
                            {request.documentsToReview === 0 && request.documentsMissing === 0 && <small>–</small>}
                          </td>
                          <td>
                            {request.quote === null ? <small>–</small> : <bdi>{formatMoney(request.quote, c.locale)}</bdi>}
                            {request.paidOutside && <small>{c.text("Paid outside the website", "مدفوع خارج الموقع")}</small>}
                          </td>
                          <td>
                            <RelocationStatusBadge status={request.status} />
                            {request.refundNeeded && <small className="orders-refund">{c.text("Refund needed", "يحتاج استرداداً")}</small>}
                            {request.attention && <small className="orders-refund">{c.text("Payment to check", "دفعة تحتاج مراجعة")}</small>}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={c.text(`View relocation request ${request.reference}`, `عرض طلب النقل ${request.reference}`)}
                              onClick={(e) => open(request.reference, e.currentTarget)}
                            >
                              <Ellipsis size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.requests.length === 0 && (
                  <Empty>
                    {filtered
                      ? c.text("No relocation requests match these filters.", "لا توجد طلبات نقل مطابقة لهذه المرشحات.")
                      : c.text("No relocation requests yet. Requests sent on the website appear here.", "لا توجد طلبات نقل بعد. تظهر هنا الطلبات المرسلة عبر الموقع.")}
                  </Empty>
                )}
                <div className="orders-pagination">
                  <nav aria-label={c.text("Relocation pages", "صفحات طلبات النقل")}>
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
                      ? c.text("0 requests", "٠ طلبات")
                      : c.text(
                          `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} requests`,
                          `عرض ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} من ${data.total} طلباً`,
                        )}
                  </span>
                  <select aria-label={c.text("Requests per page", "طلبات لكل صفحة")} value={filters.pageSize} onChange={(e) => patch({ pageSize: Number(e.target.value) })}>
                    {ADMIN_RELOCATION_PAGE_SIZES.map((size) => (
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
        {reference && <RelocationApiDetail key={reference} reference={reference} close={closeDetail} panelRef={detailRef} />}
      </div>
      <RelocationSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AdminPage>
  );
}
