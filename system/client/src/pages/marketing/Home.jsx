import React, { useState } from "react";
import { useI18n } from "../../context/LanguageContext.jsx";
import {
  CATEGORIES,
  CONTACT,
  COPY,
  PRODUCTS,
  SERVICES,
} from "../../marketing/siteData.js";

export default function Home() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const c = COPY[isAr ? "ar" : "en"];
  const [sent, setSent] = useState(false);

  return (
    <div className="nc-page">
      <section className="nc-hero" id="top">
        <div className="nc-shell nc-hero-grid">
          <div className="nc-hero-copy">
            <p className="nc-hero-eyebrow">{c.hero.eyebrow}</p>
            <h1 className="nc-hero-title">{c.hero.headline}</h1>
            <p className="nc-hero-support">{c.hero.support}</p>
            <div className="nc-hero-cta">
              <a className="nc-btn nc-btn-forest" href="#categories">
                {c.hero.ctaPrimary}
              </a>
              <a className="nc-btn nc-btn-ghost-ink" href="#contact">
                {c.hero.ctaSecondary}
              </a>
            </div>
            <ul className="nc-hero-stats">
              {c.hero.stats.map((s) => (
                <li key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="nc-hero-stage">
            <img
              src="/brand/logo.png"
              alt=""
              className="nc-hero-logo"
              width={320}
              height={370}
            />
            <p className="nc-hero-place">
              {isAr ? CONTACT.locationAr : CONTACT.locationEn}
            </p>
          </div>
        </div>
      </section>

      <section className="nc-section" id="categories">
        <div className="nc-shell">
          <header className="nc-section-head">
            <h2>{c.categories.title}</h2>
            <p>{c.categories.lead}</p>
            <span className="nc-leaf" aria-hidden="true" />
          </header>
          <div className="nc-cat-grid">
            {CATEGORIES.map((cat) => (
              <a key={cat.id} className="nc-cat" href="#products">
                <span className="nc-cat-emoji" aria-hidden="true">
                  {cat.emoji}
                </span>
                <h3>{isAr ? cat.ar : cat.en}</h3>
                <span className="nc-cat-badge">
                  {cat.count} {isAr ? "تصاميم" : "designs"}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="nc-section nc-section-soft" id="products">
        <div className="nc-shell">
          <header className="nc-section-head">
            <h2>{c.products.title}</h2>
            <p>{c.products.lead}</p>
            <span className="nc-leaf" aria-hidden="true" />
          </header>
          <div className="nc-product-grid">
            {PRODUCTS.map((p) => (
              <article key={p.id} className="nc-product">
                <div className="nc-product-visual" aria-hidden="true">
                  <span>{p.en.slice(0, 1)}</span>
                </div>
                <div className="nc-product-body">
                  <h3>{isAr ? p.ar : p.en}</h3>
                  <p>{isAr ? p.blurbAr : p.blurbEn}</p>
                  <strong>{isAr ? p.priceAr : p.price}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="nc-section" id="services">
        <div className="nc-shell">
          <header className="nc-section-head">
            <span className="nc-kicker">{c.services.kicker}</span>
            <h2>{c.services.title}</h2>
            <p>{c.services.lead}</p>
            <span className="nc-leaf" aria-hidden="true" />
          </header>
          <div className="nc-service-grid">
            {SERVICES.map((s) => (
              <article key={s.id} className={`nc-service nc-service-${s.id}`}>
                <span className="nc-service-label">
                  {isAr ? "باقة" : "Package"}
                </span>
                <h3>{isAr ? s.tierAr : s.tier}</h3>
                <p className="nc-service-price">{s.price}</p>
                <p className="nc-service-count">
                  <strong>{s.coupons}</strong>
                  <span>{isAr ? "قسائم تهذيب" : "grooming coupons"}</span>
                </p>
                <p className="nc-service-blurb">{isAr ? s.blurbAr : s.blurbEn}</p>
                <a className="nc-btn nc-btn-forest nc-btn-block" href={CONTACT.whatsappHref} target="_blank" rel="noreferrer">
                  {c.services.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="nc-section nc-section-contact" id="contact">
        <div className="nc-shell nc-contact-grid">
          <div>
            <header className="nc-section-head nc-section-head-left">
              <h2>{c.contact.title}</h2>
              <p>{c.contact.lead}</p>
            </header>
            <ul className="nc-contact-list">
              <li>
                <span>{c.contact.whatsapp}</span>
                <a href={CONTACT.whatsappHref} target="_blank" rel="noreferrer">
                  {CONTACT.whatsapp}
                </a>
              </li>
              <li>
                <span>{c.contact.instagram}</span>
                <a href={CONTACT.instagramHref} target="_blank" rel="noreferrer">
                  {CONTACT.instagram}
                </a>
              </li>
              <li>
                <span>{c.contact.email}</span>
                <a href={CONTACT.emailHref}>{CONTACT.email}</a>
              </li>
              <li>
                <span>{isAr ? "الموقع" : "Location"}</span>
                <em>{isAr ? CONTACT.locationAr : CONTACT.locationEn}</em>
              </li>
            </ul>
          </div>

          <form
            className="nc-contact-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label>
              {c.contact.formName}
              <input name="name" type="text" required autoComplete="name" />
            </label>
            <label>
              {c.contact.formPet}
              <input name="pet" type="text" required />
            </label>
            <label>
              {c.contact.formMsg}
              <textarea name="message" rows={4} required />
            </label>
            <button type="submit" className="nc-btn nc-btn-forest nc-btn-block">
              {c.contact.formSend}
            </button>
            <p className="nc-form-note">
              {sent
                ? isAr
                  ? "شكراً — تواصل معنا عبر واتساب للمتابعة."
                  : "Thanks — please continue on WhatsApp for a real reply."
                : c.contact.formNote}
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
