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
import { useDispatchNavBadges } from "../DispatchNav.jsx";
import { usePendingConfirmations } from "../PaymentConfirmShared.jsx";
// fix-rf: the menu is one data definition (lib/menuDefinition.js), shared with the role landing
// pages, the admin's menu preview and the "Who sees what" guide.
import { MENU_LEGACY_ROLES, MENU_ROLES, sectionForPath } from "../../lib/menuDefinition.js";
import { setMenuPreview } from "../../lib/menuPreview.js";
import { useStaffMenu } from "../../hooks/useStaffMenu.js";

const sidebarLinkClass = ({ isActive }) =>
  `app-sidebar-link${isActive ? " is-active" : ""}`;

function SidebarNavSection({ sectionId, title, icon, expanded, onToggle, t, badge = 0, children }) {
  const visible = React.Children.toArray(children).some(
    (c) => c != null && typeof c !== "boolean",
  );
  if (!visible) return null;
  const panelId = `sidebar-nav-${sectionId}`;
  const hint = expanded ? t("nav.collapseSection", { title }) : t("nav.expandSection", { title });
  return (
    <div className={`app-sidebar-nav-section${expanded ? " is-open" : ""}`} data-testid={`nav-section-${sectionId}`} data-section={sectionId}>
      <button
        type="button"
        className="app-sidebar-nav-heading app-sidebar-nav-heading--toggle"
        id={`${panelId}-btn`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        title={hint}
        data-testid={`nav-section-btn-${sectionId}`}
      >
        <span className="app-sidebar-heading-main">
          {icon ? (
            <span className="app-sidebar-heading-ico" aria-hidden>
              <SidebarIcon name={icon} />
            </span>
          ) : null}
          <span className="app-sidebar-heading-label">{title}</span>
          {/* fix-rf: a closed section still shows that something inside waits (sum of its badges). */}
          {!expanded && badge > 0 ? (
            <span className="app-sidebar-badge app-sidebar-badge--section" data-testid={`nav-section-badge-${sectionId}`}>
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
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

/** One menu link from the definition (keeps the old data-testids: nav-driver, nav-confirmations, ...). */
function MenuLink({ item, t, badge }) {
  const testId = item.testId || `nav-${item.id}`;
  return (
    <NavLink to={item.to} end={Boolean(item.end)} className={sidebarLinkClass} data-testid={testId} data-nav-id={item.id}>
      <SidebarIcon name={item.icon} />
      {item.badge ? (
        <span className="app-sidebar-link-row">
          <span>{t(item.label)}</span>
          {badge > 0 ? (
            <span className="app-sidebar-badge" data-testid={`${testId}-badge`} title={t(item.label)}>
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
      ) : (
        <span>{t(item.label)}</span>
      )}
    </NavLink>
  );
}

/** fix-rf: the top admin's "Preview menu as" picker (navigation only). */
function MenuPreviewPicker({ user, previewRole, t }) {
  return (
    <div className="app-sidebar-branch app-sidebar-preview">
      <span className="app-sidebar-branch-kicker">{t("menu.preview.label")}</span>
      <div className="app-sidebar-branch-control">
        <span className="app-sidebar-branch-ico" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        <select
          value={previewRole}
          onChange={(e) => setMenuPreview(user.id, e.target.value)}
          aria-label={t("menu.preview.label")}
          title={t("menu.preview.tooltip")}
          data-testid="menu-preview-select"
        >
          <option value="">{t("menu.preview.off")}</option>
          {MENU_ROLES.filter((r) => r !== "ADMIN").map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}{MENU_LEGACY_ROLES.includes(r) ? ` — ${t("menu.guide.legacy")}` : ""}
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
  );
}

export function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const {
    branches,
    activeBranchId,
    setActiveBranchId,
    canSwitchBranch,
  } = useBranchContext();
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const { menu, realCtx, previewRole, previewReady, previewError } = useStaffMenu();

  // Badges poll with the user's real rights (hidden while previewing another role's menu).
  const { count: alertsBadge } = useAlertsBadgeCount();
  const dispatchBadges = useDispatchNavBadges({
    driverUnseen: realCtx.canModule("driver", "view") && realCtx.isVanUser && user?.role !== "ADMIN",
    approvals: realCtx.canModule("driverApprovals", "view"),
  });
  const confirmData = usePendingConfirmations(realCtx.canModule("paymentConfirm", "view"));
  const badges = previewRole
    ? {}
    : {
        alerts: alertsBadge,
        driverUnseen: dispatchBadges.driverUnseen,
        approvals: dispatchBadges.approvals,
        confirmations: confirmData?.pending || 0,
      };

  const isPosRoute = location.pathname === "/pos";

  // The section holding the current route opens by itself; the others keep what the user chose.
  const [openSections, setOpenSections] = useState({});
  const currentSection = sectionForPath(location.pathname, menu);
  const defaultSection = currentSection || menu[0]?.id || null;
  const isOpen = (id) => openSections[id] ?? id === defaultSection;
  useEffect(() => {
    if (currentSection) setOpenSections((prev) => (prev[currentSection] ? prev : { ...prev, [currentSection]: true }));
  }, [location.pathname, currentSection]);

  const toggleNavSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !(prev[id] ?? id === defaultSection) }));
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
          {isAdmin ? <MenuPreviewPicker user={user} previewRole={previewRole} t={t} /> : null}
        </div>

        <nav className="app-sidebar-nav" data-testid="app-menu" data-preview-role={previewRole || undefined}>
          {menu.map((section) =>
            section.id === null ? (
              // A role with its own short menu (DRIVER): plain links, no sections.
              <React.Fragment key="flat">
                {section.items.map((it) => (
                  <MenuLink key={it.id} item={it} t={t} badge={badges[it.badge] || 0} />
                ))}
              </React.Fragment>
            ) : (
              <SidebarNavSection
                key={section.id}
                sectionId={section.id}
                title={t(`menu.section.${section.id}`)}
                icon={section.icon}
                expanded={isOpen(section.id)}
                onToggle={() => toggleNavSection(section.id)}
                badge={section.items.reduce((n, it) => n + (it.badge ? badges[it.badge] || 0 : 0), 0)}
                t={t}
              >
                {section.items.map((it) => (
                  <MenuLink key={it.id} item={it} t={t} badge={badges[it.badge] || 0} />
                ))}
              </SidebarNavSection>
            ),
          )}
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
        {previewRole ? (
          <div className="menu-preview-banner" role="status" data-testid="menu-preview-banner" title={t("menu.preview.tooltip")}>
            <span>
              <strong>{t("menu.preview.banner", { role: t(`role.${previewRole}`) })}</strong>
              <span className="menu-preview-banner__hint">
                {previewError ? previewError : previewReady ? t("menu.preview.hint") : t("common.loading")}
              </span>
            </span>
            <button type="button" className="btn-touch menu-preview-banner__exit" onClick={() => setMenuPreview(null, null)} data-testid="menu-preview-exit">
              {t("menu.preview.exit")}
            </button>
          </div>
        ) : null}
        <main className={`app-main-content${isPosRoute ? " app-main-content--pos-wide" : ""}`}>
          <Outlet />
        </main>
        <FloatingCalculator />
      </div>
    </div>
  );
}
