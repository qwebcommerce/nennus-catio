"use client";
import {
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  House,
  MoreHorizontal,
  Navigation,
  Package,
  Scissors,
  Search,
  Truck,
} from "lucide-react";
import { useRef, useState } from "react";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { qatarDay, shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import {
  dispatchJobs,
  dispatchMetrics,
  mockDispatchRepository,
  type DispatchJob,
} from "@/mocks/adapters/dispatch-repository";
import {
  dispatchKinds,
  dispatchStatuses,
  dispatchTeam,
} from "@/mocks/data/dispatch";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { AdminMetric } from "@/shared/ui/AdminMetric";
import { Empty } from "@/shared/ui/BusinessUI";
import { FeatureFoundation } from "@/shared/ui/FeatureFoundation";
import { Photo } from "@/shared/ui/Photo";
import { DispatchAssignmentDialog } from "../DispatchAssignmentDialog";
import { DispatchBadge, DispatchDetailPanel } from "../DispatchDetailPanel";
import { useDispatchChanges, useDispatchWorkspace } from "../DispatchWorkspace";

const kindIcon = { product: Package, house: House, grooming: Scissors };
type Sort =
  | "time"
  | "sourceId"
  | "customerName"
  | "kind"
  | "address"
  | "assignedTo"
  | "status";
export function AdminDispatchPage() {
  const c = useCopy(),
    d = useBusiness(),
    changes = useDispatchChanges(),
    access = useAdminAccess(),
    { date, setDate } = useDashboardDate(),
    { search: headerSearch } = useDispatchWorkspace();
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [assignee, setAssignee] = useState(""),
    [period, setPeriod] = useState("all"),
    [more, setMore] = useState(false),
    [location, setLocation] = useState(""),
    [needsSlot, setNeedsSlot] = useState(false),
    [view, setView] = useState<"list" | "schedule">("list"),
    [selected, setSelected] = useState<string[]>([]),
    [activeId, setActiveId] = useState(""),
    [assignIds, setAssignIds] = useState<string[]>([]),
    [sort, setSort] = useState<Sort>("time"),
    [descending, setDescending] = useState(false),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [message, setMessage] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const jobs = dispatchJobs(d, changes),
    metrics = dispatchMetrics(jobs, date),
    active = jobs.find((j) => j.id === activeId);
  const monday = shiftDay(
    date,
    -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
  const rows = jobs
    .filter((j) => {
      const haystack =
        `${j.id} ${j.sourceId} ${j.customerName} ${j.email} ${j.phone} ${j.petName} ${j.address} ${j.items.map((i) => `${c.local(i.name)} ${i.sku}`).join(" ")}`.toLocaleLowerCase();
      return (
        (tab === "all" || j.kind === tab) &&
        [search, headerSearch].every((term) =>
          haystack.includes(term.trim().toLocaleLowerCase()),
        ) &&
        (!status || j.status === status) &&
        (!assignee ||
          (assignee === "none" ? !j.assignedTo : j.assignedTo === assignee)) &&
        (!location || j.address === location) &&
        (!needsSlot || !j.date || !j.time) &&
        (period === "all" ||
          (period === "day"
            ? j.date === date
            : j.date >= monday && j.date <= shiftDay(monday, 6)))
      );
    })
    .sort((a, b) => {
      const key = (j: DispatchJob) =>
        sort === "time"
          ? `${j.date || "9999"} ${j.time}`
          : sort === "assignedTo"
            ? (dispatchTeam.find((m) => m.id === j.assignedTo)?.name[
                c.locale
              ] ?? "")
            : sort === "kind"
              ? c.local(dispatchKinds.find((k) => k.id === j.kind)!.label)
              : j[sort];
      return (
        (key(a).localeCompare(key(b), c.locale, { numeric: true }) ||
          a.id.localeCompare(b.id)) * (descending ? -1 : 1)
      );
    });
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    currentPage = Math.min(page, pages),
    visible = rows.slice((currentPage - 1) * size, currentPage * size),
    checked = rows.filter((j) => selected.includes(j.id)),
    allChecked =
      visible.length > 0 && visible.every((j) => selected.includes(j.id));
  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setAssignee("");
    setLocation("");
    setNeedsSlot(false);
    setPeriod("all");
    setTab("all");
    setPage(1);
  };
  const open = (job: DispatchJob, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setActiveId(job.id === activeId ? "" : job.id);
  };
  const close = () => {
    setActiveId("");
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
  };
  const chooseDate = (day: string, range: string) => {
    setDate(day);
    setPeriod(range);
    setPage(1);
  };
  const changeSort = (key: Sort) => {
    setDescending(sort === key ? !descending : false);
    setSort(key);
    setPage(1);
  };
  const count = (value: number) =>
    new Intl.NumberFormat(c.locale).format(value);
  const dateLabel = (day: string) =>
    day
      ? new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", {
          dateStyle: "medium",
          timeZone: "Asia/Qatar",
        }).format(new Date(`${day}T12:00:00Z`))
      : c.text("Needs a slot", "يحتاج موعداً");
  const groups = [...new Set(rows.map((j) => j.date))].sort();
  if (!access.canView("dispatch"))
    return <FeatureFoundation area="dispatch" admin />;
  return (
    <div
      className={`dispatch-layout ${active ? "dispatch-layout--detail" : ""}`}
    >
      <div className="dispatch-workspace">
        <div className="op-heading">
          <div>
            <h1>{c.text("Dispatch", "التوصيل")}</h1>
            <p className="muted">
              {c.text(
                "Manage product deliveries, house deliveries and home grooming assignments.",
                "إدارة توصيل المنتجات والبيوت وتعيينات العناية المنزلية.",
              )}
            </p>
          </div>
        </div>
        <div className="admin-metrics dispatch-metrics">
          <AdminMetric
            icon={Truck}
            label={c.text("Dispatches Today", "مهام اليوم")}
            value={count(metrics.today)}
            note={c.text("Selected Qatar date", "التاريخ المختار في قطر")}
            trailingIcon={BarChart3}
          />
          <AdminMetric
            icon={Clock3}
            label={c.text("Awaiting Dispatch", "بانتظار التعيين")}
            value={count(metrics.awaiting)}
            note={c.text("Need assignment", "تحتاج تعييناً")}
            trailingIcon={BarChart3}
          />
          <AdminMetric
            icon={Navigation}
            label={c.text("En Route", "في الطريق")}
            value={count(metrics.enRoute)}
            note={c.text("Local mock progress", "تقدم تجريبي محلي")}
            trailingIcon={BarChart3}
          />
          <AdminMetric
            icon={CheckCircle2}
            label={c.text("Completed Today", "المكتمل اليوم")}
            value={count(metrics.completed)}
            note={c.text(
              "Scheduled on selected date",
              "مجدول في التاريخ المختار",
            )}
            trailingIcon={BarChart3}
          />
        </div>
        <section
          className="dispatch-records"
          aria-label={c.text("Dispatch records", "سجلات التوصيل")}
        >
          <fieldset
            className="dispatch-tabs"
            aria-label={c.text("Dispatch type", "نوع التوصيل")}
          >
            <button
              type="button"
              aria-pressed={tab === "all"}
              onClick={() => {
                setTab("all");
                setPage(1);
              }}
            >
              {c.text("All", "الكل")} ({count(jobs.length)})
            </button>
            {dispatchKinds.map((kind) => {
              const Icon = kindIcon[kind.id];
              return (
                <button
                  type="button"
                  key={kind.id}
                  aria-pressed={tab === kind.id}
                  onClick={() => {
                    setTab(kind.id);
                    setPage(1);
                  }}
                >
                  <Icon size={19} />
                  {c.local(kind.label)} (
                  {count(jobs.filter((j) => j.kind === kind.id).length)})
                </button>
              );
            })}
          </fieldset>
          <div className="dispatch-filters">
            <label className="dispatch-search">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label={c.text(
                  "Search dispatch list",
                  "ابحث في قائمة التوصيل",
                )}
                placeholder={c.text(
                  "Search reference, customer, location…",
                  "ابحث عن المرجع والعميل والموقع…",
                )}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              aria-label={c.text("Dispatch status", "حالة التوصيل")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{c.text("Status", "الحالة")}</option>
              {dispatchStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {c.local(s.label)}
                </option>
              ))}
            </select>
            <select
              aria-label={c.text("Dispatch date range", "نطاق تاريخ التوصيل")}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{c.text("All dates", "كل التواريخ")}</option>
              <option value="day">
                {c.text("Selected date", "التاريخ المختار")}
              </option>
              <option value="week">{c.text("This Week", "هذا الأسبوع")}</option>
            </select>
            <select
              aria-label={c.text("Assigned To filter", "تصفية المعين إليه")}
              value={assignee}
              onChange={(e) => {
                setAssignee(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{c.text("Assigned To", "معين إلى")}</option>
              <option value="none">{c.text("Unassigned", "غير معين")}</option>
              {dispatchTeam.map((m) => (
                <option key={m.id} value={m.id}>
                  {c.local(m.name)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button button--secondary"
              aria-expanded={more}
              onClick={() => setMore(!more)}
            >
              <Filter size={16} />
              {c.text("More Filters", "فلاتر إضافية")}
            </button>
          </div>
          {more && (
            <div className="dispatch-extra">
              <select
                aria-label={c.text("Destination filter", "تصفية الوجهة")}
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">
                  {c.text("All destinations", "كل الوجهات")}
                </option>
                {[...new Set(jobs.map((j) => j.address).filter(Boolean))].map(
                  (a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ),
                )}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={needsSlot}
                  onChange={(e) => {
                    setNeedsSlot(e.target.checked);
                    setPage(1);
                  }}
                />
                {c.text("Needs a slot", "يحتاج موعداً")}
              </label>
              <button
                type="button"
                className="text-link"
                onClick={resetFilters}
              >
                {c.text("Clear list filters", "مسح فلاتر القائمة")}
              </button>
            </div>
          )}
          <div className="dispatch-viewbar">
            <fieldset
              className="dispatch-segments"
              aria-label={c.text("Quick dates", "التواريخ السريعة")}
            >
              <button
                type="button"
                aria-pressed={
                  period === "day" &&
                  date === qatarDay(new Date().toISOString())
                }
                onClick={() =>
                  chooseDate(qatarDay(new Date().toISOString()), "day")
                }
              >
                {c.text("Today", "اليوم")}
              </button>
              <button
                type="button"
                aria-pressed={
                  period === "day" &&
                  date === shiftDay(qatarDay(new Date().toISOString()), 1)
                }
                onClick={() =>
                  chooseDate(
                    shiftDay(qatarDay(new Date().toISOString()), 1),
                    "day",
                  )
                }
              >
                {c.text("Tomorrow", "غداً")}
              </button>
              <button
                type="button"
                aria-pressed={period === "week"}
                onClick={() =>
                  chooseDate(qatarDay(new Date().toISOString()), "week")
                }
              >
                {c.text("This Week", "هذا الأسبوع")}
              </button>
            </fieldset>
            <fieldset
              className="dispatch-segments dispatch-mode"
              aria-label={c.text("Dispatch view", "عرض التوصيل")}
            >
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                {c.text("List", "قائمة")}
              </button>
              <button
                type="button"
                aria-pressed={view === "schedule"}
                onClick={() => setView("schedule")}
              >
                <CalendarDays size={17} />
                {c.text("Schedule", "جدول")}
              </button>
            </fieldset>
          </div>
          {checked.length > 0 && (
            <div className="dispatch-selection">
              <span>
                {count(checked.length)} {c.text("selected", "مختار")}
              </span>
              <button
                type="button"
                className="text-link"
                onClick={(e) => {
                  returnFocus.current = e.currentTarget;
                  setAssignIds(checked.map((j) => j.id));
                }}
              >
                {c.text("Assign selected · mock", "تعيين المختار · تجريبي")}
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => setSelected([])}
              >
                {c.text("Clear selection", "مسح الاختيار")}
              </button>
            </div>
          )}
          {message && (
            <p className="dispatch-feedback" role="status">
              {message}
              <button
                type="button"
                className="text-link"
                onClick={() => setMessage("")}
              >
                {c.text("Dismiss", "إخفاء")}
              </button>
            </p>
          )}
          {view === "list" ? (
            <>
              <section
                className="dispatch-table-scroll"
                aria-label={c.text(
                  "Scrollable dispatch table",
                  "جدول التوصيل القابل للتمرير",
                )}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll this wide table region (WCAG 2.1.1).
                tabIndex={0}
              >
                <table className="dispatch-table">
                  <colgroup>
                    <col className="dispatch-col-check" />
                    <col className="dispatch-col-time" />
                    <col className="dispatch-col-ref" />
                    <col className="dispatch-col-customer" />
                    <col className="dispatch-col-type" />
                    <col className="dispatch-col-location" />
                    <col className="dispatch-col-assigned" />
                    <col className="dispatch-col-status" />
                    <col className="dispatch-col-menu" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label={c.text(
                            "Select visible dispatches",
                            "اختر المهام الظاهرة",
                          )}
                          checked={allChecked}
                          onChange={() =>
                            setSelected(
                              allChecked
                                ? selected.filter(
                                    (id) => !visible.some((j) => j.id === id),
                                  )
                                : [
                                    ...new Set([
                                      ...selected,
                                      ...visible.map((j) => j.id),
                                    ]),
                                  ],
                            )
                          }
                        />
                      </th>
                      {(
                        [
                          ["time", c.text("Time", "الوقت")],
                          ["sourceId", c.text("Reference", "المرجع")],
                          [
                            "customerName",
                            c.text("Customer / Pet", "العميل / الحيوان"),
                          ],
                          ["kind", c.text("Type", "النوع")],
                          ["address", c.text("Location", "الموقع")],
                          ["assignedTo", c.text("Assigned To", "معين إلى")],
                          ["status", c.text("Status", "الحالة")],
                        ] as [Sort, string][]
                      ).map(([key, label]) => (
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
                          <button type="button" onClick={() => changeSort(key)}>
                            {label}
                            <ArrowUpDown size={11} />
                          </button>
                        </th>
                      ))}
                      <th>
                        <span className="sr-only">
                          {c.text("Details", "التفاصيل")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((job) => {
                      const Icon = kindIcon[job.kind],
                        member = dispatchTeam.find(
                          (m) => m.id === job.assignedTo,
                        );
                      return (
                        <tr
                          key={job.id}
                          className={activeId === job.id ? "is-active" : ""}
                        >
                          <td>
                            <input
                              type="checkbox"
                              aria-label={c.text(
                                `Select ${job.sourceId}`,
                                `اختر ${job.sourceId}`,
                              )}
                              checked={selected.includes(job.id)}
                              onChange={() =>
                                setSelected(
                                  selected.includes(job.id)
                                    ? selected.filter((id) => id !== job.id)
                                    : [...selected, job.id],
                                )
                              }
                            />
                          </td>
                          <td>
                            <bdi>{job.time || "—"}</bdi>
                            <small>{dateLabel(job.date)}</small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="dispatch-reference"
                              aria-label={c.text(
                                `Open dispatch ${job.sourceId}`,
                                `افتح التوصيل ${job.sourceId}`,
                              )}
                              aria-expanded={activeId === job.id}
                              onClick={(e) => open(job, e.currentTarget)}
                            >
                              <bdi>{job.sourceId}</bdi>
                            </button>
                          </td>
                          <td>
                            <div className="dispatch-person">
                              <Photo
                                src={job.image}
                                alt=""
                                sizes="32px"
                                unavailableLabel={c.text("No photo", "لا صورة")}
                              />
                              <span>
                                {job.customerName || "—"}
                                {job.petName && <small>{job.petName}</small>}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`dispatch-kind dispatch-kind--${job.kind}`}
                            >
                              <Icon size={17} />
                              {c.local(
                                dispatchKinds.find((k) => k.id === job.kind)!
                                  .label,
                              )}
                            </span>
                          </td>
                          <td>
                            <span
                              className="dispatch-location"
                              title={job.address}
                            >
                              {job.address || "—"}
                            </span>
                          </td>
                          <td>
                            <span className="dispatch-assignee">
                              {member &&
                                (member.role === "driver" ? (
                                  <Truck size={16} />
                                ) : (
                                  <UserIcon />
                                ))}
                              {member ? c.local(member.name) : "—"}
                            </span>
                          </td>
                          <td>
                            <DispatchBadge status={job.status} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={c.text(
                                `Details for ${job.sourceId}`,
                                `تفاصيل ${job.sourceId}`,
                              )}
                              aria-expanded={activeId === job.id}
                              onClick={(e) => open(job, e.currentTarget)}
                            >
                              <MoreHorizontal size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
              {rows.length > 0 && (
                <div className="dispatch-pagination">
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={c.text("Previous page", "الصفحة السابقة")}
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {[
                      ...new Set([
                        1,
                        currentPage - 1,
                        currentPage,
                        currentPage + 1,
                        pages,
                      ]),
                    ]
                      .filter((p) => p > 0 && p <= pages)
                      .sort((a, b) => a - b)
                      .map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="icon-button"
                          aria-current={p === currentPage ? "page" : undefined}
                          aria-label={c.text(`Page ${p}`, `صفحة ${p}`)}
                          onClick={() => setPage(p)}
                        >
                          {count(p)}
                        </button>
                      ))}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={c.text("Next page", "الصفحة التالية")}
                      disabled={currentPage === pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <small>
                    {c.text("Showing", "عرض")}{" "}
                    {count((currentPage - 1) * size + 1)}–
                    {count(Math.min(currentPage * size, rows.length))}{" "}
                    {c.text("of", "من")} {count(rows.length)}
                  </small>
                  <select
                    aria-label={c.text("Dispatches per page", "مهام لكل صفحة")}
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 25].map((n) => (
                      <option key={n} value={n}>
                        {count(n)} {c.text("per page", "لكل صفحة")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <div className="dispatch-schedule">
              {groups.map((day) => (
                <section key={day || "unscheduled"}>
                  <h2>
                    <CalendarDays size={17} />
                    {dateLabel(day)}
                  </h2>
                  {rows
                    .filter((j) => j.date === day)
                    .map((job) => {
                      const Icon = kindIcon[job.kind];
                      return (
                        <button
                          type="button"
                          className={`dispatch-schedule-card ${activeId === job.id ? "is-active" : ""}`}
                          key={job.id}
                          aria-expanded={activeId === job.id}
                          onClick={(e) => open(job, e.currentTarget)}
                        >
                          <bdi>{job.time || "—"}</bdi>
                          <Photo
                            src={job.image}
                            alt=""
                            sizes="38px"
                            unavailableLabel={c.text("No photo", "لا صورة")}
                          />
                          <span>
                            <strong>
                              {job.sourceId} · {job.customerName}
                            </strong>
                            <small>
                              <Icon size={14} />
                              {c.local(
                                dispatchKinds.find((k) => k.id === job.kind)!
                                  .label,
                              )}
                              {job.petName && ` · ${job.petName}`}
                            </small>
                          </span>
                          <DispatchBadge status={job.status} />
                        </button>
                      );
                    })}
                </section>
              ))}
            </div>
          )}
          {!rows.length && (
            <Empty>
              <p>
                {tab === "house"
                  ? c.text(
                      "No eligible house deliveries. House ordering is still gated.",
                      "لا توصيل بيوت مؤهل. طلب البيوت ما زال غير مفعل.",
                    )
                  : c.text(
                      "No dispatches match these filters.",
                      "لا مهام تطابق الفلاتر.",
                    )}
              </p>
              <button
                type="button"
                className="text-link"
                onClick={resetFilters}
              >
                {c.text("Clear list filters", "مسح فلاتر القائمة")}
              </button>
            </Empty>
          )}
        </section>
        <p className="dispatch-boundary">
          {c.text(
            "Mock operations only. Paid delivery orders and paid Home Grooming bookings appear automatically. FleetWiz is not connected.",
            "عمليات تجريبية فقط. تظهر طلبات التوصيل وحجوزات العناية المنزلية المدفوعة تلقائياً. FleetWiz غير متصل.",
          )}
        </p>
      </div>
      {active && (
        <DispatchDetailPanel
          job={active}
          onClose={close}
          onAssign={() => setAssignIds([active.id])}
          onAdvance={(next) => {
            const error = mockDispatchRepository.advance(
              repo.getSnapshot(),
              active.id,
              next,
            );
            setMessage(
              error
                ? c.text(
                    "Progress could not be updated. Check the source and assignment.",
                    "تعذر تحديث التقدم. تحقق من المصدر والتعيين.",
                  )
                : c.text(
                    "Mock progress updated. No source record or fleet system was changed.",
                    "تم تحديث التقدم التجريبي دون تغيير المصدر أو الأسطول.",
                  ),
            );
          }}
        />
      )}
      {assignIds.length > 0 && (
        <DispatchAssignmentDialog
          key={assignIds.join(",")}
          jobs={jobs.filter((j) => assignIds.includes(j.id))}
          returnFocusRef={returnFocus}
          onClose={() => setAssignIds([])}
          onSaved={() => {
            setAssignIds([]);
            setSelected([]);
            setMessage(
              c.text(
                "Mock assignment saved. Nothing was sent to FleetWiz.",
                "حفظ التعيين التجريبي. لم يرسل شيء إلى FleetWiz.",
              ),
            );
          }}
        />
      )}
    </div>
  );
}
function UserIcon() {
  return <Scissors size={16} />;
}
