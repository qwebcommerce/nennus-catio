"use client";

import type { FinanceDetail, PayableKind } from "@nennus-catio/contracts";
import { ArrowRight, ChevronRight, House, Package, Plane, Scissors, X } from "lucide-react";
import type { RefObject } from "react";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeFinanceError, useFinanceDetail } from "@/shared/api/admin-finance";
import { useCopy } from "@/shared/lib/copy";
import { formatDiscount, formatMoney } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import {
  FINANCE_TRANSACTION_STATUS,
  FINANCE_TYPE,
  financeWhen,
  PAYMENT_ATTENTION,
  PAYMENT_PROVIDER,
  REFUND_METHOD,
  REFUND_STATUS,
  refundStatusTone,
  transactionStatusTone,
} from "../lib/finance-labels";

/** What each kind of payable is called, where its own page is, and the permission that opens it (15d: relocation). */
const SOURCE: Record<
  PayableKind,
  { label: { en: string; ar: string }; view: { en: string; ar: string }; items: { en: string; ar: string }; page: string; module: "orders" | "bookings" | "relocation" }
> = {
  order: { label: { en: "Order", ar: "الطلب" }, view: { en: "View order", ar: "عرض الطلب" }, items: { en: "Items", ar: "المنتجات" }, page: "orders", module: "orders" },
  booking: { label: { en: "Booking", ar: "الحجز" }, view: { en: "View booking", ar: "عرض الحجز" }, items: { en: "Package", ar: "الباقة" }, page: "bookings", module: "bookings" },
  relocation: { label: { en: "Relocation request", ar: "طلب النقل" }, view: { en: "View request", ar: "عرض الطلب" }, items: { en: "Quote", ar: "عرض السعر" }, page: "relocation", module: "relocation" },
};

/**
 * One order's or booking's money (#12 part 1): its prices, promotions, payments with the payment
 * company's ids, refunds, and what is still owed back. Read-only, and never a phone, email or address
 * (answer 4A): the customer's record opens only for roles that may view Customers.
 */
