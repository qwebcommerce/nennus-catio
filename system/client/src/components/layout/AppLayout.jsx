import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useBranchContext } from "../../context/BranchContext.jsx";
import { formatUserBranchLine, branchDisplayName } from "../../utils/displayLabels.js";
import { OfflineBanner } from "../OfflineBanner.jsx";
import { useAlertsBadgeCount } from "../../hooks/useAlertsBadgeCount.js";
import { isVerticalFeatureEnabled } from "../../lib/verticalFeatures.js";
import { SidebarIcon } from "../SidebarIcon.jsx";
import { LanguageSwitcher } from "../LanguageSwitcher.jsx";
import { FloatingCalculator } from "../FloatingCalculator.jsx";

const NAV_SECTION_IDS = ["dashboard", "inventory", "customers", "business", "admin"];

/** Which sidebar section owns the current route (for auto-expand). */
function navSectionForPath(pathname) {
  const p = pathname || "";
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/command-center") ||
    p.startsWith("/alerts") ||
    p.startsWith("/sync-queue") ||
    p.startsWith("/reports") ||
    p.startsWith("/sales")
  ) {
    return "dashboard";
  }
  if (
    p.startsWith("/products") ||
    p.startsWith("/inventory-lots") ||
    p.startsWith("/stock-brain") ||
    p.startsWith("/pricing-brain") ||
    p.startsWith("/cost-brain") ||
    p.startsWith("/stock-balancer") ||
    p.startsWith("/categories") ||
    p.startsWith("/cash") ||
    p.startsWith("/purchases") ||
    p.startsWith("/transfer") ||
    p.startsWith("/count") ||
    p.startsWith("/returns")
  ) {
    return "inventory";
  }
  if (
    p.startsWith("/customers") ||
    p.startsWith("/customers-brain") ||
    p.startsWith("/customer-accounts") ||
    p.startsWith("/loyalty") ||
    p.startsWith("/appointments")
  ) {
    return "customers";
  }
  if (
    p.startsWith("/accounting") ||
    p.startsWith("/zakat") ||
    p.startsWith("/commissions") ||
    p.startsWith("/automations") ||
    p.startsWith("/hr")
  ) {
    return "business";
  }
  if (
    p.startsWith("/users") ||
    p.startsWith("/branches") ||
    p.startsWith("/platform") ||
    p.startsWith("/permissions") ||
    p.startsWith("/sync") ||
    p.startsWith("/plan") ||
    p.startsWith("/audit")
  ) {
    return "admin";
  }
  return "";
}

function initialOpenSections(pathname) {
  const open = {};
  NAV_SECTION_IDS.forEach((id) => {
    open[id] = false;
  });
  const sec = navSectionForPath(pathname);
  if (sec) open[sec] = true;
  else open.dashboard = true;
  return open;
}

const sidebarLinkClass = ({ isActive }) =>
  `app-sidebar-link${isActive ? " is-active" : ""}`;

