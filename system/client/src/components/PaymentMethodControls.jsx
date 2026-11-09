import React from "react";

export const PAYMENT_METHOD_IDS = ["CASH", "CARD", "ONLINE", "ON_ACCOUNT", "ON_DELIVERY"];

/** تقسيم الدفع: بدون «عند الاستلام» */
export const SPLIT_PAYMENT_METHOD_IDS = ["CASH", "CARD", "ONLINE"];

function IconCash({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function IconCardPay({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" strokeWidth="1.4" />
    </svg>
  );
}

function IconOnline({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M8 12a4 4 0 0 1 8 0" />
      <circle cx="12" cy="16" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconDelivery({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7V10z" />
      <circle cx="7.5" cy="19" r="1.5" />
      <circle cx="17.5" cy="19" r="1.5" />
    </svg>
  );
}

function IconSplit({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <rect x="2" y="5" width="9" height="12" rx="1.5" transform="rotate(-6 6.5 11)" />
      <rect x="13" y="5" width="9" height="12" rx="1.5" transform="rotate(6 17.5 11)" />
      <path d="M12 8v8" strokeDasharray="2 2" />
    </svg>
  );
}

function IconWallet({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h11l5 4v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M16 12h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3" />
      <circle cx="16" cy="13" r="0.5" fill="currentColor" />
    </svg>
  );
}

const METHOD_ICONS = {
  CASH: IconCash,
  CARD: IconCardPay,
  ONLINE: IconOnline,
  ON_ACCOUNT: IconWallet,
  ON_DELIVERY: IconDelivery,
};

const METHOD_LABEL_KEYS = {
  CASH: "payment.cash",
  CARD: "payment.card",
  ONLINE: "payment.online",
  ON_ACCOUNT: "payment.onAccount",
  ON_DELIVERY: "payment.onDelivery",
};

/**
 * أزرار أيقونات: نقدي / بطاقة / أونلاين
 */
export function PaymentMethodIconGroup({
  value,
  onChange,
  t,
  compact = false,
  methodIds = PAYMENT_METHOD_IDS,
}) {
  return (
    <div className={`pos-pay-method-group${compact ? " pos-pay-method-group--compact" : ""}`} role="radiogroup" aria-label={t("pos.payment")}>
      {methodIds.map((m) => {
        const Icon = METHOD_ICONS[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            className={`pos-pay-method-btn${compact ? " pos-pay-method-btn--compact" : ""}${active ? " pos-pay-method-btn--active" : ""}`}
            onClick={() => onChange(m)}
            title={t(METHOD_LABEL_KEYS[m])}
            aria-label={t(METHOD_LABEL_KEYS[m])}
          >
            <Icon className="pos-pay-method-btn__icon" />
            {!compact ? <span className="pos-pay-method-btn__label">{t(METHOD_LABEL_KEYS[m])}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * تبديل تقسيم الدفع — أيقونة + نص قصير
 */
export function SplitPaymentToggle({ enabled, onChange, t }) {
  return (
    <button
      type="button"
      className={`pos-split-toggle${enabled ? " pos-split-toggle--on" : ""}`}
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      title={t("pos.splitEnable")}
      aria-label={t("pos.splitEnable")}
    >
      <IconSplit className="pos-split-toggle__icon" />
      <span className="pos-split-toggle__label">{t("pos.splitShort")}</span>
      <span className="pos-split-toggle__hint">2+</span>
    </button>
  );
}

/** عنوان قسم الدفع — أيقونة محفظة + نص */
export function PaymentSectionHeading({ t }) {
  return (
    <div className="pos-payment-heading">
      <IconWallet className="pos-payment-heading__icon" aria-hidden />
      <span>{t("pos.payment")}</span>
    </div>
  );
}