export function FinanceApiDetail({
  selected,
  close,
  panelRef,
}: {
  selected: { kind: PayableKind; reference: string };
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy();
  const detail = useFinanceDetail(selected);
  const label = c.local(SOURCE[selected.kind].label);
  return (
    <aside
      className="finance-card finance-detail"
      tabIndex={-1}
      ref={panelRef}
      aria-label={c.text(`${label} ${selected.reference}`, `${label} ${selected.reference}`)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="finance-detail-title">
        <h2>
          {label} <bdi>{selected.reference}</bdi>
        </h2>
        {detail.data && <TransactionBadge detail={detail.data} />}
        <button type="button" className="finance-icon-button" onClick={close} aria-label={c.text("Close transaction details", "إغلاق تفاصيل المعاملة")}>
          <X size={17} />
        </button>
      </div>
      {detail.isPending && (
        <p className="muted" role="status" aria-busy="true">
          {c.text("Loading…", "جارٍ التحميل…")}
        </p>
      )}
      {detail.isError && (
        <div className="inline-state" role="alert">
          <p>{describeFinanceError(detail.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void detail.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {detail.data && <DetailBody detail={detail.data} />}
    </aside>
  );
}

function TransactionBadge({ detail }: { detail: FinanceDetail }) {
  const c = useCopy();
  const status = detail.refunded === 0 ? "paid" : detail.refunded >= detail.paid ? "refunded" : "partly_refunded";
  return (
    <span className={`finance-status finance-status--${transactionStatusTone(status)}`}>
      <i aria-hidden="true" />
      {c.local(FINANCE_TRANSACTION_STATUS[status])}
    </span>
  );
}

function DetailBody({ detail }: { detail: FinanceDetail }) {
  const c = useCopy();
  const access = useAdminAccess();
  const Icon = detail.type === "grooming" ? Scissors : detail.type === "houses" ? House : detail.type === "relocation" ? Plane : Package;
  const source = SOURCE[detail.kind];
  const sourceHref = `/admin/${source.page}?search=${encodeURIComponent(detail.reference)}`;
  const canOpenSource = access.can(source.module, "view");
  const firstPaid = detail.payments[0]?.succeededAt;
  const when = (iso: string) => {
    const at = financeWhen(iso, c.ar);
    return `${at.date}, ${at.time}`;
  };
  return (
    <>
      {firstPaid && (
        <time dateTime={firstPaid}>
          {c.text("Paid", "دُفع")} {when(firstPaid)}
        </time>
      )}
      <section className="finance-detail-section">
        <h3>{c.text("Source", "المصدر")}</h3>
        <div className="finance-detail-source">
          <Icon size={30} />
          <div>
            <strong>
              <bdi>{detail.reference}</bdi>
            </strong>
            <small>
              {c.local(FINANCE_TYPE[detail.type])}
              {detail.booking &&
                ` · ${detail.booking.date} ${detail.booking.time} · ${
                  detail.booking.location === "home" ? c.text("Home visit", "زيارة منزلية") : c.text("In the shop", "في المتجر")
                } · ${petLabel(detail.booking.pet, c.local)}`}
            </small>
          </div>
          {canOpenSource && (
            <Link href={sourceHref} aria-label={c.local(source.view)}>
              <ChevronRight size={18} />
            </Link>
          )}
        </div>
      </section>
      <section className="finance-detail-section">
        <div className="finance-section-title">
          <h3>{c.text("Customer", "العميل")}</h3>
          {detail.customer.recordId && (
            <Link href={`/admin/customers?search=${encodeURIComponent(detail.customer.name)}`}>
              {c.text("View customer", "عرض العميل")} <ArrowRight size={12} />
            </Link>
          )}
        </div>
        <div className="finance-detail-customer">
          <span className="finance-avatar">{initials(detail.customer.name)}</span>
          <div>
            <strong>{detail.customer.name}</strong>
            <small>{c.text("Contact details are not shown in Finance.", "لا تظهر بيانات التواصل في المالية.")}</small>
          </div>
        </div>
      </section>
      <section className="finance-detail-section">
        <h3>{c.text("Payment details", "تفاصيل الدفع")}</h3>
        <dl className="finance-breakdown">
          <div>
            <dt>{c.local(source.items)}</dt>
            <dd>
              <bdi>{formatMoney(detail.breakdown.items, c.locale)}</bdi>
            </dd>
          </div>
          {detail.breakdown.discount > 0 && (
            <div>
              <dt>{c.text("Discount", "الخصم")}</dt>
              <dd>
                <bdi>{formatDiscount(detail.breakdown.discount, c.locale)}</bdi>
              </dd>
            </div>
          )}
          {detail.kind === "order" ? (
            <div>
              <dt>{c.text("Delivery fee", "رسوم التوصيل")}</dt>
              <dd>
                <bdi>{formatMoney(detail.breakdown.deliveryFee, c.locale)}</bdi>
              </dd>
            </div>
          ) : (
            detail.breakdown.visitFee > 0 && (
              <div>
                <dt>{c.text("Home visit fee", "رسوم الزيارة المنزلية")}</dt>
                <dd>
                  <bdi>{formatMoney(detail.breakdown.visitFee, c.locale)}</bdi>
                </dd>
              </div>
            )
          )}
          <div className="finance-total">
            <dt>{c.text("Total", "الإجمالي")}</dt>
            <dd>
              <bdi>{formatMoney(detail.breakdown.total, c.locale)}</bdi>
            </dd>
          </div>
        </dl>
        {detail.promotions.length > 0 && (
          <ul className="finance-detail-list" aria-label={c.text("Promotions", "العروض")}>
            {detail.promotions.map((promotion) => (
              <li key={`${promotion.name.en}-${promotion.code ?? ""}`}>
                <span>
                  {c.local(promotion.name)}
                  {promotion.code && (
                    <small>
                      {" "}
                      <bdi>{promotion.code}</bdi>
                    </small>
                  )}
                </span>
                <bdi>{formatDiscount(promotion.discount, c.locale)}</bdi>
              </li>
            ))}
          </ul>
        )}
        <dl className="finance-breakdown">
          <div>
            <dt>{c.text("Paid", "المدفوع")}</dt>
            <dd>
              <bdi>{formatMoney(detail.paid, c.locale)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{c.text("Refunded", "المسترد")}</dt>
            <dd>
              <bdi>{formatMoney(detail.refunded, c.locale)}</bdi>
            </dd>
          </div>
          {detail.toRefund > 0 && (
            <div className="finance-total">
              <dt>{c.text("Still to refund", "متبقٍ للاسترداد")}</dt>
              <dd>
                <bdi>{formatMoney(detail.toRefund, c.locale)}</bdi>
              </dd>
            </div>
          )}
        </dl>
        {(detail.refundNeeded || detail.attention) && (
          <p className="form-error">
            {[detail.refundNeeded ? c.text("Refund needed", "يحتاج استرداداً") : null, detail.attention ? c.local(PAYMENT_ATTENTION[detail.attention]) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>
      <section className="finance-detail-section">
        <h3>{c.text(`Payments (${detail.payments.length})`, `المدفوعات (${detail.payments.length})`)}</h3>
        <ul className="finance-detail-list">
          {detail.payments.map((payment) => (
            <li key={payment.reference}>
              <span>
                <bdi>{payment.reference}</bdi>
                <small>
                  {c.local(PAYMENT_PROVIDER[payment.provider])}
                  {payment.providerPaymentId && (
                    <>
                      {" · "}
                      <bdi>{payment.providerPaymentId}</bdi>
                    </>
                  )}
                </small>
                <small>{when(payment.succeededAt)}</small>
              </span>
              <bdi>{formatMoney(payment.amount, c.locale)}</bdi>
            </li>
          ))}
        </ul>
      </section>
      {detail.refunds.length > 0 && (
        <section className="finance-detail-section">
          <h3>{c.text(`Refunds (${detail.refunds.length})`, `الاستردادات (${detail.refunds.length})`)}</h3>
          <ul className="finance-detail-list">
            {detail.refunds.map((refund) => (
              <li key={refund.id}>
                <span>
                  <span className={`finance-status finance-status--${refundStatusTone(refund.status)}`}>
                    <i aria-hidden="true" />
                    {c.local(REFUND_STATUS[refund.status])}
                  </span>
                  <small>
                    {c.local(REFUND_METHOD[refund.method])}
                    {(refund.providerRefundId ?? refund.manualReference) && (
                      <>
                        {" · "}
                        <bdi>{refund.providerRefundId ?? refund.manualReference}</bdi>
                      </>
                    )}
                  </small>
                  <small>
                    {when(refund.completedAt ?? refund.requestedAt)} · {refund.requestedBy}
                  </small>
                  <small>{refund.reason}</small>
                </span>
                <bdi>{formatMoney(refund.amount, c.locale)}</bdi>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="finance-detail-section">
        <h3>
          {detail.kind === "order"
            ? c.text(`Items (${detail.lines.reduce((sum, line) => sum + line.quantity, 0)})`, `القطع (${detail.lines.reduce((sum, line) => sum + line.quantity, 0)})`)
            : detail.kind === "booking"
              ? c.text("Grooming service", "خدمة العناية")
              : c.text("Relocation quote", "عرض سعر النقل")}
        </h3>
        <ul className="finance-items">
          {detail.lines.map((line) => (
            // An order has one line per product and pack.
            <li key={`${line.name.en}|${line.label.en}`}>
              <div>
                <strong>{c.local(line.name)}</strong>
                <small>{c.local(line.label)}</small>
                {line.discount > 0 && <small>{formatDiscount(line.discount, c.locale)}</small>}
              </div>
              <span>×{line.quantity}</span>
              <bdi>{formatMoney(line.total, c.locale)}</bdi>
            </li>
          ))}
        </ul>
      </section>
      {canOpenSource && (
        <Link className="finance-view-source" href={sourceHref}>
          {c.local(source.view)} <ArrowRight size={15} />
        </Link>
      )}
      <p className="finance-detail-note">
        {c.text("Read-only. Refunds are made on the order or booking.", "للقراءة فقط. تتم الاستردادات من الطلب أو الحجز.")}
      </p>
    </>
  );
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter((letter) => letter && /\p{L}/u.test(letter))
      .slice(0, 2)
      .join("") || "?"
  );
}
