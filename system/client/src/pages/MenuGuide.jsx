import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import {
  MENU_LEGACY_ROLES,
  MENU_ROLES,
  accessMatrix,
  homePath,
  itemForPath,
  roleContext,
  visibleMenu,
} from "../lib/menuDefinition.js";
import { setMenuPreview, useRoleMenuData } from "../lib/menuPreview.js";

/**
 * fix-rf: "Who sees what" (/permissions/guide, top admin). Generated from the menu definition and
 * each role's current permission map (GET /api/role-menus); nothing here is written by hand except
 * the plain-language role descriptions. Printable, English / Arabic.
 */
const MARK = { menu: "✓", link: "○", none: "–" };

export default function MenuGuide() {
  const { t, locale } = useI18n();
  const { user, isOrgOwner } = useAuth();
  const { data, error } = useRoleMenuData(true);

  const roles = MENU_ROLES;
  const matrix = useMemo(() => (data?.modules ? accessMatrix(data.modules, roles) : null), [data]);
  const menus = useMemo(() => {
    if (!data?.modules) return {};
    return Object.fromEntries(
      roles.map((r) => {
        const ctx = roleContext(r, data.modules[r]);
        return [r, { menu: visibleMenu(ctx), home: homePath(ctx) }];
      }),
    );
  }, [data]);

  const count = (r) => Number(data?.userCounts?.[r] || 0);
  const generated = new Date().toLocaleString(locale === "en" ? "en-GB" : "ar-QA", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="menu-guide dashboard-print-area" data-testid="menu-guide">
      <div className="menu-guide__head">
        <div>
          <h1 style={{ margin: 0 }}>{t("menu.guide.title")}</h1>
          <p className="vr-muted" style={{ margin: "6px 0 0" }}>{t("menu.guide.intro")}</p>
          <p className="vr-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{t("menu.guide.generated", { date: generated })}</p>
        </div>
        <div className="menu-guide__actions dashboard-print-hide">
          <button type="button" className="btn-touch" onClick={() => window.print()} data-testid="guide-print">{t("menu.guide.print")}</button>
          {isOrgOwner ? <Link to="/permissions" className="btn-touch menu-guide__link">{t("menu.guide.openPermissions")}</Link> : null}
        </div>
      </div>

      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{t("menu.guide.loadFailed")}: {error}</div> : null}
      {!data && !error ? <p>{t("common.loading")}</p> : null}

      {data ? (
        <>
          <section className="card menu-guide__card">
            <h2>{t("menu.guide.rolesTitle")}</h2>
            <div className="menu-guide__roles">
              {roles.map((r) => {
                const legacy = MENU_LEGACY_ROLES.includes(r);
                const home = menus[r]?.home;
                const homeItem = home ? itemForPath(home) : null;
                return (
                  <article key={r} className="menu-guide__role" data-testid={`guide-role-${r}`} data-role={r}>
                    <h3>
                      {t(`role.${r}`)}
                      {legacy ? <span className="vr-badge vr-badge--warn" data-testid="guide-legacy">{t("menu.guide.legacy")}</span> : null}
                      {count(r) === 0 ? (
                        <span className="vr-badge vr-badge--bad" data-testid="guide-nobody">{t("menu.guide.nobody")}</span>
                      ) : (
                        <span className="vr-badge">{t("menu.guide.users", { n: count(r) })}</span>
                      )}
                    </h3>
                    <p>{t(`menu.role.${r}`)}</p>
                    <p className="vr-muted" data-testid="guide-home" data-home={home}>
                      {t("menu.guide.home", { page: homeItem ? t(homeItem.label) : home })}
                    </p>
                    <div className="menu-guide__menu" data-testid={`guide-menu-${r}`}>
                      <strong>{t("menu.guide.menuOf", { role: t(`role.${r}`) })}</strong>
                      <ul>
                        {(menus[r]?.menu || []).map((s) => (
                          <li key={s.id || "flat"}>
                            {s.id ? <b>{t(`menu.section.${s.id}`)}: </b> : null}
                            {s.items.map((it, i) => (
                              <span key={it.id} data-guide-link={it.to}>
                                {i ? ", " : ""}
                                {t(it.label)}
                              </span>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {r !== "ADMIN" && user?.role === "ADMIN" ? (
                      <button
                        type="button"
                        className="btn-touch vr-btn vr-btn--ghost dashboard-print-hide"
                        onClick={() => setMenuPreview(user.id, r)}
                        data-testid={`guide-preview-${r}`}
                      >
                        {t("menu.preview.thisRole")}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="card menu-guide__card">
            <h2>{t("menu.guide.matrixTitle")}</h2>
            <p className="menu-guide__legend">
              <b>{t("menu.guide.legend")}:</b> <span>{MARK.menu} {t("menu.guide.cell.menu")}</span> · <span>{MARK.link} {t("menu.guide.cell.link")}</span> · <span>{MARK.none} {t("menu.guide.cell.none")}</span>
            </p>
            <div className="menu-guide__scroll">
              <table className="menu-guide__table" data-testid="guide-matrix">
                <thead>
                  <tr>
                    <th scope="col">{t("menu.guide.screen")}</th>
                    {roles.map((r) => (
                      <th key={r} scope="col" data-role={r} className={count(r) === 0 ? "is-empty" : undefined}>
                        {t(`role.${r}`)}
                        {MENU_LEGACY_ROLES.includes(r) ? <small> ({t("menu.guide.legacy")})</small> : null}
                        {count(r) === 0 ? <small> · {t("menu.guide.nobody")}</small> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr className="menu-guide__section">
                        <th colSpan={roles.length + 1} scope="colgroup">{t(`menu.section.${s.id}`)}</th>
                      </tr>
                      {s.items.map(({ item, cells }) => (
                        <tr key={item.id} data-item={item.id} data-to={item.to}>
                          <th scope="row">
                            {t(item.label)} <small className="vr-muted">{item.to}</small>
                          </th>
                          {roles.map((r) => (
                            <td key={r} data-role={r} data-state={cells[r]} className={`is-${cells[r]}`} title={t(`menu.guide.cell.${cells[r]}`)}>
                              {MARK[cells[r]]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
