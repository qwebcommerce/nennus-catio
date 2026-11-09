import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useI18n } from "../context/LanguageContext.jsx";
import { LanguageSwitcher } from "../components/LanguageSwitcher.jsx";
import { CONTACT, COPY } from "./siteData.js";
import "./marketing.css";

const NAV = [
  { href: "#categories", key: "categories" },
  { href: "#products", key: "products" },
  { href: "#services", key: "services" },
  { href: "#contact", key: "contact" },
];

export function MarketingLayout() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const c = COPY[isAr ? "ar" : "en"];
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    if (location.hash) {
      const id = location.hash.slice(1);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      });
    } else if (location.pathname === "/") {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="mkt nc" data-theme="light">
      <header
        className={`nc-nav${scrolled ? " is-scrolled" : ""}${menuOpen ? " is-menu-open" : ""}`}
      >
        <div className="nc-shell nc-nav-inner">
          <a href="#top" className="nc-brand" aria-label="Nennus Catio — home">
            <img src="/brand/logo.png" alt="" className="nc-brand-logo" />
            <span className="nc-brand-name">
              <strong>{c.brandTitle}</strong>
              <span>{c.brandSub}</span>
            </span>
          </a>

          <nav className="nc-nav-links" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.key} href={item.href}>
                {c.nav[item.key]}
              </a>
            ))}
          </nav>

          <div className="nc-nav-actions">
            <div className="nc-nav-actions-desktop">
              <LanguageSwitcher variant="compact" className="mkt-lang-switch" />
              <Link to="/login" className="nc-btn nc-btn-ghost-ink nc-nav-staff">
                {c.nav.staff}
              </Link>
              <a
                href={CONTACT.whatsappHref}
                className="nc-btn nc-btn-forest"
                target="_blank"
                rel="noreferrer"
              >
                {c.nav.book}
              </a>
            </div>
            <button
              type="button"
              className="nc-nav-toggle"
              aria-label={menuOpen ? c.nav.closeMenu : c.nav.openMenu}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <>
            <button
              type="button"
              className="nc-nav-backdrop"
              aria-label={c.nav.closeMenu}
              onClick={() => setMenuOpen(false)}
            />
            <div className="nc-nav-drawer" role="dialog" aria-modal="true">
              <nav className="nc-nav-drawer-links">
                {NAV.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    {c.nav[item.key]}
                  </a>
                ))}
              </nav>
              <div className="nc-nav-drawer-actions">
                <LanguageSwitcher
                  variant="compact"
                  className="mkt-lang-switch mkt-lang-switch--drawer"
                />
                <Link
                  to="/login"
                  className="nc-btn nc-btn-ghost-ink nc-btn-block"
                  onClick={() => setMenuOpen(false)}
                >
                  {c.nav.staff}
                </Link>
                <a
                  href={CONTACT.whatsappHref}
                  className="nc-btn nc-btn-forest nc-btn-block"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                >
                  {c.nav.book}
                </a>
              </div>
            </div>
          </>
        ) : null}
      </header>

      <Outlet />

      <footer className="nc-footer">
        <div className="nc-shell">
          <div className="nc-footer-grid">
            <div className="nc-footer-brand">
              <span className="nc-footer-avatar">
                <img src="/brand/logo.png" alt="" />
              </span>
              <strong>{c.brand}</strong>
              <p>{c.footer.tagline}</p>
            </div>
            <div className="nc-footer-col">
              <h2>{c.footer.explore}</h2>
              <nav className="nc-footer-links" aria-label={c.footer.explore}>
                {NAV.map((item) => (
                  <a key={item.key} href={item.href}>
                    {c.nav[item.key]}
                  </a>
                ))}
              </nav>
            </div>
            <div className="nc-footer-col">
              <h2>{c.footer.contact}</h2>
              <ul className="nc-footer-contact">
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
          </div>
          <div className="nc-footer-bottom">
            <p className="nc-footer-copy">
              © {new Date().getFullYear()} Nennus Catio. {c.footer.rights}
            </p>
            <p className="nc-footer-credit">
              {c.footer.credit}{" "}
              <a href="https://qweb.com.qa/" target="_blank" rel="noreferrer">
                Qweb Digital
              </a>
            </p>
          </div>
        </div>
      </footer>

      <a
        className="nc-fab"
        href={CONTACT.whatsappHref}
        target="_blank"
        rel="noreferrer"
      >
        {isAr ? "دردشة وحجز" : "Chat & Book"}
      </a>
    </div>
  );
}
