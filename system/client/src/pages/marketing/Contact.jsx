import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useMarketingCopy } from "../../marketing/copy.js";

export default function Contact() {
  const { locale } = useI18n();
  const c = useMarketingCopy(locale);
  const ct = c.contact;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState(ct.formTypes[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[i codo POS] ${type} — ${company || name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nType: ${type}\n\n${message}`
    );
    window.location.href = `mailto:${ct.email}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <>
      <section className="mkt-page-hero mkt-page-hero--premium mkt-page-hero--contact">
        <div className="mkt-page-hero-glow" aria-hidden="true" />
        <div className="mkt-shell">
          <div className="mkt-page-hero-stack">
            <span className="mkt-kicker">{ct.kicker}</span>
            <h1>{ct.title}</h1>
            <p className="mkt-lead">{ct.lead}</p>
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-contact-section">
        <div className="mkt-shell mkt-contact-layout">
          <aside className="mkt-contact-panel">
            <p className="mkt-contact-panel-kicker">i codo</p>
            <h2>{locale === "ar" ? "لنبدأ الحديث" : "Let's talk"}</h2>
            <p>
              {locale === "ar"
                ? "نرد عادة خلال 24 ساعة — استشارة قصيرة، بدون ضغط مبيعات."
                : "We typically respond within 24 hours — a short discovery call, no sales pressure."}
            </p>
            <ul className="mkt-contact-list">
              <li>
                <span>{ct.emailLabel}</span>
                <a href={`mailto:${ct.email}`}>{ct.email}</a>
              </li>
              <li>
                <span>{ct.phoneLabel}</span>
                <a href="https://wa.me/97450364653" target="_blank" rel="noreferrer">
                  {ct.phone}
                </a>
              </li>
              <li>
                <span>Web</span>
                <a href="https://www.icodo.io/" target="_blank" rel="noreferrer">
                  www.icodo.io
                </a>
              </li>
            </ul>
            <Link to="/about" className="mkt-btn mkt-btn-ghost mkt-btn-on-dark">
              {c.nav.about}
            </Link>
          </aside>

          <form className="mkt-form mkt-form-panel" onSubmit={submit}>
            <div className="mkt-form-row">
              <div className="mkt-field">
                <label htmlFor="mkt-name">{ct.formName}</label>
                <input id="mkt-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="mkt-field">
                <label htmlFor="mkt-email">{ct.formEmail}</label>
                <input
                  id="mkt-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="mkt-form-row">
              <div className="mkt-field">
                <label htmlFor="mkt-company">{ct.formCompany}</label>
                <input id="mkt-company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="mkt-field">
                <label htmlFor="mkt-type">{ct.formType}</label>
                <select id="mkt-type" value={type} onChange={(e) => setType(e.target.value)}>
                  {ct.formTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mkt-field">
              <label htmlFor="mkt-msg">{ct.formMessage}</label>
              <textarea
                id="mkt-msg"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {sent ? <p className="mkt-form-success">{ct.formSuccess}</p> : null}
            <button type="submit" className="mkt-btn mkt-btn-primary mkt-btn-block">
              {ct.formSubmit}
            </button>
            <p className="mkt-form-privacy">
              {ct.privacy}{" "}
              <Link to="/privacy">{c.nav.privacy}</Link>
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
