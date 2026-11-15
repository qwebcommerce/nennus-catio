"use client";
import type { RefObject } from "react";
import { CalendarDays, MoreHorizontal, X } from "lucide-react";
import type { Promotion } from "@/mocks/data/promotions";
import { mockPromotionsRepository } from "@/mocks/adapters/promotions-repository";
import { useBusiness } from "@/mocks/MockDataProvider";
import { Photo } from "@/shared/ui/Photo";
import { useCopy } from "@/shared/lib/copy";
import {
  promotionDate,
  promotionMoney,
  promotionOffer,
  promotionStatus,
  promotionStatuses,
  promotionTargets,
  promotionTypes,
} from "./promotion-view";

export function PromotionBadge({
  promotion,
  date,
}: {
  promotion: Promotion;
  date: string;
}) {
  const c = useCopy(),
    status = promotionStatus(promotion, date);
  return (
    <span className={`promo-badge promo-badge--${status}`}>
      <i aria-hidden="true" />
      {promotionStatuses[c.locale][status]}
    </span>
  );
}
export function PromotionDetailPanel({
  promotion: p,
  date,
  close,
  edit,
  deactivate,
  panelRef,
}: {
  promotion: Promotion;
  date: string;
  close: () => void;
  edit: () => void;
  deactivate: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy(),
    business = useBusiness();
  const count = p.redemptions.length,
    used = p.limit ? Math.min(100, Math.round((count / p.limit) * 100)) : 0;
  const eligibility =
    p.eligibility === "registered"
      ? c.text("Registered customers", "العملاء المسجلون")
      : p.eligibility === "new"
        ? c.text("New customers", "العملاء الجدد")
        : c.text("All customers", "جميع العملاء");
  const row = (name: string, value: string | number) => (
    <div>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <aside
      className="promo-card promo-detail"
      aria-label={c.text("Promotion details", "تفاصيل العرض")}
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="promo-detail-heading">
        <div>
          <h2>{p.code || c.local(p.name)}</h2>
          <small>{promotionTypes[c.locale][p.type]}</small>
        </div>
        <PromotionBadge promotion={p} date={date} />
        <button
          type="button"
          className="promo-icon"
          aria-label={c.text("Close promotion details", "إغلاق تفاصيل العرض")}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <details className="promo-detail-menu">
        <summary aria-label={c.text("Promotion actions", "إجراءات العرض")}>
          <MoreHorizontal size={18} />
        </summary>
        <button type="button" onClick={edit}>
          {c.text("Edit Promotion", "تعديل العرض")}
        </button>
      </details>
      <section className="promo-detail-section promo-information">
        <Photo src={p.image} alt={c.local(p.name)} sizes="110px" />
        <div>
          <h3>{c.text("Promotion Information", "معلومات العرض")}</h3>
          <dl>
            {p.code && row(c.text("Code", "الرمز"), p.code)}
            {row(c.text("Type", "النوع"), promotionTypes[c.locale][p.type])}
            {row(c.text("Offer", "العرض"), promotionOffer(p, c.locale))}
            {row(
              c.text("Applies To", "ينطبق على"),
              promotionTargets[c.locale][p.target],
            )}
            {row(c.text("Description", "الوصف"), c.local(p.description))}
          </dl>
        </div>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Conditions", "الشروط")}</h3>
        <dl>
          {row(
            c.text("Minimum spend", "الحد الأدنى للإنفاق"),
            promotionMoney(p.minimumSpend, c.locale),
          )}
          {row(c.text("Customer eligibility", "أهلية العميل"), eligibility)}
          {row(
            c.text("Usage limit", "حد الاستخدام"),
            p.perCustomer
              ? c.text(
                  `${p.perCustomer} per customer`,
                  `${p.perCustomer} لكل عميل`,
                )
              : c.text("Unlimited per customer", "بلا حد لكل عميل"),
          )}
        </dl>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Schedule", "الجدول")}</h3>
        <dl className="promo-schedule">
          <CalendarDays size={17} aria-hidden="true" />
          {row(
            c.text("Valid from", "صالح من"),
            `${promotionDate(p.from, c.locale, true)} · 00:00`,
          )}
          {row(
            c.text("Valid until", "صالح حتى"),
            p.to
              ? `${promotionDate(p.to, c.locale, true)} · 23:59`
              : c.text("No end date", "بلا تاريخ نهاية"),
          )}
        </dl>
        <small>
          {c.text(
            "Qatar time · inclusive dates",
            "بتوقيت قطر · التواريخ مشمولة",
          )}
        </small>
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Usage", "الاستخدام")}</h3>
        <div className="promo-usage-label">
          <strong>
            {count}
            {p.limit ? ` / ${p.limit}` : ""}{" "}
            {c.text("redemptions", "استخدامات")}
          </strong>
          {p.limit > 0 && (
            <small>
              {used}% {c.text("used", "مستخدم")}
            </small>
          )}
        </div>
        {p.limit > 0 && (
          <progress
            value={count}
            max={p.limit}
            aria-label={c.text("Usage progress", "تقدم الاستخدام")}
          />
        )}
        <div className="promo-usage-cards">
          <div>
            <small>{c.text("Demo Records", "سجلات تجريبية")}</small>
            <strong>{count}</strong>
          </div>
          <div>
            <small>{c.text("Discount Given", "الخصم الممنوح")}</small>
            <strong>
              {promotionMoney(
                p.redemptions.reduce((sum, r) => sum + r.discount, 0),
                c.locale,
              )}
            </strong>
          </div>
        </div>
        {!!p.productIds.length && (
          <p className="promo-included">
            {p.productIds
              .map((id) =>
                c.local(
                  business.products.find((product) => product.id === id)
                    ?.name ?? {
                    en: "Unavailable product",
                    ar: "منتج غير متاح",
                  },
                ),
              )
              .join(" · ")}
          </p>
        )}
      </section>
      <section className="promo-detail-section">
        <h3>{c.text("Visibility", "الظهور")}</h3>
        {(["visible", "featured"] as const).map((key) => (
          <label className="promo-toggle" key={key}>
            <input
              type="checkbox"
              role="switch"
              aria-checked={p[key]}
              checked={p[key]}
              onChange={(e) =>
                mockPromotionsRepository.update(p.id, {
                  [key]: e.target.checked,
                })
              }
            />
            <span>
              {key === "visible"
                ? c.text("Visible on Store", "ظاهر في المتجر")
                : c.text("Feature on homepage", "عرض في الصفحة الرئيسية")}
            </span>
          </label>
        ))}
        <small>
          {c.text(
            "Saved as mock settings only; public offers are not connected yet.",
            "تُحفظ كإعدادات تجريبية فقط؛ لم يتم ربط العروض العامة بعد.",
          )}
        </small>
      </section>
      <div className="promo-detail-actions">
        <button
          type="button"
          className={p.enabled ? "promo-deactivate" : "promo-activate"}
          onClick={() =>
            p.enabled
              ? deactivate()
              : mockPromotionsRepository.update(p.id, { enabled: true })
          }
        >
          {p.enabled
            ? c.text("Deactivate", "إيقاف")
            : c.text("Activate", "تفعيل")}
        </button>
        <button type="button" className="promo-edit" onClick={edit}>
          {c.text("Edit Promotion", "تعديل العرض")}
        </button>
      </div>
    </aside>
  );
}