function SidebarNavSection({ sectionId, title, icon, expanded, onToggle, t, children }) {
  const visible = React.Children.toArray(children).some(
    (c) => c != null && typeof c !== "boolean",
  );
  if (!visible) return null;
  const panelId = `sidebar-nav-${sectionId}`;
  const hint = expanded ? t("nav.collapseSection", { title }) : t("nav.expandSection", { title });
  return (
    <div className={`app-sidebar-nav-section${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="app-sidebar-nav-heading app-sidebar-nav-heading--toggle"
        id={`${panelId}-btn`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        title={hint}
      >
        <span className="app-sidebar-heading-main">
          {icon ? (
            <span className="app-sidebar-heading-ico" aria-hidden>
              <SidebarIcon name={icon} />
            </span>
          ) : null}
          <span className="app-sidebar-heading-label">{title}</span>
        </span>
        <span className="app-sidebar-nav-chevron" aria-hidden>
          <SidebarIcon name="chevron" size={14} />
        </span>
      </button>
      <div
        id={panelId}
        className={`app-sidebar-nav-panel${expanded ? " is-expanded" : ""}`}
        role="region"
        aria-labelledby={`${panelId}-btn`}
        aria-hidden={!expanded}
        inert={!expanded || undefined}
      >
        <div className="app-sidebar-nav-panel-inner">{children}</div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, logout, isAdmin, isManager, can } = useAuth();
  const { isDark } = useTheme();
  const {
    branches,
    activeBranchId,
    setActiveBranchId,
    canSwitchBranch,
  } = useBranchContext();
  const bv = user?.businessVertical;
  const { t, locale } = useI18n();
  const sidebarLogoSrc = isDark
    ? "/icodo-icon-dark.png?v=3"
    : "/icodo-sidebar-light.png?v=3";
  const nav = useNavigate();
  const location = useLocation();
  const { count: alertsBadge } = useAlertsBadgeCount();

  const isPosRoute = location.pathname === "/pos";

  const [openSections, setOpenSections] = useState(() =>
    initialOpenSections(typeof window !== "undefined" ? window.location.pathname : ""),
  );

  useEffect(() => {
    const sec = navSectionForPath(location.pathname);
    if (sec) {
      setOpenSections((prev) => ({ ...prev, [sec]: true }));
    }
  }, [location.pathname]);

  const toggleNavSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="app-layout-shell">
      <aside className="app-sidebar" aria-label={t("nav.brand")}>
        <div className="app-sidebar-header">
          <div className="app-sidebar-brand">
            <img
              src={sidebarLogoSrc}
              alt="Icodo"
              className={`app-sidebar-logo${isDark ? " app-sidebar-logo--dark" : " app-sidebar-logo--light"}`}
              decoding="async"
            />
          </div>
          {canSwitchBranch ? (
            <div className="app-sidebar-branch">
              <span className="app-sidebar-branch-kicker">{t("branchContext.label")}</span>
              <div className="app-sidebar-branch-control">
                <span className="app-sidebar-branch-ico" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <select
                  value={activeBranchId || ""}
                  onChange={(e) => setActiveBranchId(e.target.value)}
                  aria-label={t("branchContext.pick")}
                >
                  {branches.length === 0 ? (
                    <option value="">{t("branchContext.pick")}</option>
                  ) : null}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {branchDisplayName(b, locale)}
                    </option>
                  ))}
                </select>
                <span className="app-sidebar-branch-chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="app-sidebar-nav">
          <SidebarNavSection
            sectionId="dashboard"
            title={t("nav.section.dashboard")}
            icon="dashboard"
            expanded={Boolean(openSections.dashboard)}
            onToggle={() => toggleNavSection("dashboard")}
            t={t}
          >
            <NavLink to="/dashboard" className={sidebarLinkClass}>
              <SidebarIcon name="analytics" />
              <span>{t("nav.analytics")}</span>
            </NavLink>
            {(isAdmin || isManager) &&
            isVerticalFeatureEnabled("ownerBrief", bv) ? (
              <NavLink to="/command-center" className={sidebarLinkClass}>
                <SidebarIcon name="spark" />
                <span>{t("nav.commandCenter")}</span>
              </NavLink>
            ) : null}
            {can("reports") ? (
              <NavLink to="/reports" className={sidebarLinkClass}>
                <SidebarIcon name="reports" />
                <span>{t("nav.reports")}</span>
              </NavLink>
            ) : null}
            {(can("pos") || can("reports")) ? (
              <NavLink to="/sales" className={sidebarLinkClass}>
                <SidebarIcon name="sales" />
                <span>{t("nav.sales")}</span>
              </NavLink>
            ) : null}
            <NavLink to="/alerts" className={sidebarLinkClass}>
              <SidebarIcon name="bell" />
              <span className="app-sidebar-link-row">
                <span>{t("nav.notifications")}</span>
                {alertsBadge > 0 ? (
                  <span className="app-sidebar-badge" title={t("nav.notifications")}>
                    {alertsBadge > 99 ? "99+" : alertsBadge}
                  </span>
                ) : null}
              </span>
            </NavLink>
            <NavLink to="/sync-queue" className={sidebarLinkClass}>
              <SidebarIcon name="sync" />
              <span>{t("nav.offlineSync")}</span>
            </NavLink>
          </SidebarNavSection>

          {can("pos") ? (
            <NavLink to="/pos" className={sidebarLinkClass} end>
              <SidebarIcon name="pos" />
              <span>{t("nav.pos")}</span>
            </NavLink>
          ) : null}
          {/* Floor associate POS — coming soon (ASSOCIATE role still uses /floor-pos) */}
          {can("floorPos") ? (
            <span
              className="app-sidebar-link"
              style={{ opacity: 0.55, cursor: "default" }}
              title={t("common.comingSoon")}
              aria-disabled="true"
            >
              <SidebarIcon name="pos" />
              <span>
                {t("nav.floorPos")}{" "}
                <small style={{ fontWeight: 600 }}>({t("common.comingSoon")})</small>
              </span>
            </span>
          ) : null}

          <SidebarNavSection
            sectionId="inventory"
            title={t("nav.section.inventory")}
            icon="inventory"
            expanded={Boolean(openSections.inventory)}
            onToggle={() => toggleNavSection("inventory")}
            t={t}
          >
            {can("productsView") ? (
              <NavLink to="/products" className={sidebarLinkClass}>
                <SidebarIcon name="products" />
                <span>{t("nav.products")}</span>
              </NavLink>
            ) : null}
            {can("productsView") && isVerticalFeatureEnabled("lotsExpiry", bv) ? (
              <NavLink to="/inventory-lots" className={sidebarLinkClass}>
                <SidebarIcon name="inventory" />
                <span>{t("nav.lots")}</span>
              </NavLink>
            ) : null}
            {can("catalogEdit") ? (
              <NavLink to="/categories" className={sidebarLinkClass}>
                <SidebarIcon name="categories" />
                <span>{t("nav.categories")}</span>
              </NavLink>
            ) : null}
            {can("purchases") ? (
              <NavLink to="/purchases" className={sidebarLinkClass}>
                <SidebarIcon name="purchases" />
                <span>{t("nav.purchases")}</span>
              </NavLink>
            ) : null}
            {can("purchases") && isVerticalFeatureEnabled("stockBrain", bv) ? (
              <NavLink to="/stock-brain" className={sidebarLinkClass}>
                <SidebarIcon name="inventory" />
                <span>{t("nav.stockBrain")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) &&
            can("productsEdit") &&
            isVerticalFeatureEnabled("priceBrain", bv) ? (
              <NavLink to="/pricing-brain" className={sidebarLinkClass}>
                <SidebarIcon name="coupons" />
                <span>{t("nav.priceBrain")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) &&
            can("purchases") &&
            isVerticalFeatureEnabled("costBrain", bv) ? (
              <NavLink to="/cost-brain" className={sidebarLinkClass}>
                <SidebarIcon name="purchases" />
                <span>{t("nav.costBrain")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) &&
            can("transfer") &&
            isVerticalFeatureEnabled("stockBalancer", bv) ? (
              <NavLink to="/stock-balancer" className={sidebarLinkClass}>
                <SidebarIcon name="transfer" />
                <span>{t("nav.stockBalancer")}</span>
              </NavLink>
            ) : null}
            {can("transfer") ? (
              <NavLink to="/transfer" className={sidebarLinkClass}>
                <SidebarIcon name="transfer" />
                <span>{t("nav.transfer")}</span>
              </NavLink>
            ) : null}
            {can("stockCount") ? (
              <NavLink to="/count" className={sidebarLinkClass}>
                <SidebarIcon name="count" />
                <span>{t("nav.count")}</span>
              </NavLink>
            ) : null}
            {can("refunds") ? (
              <NavLink to="/returns" className={sidebarLinkClass}>
                <SidebarIcon name="returns" />
                <span>{t("nav.returns")}</span>
              </NavLink>
            ) : null}
            {can("cashSession") ? (
              <NavLink to="/cash" className={sidebarLinkClass}>
                <SidebarIcon name="funds" />
                <span>{t("nav.funds")}</span>
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="customers"
            title={t("nav.section.customers")}
            icon="customers"
            expanded={Boolean(openSections.customers)}
            onToggle={() => toggleNavSection("customers")}
            t={t}
          >
            {can("customers") ? (
              <NavLink to="/customers" className={sidebarLinkClass}>
                <SidebarIcon name="customers" />
                <span>{t("nav.customers")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) &&
            can("customers") &&
            isVerticalFeatureEnabled("customerRfm", bv) ? (
              <NavLink to="/customers-brain" className={sidebarLinkClass}>
                <SidebarIcon name="spark" />
                <span>{t("nav.customersBrain")}</span>
              </NavLink>
            ) : null}
            {can("receivables") && isVerticalFeatureEnabled("customerAccounts", bv) ? (
              <NavLink to="/customer-accounts" className={sidebarLinkClass}>
                <SidebarIcon name="accounts" />
                <span>{t("nav.accounts")}</span>
              </NavLink>
            ) : null}
            {can("loyalty") ? (
              <NavLink to="/loyalty" className={sidebarLinkClass}>
                <SidebarIcon name="coupons" />
                <span>{t("nav.coupons")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) && isVerticalFeatureEnabled("appointments", bv) ? (
              <NavLink to="/appointments" className={sidebarLinkClass}>
                <SidebarIcon name="appointments" />
                <span>{t("nav.appointments")}</span>
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="business"
            title={t("nav.section.business")}
            icon="business"
            expanded={Boolean(openSections.business)}
            onToggle={() => toggleNavSection("business")}
            t={t}
          >
            {isAdmin || isManager ? (
              <NavLink to="/accounting" className={sidebarLinkClass}>
                <SidebarIcon name="accounting" />
                <span>{t("nav.accounting")}</span>
              </NavLink>
            ) : null}
            {isAdmin || isManager ? (
              <NavLink to="/zakat" className={sidebarLinkClass}>
                <SidebarIcon name="zakat" />
                <span>{t("nav.zakat")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) && isVerticalFeatureEnabled("appointments", bv) ? (
              <NavLink to="/commissions" className={sidebarLinkClass}>
                <SidebarIcon name="commissions" />
                <span>{t("nav.commissions")}</span>
              </NavLink>
            ) : null}
            {isAdmin || isManager ? (
              <span
                className="app-sidebar-link"
                style={{ opacity: 0.55, cursor: "default" }}
                title={t("common.comingSoon")}
                aria-disabled="true"
              >
                <SidebarIcon name="automations" />
                <span>
                  {t("nav.automations")}{" "}
                  <small style={{ fontWeight: 600 }}>({t("common.comingSoon")})</small>
                </span>
              </span>
            ) : null}
            {isAdmin || isManager ? (
              <NavLink to="/hr" className={sidebarLinkClass}>
                <SidebarIcon name="hr" />
                <span>{t("nav.hr")}</span>
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="admin"
            title={t("nav.section.administration")}
            icon="admin"
            expanded={Boolean(openSections.admin)}
            onToggle={() => toggleNavSection("admin")}
            t={t}
          >
            {isAdmin ? (
              <NavLink to="/users" className={sidebarLinkClass}>
                <SidebarIcon name="users" />
                <span>{t("nav.users")}</span>
              </NavLink>
            ) : null}
            {isAdmin ? (
              <NavLink to="/permissions" className={sidebarLinkClass}>
                <SidebarIcon name="audit" />
                <span>{t("nav.permissions")}</span>
              </NavLink>
            ) : null}
            {isAdmin ? (
              <NavLink to="/branches" className={sidebarLinkClass}>
                <SidebarIcon name="branches" />
                <span>{t("nav.branches")}</span>
              </NavLink>
            ) : null}
            {isAdmin || isManager ? (
              <span
                className="app-sidebar-link"
                style={{ opacity: 0.55, cursor: "default" }}
                title={t("common.comingSoon")}
                aria-disabled="true"
              >
                <SidebarIcon name="websiteSync" />
                <span>
                  {t("nav.sync")}{" "}
                  <small style={{ fontWeight: 600 }}>({t("common.comingSoon")})</small>
                </span>
              </span>
            ) : null}
            {isAdmin ? (
              <NavLink to="/plan" className={sidebarLinkClass}>
                <SidebarIcon name="plan" />
                <span>{t("nav.plan")}</span>
              </NavLink>
            ) : null}
            {can("audit") ? (
              <NavLink to="/audit" className={sidebarLinkClass}>
                <SidebarIcon name="audit" />
                <span>{t("nav.auditLogs")}</span>
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <NavLink to="/settings" className={sidebarLinkClass}>
            <SidebarIcon name="settings" />
            <span>{t("nav.settings")}</span>
          </NavLink>
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-lang">
            <span className="app-sidebar-lang-label">{t("nav.settings.language")}</span>
            <LanguageSwitcher variant="segmented" />
          </div>
          <div className="app-sidebar-user">
            {formatUserBranchLine(user, locale)}
            {user?.role ? (
              <div className="app-sidebar-role">{t(`role.${user.role}`)}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="app-sidebar-logout"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            <SidebarIcon name="logout" />
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </aside>

      <div className="app-main-wrap">
        <OfflineBanner />
        <main className={`app-main-content${isPosRoute ? " app-main-content--pos-wide" : ""}`}>
          <Outlet />
        </main>
        <FloatingCalculator />
      </div>
    </div>
  );
}
