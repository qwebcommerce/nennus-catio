import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
// fix-rf: link to "Who sees what"
import { Link } from "react-router-dom";

/** One tab per editable role (the top admin always has everything). Order and labels: */
const ROLE_ORDER = ["SUPERVISOR", "SALES", "ACCOUNTANT", "B2B", "DRIVER", "MANAGER", "CASHIER"];
const LEGACY = ["MANAGER", "CASHIER"];

export default function Permissions() {
  const { refreshUser } = useAuth();
  const { t } = useI18n();
  /** Module/action keys are codes: show their translated names (fall back to the code). */
  const label = (kind, key) => {
    const text = t(`perm.${kind}.${key}`);
    return text === `perm.${kind}.${key}` ? key : text;
  };
  /** An action may have a module-specific name (e.g. b2b → edit = "Cash receipts"). */
  const actionLabel = (mod, action) => {
    const own = t(`perm.action.${mod}.${action}`);
    return own === `perm.action.${mod}.${action}` ? label("action", action) : own;
  };
  const { showToast } = useToast();
  const [tab, setTab] = useState("SUPERVISOR");
  const [roles, setRoles] = useState(ROLE_ORDER.filter((r) => !LEGACY.includes(r)));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadOk, setLoadOk] = useState(false);
  const [modules, setModules] = useState({});
  const [moduleKeys, setModuleKeys] = useState([]);
  const [moduleActions, setModuleActions] = useState([]);
  /** Some modules use only some actions (e.g. complimentary → create). */
  const [moduleActionsFor, setModuleActionsFor] = useState({});
  const [moduleDefaults, setModuleDefaults] = useState({});
  /** NFR-13: version of the organisation row the matrix was loaded from. */
  const [version, setVersion] = useState(null);

  const load = async () => {
    const data = await api("/api/permissions");
    const serverRoles = Array.isArray(data?.roles) ? data.roles : ROLE_ORDER;
    const counts = data?.userCounts || {};
    // Legacy roles only show while someone still has one.
    const shown = ROLE_ORDER.filter((r) => serverRoles.includes(r) && (!LEGACY.includes(r) || counts[r] > 0));
    setRoles(shown);
    setTab((cur) => (shown.includes(cur) ? cur : shown[0]));
    setModules(Object.fromEntries(shown.map((r) => [r, data?.modules?.[r] || {}])));
    setModuleKeys(data?.moduleKeys || []);
    setModuleActions(data?.moduleActions || []);
    setModuleActionsFor(data?.moduleActionsFor || {});
    setModuleDefaults(data?.moduleDefaults || {});
    setVersion(data?.version ?? null);
    setDirty(false);
    setLoadOk(true);
  };

  useEffect(() => {
    load().catch((e) => {
      setLoadOk(false);
      showToast(e.message || t("errors.generic"), "error");
    });
  }, []);

  const resetTab = () => {
    if (!loadOk) return;
    setModules((prev) => ({ ...prev, [tab]: JSON.parse(JSON.stringify(moduleDefaults[tab] || {})) }));
    setDirty(true);
  };

  const save = async () => {
    if (!loadOk) {
      showToast(t("permissions.loadRequired") || "Reload permissions before saving", "error");
      return;
    }
    setBusy(true);
    try {
      const saved = await api("/api/permissions", {
        method: "PUT",
        // The module matrix is the single source of truth (FR-08); legacy keys are derived from it.
        body: { modules, version },
      });
      setVersion(saved?.version ?? null);
      await refreshUser?.();
      setDirty(false);
      showToast(t("permissions.saved"), "success");
    } catch (e) {
      showToast(isStaleEdit(e) ? editErrorMessage(e, t) : e.message || t("permissions.saveFailed"), "error");
      // Someone else changed the settings row: reload the matrix they saved.
      if (isStaleEdit(e)) await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("permissions.title")}</h1>
        <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
          {t("permissions.intro")}
        </p>
        {/* fix-rf */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <Link to="/permissions/guide" className="btn-touch" data-testid="perm-guide-link" style={{ background: "var(--surface2)", color: "var(--text)", textDecoration: "none" }}>
            {t("menu.item.guide")}
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label={t("permissions.rolesLabel")}>
        {roles.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-role={id}
            className="btn-touch"
            onClick={() => setTab(id)}
            style={{
              background: tab === id ? "var(--accent)" : "var(--surface2)",
              color: tab === id ? "#fff" : "var(--text)",
              minHeight: 40,
            }}
          >
            {t(`role.${id}`)}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{t(`permissions.roleHint.${tab}`)}</p>

      <div className="card" style={{ display: "grid", gap: 8, overflowX: "auto" }}>
        <strong>{t("shop.modules")}</strong>
        {moduleKeys.map((mod) => (
          <div key={mod} data-module={mod} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ minWidth: 150 }}>{label("module", mod)}</span>
            {(moduleActionsFor[mod] || moduleActions).map((action) => (
              <label key={action} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  data-action={action}
                  checked={Boolean(modules[tab]?.[mod]?.[action])}
                  onChange={(e) => {
                    setModules((prev) => ({
                      ...prev,
                      [tab]: {
                        ...prev[tab],
                        [mod]: { ...prev[tab]?.[mod], [action]: e.target.checked },
                      },
                    }));
                    setDirty(true);
                  }}
                />
                {actionLabel(mod, action)}
              </label>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          className="btn-touch"
          disabled={busy || !dirty || !loadOk}
          onClick={save}
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {t("permissions.save")}
        </button>
        <button
          type="button"
          className="btn-touch"
          disabled={busy || !loadOk}
          onClick={resetTab}
          style={{ background: "var(--surface2)", color: "var(--text)" }}
        >
          {t("permissions.resetRole")}
        </button>
      </div>
    </div>
  );
}
