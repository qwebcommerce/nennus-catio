"use client";

import type { AdminPromotion } from "@nennus-catio/contracts";
import { CalendarDays, X } from "lucide-react";
import type { RefObject } from "react";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminPromotionError, useAdminPromotion } from "@/shared/api/admin-promotions";
import { useCopy } from "@/shared/lib/copy";
import { formatQatarDate } from "@/shared/lib/format";
import { Photo } from "@/shared/ui/Photo";
import {
  appliesToText,
  offerText,
  PROMOTION_ELIGIBILITY,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  PROMOTION_USE_STATUSES,
  promotionDay,
  promotionMoney,
} from "../lib/promotion-labels";

export function PromotionStatusBadge({ promotion }: { promotion: AdminPromotion }) {
  const c = useCopy();
  return (
    <span className={`promo-badge promo-badge--${promotion.status}`}>
      <i aria-hidden="true" />
      {c.local(PROMOTION_STATUSES[promotion.status])}
    </span>
  );
}

/**
 * One promotion for staff (11d): what it gives and to whom, its dates, its uses (the newest 100, each
 * linking to its order or booking for roles that may open them), and the actions the role allows. Edit,
 * switch on or off (switching off asks first) and delete (asks first; only a promotion nobody ever got).
 */
export function PromotionApiDetail({
  promotion,
  close,
  edit,
  switchOff,
  switchOn,
  remove,
  panelRef,
}: {
  promotion: AdminPromotion;
  close: () => void;
  edit: () => void;
  switchOff: () => void;
  switchOn: () => void;
  remove: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy();
  const access = useAdminAccess();
  const detail = useAdminPromotion(promotion.id);
  const canEdit = access.can("promotions", "edit");
  const canDelete = access.can("promotions", "delete");
  const p = detail.data?.promotion ?? promotion;
  const uses = detail.data?.uses ?? [];
  const usesTotal = detail.data?.usesTotal ?? null;
  const name = c.local(p.name);
  const row = (label: string, value: string) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const limit = (count: number, en: string, ar: string) => (count === 0 ? c.text(`No ${en} limit`, `بلا حد ${ar}`) : String(count));

  return (
    <aside
      className="promo-card promo-detail"
      aria-label={name}
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="promo-detail-heading">
        <div>
          <h2>{p.code ?? name}</h2>
          <small>{c.local(PROMOTION_TYPES[p.type])}</small>
        </div>
        <PromotionStatusBadge promotion={p} />
        <button type="button" className="promo-icon" aria-label={c.text("Close promotion details", "إغلاق تفاصيل العرض")} onClick={close}>
          <X size={18} />
        </button>
      </div>
      <section className={`promo-detail-section promo-information${p.image ? "" : " promo-information--no-image"}`}>
        {p.image && <Photo src={p.image} alt={name} sizes="110px" />}
        <div>
          <h3>{c.text("Promotion information", "معلومات العرض")}</h3>
          <dl>
            {row(c.text("Name", "الاسم"), name)}
            {p.code && row(c.text("Code", "الرمز"), p.code)}
            {row(c.text("Offer", "العرض"), offerText(p, c.text, c.locale))}
            {row(c.text("Applies to", "ينطبق على"), appliesToText(p, c.text, c.local))}
            {c.local(p.description) && row(c.text("Description", "الوصف"), c.local(p.description))}
          </dl>
        </div>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Conditions", "الشروط")}</h3>
        <dl>
          {row(c.text("Minimum spend", "الحد الأدنى للإنفاق"), p.minSpend ? promotionMoney(p.minSpend, c.locale) : c.text("None", "لا يوجد"))}
          {row(c.text("Who can use it", "من يمكنه استخدامه"), c.local(PROMOTION_ELIGIBILITY[p.eligibility]))}
          {row(c.text("Total uses", "إجمالي الاستخدامات"), limit(p.usageLimit, "total", "إجمالي"))}
          {row(c.text("Uses per customer", "الاستخدامات لكل عميل"), limit(p.perCustomerLimit, "per-customer", "لكل عميل"))}
        </dl>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Schedule", "الجدول")}</h3>
        <dl className="promo-schedule">
          <CalendarDays size={17} aria-hidden="true" />
          {row(c.text("Valid from", "صالح من"), `${promotionDay(p.startsOn, c.locale, true)} · 00:00`)}
          {row(c.text("Valid until", "صالح حتى"), p.endsOn ? `${promotionDay(p.endsOn, c.locale, true)} · 23:59` : c.text("No end date", "بلا تاريخ نهاية"))}
        </dl>
        <small>{c.text("Qatar time · inclusive dates", "بتوقيت قطر · التواريخ مشمولة")}</small>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Usage", "الاستخدام")}</h3>
        <div className="promo-usage-label">
          <strong>
            {p.usesCount}
            {p.usageLimit ? ` / ${p.usageLimit}` : ""} {p.usesCount === 1 && !p.usageLimit ? c.text("use counted", "استخدام محسوب") : c.text("uses counted", "استخدامات محسوبة")}
          </strong>
          <small>{c.text("Paid, and awaiting payment", "مدفوعة، وبانتظار الدفع")}</small>
        </div>
        {p.usageLimit > 0 && <progress value={Math.min(p.usesCount, p.usageLimit)} max={p.usageLimit} aria-label={c.text("Uses against the limit", "الاستخدامات مقابل الحد")} />}
        <div className="promo-usage-cards">
          <div>
            <small>{c.text("Paid uses", "استخدامات مدفوعة")}</small>
            <strong>{p.usedCount}</strong>
          </div>
          <div>
            <small>{c.text("Discount given", "الخصم الممنوح")}</small>
            <strong>{promotionMoney(p.discountGiven, c.locale)}</strong>
          </div>
        </div>
        {detail.isError && <p className="form-error">{describeAdminPromotionError(detail.error, c.text)}</p>}
        {uses.length > 0 && (
          <ul className="promo-uses">
            {uses.map((use) => {
              const module = use.kind === "order" ? "orders" : "bookings";
              const href = `/admin/${module}?search=${encodeURIComponent(use.reference)}`;
              return (
                <li key={use.id}>
                  {access.canView(module) ? (
                    <Link href={href} className="text-link">
                      <bdi>{use.reference}</bdi>
                    </Link>
                  ) : (
                    <bdi>{use.reference}</bdi>
                  )}
                  <span>{c.local(PROMOTION_USE_STATUSES[use.status])}</span>
                  <span>{promotionMoney(use.discount, c.locale)}</span>
                  <time dateTime={use.createdAt}>{formatQatarDate(use.createdAt, c.locale)}</time>
                </li>
              );
            })}
          </ul>
        )}
        {usesTotal !== null && usesTotal > uses.length && (
          <p className="small muted">{c.text(`The newest ${uses.length} of ${usesTotal} uses.`, `أحدث ${uses.length} من ${usesTotal} استخداماً.`)}</p>
        )}
        {usesTotal === 0 && <p className="small muted">{c.text("No order or booking has used it yet.", "لم يستخدمه أي طلب أو حجز بعد.")}</p>}
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Visibility", "الظهور")}</h3>
        <dl>
          {row(c.text("Visible on store", "ظاهر في المتجر"), p.visible ? c.text("Yes", "نعم") : c.text("No", "لا"))}
          {row(c.text("Feature on homepage", "عرض في الصفحة الرئيسية"), p.featured ? c.text("Yes", "نعم") : c.text("No", "لا"))}
        </dl>
      </section>
      {(canEdit || canDelete) && (
        <div className="promo-detail-actions">
          {canEdit && (
            <button type="button" className={p.enabled ? "promo-deactivate" : "promo-activate"} onClick={p.enabled ? switchOff : switchOn}>
              {p.enabled ? c.text("Switch off", "إيقاف") : c.text("Switch on", "تفعيل")}
            </button>
          )}
          {canEdit && (
            <button type="button" className="promo-edit" onClick={edit}>
              {c.text("Edit promotion", "تعديل العرض")}
            </button>
          )}
          {canDelete && usesTotal === 0 && (
            <button type="button" className="promo-deactivate" onClick={remove}>
              {c.text("Delete", "حذف")}
            </button>
          )}
        </div>
      )}
      {canDelete && usesTotal !== null && usesTotal > 0 && (
        <p className="small muted">
          {c.text(
            "Orders or bookings got this promotion, so it cannot be deleted: switch it off or give it an end date instead.",
            "حصلت طلبات أو حجوزات على هذا العرض، لذا لا يمكن حذفه: أوقفه أو حدد له تاريخ نهاية بدلاً من ذلك.",
          )}
        </p>
      )}
    </aside>
  );
}
