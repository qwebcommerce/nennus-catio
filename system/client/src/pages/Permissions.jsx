import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const ROLE_TABS = [
  { id: "MANAGER", labelKey: "permissions.roleManager" },
  { id: "CASHIER", labelKey: "permissions.roleEmployee" },
];

export default function Permissions() {
  const { refreshUser } = useAuth();
  const { t } = useI18n();
  /** Module/action keys are codes: show their translated names (fall back to the code). */
  const label = (kind, key) => {
    const text = t(`perm.${kind}.${key}`);
    return text === `perm.${kind}.${key}` ? key : text;
  };
  const { showToast } = useToast();
  const [tab, setTab] = useState("MANAGER");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadOk, setLoadOk] = useState(false);
  const [modules, setModules] = useState({ MANAGER: {}, CASHIER: {} });
  const [moduleKeys, setModuleKeys] = useState([]);
  const [moduleActions, setModuleActions] = useState([]);
  const [moduleDefaults, setModuleDefaults] = useState({ MANAGER: {}, CASHIER: {} });
  /** NFR-13: version of the organisation row the matrix was loaded from. */
  const [version, setVersion] = useState(null);

  const load = async () => {
    const data = await api("/api/permissions");
    setModules({
      MANAGER: data?.modules?.MANAGER || {},
      CASHIER: data?.modules?.CASHIER || {},
    });
    setModuleKeys(data?.moduleKeys || []);
    setModuleActions(data?.moduleActions || []);
    setModuleDefaults(data?.moduleDefaults || { MANAGER: {}, CASHIER: {} });
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
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ROLE_TABS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="btn-touch"
            onClick={() => setTab(r.id)}
            style={{
              background: tab === r.id ? "var(--accent)" : "var(--surface2)",
              color: tab === r.id ? "#fff" : "var(--text)",
              minHeight: 40,
            }}
          >
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 8, overflowX: "auto" }}>
        <strong>{t("shop.modules")}</strong>
        {moduleKeys.map((mod) => (
          <div key={mod} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ minWidth: 150 }}>{label("module", mod)}</span>
            {moduleActions.map((action) => (
              <label key={action} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
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
                {label("action", action)}
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
