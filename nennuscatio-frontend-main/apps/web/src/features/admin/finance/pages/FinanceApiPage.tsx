"use client";

import {
  FINANCE_MAX_DAYS,
  FINANCE_PAGE_SIZES,
  type FinanceGrouping,
  type FinancePayment,
  type FinanceRefund,
  type FinanceTransaction,
  financeRefundFilterSchema,
  financeTransactionStatusSchema,
  type PayableKind,
} from "@nennus-catio/contracts";
import { ArrowDownUp, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Filter, House, MoreHorizontal, Package, RotateCcw, Scissors, Search, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import {
  describeFinanceError,
  emptyFinanceFilters,
  type FinanceListFilters,
  type FinanceTab,
  financeListSearch,
  financeOverviewSearch,
  qarToMinor,
  useFinanceOverview,
  useFinancePayments,
  useFinanceRefunds,
  useFinanceTransactions,
} from "@/shared/api/admin-finance";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney, formatSignedMoney } from "@/shared/lib/format";
import { AdminPage, Empty, ErrorMessage, Field } from "@/shared/ui/BusinessUI";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { FINANCE_KIND_COLORS, FinanceChartPanels } from "../FinanceCharts";
import { FinanceApiDetail } from "../components/FinanceApiDetail";
import {
  bucketLabel,
  FINANCE_TRANSACTION_STATUS,
  FINANCE_TYPE,
  FINANCE_TYPE_CLASS,
  financePeriod,
  financeWhen,
  PAYMENT_PROVIDER,
  REFUND_FILTER,
  REFUND_METHOD,
  REFUND_STATUS,
  rangeDays,
  refundStatusTone,
  transactionStatusTone,
} from "../lib/finance-labels";
import { NumberInput } from "@/shared/ui/NumberInput";

type Period = "today" | "week" | "month" | "custom";
type Selected = { kind: PayableKind; reference: string };

const TABS: readonly FinanceTab[] = ["transactions", "payments", "refunds"];
/** Sortable columns of each tab (the API refuses any other). */
const SORTS: Record<FinanceTab, readonly string[]> = {
  transactions: ["date", "reference", "customer", "type", "amount", "status"],
  payments: ["date", "reference", "customer", "type", "amount"],
  refunds: ["date", "reference", "customer", "type", "amount", "status"],
};

/**
 * Real finance (#12 part 1, D222-D223): website money only (in-store sales stay in the POS, D273/D285),
 * counted on the Qatar day it moved (answer 1A). Cards, charts, three lists with the server's
 * filters, sorting and pages, a read-only detail panel, and each tab's CSV for roles with Export.
 */
