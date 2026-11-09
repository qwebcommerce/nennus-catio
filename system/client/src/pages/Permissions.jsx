import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  DEFAULT_CASHIER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  PERMISSION_KEYS,
} from "../lib/permissions.js";

const ROLE_TABS = [
  { id: "MANAGER", labelKey: "permissions.roleManager" },
  { id: "CASHIER", labelKey: "permissions.roleEmployee" },
];

export default function Permissions() {
  const { refreshUser } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [tab, setTab] = useState("MANAGER");
  const [matrices, setMatrices] = useState({
    MANAGER: { ...DEFAULT_MANAGER_PERMISSIONS },
    CASHIER: { ...DEFAULT_CASHIER_PERMISSIONS },
  });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadOk, setLoadOk] = useState(false);

  const load = async () => {
    const data = await api("/api/permissions");
    setMatrices({
      MANAGER: { ...DEFAULT_MANAGER_PERMISSIONS, ...(data?.matrices?.MANAGER || {}) },
      CASHIER: { ...DEFAULT_CASHIER_PERMISSIONS, ...(data?.matrices?.CASHIER || {}) },
    });
    setDirty(false);
    setLoadOk(true);
  };

  useEffect(() => {
    load().catch((e) => {
      setLoadOk(false);
      showToast(e.message || "Failed to load", "error");
    });
  }, []);

  const toggle = (key) => {
    if (!loadOk) return;
    setMatrices((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], [key]: !prev[tab][key] },
    }));
    setDirty(true);
  };

  const resetTab = () => {
    if (!loadOk) return;
    const defaults = tab === "MANAGER" ? DEFAULT_MANAGER_PERMISSIONS : DEFAULT_CASHIER_PERMISSIONS;
    setMatrices((prev) => ({ ...prev, [tab]: { ...defaults } }));
    setDirty(true);
  };

  const save = async () => {
    if (!loadOk) {
      showToast(t("permissions.loadRequired") || "Reload permissions before saving", "error");
      return;
    }
    setBusy(true);
    try {
      await api("/api/permissions", {
        method: "PUT",
        body: {
          MANAGER: matrices.MANAGER,
          CASHIER: matrices.CASHIER,
        },
      });
      await refreshUser?.();
      setDirty(false);
      showToast(t("permissions.saved"), "success");
    } catch (e) {
      showToast(e.message || t("permissions.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const current = matrices[tab] || {};

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

      <div className="card" style={{ display: "grid", gap: 0 }}>
        {PERMISSION_KEYS.map((key) => (
          <label
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 4px",
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            <span>
              <strong style={{ display: "block" }}>{t(`permissions.key.${key}`)}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {t(`permissions.keyHint.${key}`)}
              </span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(current[key])}
              onChange={() => toggle(key)}
              style={{ width: 20, height: 20 }}
            />
          </label>
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
