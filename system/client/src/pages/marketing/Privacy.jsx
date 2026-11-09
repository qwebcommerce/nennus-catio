import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useMarketingCopy } from "../../marketing/copy.js";

export default function Privacy() {
  const { locale } = useI18n();
  const c = useMarketingCopy(locale);
  const p = c.privacy;

  return (
    <>
      <section className="mkt-page-hero mkt-page-hero--premium mkt-page-hero--contact">
        <div className="mkt-page-hero-glow" aria-hidden="true" />
        <div className="mkt-shell">
          <div className="mkt-page-hero-stack">
            <span className="mkt-kicker">{p.kicker}</span>
            <h1>{p.title}</h1>
            <p className="mkt-lead">{p.lead}</p>
            <p className="mkt-privacy-updated">{p.updated}</p>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell mkt-privacy-doc">
          {p.sections.map((section) => (
            <article key={section.title} className="mkt-privacy-block">
              <h2>{section.title}</h2>
              {section.body.map((para) => (
                <p key={para.slice(0, 40)}>{para}</p>
              ))}
            </article>
          ))}
          <div className="mkt-page-cta-row">
            <Link to="/contact" className="mkt-btn mkt-btn-primary">
              {p.ctaContact}
            </Link>
            <Link to="/" className="mkt-btn mkt-btn-ghost">
              {c.nav.home}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
