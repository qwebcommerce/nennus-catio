"use client";

import { type AdminPromotion, PROMOTION_LIMITS, type PromotionStatus, type PromotionTargetKind, type PromotionType } from "@nennus-catio/contracts";
import { ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Gift, MoreHorizontal, Package, Scissors, Search, ShoppingCart, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminPromotionError, useAdminPromotions, useDeletePromotion, useSetPromotionEnabled } from "@/shared/api/admin-promotions";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Empty, ErrorMessage, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { DownloadMenu } from "@/shared/ui/DownloadMenu";
import { Photo } from "@/shared/ui/Photo";
import { usePromotionsWorkspace } from "../PromotionsWorkspace";
import { PromotionApiDetail, PromotionStatusBadge } from "../components/PromotionApiDetail";
import { PromotionApiEditor } from "../components/PromotionApiEditor";
import { addDays, isGroomingTarget, offerText, PROMOTION_STATUSES, PROMOTION_TARGETS, PROMOTION_TYPES, periodText } from "../lib/promotion-labels";

type Tab = "all" | PromotionType;
type Sort = "default" | "name" | "type" | "target" | "offer" | "from" | "usage" | "status";

const TABS: Tab[] = ["all", "discount", "code", "bundle"];
const PAGE_SIZES = [5, 10, 20] as const;

/**
 * Real promotions (11d; plan BRANCH_11 section 6): the approved screen (D57) with the API's data. The four
 * cards, the tabs and filters, the table and a promotion's details with its real uses; create and edit
 * for Create/Edit, switching on or off (asks first, D128) and deleting a promotion nobody got (Delete, asks
 * first). The list is small, so it is read whole and filtered here; statuses follow the server's Qatar date.
 */
