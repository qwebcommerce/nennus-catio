"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Gift,
  House,
  MoreHorizontal,
  Package,
  Scissors,
  Search,
  ShoppingCart,
  Tag,
} from "lucide-react";
import {
  usePromotions,
  mockPromotionsRepository,
} from "@/mocks/adapters/promotions-repository";
import type { Promotion } from "@/mocks/data/promotions";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { AdminPage, Empty, Modal } from "@/shared/ui/BusinessUI";
import { useDashboardDate } from "@/features/admin/dashboard/components/DashboardDate";
import { usePromotionsWorkspace } from "../PromotionsWorkspace";
import { PromotionBadge, PromotionDetailPanel } from "../PromotionDetailPanel";
import { PromotionEditor } from "../PromotionEditor";
import { AdminPromotionsApiPage } from "./AdminPromotionsApiPage";
import {
  promotionPeriod,
  promotionOffer,
  promotionStatus,
  promotionStatuses,
  promotionTargets,
  promotionTypes,
} from "../promotion-view";

/** API mode: real promotions (11d). Mock mode keeps the demo page below. */
export function AdminPromotionsPage() {
  if (useDataSourceOrNull() === "api") return <AdminPromotionsApiPage />;
  return <PromotionsDemo />;
}

function PromotionsDemo() {
  const c = useCopy(),
    records = usePromotions(),
    business = useBusiness(),
    { date } = useDashboardDate();
  const { search, setSearch, editing, setEditing } = usePromotionsWorkspace();
  const [tab, setTab] = useState("all"),
    [status, setStatus] = useState(""),
    [target, setTarget] = useState(""),
    [when, setWhen] = useState(""),
    [more, setMore] = useState(false),
    [eligibility, setEligibility] = useState(""),
    [visibility, setVisibility] = useState(""),
    [sort, setSort] = useState("default"),
    [descending, setDescending] = useState(false),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [selectedId, setSelectedId] = useState(""),
    [checked, setChecked] = useState<string[]>([]),
    [confirm, setConfirm] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const panelRef = useRef<HTMLElement>(null),
    originRef = useRef<HTMLButtonElement | null>(null);
  const endSoon = new Date(
    new Date(`${date}T12:00:00Z`).getTime() + 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const active = (p: Promotion) => promotionStatus(p, date) === "active";
  const ending = (p: Promotion) => active(p) && !!p.to && p.to <= endSoon;
  const metrics = [
    records.filter(active).length,
    records.filter((p) => promotionStatus(p, date) === "scheduled").length,
    records.filter(ending).length,
    records.reduce(
      (sum, p) =>
        sum +
        p.redemptions.filter((r) => r.at.slice(0, 7) === date.slice(0, 7))
          .length,
      0,
    ),
  ];
  const rows = records.filter(
    (p) =>
      (tab === "all" || p.type === tab) &&
      (!status || promotionStatus(p, date) === status) &&
      (!target || p.target === target) &&
      (!eligibility || p.eligibility === eligibility) &&
      (!visibility || p.visible === (visibility === "visible")) &&
      (!when ||
        (when === "ending"
          ? ending(p)
          : when === "starting"
            ? p.from >= date && p.from <= endSoon
            : p.from <= date && (!p.to || p.to >= date))) &&
      [
        p.name.en,
        p.name.ar,
        p.code,
        p.description.en,
        p.description.ar,
        promotionTargets.en[p.target],
        promotionTargets.ar[p.target],
        ...p.productIds.map((id) => {
          const product = business.products.find((item) => item.id === id);
          return product ? c.local(product.name) : "";
        }),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const value = (p: Promotion): string | number =>
    sort === "name"
      ? c.local(p.name)
      : sort === "type"
        ? promotionTypes[c.locale][p.type]
        : sort === "target"
          ? promotionTargets[c.locale][p.target]
          : sort === "offer"
            ? promotionOffer(p, c.locale)
            : sort === "from"
              ? p.from
              : sort === "usage"
                ? p.redemptions.length
                : promotionStatuses[c.locale][promotionStatus(p, date)];
  if (sort !== "default")
    rows.sort((a, b) => {
      const x = value(a),
        y = value(b);
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), c.locale, { numeric: true })) *
        (descending ? -1 : 1)
      );
    });
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    current = Math.min(page, pages),
    shown = rows.slice((current - 1) * size, current * size);
  const selected = records.find((p) => p.id === selectedId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Filter changes intentionally reset pagination, selection and details.
  useEffect(() => {
    setPage(1);
    setSelectedId("");
    setChecked([]);
  }, [search, tab, status, target, when, eligibility, visibility, date]);
  useEffect(() => {
    if (selectedId) panelRef.current?.focus({ preventScroll: true });
  }, [selectedId]);
  function close() {
    setSelectedId("");
    originRef.current?.focus({ preventScroll: true });
  }
  function heading(label: string, key: string) {
    return (
      <th
        aria-sort={
          sort === key ? (descending ? "descending" : "ascending") : "none"
        }
      >
        <button
          type="button"
          onClick={() => {
            if (sort === key) setDescending(!descending);
            else {
              setSort(key);
              setDescending(false);
            }
          }}
        >
          {label}
          <ArrowDownUp size={10} aria-hidden="true" />
        </button>
      </th>
    );
  }
  function reset() {
    setSearch("");
    setTab("all");
    setStatus("");
    setTarget("");
    setWhen("");
    setEligibility("");
    setVisibility("");
    setSelectedId("");
    setChecked([]);
    setPage(1);
  }
  return (
    <div className="reference-promotions">
      <AdminPage
        module="promotions"
        title={c.text("Promotions", "العروض الترويجية")}
        subtitle={c.text(
          "Create and manage discounts, promo codes and bundles.",
          "إنشاء وإدارة الخصومات والرموز الترويجية والمجموعات.",
        )}
      >
        <div
          className={`promo-layout ${selected ? "promo-layout--detail" : ""}`}
        >
          <div className="promo-workspace">
            <div className="promo-metrics">
              {[
                {
                  label: c.text("Active Promotions", "العروض النشطة"),
                  note: c.text("Running now", "تعمل الآن"),
                  Icon: Tag,
                  tone: "green",
                },
                {
                  label: c.text("Scheduled", "المجدولة"),
                  note: c.text("Upcoming", "القادمة"),
                  Icon: CalendarDays,
                  tone: "blue",
                },
                {
                  label: c.text("Ending Soon", "تنتهي قريباً"),
                  note: c.text("Next 7 days", "خلال 7 أيام"),
                  Icon: Clock3,
                  tone: "red",
                },
                {
                  label: c.text("Total Redemptions", "إجمالي الاستخدامات"),
                  note: c.text("This month · demo", "هذا الشهر · تجريبي"),
                  Icon: Gift,
                  tone: "purple",
                },
              ].map(({ label, note, Icon, tone }, index) => (
                <div
                  className={`promo-card promo-metric promo-metric--${tone}`}
                  key={tone}
                >
                  <span className="promo-metric-icon">
                    <Icon size={26} strokeWidth={1.7} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{metrics[index]}</strong>
                    <small>{note}</small>
                  </div>
                </div>
              ))}
            </div>
            <section
              className="promo-card promo-records"
              aria-label={c.text("Promotions list", "قائمة العروض")}
            >
              <div
                className="promo-tabs"
                role="tablist"
                aria-label={c.text("Promotion types", "أنواع العروض")}
              >
                {["all", "discount", "code", "bundle"].map((type, index) => (
                  <button
                    role="tab"
                    type="button"
                    key={type}
                    id={`promo-tab-${type}`}
                    aria-controls="promo-results"
                    aria-selected={tab === type}
                    tabIndex={tab === type ? 0 : -1}
                    onClick={() => setTab(type)}
                    onKeyDown={(event) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        const types = ["all", "discount", "code", "bundle"],
                          step = (event.key === "ArrowRight") !== c.ar ? 1 : 3;
                        const next =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? 3
                              : (index + step) % 4;
                        setTab(types[next]);
                        document
                          .getElementById(`promo-tab-${types[next]}`)
                          ?.focus();
                      }
                    }}
                  >
                    {type === "all"
                      ? c.text("All Promotions", "كل العروض")
                      : type === "discount"
                        ? c.text("Discounts", "الخصومات")
                        : type === "code"
                          ? c.text("Promo Codes", "الرموز الترويجية")
                          : c.text("Bundles", "المجموعات")}{" "}
                    (
                    {
                      records.filter((p) => type === "all" || p.type === type)
                        .length
                    }
                    )
                  </button>
                ))}
              </div>
              <div className="promo-filters">
                <label className="promo-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label={c.text("Search promotions", "ابحث عن العروض")}
                    placeholder={c.text(
                      "Search promotions…",
                      "ابحث عن العروض…",
                    )}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label={c.text("Filter status", "تصفية الحالة")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">{c.text("Status", "الحالة")}</option>
                  {Object.entries(promotionStatuses[c.locale]).map(
                    ([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ),
                  )}
                </select>
                <select
                  aria-label={c.text("Filter applies to", "تصفية مجال العرض")}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">{c.text("Applies To", "ينطبق على")}</option>
                  {Object.entries(promotionTargets[c.locale]).map(
                    ([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ),
                  )}
                </select>
                <select
                  aria-label={c.text("Filter schedule", "تصفية الجدول")}
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                >
                  <option value="">{c.text("Date", "التاريخ")}</option>
                  <option value="valid">
                    {c.text("Valid on selected date", "صالح في التاريخ المحدد")}
                  </option>
                  <option value="ending">
                    {c.text("Ending in 7 days", "ينتهي خلال 7 أيام")}
                  </option>
                  <option value="starting">
                    {c.text("Starting in 7 days", "يبدأ خلال 7 أيام")}
                  </option>
                </select>
                <button
                  type="button"
                  className="promo-filter-button"
                  aria-expanded={more}
                  onClick={() => setMore(!more)}
                >
                  <Filter size={16} />
                  {c.text("More Filters", "فلاتر إضافية")}
                </button>
              </div>
              {more && (
                <div className="promo-extra-filters">
                  <select
                    aria-label={c.text(
                      "Filter eligibility",
                      "تصفية أهلية العميل",
                    )}
                    value={eligibility}
                    onChange={(e) => setEligibility(e.target.value)}
                  >
                    <option value="">
                      {c.text("All customers", "كل العملاء")}
                    </option>
                    <option value="registered">
                      {c.text("Registered", "مسجلون")}
                    </option>
                    <option value="new">{c.text("New", "جدد")}</option>
                    <option value="all">
                      {c.text("Unrestricted", "بلا قيود")}
                    </option>
                  </select>
                  <select
                    aria-label={c.text("Filter visibility", "تصفية الظهور")}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="">
                      {c.text("Any visibility", "كل إعدادات الظهور")}
                    </option>
                    <option value="visible">
                      {c.text("Visible on Store", "ظاهر في المتجر")}
                    </option>
                    <option value="hidden">{c.text("Hidden", "مخفي")}</option>
                  </select>
                  <button type="button" className="text-button" onClick={reset}>
                    {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                  </button>
                </div>
              )}
              {!!checked.length && (
                <div className="promo-selection">
                  <span>
                    {checked.length} {c.text("selected", "محدد")}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirm(
                        checked.filter(
                          (id) => records.find((p) => p.id === id)?.enabled,
                        ),
                      )
                    }
                    disabled={
                      !checked.some(
                        (id) => records.find((p) => p.id === id)?.enabled,
                      )
                    }
                  >
                    {c.text("Deactivate selected", "إيقاف المحدد")}
                  </button>
                  <button type="button" onClick={() => setChecked([])}>
                    {c.text("Clear selection", "إلغاء التحديد")}
                  </button>
                </div>
              )}
              <div
                id="promo-results"
                role="tabpanel"
                aria-labelledby={`promo-tab-${tab}`}
              >
                <section
                  className="promo-table-scroll"
                  aria-label={c.text(
                    "Scrollable promotions table",
                    "جدول العروض القابل للتمرير",
                  )}
                >
                  <table className="promo-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={c.text(
                              "Select visible promotions",
                              "تحديد العروض الظاهرة",
                            )}
                            checked={
                              !!shown.length &&
                              shown.every((p) => checked.includes(p.id))
                            }
                            onChange={(e) =>
                              setChecked(
                                e.target.checked
                                  ? Array.from(
                                      new Set([
                                        ...checked,
                                        ...shown.map((p) => p.id),
                                      ]),
                                    )
                                  : checked.filter(
                                      (id) => !shown.some((p) => p.id === id),
                                    ),
                              )
                            }
                          />
                        </th>
                        {heading(c.text("Promotion", "العرض"), "name")}
                        {heading(c.text("Type", "النوع"), "type")}
                        {heading(c.text("Applies To", "ينطبق على"), "target")}
                        {heading(c.text("Offer", "العرض"), "offer")}
                        {heading(c.text("Period", "الفترة"), "from")}
                        {heading(c.text("Usage", "الاستخدام"), "usage")}
                        {heading(c.text("Status", "الحالة"), "status")}
                        <th>
                          <span className="sr-only">
                            {c.text("Details", "التفاصيل")}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p) => {
                        const Icon =
                          p.target === "grooming"
                            ? Scissors
                            : p.target === "houses"
                              ? House
                              : p.target === "order"
                                ? ShoppingCart
                                : Package;
                        const open = (button: HTMLButtonElement) => {
                          if (selectedId === p.id) close();
                          else {
                            originRef.current = button;
                            setSelectedId(p.id);
                          }
                        };
                        return (
                          <tr
                            key={p.id}
                            className={selectedId === p.id ? "is-selected" : ""}
                          >
                            <td>
                              <input
                                type="checkbox"
                                aria-label={c.text(
                                  `Select ${p.name.en}`,
                                  `تحديد ${p.name.ar}`,
                                )}
                                checked={checked.includes(p.id)}
                                onChange={(e) =>
                                  setChecked(
                                    e.target.checked
                                      ? [...checked, p.id]
                                      : checked.filter((id) => id !== p.id),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="promo-name"
                                aria-label={c.text(
                                  `Open promotion ${p.name.en}`,
                                  `افتح العرض ${p.name.ar}`,
                                )}
                                aria-expanded={selectedId === p.id}
                                onClick={(e) => open(e.currentTarget)}
                              >
                                <Photo src={p.image} alt="" sizes="40px" />
                                <span>
                                  <strong>{c.local(p.name)}</strong>
                                  <small>
                                    {p.type === "bundle"
                                      ? c.text(
                                          "Curated essentials bundle",
                                          "مجموعة مستلزمات مختارة",
                                        )
                                      : promotionOffer(p, c.locale)}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span
                                className={`promo-type promo-type--${p.type}`}
                              >
                                {promotionTypes[c.locale][p.type]}
                              </span>
                            </td>
                            <td>
                              <span className="promo-target">
                                <Icon size={17} />
                                {promotionTargets[c.locale][p.target]}
                              </span>
                            </td>
                            <td>
                              <bdi>{promotionOffer(p, c.locale)}</bdi>
                            </td>
                            <td>{promotionPeriod(p, c.locale)}</td>
                            <td>
                              {p.redemptions.length}{" "}
                              {p.type === "bundle"
                                ? c.text("sold", "مباع")
                                : c.text("uses", "استخدامات")}
                            </td>
                            <td>
                              <PromotionBadge promotion={p} date={date} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="promo-icon"
                                aria-label={c.text(
                                  `Promotion details ${p.name.en}`,
                                  `تفاصيل العرض ${p.name.ar}`,
                                )}
                                onClick={(e) => open(e.currentTarget)}
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
                {!shown.length && (
                  <Empty>
                    {c.text("No matching promotions.", "لا توجد عروض مطابقة.")}
                    <button
                      type="button"
                      className="text-button"
                      onClick={reset}
                    >
                      {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                    </button>
                  </Empty>
                )}
              </div>
              <div className="promo-pagination">
                <div>
                  <button
                    type="button"
                    aria-label={c.text("Previous page", "الصفحة السابقة")}
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: pages }, (_, index) => index + 1)
                    .filter(
                      (n) =>
                        n === 1 || n === pages || Math.abs(n - current) < 2,
                    )
                    .map((n) => (
                      <button
                        type="button"
                        aria-current={current === n ? "page" : undefined}
                        key={n}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                  <button
                    type="button"
                    aria-label={c.text("Next page", "الصفحة التالية")}
                    disabled={current === pages}
                    onClick={() => setPage(current + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <span>
                  {c.text(
                    `Showing ${rows.length ? (current - 1) * size + 1 : 0}–${Math.min(current * size, rows.length)} of ${rows.length} promotions`,
                    `عرض ${rows.length ? (current - 1) * size + 1 : 0}–${Math.min(current * size, rows.length)} من ${rows.length} عرضاً`,
                  )}
                </span>
                <select
                  aria-label={c.text("Promotions per page", "العروض لكل صفحة")}
                  value={size}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[5, 10, 20].map((n) => (
                    <option value={n} key={n}>
                      {n} {c.text("per page", "لكل صفحة")}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            <p className="promo-note">
              {c.text(
                "Frontend prototype. Sample offers and history only. Changes reset on refresh; checkout discounts, targeting and campaigns are not connected.",
                "نموذج واجهة أمامية. عروض وسجل تجريبيان فقط. التحديث يعيد البيانات؛ لم يتم ربط خصومات الدفع والاستهداف والحملات.",
              )}
            </p>
            <p className="promo-message" role="status">
              {message}
            </p>
          </div>
          {selected && (
            <PromotionDetailPanel
              promotion={selected}
              date={date}
              close={close}
              edit={() => setEditing(selected)}
              deactivate={() => setConfirm([selected.id])}
              panelRef={panelRef}
            />
          )}
        </div>
        <Modal
          open={editing !== undefined}
          onOpenChange={(open) => {
            if (!open) setEditing(undefined);
          }}
          title={
            editing
              ? c.text("Edit Promotion", "تعديل العرض")
              : c.text("Create Promotion", "إنشاء عرض")
          }
          returnFocusRef={panelRef}
        >
          {editing !== undefined && (
            <PromotionEditor
              key={editing?.id ?? "new"}
              promotion={editing}
              date={date}
              saved={(promotion) => {
                reset();
                setEditing(undefined);
                setSelectedId(promotion.id);
                setMessage(
                  c.text(
                    "Promotion saved in the prototype.",
                    "تم حفظ العرض في النموذج الأولي.",
                  ),
                );
              }}
            />
          )}
        </Modal>
        <Modal
          open={!!confirm.length}
          onOpenChange={(open) => {
            if (!open) setConfirm([]);
          }}
          title={c.text("Deactivate promotion?", "إيقاف العرض؟")}
          description={c.text(
            "This changes only mock promotion records. No live offer or customer order is affected.",
            "هذا يغير سجلات العروض التجريبية فقط. لا تتأثر عروض فعلية أو طلبات عملاء.",
          )}
          returnFocusRef={panelRef}
        >
          <p>
            {confirm.length} {c.text("promotion(s) selected.", "عرض محدد.")}
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              for (const id of confirm)
                mockPromotionsRepository.update(id, { enabled: false });
              setConfirm([]);
              setChecked([]);
              setMessage(
                c.text(
                  "Promotion deactivated in the prototype.",
                  "تم إيقاف العرض في النموذج الأولي.",
                ),
              );
            }}
          >
            {c.text("Confirm deactivation", "تأكيد الإيقاف")}
          </button>
        </Modal>
      </AdminPage>
    </div>
  );
}
