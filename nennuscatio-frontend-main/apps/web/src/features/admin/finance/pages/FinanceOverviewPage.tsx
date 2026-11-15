"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Banknote, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, CreditCard, Download, Filter, House, Landmark, MoreHorizontal, RotateCcw, Search, Scissors, Package } from "lucide-react";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Empty, Field } from "@/shared/ui/BusinessUI";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { useFinanceWorkspace } from "../FinanceWorkspace";
import { financeMoney, financeCsvExport, financeDate, financeDefaults, financeMetrics, financeRange, financeRows, financeTransactions, type FinanceFilters, type FinancePeriod, type FinanceSort, type FinanceTab } from "../finance-list";
import { FinanceDetailPanel, FinanceStatusBadge, financeMethodLabel } from "../FinanceDetailPanel";
import { FinanceCharts } from "../FinanceCharts";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { FinanceApiPage } from "./FinanceApiPage";
import { NumberInput } from "@/shared/ui/NumberInput";

/** API mode: real finance (#12 part 1). Mock mode keeps the demo page below. */
export function FinanceOverviewPage() {
  if (useDataSourceOrNull() === "api") return <FinanceApiPage />;
  return <FinanceDemo />;
}

function FinanceDemo() {
  const c = useCopy(), d = useBusiness(), { date } = useDashboardDate(), { search, setSearch } = useFinanceWorkspace();
  const [period, setPeriod] = useState<FinancePeriod>("month"),
    [filters, setFilters] = useState<FinanceFilters>(financeDefaults),
    [tab, setTab] = useState<FinanceTab>("transactions"),
    [sort, setSort] = useState<FinanceSort>("date"),
    [descending, setDescending] = useState(true),
    [page, setPage] = useState(1), [size, setSize] = useState(10),
    [moreFilters, setMoreFilters] = useState(false),
    [chartMode, setChartMode] = useState<"daily" | "weekly" | "monthly">("monthly"),
    [selectedId, setSelectedId] = useState(""),
    [checked, setChecked] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const panelRef = useRef<HTMLElement>(null), originRef = useRef<HTMLButtonElement | null>(null);
  const records = financeTransactions(d), range = financeRange(date, period, filters.from, filters.to);
  const applied = { ...filters, ...range, search };
  const rows = financeRows(records, applied, tab, sort, descending);
  const pages = Math.max(1, Math.ceil(rows.length / size)), currentPage = Math.min(page, pages);
  const shown = rows.slice((currentPage - 1) * size, currentPage * size);
  const selected = rows.find((r) => r.id === selectedId);
  const metrics = financeMetrics(records, range.from, range.to);
  const selectedRows = rows.filter((r) => checked.includes(r.id));
  const exportRows = selectedRows.length ? selectedRows : rows;
  const badRange = !!range.from && !!range.to && range.from > range.to;
  const badAmount = !!filters.minimum && !!filters.maximum && Number(filters.minimum) > Number(filters.maximum);
  const periodLabel = period === "today" ? c.text("Today", "اليوم") : period === "week" ? c.text("This week", "هذا الأسبوع") : period === "month" ? c.text("This month", "هذا الشهر") : c.text("Custom period", "فترة مخصصة");
  const counts = (value: FinanceTab) => financeRows(records, applied, value).length;
  const typeLabel = (kind: string) => kind === "grooming" ? c.text("Grooming", "العناية") : kind === "house" ? c.text("Pet House", "بيت للحيوان") : c.text("Product Order", "طلب منتج");
  // biome-ignore lint/correctness/useExhaustiveDependencies: Search and date changes intentionally reset pagination, selection and details.
  useEffect(() => { setPage(1); setSelectedId(""); setChecked([]); }, [search, date]);
  useEffect(() => { if (selectedId) panelRef.current?.focus(); }, [selectedId]);
  function close() { setSelectedId(""); originRef.current?.focus(); }
  function update(key: keyof FinanceFilters, value: string) {
    setFilters((old) => ({ ...old, [key]: value })); setPage(1); setSelectedId(""); setChecked([]);
  }
  function changePeriod(value: FinancePeriod) {
    setPeriod(value); setPage(1); setSelectedId(""); setChecked([]);
    if (value === "custom" && (!filters.from || !filters.to)) setFilters((old) => ({ ...old, from: range.from, to: range.to }));
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([financeCsvExport(exportRows, tab)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `nennus-catio-demo-finance-${tab}.csv`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(c.text(`Exported ${exportRows.length} financial records. Customer contact details are excluded.`, `تم تصدير ${exportRows.length} سجلاً مالياً دون بيانات التواصل مع العملاء.`));
  }
  function heading(label: string, key: FinanceSort) {
    return <th aria-sort={sort === key ? descending ? "descending" : "ascending" : "none"}>
      <button type="button" onClick={() => { if (sort === key) setDescending(!descending); else { setSort(key); setDescending(key === "date" || key === "amount"); } }}>
        {label}<ArrowDownUp size={9} aria-hidden="true" /></button></th>;
  }
  return <div className="reference-finance">
    <AdminPage module="finance" title={c.text("Finance", "المالية")} subtitle={c.text("Track sales, payments, refunds and transaction activity.", "تابع المبيعات والمدفوعات والاستردادات والمعاملات.")}>
      <div className={`finance-layout ${selected ? "finance-layout--detail" : ""}`}>
        <div className="finance-workspace">
          <fieldset className="finance-periods" aria-label={c.text("Financial period", "الفترة المالية")}>
            {(["today", "week", "month", "custom"] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => changePeriod(value)}>
              {value === "today" ? c.text("Today", "اليوم") : value === "week" ? c.text("This Week", "هذا الأسبوع") : value === "month" ? c.text("This Month", "هذا الشهر") : c.text("Custom", "مخصص")}{value === "custom" && <CalendarDays size={13} />}</button>)}
          </fieldset>
          {period === "custom" && <div className="finance-custom-dates"><Field label={c.text("From date (Qatar)", "من تاريخ (قطر)")}><input type="date" value={filters.from} onChange={(e) => update("from", e.target.value)} /></Field>
            <Field label={c.text("To date (Qatar)", "إلى تاريخ (قطر)")}><input type="date" value={filters.to} onChange={(e) => update("to", e.target.value)} /></Field></div>}
          {badRange && <p className="form-error" role="alert">{c.text("Start date must not be after end date.", "يجب ألا يأتي تاريخ البداية بعد تاريخ النهاية.")}</p>}
          <div className="finance-metrics">
            {[{ label: c.text("Revenue", "الإيرادات"), value: metrics.revenue, note: c.text("Paid less refunds", "المدفوع ناقص الاسترداد"), Icon: BarChart3, tone: "blue" },
              { label: c.text("Paid", "المدفوع"), value: metrics.paid, note: c.text("Collected", "محصل"), Icon: CreditCard, tone: "green" },
              { label: c.text("Outstanding", "المستحق"), value: metrics.pending, note: c.text("To be collected", "بانتظار التحصيل"), Icon: Clock3, tone: "orange" },
              { label: c.text("Refunds", "الاستردادات"), value: metrics.refunded, note: c.text("Recorded returns", "المبالغ المستردة"), Icon: RotateCcw, tone: "red" }].map(({ label, value, note, Icon, tone }) => <div className={`finance-card finance-metric finance-metric--${tone}`} key={tone}>
                <span className="finance-metric-icon"><Icon size={23} strokeWidth={1.8} /></span><div><span>{label}</span><strong><bdi>{financeMoney(value, c.locale)}</bdi></strong><small>{note}</small></div>
              </div>)}
          </div>
          <FinanceCharts records={records} from={range.from} to={range.to} mode={chartMode} setMode={setChartMode} />
          <section className="finance-card finance-records" aria-label={c.text("Financial transactions", "المعاملات المالية")}>
            <div className="finance-records-heading"><div className="finance-tabs" role="tablist" aria-label={c.text("Transaction view", "عرض المعاملات")}>
              {(["transactions", "payments", "refunds"] as const).map((value, index) => <button type="button" key={value} id={`finance-tab-${value}`} aria-controls="finance-results" role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
                onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const tabs = ["transactions", "payments", "refunds"] as const; const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3; setTab(tabs[next]); setPage(1); setSelectedId(""); setChecked([]); document.getElementById(`finance-tab-${tabs[next]}`)?.focus(); } }}
                onClick={() => { setTab(value); setPage(1); setSelectedId(""); setChecked([]); }}>
                {value === "transactions" ? c.text("Transactions", "المعاملات") : value === "payments" ? c.text("Payments", "المدفوعات") : c.text("Refunds", "الاستردادات")} ({counts(value)})</button>)}
            </div><button type="button" className="finance-export" disabled={!exportRows.length || badRange || badAmount} onClick={exportCsv}><Download size={13} />{selectedRows.length ? c.text(`Export (${selectedRows.length})`, `تصدير (${selectedRows.length})`) : c.text("Export", "تصدير")}</button></div>
            <div className="finance-filters"><label className="finance-search"><Search size={15} aria-hidden="true" /><input aria-label={c.text("Search transactions", "ابحث عن المعاملات")} placeholder={c.text("Search reference or customer…", "ابحث عن المرجع أو العميل…")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <select aria-label={c.text("Transaction type", "نوع المعاملة")} value={filters.kind} onChange={(e) => update("kind", e.target.value)}>
                <option value="">{c.text("Type", "النوع")}</option><option value="product">{c.text("Product Orders", "طلبات المنتجات")}</option><option value="house">{c.text("Pet Houses", "بيوت الحيوانات")}</option><option value="grooming">{c.text("Grooming", "العناية")}</option></select>
              <select aria-label={c.text("Payment status", "حالة الدفع")} value={filters.status} onChange={(e) => update("status", e.target.value)}>
                <option value="">{c.text("Payment Status", "حالة الدفع")}</option><option value="paid">{c.text("Paid", "مدفوع")}</option><option value="pending">{c.text("Pending", "قيد الانتظار")}</option><option value="refunded">{c.text("Refunded", "مسترد")}</option></select>
              <select aria-label={c.text("Payment method", "طريقة الدفع")} value={filters.method} onChange={(e) => update("method", e.target.value)}>
                <option value="">{c.text("Payment Method", "طريقة الدفع")}</option>{(["card", "bank-transfer", "cod", "cash", "unknown"] as const).map((method) => <option key={method} value={method}>{financeMethodLabel(method === "unknown" ? undefined : method, c.ar)}</option>)}</select>
              <button type="button" className="finance-filter-button" aria-pressed={period === "custom"} onClick={() => changePeriod("custom")}><CalendarDays size={13} />{c.text("Date", "التاريخ")}</button>
              <button type="button" className="finance-filter-button" aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}><Filter size={13} />{c.text("More Filters", "فلاتر إضافية")}</button>
            </div>
            {moreFilters && <div className="finance-more-filters"><Field label={c.text("Minimum amount (QAR)", "أقل مبلغ (ر.ق)")}><NumberInput kind="decimal" min={0} value={filters.minimum} onChange={(e) => update("minimum", e.target.value)} /></Field>
              <Field label={c.text("Maximum amount (QAR)", "أعلى مبلغ (ر.ق)")}><NumberInput kind="decimal" min={0} value={filters.maximum} onChange={(e) => update("maximum", e.target.value)} /></Field></div>}
            {badAmount && <p className="form-error" role="alert">{c.text("Minimum amount must not exceed maximum amount.", "يجب ألا يتجاوز الحد الأدنى الحد الأعلى.")}</p>}
            <div id="finance-results" role="tabpanel" aria-labelledby={`finance-tab-${tab}`}>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll this wide table region (WCAG 2.1.1). */}
              <section className="finance-table-scroll" aria-label={c.text("Scrollable transaction table", "جدول المعاملات القابل للتمرير")} tabIndex={0}><table className="finance-table"><thead><tr>
                <th><input type="checkbox" aria-label={c.text("Select visible transactions", "تحديد المعاملات الظاهرة")} checked={!!shown.length && shown.every((r) => checked.includes(r.id))} onChange={(e) => setChecked(e.target.checked ? Array.from(new Set([...checked, ...shown.map((r) => r.id)])) : checked.filter((id) => !shown.some((r) => r.id === id)))} /></th>
                {heading(c.text("Date", "التاريخ"), "date")}{heading(c.text("Reference", "المرجع"), "reference")}{heading(c.text("Customer", "العميل"), "customer")}{heading(c.text("Type", "النوع"), "type")}{heading(c.text("Amount", "المبلغ"), "amount")}{heading(c.text("Payment Method", "طريقة الدفع"), "method")}{heading(c.text("Payment Status", "حالة الدفع"), "status")}<th><span className="sr-only">{c.text("Details", "التفاصيل")}</span></th>
              </tr></thead><tbody>{shown.map((r) => {
                const Icon = r.kind === "grooming" ? Scissors : r.kind === "house" ? House : Package;
                const MethodIcon = r.method === "bank-transfer" ? Landmark : r.method === "cash" || r.method === "cod" ? Banknote : CreditCard;
                const amount = tab === "refunds" ? r.refunded : r.amount, displayDate = tab === "refunds" ? r.refundDate ?? r.date : r.date;
                const open = (button: HTMLButtonElement) => { if (r.id === selectedId) close(); else { originRef.current = button; setSelectedId(r.id); } };
                return <tr key={r.id} className={selectedId === r.id ? "is-selected" : ""}>
                  <td><input type="checkbox" aria-label={c.text(`Select ${r.reference}`, `تحديد ${r.reference}`)} checked={checked.includes(r.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, r.id] : checked.filter((id) => id !== r.id))} /></td>
                  <td><time dateTime={displayDate}>{financeDate(displayDate, c.locale)}<small>{new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(displayDate))}</small></time></td>
                  <td><button type="button" className="finance-reference" aria-expanded={selectedId === r.id} onClick={(e) => open(e.currentTarget)} aria-label={c.text(`Open transaction ${r.reference}`, `افتح المعاملة ${r.reference}`)}><bdi>{r.reference}</bdi></button></td>
                  <td><div className="finance-customer-cell"><span className="finance-avatar">{r.customerName.split(" ").map((n) => n[0]).slice(0, 2).join("") || "?"}</span><span>{r.customerName || c.text("Not recorded", "غير مسجل")}<small>{r.booking?.petName ?? c.text("Shop customer", "عميل المتجر")}</small></span></div></td>
                  <td><span className={`finance-type finance-type--${r.kind}`}><Icon size={13} />{typeLabel(r.kind)}</span></td>
                  <td><bdi>{financeMoney(amount, c.locale)}</bdi></td><td><span className="finance-method-cell"><MethodIcon size={14} />{financeMethodLabel(r.method, c.ar)}</span></td><td><FinanceStatusBadge status={r.status} /></td>
                  <td><button type="button" className="finance-icon-button" aria-label={c.text(`Transaction details ${r.reference}`, `تفاصيل المعاملة ${r.reference}`)} onClick={(e) => open(e.currentTarget)}><MoreHorizontal size={17} /></button></td>
                </tr>;
              })}</tbody></table></section>
              {!shown.length && <Empty>{c.text("No matching financial records.", "لا توجد سجلات مالية مطابقة.")}<button type="button" className="text-button" onClick={() => { setFilters(financeDefaults); setSearch(""); setPeriod("month"); setTab("transactions"); }}>{c.text("Reset filters", "إعادة ضبط الفلاتر")}</button></Empty>}
            </div>
            <div className="finance-pagination"><div><button type="button" aria-label={c.text("Previous page", "الصفحة السابقة")} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - currentPage) < 2).map((p) => <button type="button" key={p} aria-current={p === currentPage ? "page" : undefined} onClick={() => setPage(p)}>{p}</button>)}
              <button type="button" aria-label={c.text("Next page", "الصفحة التالية")} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button></div>
              <span>{c.text(`Showing ${rows.length ? (currentPage - 1) * size + 1 : 0}–${Math.min(currentPage * size, rows.length)} of ${rows.length} transactions`, `عرض ${rows.length ? (currentPage - 1) * size + 1 : 0}–${Math.min(currentPage * size, rows.length)} من ${rows.length} معاملة`)}</span>
              <select aria-label={c.text("Transactions per page", "المعاملات لكل صفحة")} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>{[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} {c.text("per page", "لكل صفحة")}</option>)}</select></div>
          </section>
          <p className="finance-caption">{periodLabel} · {c.text("Qatar time. Charts show net collected revenue; table filters and selection apply to CSV exports. Demo data only.", "بتوقيت قطر. تعرض المخططات صافي الإيرادات المحصلة؛ تنطبق فلاتر الجدول والتحديد على تصدير CSV. بيانات تجريبية فقط.")}</p>
          <p className="finance-export-message" role="status">{message}</p>
        </div>
        {selected && <FinanceDetailPanel transaction={selected} close={close} panelRef={panelRef} />}
      </div>
    </AdminPage>
  </div>;
}
