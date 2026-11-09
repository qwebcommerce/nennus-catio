import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useMarketingCopy } from "../../marketing/copy.js";

const ABOUT_HERO_IMG =
  "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=1400&q=80";

export default function About() {
  const { locale } = useI18n();
  const c = useMarketingCopy(locale);
  const a = c.about;

  return (
    <>
      <section className="mkt-page-hero mkt-page-hero--premium mkt-page-hero--split">
        <div className="mkt-page-hero-glow" aria-hidden="true" />
        <div className="mkt-shell mkt-about-hero-grid">
          <div className="mkt-page-hero-stack">
            <span className="mkt-kicker">{a.kicker}</span>
            <h1>{a.title}</h1>
            <p className="mkt-lead">{a.lead}</p>
            <div className="mkt-page-hero-actions">
              <a href="https://www.icodo.io/" target="_blank" rel="noreferrer" className="mkt-btn mkt-btn-primary">
                icodo.io
              </a>
              <Link to="/contact" className="mkt-btn mkt-btn-ghost">
                {c.nav.contact}
              </Link>
            </div>
          </div>
          <div className="mkt-about-hero-media">
            <img
              src={ABOUT_HERO_IMG}
              alt={locale === "ar" ? "فريق يعمل على منتج رقمي" : "Team building a digital product"}
              loading="eager"
            />
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell mkt-about-story">
          <div>
            <span className="mkt-kicker">{a.kicker}</span>
            <h2>{a.storyTitle}</h2>
          </div>
          <div className="mkt-about-story-body">
            {a.story.map((p) => (
              <p key={p.slice(0, 28)}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section-alt">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-kicker">{a.leadersTitle}</span>
            <h2>{a.leadersTitle}</h2>
          </div>
          <div className="mkt-leader-grid">
            {a.leaders.map((l) => (
              <article key={l.name} className="mkt-leader">
                <div className="mkt-leader-mark" aria-hidden="true">
                  {l.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div>
                  <h3>{l.name}</h3>
                  <p className="mkt-leader-role">{l.role}</p>
                  <p className="mkt-leader-bio">{l.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-kicker">Process</span>
            <h2>{a.processTitle}</h2>
          </div>
          <ol className="mkt-process">
            {a.steps.map((s) => (
              <li key={s.n} className="mkt-process-step">
                <span className="mkt-process-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mkt-page-cta-row">
            <Link to="/contact" className="mkt-btn mkt-btn-primary">
              {c.nav.contact}
            </Link>
            <Link to="/register" className="mkt-btn mkt-btn-ghost">
              {c.nav.signUp}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
