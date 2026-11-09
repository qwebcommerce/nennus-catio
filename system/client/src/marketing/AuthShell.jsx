import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/LanguageContext.jsx";
import { LanguageSwitcher } from "../components/LanguageSwitcher.jsx";
import { COPY } from "./siteData.js";
import "./marketing.css";

/** Shared chrome for Sign in — Nennus Catio branded */
export function AuthShell({ title, subtitle, children }) {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const c = COPY[isAr ? "ar" : "en"];

  return (
    <div className="mkt nc nc-auth-root" data-theme="light">
      <header className="nc-nav">
        <div className="nc-shell nc-nav-inner">
          <Link to="/" className="nc-brand" aria-label="Nennus Catio">
            <img src="/brand/logo.png" alt="" className="nc-brand-logo" />
          </Link>
          <div className="nc-nav-actions">
            <LanguageSwitcher variant="compact" className="mkt-lang-switch" />
            <Link to="/" className="nc-btn nc-btn-ghost-ink">
              {isAr ? "العودة للرئيسية" : "Back home"}
            </Link>
          </div>
        </div>
      </header>

      <div className="nc-auth-wrap">
        <div className="nc-shell nc-auth">
          <div className="nc-auth-panel">
            <div className="nc-auth-card">
              <h1>{title}</h1>
              <p className="nc-auth-sub">{subtitle}</p>
              {children}
            </div>
          </div>
          <div className="nc-auth-visual" aria-hidden="true">
            <span className="nc-auth-avatar">
              <img src="/brand/logo.png" alt="" />
            </span>
            <h2>{c.brand}</h2>
            <p>{c.footer.tagline}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