export function FinanceApiPage() {
  const c = useCopy();
  const canExport = useAdminAccess().can("finance", "export");
  const { date } = useDashboardDate();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [grouping, setGrouping] = useState<FinanceGrouping>("day");
  const [tab, setTab] = useState<FinanceTab>("transactions");
  const [filters, setFilters] = useState<FinanceListFilters>(emptyFinanceFilters);
  const [typed, setTyped] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);

  const range = financePeriod(date, period, custom);
  const days = rangeDays(range.from, range.to);
  const badRange = period === "custom" && (!range.from || !range.to || range.from > range.to);
  const tooLong = !badRange && days > FINANCE_MAX_DAYS;
  const badAmount = (() => {
    const min = qarToMinor(filters.min);
    const max = qarToMinor(filters.max);
    return min !== undefined && max !== undefined && min > max;
  })();
  const ready = !badRange && !tooLong && days > 0;
  const overview = useFinanceOverview(financeOverviewSearch(range.from, range.to, grouping), { enabled: ready });
  const listSearch = financeListSearch(tab, range, filters);
  const listReady = ready && !badAmount;
  const transactions = useFinanceTransactions(listSearch, listReady && tab === "transactions");
  const payments = useFinancePayments(listSearch, listReady && tab === "payments");
  const refunds = useFinanceRefunds(listSearch, listReady && tab === "refunds");
  const list = tab === "transactions" ? transactions : tab === "payments" ? payments : refunds;

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === typed ? current : { ...current, q: typed, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new dashboard date or period closes the open transaction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: date and period changes intentionally close the details.
  useEffect(() => {
    setSelected(null);
    setFilters((current) => ({ ...current, page: 1 }));
  }, [date, period]);

  useEffect(() => {
    if (selected) panelRef.current?.focus();
  }, [selected]);

  function patch(values: Partial<FinanceListFilters>) {
    setFilters((current) => ({ ...current, ...values, page: values.page ?? 1 }));
  }

  function changeTab(next: FinanceTab) {
    setTab(next);
    setSelected(null);
    // Each tab has its own statuses and columns.
    patch({ status: "", provider: "", method: "", sort: "date", order: "desc" });
  }

  function changePeriod(next: Period) {
    if (next === "custom" && (!custom.from || !custom.to)) setCustom(financePeriod(date, period, custom));
    setPeriod(next);
  }

  function open(next: Selected, button: HTMLButtonElement) {
    if (selected?.kind === next.kind && selected.reference === next.reference) {
      close();
      return;
    }
    originRef.current = button;
    setSelected(next);
  }

  function close() {
    setSelected(null);
    originRef.current?.focus();
  }

  function sortBy(column: string) {
    if (filters.sort === column) patch({ order: filters.order === "asc" ? "desc" : "asc" });
    else patch({ sort: column, order: column === "date" || column === "amount" ? "desc" : "asc" });
  }

  const data = overview.data;
  const tabLabel = (value: FinanceTab) =>
    value === "transactions" ? c.text("Transactions", "المعاملات") : value === "payments" ? c.text("Payments", "المدفوعات") : c.text("Refunds", "الاستردادات");
  const heading = (label: string, column: string) =>
    SORTS[tab].includes(column) ? (
      <th aria-sort={filters.sort === column ? (filters.order === "desc" ? "descending" : "ascending") : "none"}>
        <button type="button" onClick={() => sortBy(column)}>
          {label}
          <ArrowDownUp size={9} aria-hidden="true" />
        </button>
      </th>
    ) : (
      <th>{label}</th>
    );
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const filtered = !!filters.q.trim() || !!filters.type || !!filters.status || !!filters.provider || !!filters.method || !!filters.min || !!filters.max;

  return (
    <div className="reference-finance">
      <AdminPage
        module="finance"
        title={c.text("Finance", "المالية")}
        subtitle={c.text(
          "Website sales, payments and refunds. In-store sales stay in the POS.",
          "مبيعات الموقع والمدفوعات والاستردادات. تبقى مبيعات المتجر في نظام نقطة البيع.",
        )}
      >
        <div className={`finance-layout ${selected ? "finance-layout--detail" : ""}`}>
          <div className="finance-workspace">
            <fieldset className="finance-periods" aria-label={c.text("Financial period", "الفترة المالية")}>
              {(["today", "week", "month", "custom"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={period === value} onClick={() => changePeriod(value)}>
                  {value === "today"
                    ? c.text("Today", "اليوم")
                    : value === "week"
                      ? c.text("This Week", "هذا الأسبوع")
                      : value === "month"
                        ? c.text("This Month", "هذا الشهر")
                        : c.text("Custom", "مخصص")}
                  {value === "custom" && <CalendarDays size={13} />}
                </button>
              ))}
            </fieldset>
            {period === "custom" && (
              <div className="finance-custom-dates">
                <Field label={c.text("From date (Qatar)", "من تاريخ (قطر)")}>
                  <input type="date" value={custom.from} onChange={(e) => setCustom((value) => ({ ...value, from: e.target.value }))} />
                </Field>
                <Field label={c.text("To date (Qatar)", "إلى تاريخ (قطر)")}>
                  <input type="date" value={custom.to} onChange={(e) => setCustom((value) => ({ ...value, to: e.target.value }))} />
                </Field>
              </div>
            )}
            {badRange && (
              <p className="form-error" role="alert">
                {c.text("Choose a start date and an end date, the start not after the end.", "اختر تاريخ بداية وتاريخ نهاية، على ألا تكون البداية بعد النهاية.")}
              </p>
            )}
            {tooLong && (
              <p className="form-error" role="alert">
                {c.text(`Choose at most ${FINANCE_MAX_DAYS} days.`, `اختر ${FINANCE_MAX_DAYS} يوماً على الأكثر.`)}
              </p>
            )}
            {overview.isError && (
              <div className="inline-state" role="alert">
                <p>{describeFinanceError(overview.error, c.text)}</p>
                <button type="button" className="button button--secondary" onClick={() => void overview.refetch()}>
                  {c.text("Retry", "أعد المحاولة")}
                </button>
              </div>
            )}
            <div className="finance-metrics" aria-busy={overview.isFetching}>
              {[
                {
                  label: c.text("Online sales", "مبيعات الموقع"),
                  value: data ? formatSignedMoney(data.net, c.locale) : "–",
                  note: c.text("Paid less refunds", "المدفوع ناقص الاسترداد"),
                  Icon: BarChart3,
                  tone: "blue",
                },
                {
                  label: c.text("Paid", "المدفوع"),
                  value: data ? formatMoney(data.paid.amount, c.locale) : "–",
                  note: data ? c.text(`${data.paid.count} payments received`, `${data.paid.count} دفعات مستلمة`) : c.text("Payments received", "دفعات مستلمة"),
                  Icon: CreditCard,
                  tone: "green",
                },
                {
                  label: c.text("To refund", "للاسترداد"),
                  value: data ? formatMoney(data.toRefund.amount, c.locale) : "–",
                  note: data
                    ? c.text(`Owed back now on ${data.toRefund.count} orders, bookings or relocation requests`, `مستحق للعملاء الآن على ${data.toRefund.count} طلبات أو حجوزات أو طلبات نقل`)
                    : c.text("Owed back to customers now", "مستحق للعملاء الآن"),
                  Icon: Undo2,
                  tone: "orange",
                },
                {
                  label: c.text("Refunds", "الاستردادات"),
                  value: data ? formatMoney(data.refunds.amount, c.locale) : "–",
                  note: data ? c.text(`${data.refunds.count} completed`, `${data.refunds.count} مكتملة`) : c.text("Completed refunds", "استردادات مكتملة"),
                  Icon: RotateCcw,
                  tone: "red",
                },
              ].map(({ label, value, note, Icon, tone }) => (
                <div className={`finance-card finance-metric finance-metric--${tone}`} key={tone}>
                  <span className="finance-metric-icon">
                    <Icon size={23} strokeWidth={1.8} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>
                      <bdi>{value}</bdi>
                    </strong>
                    <small>{note}</small>
                  </div>
                </div>
              ))}
            </div>
            {data && data.sales.count + data.otherPayments.count > 0 && (
              <dl className="finance-card finance-sales" aria-label={c.text("Where the money came from", "مصدر المبالغ")}>
                <div>
                  <dt>
                    {c.text(
                      `Items, packages and quotes (${data.sales.count} orders, bookings and relocation requests)`,
                      `المنتجات والباقات وعروض الأسعار (${data.sales.count} طلبات وحجوزات وطلبات نقل)`,
                    )}
                  </dt>
                  <dd>
                    <bdi>{formatMoney(data.sales.items, c.locale)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{c.text("Discounts", "الخصومات")}</dt>
                  <dd>
                    <bdi>{data.sales.discount ? `−${formatMoney(data.sales.discount, c.locale)}` : formatMoney(0, c.locale)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{c.text("Delivery fees", "رسوم التوصيل")}</dt>
                  <dd>
                    <bdi>{formatMoney(data.sales.deliveryFees, c.locale)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{c.text("Home visit fees", "رسوم الزيارات المنزلية")}</dt>
                  <dd>
                    <bdi>{formatMoney(data.sales.visitFees, c.locale)}</bdi>
                  </dd>
                </div>
                {data.otherPayments.count > 0 && (
                  <div>
                    <dt>{c.text(`Other payments (${data.otherPayments.count}: paid twice or late)`, `مدفوعات أخرى (${data.otherPayments.count}: مكررة أو متأخرة)`)}</dt>
                    <dd>
                      <bdi>{formatMoney(data.otherPayments.amount, c.locale)}</bdi>
                    </dd>
                  </div>
                )}
                <div className="finance-total">
                  <dt>{c.text("Paid", "المدفوع")}</dt>
                  <dd>
                    <bdi>{formatMoney(data.paid.amount, c.locale)}</bdi>
                  </dd>
                </div>
                {data.promotions.map((promotion) => (
                  <div key={`${promotion.name.en}-${promotion.code ?? ""}`} className="finance-sales-promotion">
                    <dt>
                      {c.local(promotion.name)}
                      {promotion.code && <bdi> {promotion.code}</bdi>} ·{" "}
                      {c.text(`${promotion.uses} uses`, `${promotion.uses} استخدامات`)}
                    </dt>
                    <dd>
                      <bdi>−{formatMoney(promotion.discount, c.locale)}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {/* Relocation quotes paid or refunded outside the website (15d, D279 answer 10): staff records, never added to online sales (D222). */}
            {data && (data.outside.paid.count > 0 || data.outside.refunded.count > 0) && (
              <dl className="finance-card finance-sales finance-outside" aria-label={c.text("Outside the website", "خارج الموقع")}>
                <div>
                  <dt>{c.text(`Paid outside the website (relocation, ${data.outside.paid.count})`, `مدفوع خارج الموقع (النقل، ${data.outside.paid.count})`)}</dt>
                  <dd>
                    <bdi>{formatMoney(data.outside.paid.amount, c.locale)}</bdi>
                  </dd>
                </div>
                {data.outside.refunded.count > 0 && (
                  <div>
                    <dt>{c.text(`Refunded outside the website (${data.outside.refunded.count})`, `مسترد خارج الموقع (${data.outside.refunded.count})`)}</dt>
                    <dd>
                      <bdi>{formatMoney(data.outside.refunded.amount, c.locale)}</bdi>
                    </dd>
                  </div>
                )}
                <p className="small muted">
                  {c.text(
                    "Recorded by staff (bank transfer, cash or another way). Not included in online sales or any figure above.",
                    "سجّلها الموظفون (تحويل بنكي أو نقداً أو بطريقة أخرى). غير محتسبة في مبيعات الموقع ولا في أي رقم أعلاه.",
                  )}
                </p>
              </dl>
            )}
            {data && (
              <FinanceChartPanels
                series={data.series.map((bucket) => ({ label: bucketLabel(bucket.start, data.grouping, c.ar), value: bucket.net }))}
                kinds={data.byType.map((row) => ({
                  kind: FINANCE_TYPE_CLASS[row.type],
                  value: row.net,
                  label: c.local(FINANCE_TYPE[row.type]),
                  color: FINANCE_KIND_COLORS[FINANCE_TYPE_CLASS[row.type]],
                }))}
                mode={grouping}
                setMode={setGrouping}
                modes={[
                  { value: "day", label: c.text("Daily", "يومي") },
                  { value: "week", label: c.text("Weekly", "أسبوعي") },
                  { value: "month", label: c.text("Monthly", "شهري") },
                ]}
                title={c.text("Online sales over time", "مبيعات الموقع عبر الوقت")}
                typeTitle={c.text("Online sales by type", "مبيعات الموقع حسب النوع")}
                netLabel={c.text("Online sales", "مبيعات الموقع")}
                emptyText={c.text("No money moved in this period.", "لم تتحرك أي مبالغ في هذه الفترة.")}
              />
            )}
            <section className="finance-card finance-records" aria-label={c.text("Financial records", "السجلات المالية")}>
              <div className="finance-records-heading">
                <div className="finance-tabs" role="tablist" aria-label={c.text("Transaction view", "عرض المعاملات")}>
                  {TABS.map((value, index) => (
                    <button
                      type="button"
                      key={value}
                      id={`finance-tab-${value}`}
                      aria-controls="finance-results"
                      role="tab"
                      aria-selected={tab === value}
                      tabIndex={tab === value ? 0 : -1}
                      onKeyDown={(e) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                        e.preventDefault();
                        const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                        const target = TABS[next] ?? "transactions";
                        changeTab(target);
                        document.getElementById(`finance-tab-${target}`)?.focus();
                      }}
                      onClick={() => changeTab(value)}
                    >
                      {tabLabel(value)}
                    </button>
                  ))}
                </div>
                {canExport && (
                  <DownloadMenu
                    compact
                    path={`/admin/finance/${tab}`}
                    search={financeListSearch(tab, range, filters, { paged: false })}
                    onError={setDownloadError}
                    disabled={!listReady}
                  />
                )}
              </div>
              <ErrorMessage message={downloadError} />
              <div className="finance-filters">
                <label className="finance-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    aria-label={c.text("Search", "بحث")}
                    placeholder={
                      tab === "transactions"
                        ? c.text("Search reference or customer…", "ابحث عن المرجع أو العميل…")
                        : c.text("Search reference, SkipCash id or customer…", "ابحث عن المرجع أو رقم SkipCash أو العميل…")
                    }
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </label>
                <select aria-label={c.text("Type", "النوع")} value={filters.type} onChange={(e) => patch({ type: e.target.value as FinanceListFilters["type"] })}>
                  <option value="">{c.text("All types", "كل الأنواع")}</option>
                  {(["products", "houses", "grooming"] as const).map((type) => (
                    <option key={type} value={type}>
                      {c.local(FINANCE_TYPE[type])}
                    </option>
                  ))}
                </select>
                {tab === "transactions" && (
                  <select aria-label={c.text("Status", "الحالة")} value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
                    <option value="">{c.text("All statuses", "كل الحالات")}</option>
                    {financeTransactionStatusSchema.options.map((status) => (
                      <option key={status} value={status}>
                        {c.local(FINANCE_TRANSACTION_STATUS[status])}
                      </option>
                    ))}
                  </select>
                )}
                {tab === "payments" && (
                  <select
                    aria-label={c.text("Payment company", "شركة الدفع")}
                    value={filters.provider}
                    onChange={(e) => patch({ provider: e.target.value as FinanceListFilters["provider"] })}
                  >
                    <option value="">{c.text("All payment companies", "كل شركات الدفع")}</option>
                    <option value="skipcash">{c.local(PAYMENT_PROVIDER.skipcash)}</option>
                    <option value="fake">{c.local(PAYMENT_PROVIDER.fake)}</option>
                  </select>
                )}
                {tab === "refunds" && (
                  <>
                    <select aria-label={c.text("Refund status", "حالة الاسترداد")} value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
                      <option value="">{c.text("All statuses", "كل الحالات")}</option>
                      {financeRefundFilterSchema.options.map((status) => (
                        <option key={status} value={status}>
                          {c.local(REFUND_FILTER[status])}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={c.text("Refund method", "طريقة الاسترداد")}
                      value={filters.method}
                      onChange={(e) => patch({ method: e.target.value as FinanceListFilters["method"] })}
                    >
                      <option value="">{c.text("All methods", "كل الطرق")}</option>
                      <option value="api">{c.local(REFUND_METHOD.api)}</option>
                      <option value="manual">{c.local(REFUND_METHOD.manual)}</option>
                    </select>
                  </>
                )}
                <button type="button" className="finance-filter-button" aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>
                  <Filter size={13} />
                  {c.text("More Filters", "فلاتر إضافية")}
                </button>
              </div>
              {moreFilters && (
                <div className="finance-more-filters">
                  <Field label={c.text("Minimum amount (QAR)", "أقل مبلغ (ر.ق)")}>
                    <NumberInput kind="decimal" min={0} value={filters.min} onChange={(e) => patch({ min: e.target.value })} />
                  </Field>
                  <Field label={c.text("Maximum amount (QAR)", "أعلى مبلغ (ر.ق)")}>
                    <NumberInput kind="decimal" min={0} value={filters.max} onChange={(e) => patch({ max: e.target.value })} />
                  </Field>
                </div>
              )}
              {badAmount && (
                <p className="form-error" role="alert">
                  {c.text("Minimum amount must not exceed maximum amount.", "يجب ألا يتجاوز الحد الأدنى الحد الأعلى.")}
                </p>
              )}
              <div id="finance-results" role="tabpanel" aria-labelledby={`finance-tab-${tab}`}>
                {list.isError && (
                  <div className="inline-state" role="alert">
                    <p>{describeFinanceError(list.error, c.text)}</p>
                    <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                      {c.text("Retry", "أعد المحاولة")}
                    </button>
                  </div>
                )}
                {list.isPending && listReady && (
                  <p className="muted" role="status" aria-busy="true">
                    {c.text("Loading…", "جارٍ التحميل…")}
                  </p>
                )}
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll this wide table region (WCAG 2.1.1). */}
                <section className="finance-table-scroll" aria-label={c.text("Scrollable transaction table", "جدول المعاملات القابل للتمرير")} tabIndex={0}>
                  <table className={`finance-table finance-table--${tab}`} aria-busy={list.isFetching}>
                    <thead>
                      <tr>
                        {heading(c.text("Date", "التاريخ"), "date")}
                        {heading(c.text("Reference", "المرجع"), "reference")}
                        {heading(c.text("Customer", "العميل"), "customer")}
                        {heading(c.text("Type", "النوع"), "type")}
                        {heading(c.text("Amount", "المبلغ"), "amount")}
                        {tab === "transactions" && <th>{c.text("Refunded", "المسترد")}</th>}
                        {tab === "refunds" ? <th>{c.text("Method", "الطريقة")}</th> : <th>{c.text("Payment company", "شركة الدفع")}</th>}
                        {tab === "payments" ? <th>{c.text("Payment", "الدفعة")}</th> : heading(c.text("Status", "الحالة"), "status")}
                        <th>
                          <span className="sr-only">{c.text("Details", "التفاصيل")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tab === "transactions" &&
                        transactions.data?.rows.map((row) => <TransactionRow key={`${row.kind}-${row.reference}`} row={row} selected={selected} open={open} />)}
                      {tab === "payments" && payments.data?.rows.map((row) => <PaymentRow key={row.reference} row={row} selected={selected} open={open} />)}
                      {tab === "refunds" && refunds.data?.rows.map((row) => <RefundRow key={row.id} row={row} selected={selected} open={open} />)}
                    </tbody>
                  </table>
                </section>
                {list.data && list.data.rows.length === 0 && (
                  <Empty>
                    {filtered ? c.text("No matching financial records.", "لا توجد سجلات مالية مطابقة.") : c.text("No money moved in this period.", "لم تتحرك أي مبالغ في هذه الفترة.")}
                    {filtered && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setTyped("");
                          setFilters({ ...emptyFinanceFilters(), pageSize: filters.pageSize });
                        }}
                      >
                        {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                      </button>
                    )}
                  </Empty>
                )}
              </div>
              {list.data && (
                <div className="finance-pagination">
                  <div>
                    <button type="button" aria-label={c.text("Previous page", "الصفحة السابقة")} disabled={list.data.page <= 1} onClick={() => patch({ page: filters.page - 1 })}>
                      <ChevronLeft size={14} />
                    </button>
                    <span aria-current="page">{c.text(`Page ${list.data.page} of ${pages}`, `صفحة ${list.data.page} من ${pages}`)}</span>
                    <button type="button" aria-label={c.text("Next page", "الصفحة التالية")} disabled={list.data.page >= pages} onClick={() => patch({ page: filters.page + 1 })}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <span>
                    {c.text(`${list.data.total} records · total ${formatMoney(list.data.sum, "en")}`, `${list.data.total} سجلات · المجموع ${formatMoney(list.data.sum, "ar")}`)}
                  </span>
                  <select
                    aria-label={c.text("Records per page", "السجلات لكل صفحة")}
                    value={filters.pageSize}
                    onChange={(e) => patch({ pageSize: Number(e.target.value) })}
                  >
                    {FINANCE_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} {c.text("per page", "لكل صفحة")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
            <p className="finance-caption">
              {c.text(
                `${range.from} – ${range.to}, Qatar time. Payments count on the day they were received and refunds on the day they were completed. Website sales only.`,
                `${range.from} – ${range.to}، بتوقيت قطر. تُحسب المدفوعات في يوم استلامها والاستردادات في يوم اكتمالها. مبيعات الموقع فقط.`,
              )}
            </p>
          </div>
          {selected && <FinanceApiDetail key={`${selected.kind}-${selected.reference}`} selected={selected} close={close} panelRef={panelRef} />}
        </div>
      </AdminPage>
    </div>
  );
}

type RowProps<T> = { row: T; selected: Selected | null; open: (next: Selected, button: HTMLButtonElement) => void };

function TypeCell({ type }: { type: FinanceTransaction["type"] }) {
  const c = useCopy();
  const Icon = type === "grooming" ? Scissors : type === "houses" ? House : Package;
  return (
    <span className={`finance-type finance-type--${FINANCE_TYPE_CLASS[type]}`}>
      <Icon size={13} />
      {c.local(FINANCE_TYPE[type])}
    </span>
  );
}

function When({ iso }: { iso: string }) {
  const c = useCopy();
  const at = financeWhen(iso, c.ar);
  return (
    <time dateTime={iso}>
      {at.date}
      <small>{at.time}</small>
    </time>
  );
}

function Customer({ name }: { name: string }) {
  return (
    <div className="finance-customer-cell">
      <span className="finance-avatar" aria-hidden="true">
        {name
          .split(" ")
          .map((part) => part[0])
          .filter((letter) => letter && /\p{L}/u.test(letter))
          .slice(0, 2)
          .join("") || "?"}
      </span>
      <span>{name}</span>
    </div>
  );
}

function OpenButton({ source, selected, open, icon }: { source: Selected; selected: Selected | null; open: RowProps<unknown>["open"]; icon?: boolean }) {
  const c = useCopy();
  const isOpen = selected?.kind === source.kind && selected.reference === source.reference;
  return icon ? (
    <button
      type="button"
      className="finance-icon-button"
      aria-label={c.text(`Transaction details ${source.reference}`, `تفاصيل المعاملة ${source.reference}`)}
      onClick={(e) => open(source, e.currentTarget)}
    >
      <MoreHorizontal size={17} />
    </button>
  ) : (
    <button
      type="button"
      className="finance-reference"
      aria-expanded={isOpen}
      aria-label={c.text(`Open transaction ${source.reference}`, `افتح المعاملة ${source.reference}`)}
      onClick={(e) => open(source, e.currentTarget)}
    >
      <bdi>{source.reference}</bdi>
    </button>
  );
}

function TransactionRow({ row, selected, open }: RowProps<FinanceTransaction>) {
  const c = useCopy();
  const source = { kind: row.kind, reference: row.reference };
  return (
    <tr className={selected?.reference === row.reference ? "is-selected" : ""}>
      <td>
        <When iso={row.paidAt} />
      </td>
      <td>
        <OpenButton source={source} selected={selected} open={open} />
        {row.payments > 1 && <small>{c.text(`${row.payments} payments`, `${row.payments} دفعات`)}</small>}
      </td>
      <td>
        <Customer name={row.customerName} />
      </td>
      <td>
        <TypeCell type={row.type} />
      </td>
      <td>
        <bdi>{formatMoney(row.paid, c.locale)}</bdi>
      </td>
      <td>
        <bdi>{row.refunded ? formatMoney(row.refunded, c.locale) : "–"}</bdi>
      </td>
      <td>
        <span className="finance-method-cell">
          <CreditCard size={14} />
          {c.local(PAYMENT_PROVIDER[row.provider])}
        </span>
      </td>
      <td>
        <span className={`finance-status finance-status--${transactionStatusTone(row.status)}`}>
          <i aria-hidden="true" />
          {c.local(FINANCE_TRANSACTION_STATUS[row.status])}
        </span>
      </td>
      <td>
        <OpenButton source={source} selected={selected} open={open} icon />
      </td>
    </tr>
  );
}

function PaymentRow({ row, selected, open }: RowProps<FinancePayment>) {
  const c = useCopy();
  return (
    <tr className={selected?.reference === row.source.reference ? "is-selected" : ""}>
      <td>
        <When iso={row.succeededAt} />
      </td>
      <td>
        <OpenButton source={row.source} selected={selected} open={open} />
        <small>
          <bdi>{row.reference}</bdi>
        </small>
      </td>
      <td>
        <Customer name={row.customerName} />
      </td>
      <td>
        <TypeCell type={row.type} />
      </td>
      <td>
        <bdi>{formatMoney(row.amount, c.locale)}</bdi>
        {row.refunded > 0 && <small>{c.text(`Refunded ${formatMoney(row.refunded, "en")}`, `مسترد ${formatMoney(row.refunded, "ar")}`)}</small>}
      </td>
      <td>
        <span className="finance-method-cell">
          <CreditCard size={14} />
          {c.local(PAYMENT_PROVIDER[row.provider])}
        </span>
        {row.providerPaymentId && (
          <small>
            <bdi>{row.providerPaymentId}</bdi>
          </small>
        )}
      </td>
      <td>
        {row.extra ? (
          <span className="finance-status finance-status--pending">
            <i aria-hidden="true" />
            {c.text("Another payment", "دفعة أخرى")}
          </span>
        ) : (
          <span className="finance-status finance-status--paid">
            <i aria-hidden="true" />
            {c.text("Sale", "بيع")}
          </span>
        )}
      </td>
      <td>
        <OpenButton source={row.source} selected={selected} open={open} icon />
      </td>
    </tr>
  );
}

function RefundRow({ row, selected, open }: RowProps<FinanceRefund>) {
  const c = useCopy();
  return (
    <tr className={selected?.reference === row.source.reference ? "is-selected" : ""}>
      <td>
        <When iso={row.completedAt ?? row.requestedAt} />
      </td>
      <td>
        <OpenButton source={row.source} selected={selected} open={open} />
        {(row.providerRefundId ?? row.manualReference) && (
          <small>
            <bdi>{row.providerRefundId ?? row.manualReference}</bdi>
          </small>
        )}
      </td>
      <td>
        <Customer name={row.customerName} />
      </td>
      <td>
        <TypeCell type={row.type} />
      </td>
      <td>
        <bdi>{formatMoney(row.amount, c.locale)}</bdi>
      </td>
      <td>{c.local(REFUND_METHOD[row.method])}</td>
      <td>
        <span className={`finance-status finance-status--${refundStatusTone(row.status)}`}>
          <i aria-hidden="true" />
          {c.local(REFUND_STATUS[row.status])}
        </span>
      </td>
      <td>
        <OpenButton source={row.source} selected={selected} open={open} icon />
      </td>
    </tr>
  );
}