export function AdminPromotionsApiPage() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("promotions", "edit");
  const canExport = access.can("promotions", "export");
  const { search, setSearch, editing: createRequested, setEditing: setCreateRequested } = usePromotionsWorkspace();
  const list = useAdminPromotions();
  const setEnabled = useSetPromotionEnabled();
  const remove = useDeletePromotion();
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<"" | PromotionStatus>("");
  const [target, setTarget] = useState<"" | PromotionTargetKind>("");
  const [when, setWhen] = useState<"" | "valid" | "ending" | "starting">("");
  const [more, setMore] = useState(false);
  const [eligibility, setEligibility] = useState("");
  const [visibility, setVisibility] = useState("");
  const [sort, setSort] = useState<Sort>("default");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(10);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<{ promotion: AdminPromotion | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);

  // The header's Create button asks the workspace for a new promotion (null); the editor opens here.
  useEffect(() => {
    if (createRequested !== null) return;
    setCreateRequested(undefined);
    if (canEdit) {
      setError("");
      setEditor({ promotion: null });
    }
  }, [createRequested, setCreateRequested, canEdit]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a filter change goes back to the first page and closes the details.
  useEffect(() => {
    setPage(1);
    setSelectedId("");
  }, [search, tab, status, target, when, eligibility, visibility]);

  useEffect(() => {
    if (selectedId) panelRef.current?.focus({ preventScroll: true });
  }, [selectedId]);

  const data = list.data;
  const today = data?.today ?? "";
  const records = data?.promotions ?? [];
  const soon = today ? addDays(today, PROMOTION_LIMITS.endingSoonDays) : "";
  const ending = (p: AdminPromotion) => p.status === "active" && p.endsOn !== null && p.endsOn <= soon;
  const query = search.trim().toLowerCase();
  const rows = records.filter(
    (p) =>
      (tab === "all" || p.type === tab) &&
      (!status || p.status === status) &&
      (!target || p.targetKind === target) &&
      (!eligibility || p.eligibility === eligibility) &&
      (!visibility || p.visible === (visibility === "visible")) &&
      (!when ||
        (when === "ending"
          ? ending(p)
          : when === "starting"
            ? p.startsOn > today && p.startsOn <= soon
            : p.startsOn <= today && (!p.endsOn || p.endsOn >= today))) &&
      (!query ||
        [p.name.en, p.name.ar, p.code ?? "", p.description.en, p.description.ar, ...p.targets.flatMap((item) => [item.name.en, item.name.ar])]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
  const value = (p: AdminPromotion): string | number =>
    sort === "name"
      ? c.local(p.name)
      : sort === "type"
        ? c.local(PROMOTION_TYPES[p.type])
        : sort === "target"
          ? c.local(PROMOTION_TARGETS[p.targetKind])
          : sort === "offer"
            ? offerText(p, c.text, c.locale)
            : sort === "from"
              ? p.startsOn
              : sort === "usage"
                ? p.usesCount
                : c.local(PROMOTION_STATUSES[p.status]);
  if (sort !== "default") {
    rows.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), c.locale, { numeric: true })) * (descending ? -1 : 1);
    });
  }
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * size, current * size);
  const selected = records.find((p) => p.id === selectedId);

  function close() {
    setSelectedId("");
    originRef.current?.focus({ preventScroll: true });
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
    setPage(1);
  }

  function heading(label: string, key: Sort) {
    return (
      <th aria-sort={sort === key ? (descending ? "descending" : "ascending") : "none"}>
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

  /** Switching on or off asks first (D128): it changes what customers pay from that moment. */
  function askSwitch(promotion: AdminPromotion, enabled: boolean) {
    const name = c.local(promotion.name);
    setConfirm({
      title: enabled ? c.text(`Switch on “${name}”?`, `تفعيل «${name}»؟`) : c.text(`Switch off “${name}”?`, `إيقاف «${name}»؟`),
      message: enabled
        ? c.text(
            "Customers get it again from now on, within its dates and limits.",
            "سيحصل عليه العملاء من الآن مجدداً، ضمن تواريخه وحدوده.",
          )
        : c.text(
            "Customers stop getting it from now on. Orders and bookings that already got it keep their discount.",
            "يتوقف حصول العملاء عليه من الآن. تحتفظ الطلبات والحجوزات التي حصلت عليه بخصمها.",
          ),
      confirmLabel: enabled ? c.text("Switch on", "تفعيل") : c.text("Switch off", "إيقاف"),
      run: async () => {
        setError("");
        try {
          await setEnabled.mutateAsync({ promotion, enabled });
          setMessage(enabled ? c.text("The promotion is switched on.", "تم تفعيل العرض.") : c.text("The promotion is switched off.", "تم إيقاف العرض."));
        } catch (failure) {
          setError(describeAdminPromotionError(failure, c.text));
        }
      },
    });
  }

  function askDelete(promotion: AdminPromotion) {
    const name = c.local(promotion.name);
    setConfirm({
      title: c.text(`Delete “${name}”?`, `حذف «${name}»؟`),
      message: c.text("It is removed for good. No order or booking has used it.", "سيُحذف نهائياً. لم يستخدمه أي طلب أو حجز."),
      confirmLabel: c.text("Delete", "حذف"),
      run: async () => {
        setError("");
        try {
          await remove.mutateAsync({ promotion });
          setSelectedId("");
          setMessage(c.text("The promotion is deleted.", "تم حذف العرض."));
        } catch (failure) {
          setError(describeAdminPromotionError(failure, c.text));
        }
      },
    });
  }

  const counts = data?.counts;
  const metrics = [
    { label: c.text("Active promotions", "العروض النشطة"), note: c.text("Running now", "تعمل الآن"), Icon: Tag, tone: "green", value: counts?.active },
    { label: c.text("Scheduled", "المجدولة"), note: c.text("Upcoming", "القادمة"), Icon: CalendarDays, tone: "blue", value: counts?.scheduled },
    { label: c.text("Ending soon", "تنتهي قريباً"), note: c.text("Next 7 days", "خلال 7 أيام"), Icon: Clock3, tone: "red", value: counts?.endingSoon },
    { label: c.text("Uses this month", "الاستخدامات هذا الشهر"), note: c.text("Paid · Qatar month", "مدفوعة · شهر قطر"), Icon: Gift, tone: "purple", value: counts?.usedThisMonth },
  ];

  return (
    <div className="reference-promotions">
      <AdminPage
        module="promotions"
        title={c.text("Promotions", "العروض الترويجية")}
        subtitle={c.text("Create and manage discounts, promo codes and bundles.", "إنشاء وإدارة الخصومات والرموز الترويجية والمجموعات.")}
        actions={canExport && <DownloadMenu path="/admin/promotions" onError={setError} />}
      >
        <ErrorMessage message={error} />
        <div className={`promo-layout ${selected ? "promo-layout--detail" : ""}`}>
          <div className="promo-workspace">
            <div className="promo-metrics">
              {metrics.map(({ label, note, Icon, tone, value: shownValue }) => (
                <div className={`promo-card promo-metric promo-metric--${tone}`} key={tone}>
                  <span className="promo-metric-icon">
                    <Icon size={26} strokeWidth={1.7} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{shownValue ?? "–"}</strong>
                    <small>{note}</small>
                  </div>
                </div>
              ))}
            </div>
            <section className="promo-card promo-records" aria-label={c.text("Promotions list", "قائمة العروض")}>
              <div className="promo-tabs" role="tablist" aria-label={c.text("Promotion types", "أنواع العروض")}>
                {TABS.map((type, index) => (
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
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      const step = (event.key === "ArrowRight") !== c.ar ? 1 : TABS.length - 1;
                      const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + step) % TABS.length;
                      const nextTab = TABS[next] ?? "all";
                      setTab(nextTab);
                      document.getElementById(`promo-tab-${nextTab}`)?.focus();
                    }}
                  >
                    {type === "all"
                      ? c.text("All promotions", "كل العروض")
                      : type === "discount"
                        ? c.text("Discounts", "الخصومات")
                        : type === "code"
                          ? c.text("Promo codes", "الرموز الترويجية")
                          : c.text("Bundles", "المجموعات")}{" "}
                    ({records.filter((p) => type === "all" || p.type === type).length})
                  </button>
                ))}
              </div>
              <div className="promo-filters">
                <label className="promo-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label={c.text("Search promotions", "ابحث عن العروض")}
                    placeholder={c.text("Search promotions…", "ابحث عن العروض…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select aria-label={c.text("Filter status", "تصفية الحالة")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="">{c.text("Status", "الحالة")}</option>
                  {(Object.keys(PROMOTION_STATUSES) as PromotionStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {c.local(PROMOTION_STATUSES[key])}
                    </option>
                  ))}
                </select>
                <select aria-label={c.text("Filter applies to", "تصفية مجال العرض")} value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
                  <option value="">{c.text("Applies to", "ينطبق على")}</option>
                  {(Object.keys(PROMOTION_TARGETS) as PromotionTargetKind[]).map((key) => (
                    <option key={key} value={key}>
                      {c.local(PROMOTION_TARGETS[key])}
                    </option>
                  ))}
                </select>
                <select aria-label={c.text("Filter dates", "تصفية التواريخ")} value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
                  <option value="">{c.text("Dates", "التواريخ")}</option>
                  <option value="valid">{c.text("Valid today", "صالح اليوم")}</option>
                  <option value="ending">{c.text("Ending in 7 days", "ينتهي خلال 7 أيام")}</option>
                  <option value="starting">{c.text("Starting in 7 days", "يبدأ خلال 7 أيام")}</option>
                </select>
                <button type="button" className="promo-filter-button" aria-expanded={more} onClick={() => setMore(!more)}>
                  <Filter size={16} />
                  {c.text("More filters", "فلاتر إضافية")}
                </button>
              </div>
              {more && (
                <div className="promo-extra-filters">
                  <select aria-label={c.text("Filter who can use it", "تصفية من يمكنه استخدامه")} value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
                    <option value="">{c.text("Any customers", "أي عملاء")}</option>
                    <option value="all">{c.text("All customers", "جميع العملاء")}</option>
                    <option value="registered">{c.text("Registered customers", "العملاء المسجلون")}</option>
                    <option value="new">{c.text("New customers", "العملاء الجدد")}</option>
                  </select>
                  <select aria-label={c.text("Filter visibility", "تصفية الظهور")} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="">{c.text("Any visibility", "كل إعدادات الظهور")}</option>
                    <option value="visible">{c.text("Visible on store", "ظاهر في المتجر")}</option>
                    <option value="hidden">{c.text("Hidden", "مخفي")}</option>
                  </select>
                  <button type="button" className="text-button" onClick={reset}>
                    {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                  </button>
                </div>
              )}
              {list.isError && (
                <div className="inline-state" role="alert">
                  <p>{describeAdminPromotionError(list.error, c.text)}</p>
                  <button type="button" className="button button--secondary" onClick={() => void list.refetch()}>
                    {c.text("Retry", "أعد المحاولة")}
                  </button>
                </div>
              )}
              {list.isPending && (
                <p className="muted" role="status" aria-busy="true">
                  {c.text("Loading promotions…", "جارٍ تحميل العروض…")}
                </p>
              )}
              {data && (
                <div id="promo-results" role="tabpanel" aria-labelledby={`promo-tab-${tab}`}>
                  <section className="promo-table-scroll" aria-label={c.text("Scrollable promotions table", "جدول العروض القابل للتمرير")}>
                    <table className="promo-table promo-table--real" aria-busy={list.isFetching}>
                      <thead>
                        <tr>
                          {heading(c.text("Promotion", "العرض"), "name")}
                          {heading(c.text("Type", "النوع"), "type")}
                          {heading(c.text("Applies to", "ينطبق على"), "target")}
                          {heading(c.text("Offer", "العرض"), "offer")}
                          {heading(c.text("Period", "الفترة"), "from")}
                          {heading(c.text("Usage", "الاستخدام"), "usage")}
                          {heading(c.text("Status", "الحالة"), "status")}
                          <th>
                            <span className="sr-only">{c.text("Details", "التفاصيل")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((p) => {
                          const name = c.local(p.name);
                          const Icon = isGroomingTarget(p.targetKind) ? Scissors : p.targetKind === "order" ? ShoppingCart : Package;
                          const open = (button: HTMLButtonElement) => {
                            if (selectedId === p.id) close();
                            else {
                              originRef.current = button;
                              setSelectedId(p.id);
                            }
                          };
                          return (
                            <tr key={p.id} className={selectedId === p.id ? "is-selected" : ""}>
                              <td>
                                <button
                                  type="button"
                                  className="promo-name"
                                  aria-label={c.text(`Open promotion ${name}`, `افتح العرض ${name}`)}
                                  aria-expanded={selectedId === p.id}
                                  onClick={(e) => open(e.currentTarget)}
                                >
                                  {p.image ? <Photo src={p.image} alt="" sizes="40px" /> : <span className="promo-name-icon" aria-hidden="true"><Tag size={18} /></span>}
                                  <span>
                                    <strong>{name}</strong>
                                    <small>{p.code ?? offerText(p, c.text, c.locale)}</small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span className={`promo-type promo-type--${p.type}`}>{c.local(PROMOTION_TYPES[p.type])}</span>
                              </td>
                              <td>
                                <span className="promo-target">
                                  <Icon size={17} />
                                  {c.local(PROMOTION_TARGETS[p.targetKind])}
                                </span>
                              </td>
                              <td>
                                <bdi>{offerText(p, c.text, c.locale)}</bdi>
                              </td>
                              <td>{periodText(p, c.text, c.locale)}</td>
                              <td>
                                {p.usesCount}
                                {p.usageLimit ? ` / ${p.usageLimit}` : ""} {p.usesCount === 1 && !p.usageLimit ? c.text("use", "استخدام") : c.text("uses", "استخدامات")}
                              </td>
                              <td>
                                <PromotionStatusBadge promotion={p} />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="promo-icon"
                                  aria-label={c.text(`Promotion details ${name}`, `تفاصيل العرض ${name}`)}
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
                      {records.length === 0
                        ? canEdit
                          ? c.text("No promotions yet. Press Create Promotion to add the first one.", "لا توجد عروض بعد. اضغط إنشاء عرض لإضافة أول عرض.")
                          : c.text("No promotions yet.", "لا توجد عروض بعد.")
                        : c.text("No matching promotions.", "لا توجد عروض مطابقة.")}
                      {records.length > 0 && (
                        <button type="button" className="text-button" onClick={reset}>
                          {c.text("Reset filters", "إعادة ضبط الفلاتر")}
                        </button>
                      )}
                    </Empty>
                  )}
                  <div className="promo-pagination">
                    <div>
                      <button type="button" aria-label={c.text("Previous page", "الصفحة السابقة")} disabled={current === 1} onClick={() => setPage(current - 1)}>
                        <ChevronLeft size={16} />
                      </button>
                      {Array.from({ length: pages }, (_, index) => index + 1)
                        .filter((n) => n === 1 || n === pages || Math.abs(n - current) < 2)
                        .map((n) => (
                          <button type="button" aria-current={current === n ? "page" : undefined} key={n} onClick={() => setPage(n)}>
                            {n}
                          </button>
                        ))}
                      <button type="button" aria-label={c.text("Next page", "الصفحة التالية")} disabled={current === pages} onClick={() => setPage(current + 1)}>
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
                      {PAGE_SIZES.map((n) => (
                        <option value={n} key={n}>
                          {n} {c.text("per page", "لكل صفحة")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </section>
            <p className="promo-message" role="status">
              {message}
            </p>
          </div>
          {selected && (
            <PromotionApiDetail
              key={selected.id}
              promotion={selected}
              close={close}
              edit={() => {
                setError("");
                setEditor({ promotion: selected });
              }}
              switchOff={() => askSwitch(selected, false)}
              switchOn={() => askSwitch(selected, true)}
              remove={() => askDelete(selected)}
              panelRef={panelRef}
            />
          )}
        </div>
        <Modal
          open={editor !== null}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={editor?.promotion ? c.text("Edit promotion", "تعديل العرض") : c.text("Create promotion", "إنشاء عرض")}
          description={c.text(
            "What customers get, who can use it and when. Orders and bookings that already got a promotion keep what they got.",
            "ما يحصل عليه العملاء، ومن يمكنه استخدامه ومتى. تحتفظ الطلبات والحجوزات التي حصلت على عرض بما حصلت عليه.",
          )}
          returnFocusRef={panelRef}
        >
          {editor !== null && today && (
            <PromotionApiEditor
              key={editor.promotion?.id ?? "new"}
              promotion={editor.promotion}
              today={today}
              onCancel={() => setEditor(null)}
              onSaved={(promotion) => {
                setEditor(null);
                setSelectedId(promotion.id);
                setMessage(c.text("The promotion is saved.", "تم حفظ العرض."));
              }}
            />
          )}
        </Modal>
        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      </AdminPage>
    </div>
  );
}
