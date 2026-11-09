import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useMarketingCopy } from "../../marketing/copy.js";
import { COUNTRY_PACKS } from "../../lib/countries.js";
import { currencyFromCountry, currencyLabel, sarToLocal } from "../../lib/fxGulf.js";

export default function Pricing() {
  const { locale } = useI18n();
  const c = useMarketingCopy(locale);
  const pr = c.pricing;
  const [country, setCountry] = useState("DZ");

  const currency = useMemo(() => currencyFromCountry(country), [country]);
  const label = currencyLabel(currency, locale);

  return (
    <>
      <section className="mkt-page-hero mkt-page-hero--premium mkt-page-hero--contact">
        <div className="mkt-page-hero-glow" aria-hidden="true" />
        <div className="mkt-shell">
          <div className="mkt-page-hero-stack">
            <span className="mkt-kicker">{pr.kicker}</span>
            <h1>{pr.title}</h1>
            <p className="mkt-lead">{pr.lead}</p>
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-pricing-trial-section">
        <div className="mkt-shell">
          <div className="mkt-pricing-trial">
            <span className="mkt-pricing-trial-badge">{pr.trialBadge}</span>
            <div>
              <h2>{pr.trialTitle}</h2>
              <p>{pr.trialBody}</p>
            </div>
            <Link to="/register" className="mkt-btn mkt-btn-primary">
              {pr.ctaRegister}
            </Link>
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section-alt">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-kicker">{pr.kicker}</span>
            <h2>{pr.title}</h2>
            <label style={{ display: "grid", gap: 6, maxWidth: 280, marginTop: 12 }}>
              <span style={{ fontSize: 13, color: "var(--mkt-muted)" }}>
                {locale === "en" ? "Show prices in" : "عرض الأسعار بـ"}
              </span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ minHeight: 42, borderRadius: 10, padding: "8px 10px" }}
              >
                {COUNTRY_PACKS.map((co) => (
                  <option key={co.code} value={co.code}>
                    {locale === "en" ? co.labelEn : co.labelAr}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mkt-pricing-grid">
            {pr.plans.map((plan) => {
              const sar = Number(plan.price) || 0;
              const local = sarToLocal(sar, currency);
              return (
                <article
                  key={plan.id}
                  className={`mkt-price-card${plan.highlight ? " is-featured" : ""}`}
                >
                  {plan.highlight ? <span className="mkt-price-badge">{pr.featured}</span> : null}
                  <h3>{plan.name}</h3>
                  <div className="mkt-price-amount">
                    <strong>{local}</strong>
                    <span>{label}</span>
                  </div>
                  <p className="mkt-price-period">{plan.period}</p>
                  <p className="mkt-price-note">
                    {plan.note}
                    {currency !== "SAR" ? ` · ${sar} SAR` : ""}
                  </p>
                  <ul className="mkt-price-features">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`mkt-btn ${plan.highlight ? "mkt-btn-primary" : "mkt-btn-ghost"}`}
                  >
                    {pr.ctaRegister}
                  </Link>
                </article>
              );
            })}
          </div>
          <p style={{ marginTop: 16, color: "var(--mkt-muted)", fontSize: 0.92 }}>
            {locale === "en"
              ? "Subscription is billed in SAR via Stripe. Local amounts are approximate for display."
              : "يُحصَّل الاشتراك بالريال السعودي عبر Stripe. المبالغ المحلية تقريبية للعرض."}
          </p>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-kicker">{pr.kicker}</span>
            <h2>{pr.includesTitle}</h2>
          </div>
          <ul className="mkt-pricing-includes">
            {pr.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mkt-pricing-cta">
            <h2>{pr.ctaTitle}</h2>
            <p>{pr.ctaBody}</p>
            <div className="mkt-page-cta-row">
              <Link to="/register" className="mkt-btn mkt-btn-primary">
                {pr.ctaRegister}
              </Link>
              <Link to="/contact" className="mkt-btn mkt-btn-ghost">
                {pr.ctaContact}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
