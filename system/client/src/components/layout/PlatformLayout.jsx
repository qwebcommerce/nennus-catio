import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { IcodoLogo } from "../../marketing/IcodoLogo.jsx";

/** Platform admin console — English only for now. */
export default function PlatformLayout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();

  useEffect(() => {
    if (locale !== "en") setLocale("en");
  }, [locale, setLocale]);

  return (
    <div className="app-layout-shell" lang="en" dir="ltr">
      <aside className="app-sidebar" aria-label={t("platform.title")}>
        <div className="app-sidebar-header">
          <div className="app-sidebar-brand">
            <IcodoLogo
              variant={theme === "light" ? "light" : "dark"}
              width={148}
              className="app-sidebar-logo"
            />
          </div>
        </div>
        <nav className="app-sidebar-nav">
          <NavLink to="/platform/analytics" className={({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`}>
            {t("platform.analytics")}
          </NavLink>
          <NavLink to="/platform/onboarding" className={({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`}>
            {t("platform.onboardingNav")}
          </NavLink>
          <NavLink to="/platform/organizations" className={({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`}>
            {t("platform.orgs")}
          </NavLink>
          <NavLink to="/platform/users" className={({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`}>
            {t("platform.users")}
          </NavLink>
        </nav>
      </aside>
      <div className="app-main-wrap">
        <header className="app-topbar">
          <div style={{ fontSize: 13, color: "var(--muted)", flex: "1 1 auto" }}>
            {t("nav.platform")}
            <span style={{ marginInlineStart: 8, opacity: 0.7 }}>English</span>
          </div>
          <button
            type="button"
            className="btn-touch"
            onClick={toggleTheme}
            title={theme === "dark" ? t("theme.lightTitle") : t("theme.darkTitle")}
            aria-label={theme === "dark" ? t("theme.lightTitle") : t("theme.darkTitle")}
            style={{ background: "var(--surface2)", color: "var(--text)", minWidth: 44 }}
          >
            {theme === "dark" ? t("theme.lightShort") : t("theme.darkShort")}
          </button>
          <button
            type="button"
            className="btn-touch"
            onClick={() => {
              logout();
              nav("/login");
            }}
            style={{ background: "var(--surface2)", color: "var(--text)" }}
          >
            {t("nav.logout")}
          </button>
        </header>
        <main className="app-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
