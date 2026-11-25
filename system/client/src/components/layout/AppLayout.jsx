import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { useBranchContext } from "../../context/BranchContext.jsx";
import { formatUserBranchLine, branchDisplayName } from "../../utils/displayLabels.js";
import { OfflineBanner } from "../OfflineBanner.jsx";
import { useAlertsBadgeCount } from "../../hooks/useAlertsBadgeCount.js";
import { SidebarIcon } from "../SidebarIcon.jsx";
import { LanguageSwitcher } from "../LanguageSwitcher.jsx";
import { FloatingCalculator } from "../FloatingCalculator.jsx";

const NAV_SECTION_IDS = ["dashboard", "inventory", "customers", "admin"];

/** Which sidebar section owns the current route (for auto-expand). */
function navSectionForPath(pathname) {
  const p = pathname || "";
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/alerts") ||
    p.startsWith("/reports") ||
    (p.startsWith("/sales") && !p.startsWith("/sales-orders"))
  ) {
    return "dashboard";
  }
  if (
    p.startsWith("/products") ||
    p.startsWith("/categories") ||
    p.startsWith("/sales-orders") ||
    p.startsWith("/cash") ||
    p.startsWith("/purchases") ||
    p.startsWith("/transfer") ||
    p.startsWith("/count") ||
    p.startsWith("/damaged-stock") ||
    p.startsWith("/returns")
  ) {
    return "inventory";
  }
  if (
    p.startsWith("/customers") ||
    p.startsWith("/customer-accounts") ||
    p.startsWith("/appointments")
  ) {
    return "customers";
  }
  if (
    p.startsWith("/users") ||
    p.startsWith("/branches") ||
    p.startsWith("/permissions") ||
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
        inert={!expanded ? "" : undefined}
      >
        <div className="app-sidebar-nav-panel-inner">{children}</div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, logout, isAdmin, isManager, isOrgOwner, can, canModule } = useAuth();
  const {
    branches,
    activeBranchId,
    setActiveBranchId,
    canSwitchBranch,
  } = useBranchContext();
  const { t, locale } = useI18n();
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

  /** Phones: the sidebar is a drawer behind a menu button so the page (e.g. the van till) comes first. */
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={`app-layout-shell${menuOpen ? " is-menu-open" : ""}`}>
      <div className="app-mobile-bar">
        <button
          type="button"
          className="app-mobile-menu-btn"
          aria-label={t("nav.menu")}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="app-mobile-brand">
          <img src="/brand/logo.png" alt="" />
          <strong>Nennus Catio</strong>
        </span>
        {activeBranchId && branches.length ? (
          <span className="app-mobile-branch">
            {branchDisplayName(branches.find((b) => b.id === activeBranchId) || branches[0], locale)}
          </span>
        ) : null}
      </div>
      {menuOpen ? <div className="app-sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}
      <aside id="app-sidebar" className={`app-sidebar${menuOpen ? " is-open" : ""}`} aria-label={t("nav.brand")}>
        <div className="app-sidebar-header">
          <div className="app-sidebar-brand">
            <span className="app-sidebar-avatar" aria-hidden="true">
              <img src="/brand/logo.png" alt="" />
            </span>
            <span className="app-sidebar-word">
              <strong>Nennus</strong>
              <span>Catio</span>
            </span>
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
          </SidebarNavSection>

          {can("pos") ? (
            <NavLink to="/pos" className={sidebarLinkClass} end>
              <SidebarIcon name="pos" />
              <span>{t("nav.pos")}</span>
            </NavLink>
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
            {canModule("salesOrders", "view") ? (
              <NavLink to="/sales-orders" className={sidebarLinkClass}>
                <SidebarIcon name="purchases" />
                <span>{t("so.title")}</span>
              </NavLink>
            ) : null}
            {can("purchases") ? (
              <NavLink to="/purchase-orders" className={sidebarLinkClass}>
                <SidebarIcon name="purchases" />
                <span>{t("po.title")}</span>
              </NavLink>
            ) : null}
            {can("productsView") ? (
              <NavLink to="/online-orders" className={sidebarLinkClass}>
                <SidebarIcon name="products" />
                <span>{t("shop.staffOrders")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) ? (
              <NavLink to="/promotions" className={sidebarLinkClass}>
                <SidebarIcon name="coupons" />
                <span>{t("shop.promotions")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) ? (
              <NavLink to="/finance" className={sidebarLinkClass}>
                <SidebarIcon name="purchases" />
                <span>{t("shop.finance")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager || canModule("returns", "view")) ? (
              <NavLink to="/vehicles" className={sidebarLinkClass}>
                <SidebarIcon name="inventory" />
                <span>{t("shop.vehicles")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) ? (
              <NavLink to="/admin/grooming" className={sidebarLinkClass}>
                <SidebarIcon name="categories" />
                <span>{t("shop.grooming")}</span>
              </NavLink>
            ) : null}
            {(isAdmin || isManager) ? (
              <NavLink to="/admin/relocation" className={sidebarLinkClass}>
                <SidebarIcon name="categories" />
                <span>{t("shop.relocation")}</span>
              </NavLink>
            ) : null}
            {can("catalogEdit") ? (
              <NavLink to="/pet-types" className={sidebarLinkClass}>
                <SidebarIcon name="categories" />
                <span>{t("shop.catalogueSetup")}</span>
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
            {can("receivables") ? (
              <NavLink to="/customer-accounts" className={sidebarLinkClass}>
                <SidebarIcon name="accounts" />
                <span>{t("nav.accounts")}</span>
              </NavLink>
            ) : null}
            {isAdmin || isManager ? (
              <NavLink to="/appointments" className={sidebarLinkClass}>
                <SidebarIcon name="appointments" />
                <span>{t("nav.appointments")}</span>
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
            {isOrgOwner ? (
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
          <NavLink to="/change-password" className="app-sidebar-logout" onClick={() => setMenuOpen?.(false)}>
            <SidebarIcon name="settings" />
            <span>{t("nav.changePassword")}</span>
          </NavLink>
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
