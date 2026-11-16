import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { addLocalDismissedKeys, getLocalDismissedKeySet, getLocalReadKeySet } from "../alerts/localRead.js";

const card = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
};

function severityColor(sev) {
  if (sev === "critical") return "var(--danger, #c62828)";
  if (sev === "warning") return "var(--accent)";
  return "var(--muted)";
}

export default function Alerts() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const nav = useNavigate();
  const [localReadTick, setLocalReadTick] = useState(0);
  const [clearing, setClearing] = useState(false);

  const [typeLow, setTypeLow] = useState(true);
  const [typeCash, setTypeCash] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const [serverItems, setServerItems] = useState([]);
  const [readKeys, setReadKeys] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const typesParam = useMemo(() => {
    const p = [];
    if (typeLow) p.push("LOW_STOCK");
    if (typeCash) p.push("CASH_NO_SESSION");
    return p.join(",");
  }, [typeLow, typeCash]);

  const skipServerTypes = !typeLow && !typeCash;

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      if (skipServerTypes) {
        setServerItems([]);
        setReadKeys(new Set());
      } else {
        const qs = new URLSearchParams();
        if (branchId) qs.set("branchId", branchId);
        if (typesParam) qs.set("types", typesParam);
        const data = await api(`/api/notifications?${qs.toString()}`);
        setServerItems(Array.isArray(data.items) ? data.items : []);
        setReadKeys(new Set(Array.isArray(data.readKeys) ? data.readKeys : []));
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [branchId, typesParam, skipServerTypes]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const merged = useMemo(() => {
    const localRead = getLocalReadKeySet();
    const dismissed = getLocalDismissedKeySet();
    const out = [];

    for (const it of serverItems) {
      if (dismissed.has(it.key)) continue;
      const read = readKeys.has(it.key) || localRead.has(it.key);
      out.push({ ...it, source: "server", read });
    }

    out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return out;
  }, [serverItems, readKeys, localReadTick]);

  const filtered = useMemo(() => {
    if (!showUnreadOnly) return merged;
    return merged.filter((x) => !x.read);
  }, [merged, showUnreadOnly]);

  const formatTitle = (it) => {
    if (it.type === "LOW_STOCK") {
      const name =
        locale === "en" && it.payload?.productNameEn
          ? it.payload.productNameEn
          : it.payload?.productName;
      return t("alerts.title.lowStock", { name: name || "—" });
    }
    if (it.type === "CASH_NO_SESSION") {
      return t("alerts.title.cashNoSession");
    }
    return it.key;
  };

  const formatBody = (it) => {
    if (it.type === "LOW_STOCK") {
      return t("alerts.body.lowStock", {
        qty: String(it.payload?.quantity ?? ""),
        min: String(it.payload?.minStockLevel ?? ""),
      });
    }
    if (it.type === "CASH_NO_SESSION") {
      return t("alerts.body.cashNoSession");
    }
    return "";
  };

  const onMarkRead = async (it) => {
    setMsg("");
    try {
      await api("/api/notifications/mark-read", {
        method: "POST",
        body: { keys: [it.key] },
      });
      setReadKeys((prev) => new Set([...prev, it.key]));
      await load();
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  const onMarkAllRead = async () => {
    setMsg("");
    try {
      if (!skipServerTypes) {
        await api("/api/notifications/mark-all-read", {
          method: "POST",
          body: {
            branchId: branchId || undefined,
            types: typesParam || undefined,
          },
        });
      }
      setLocalReadTick((x) => x + 1);
      await load();
      window.dispatchEvent(new Event("alerts-changed"));
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  const onClearAll = async () => {
    if (merged.length === 0) return;
    setMsg("");
    setClearing(true);
    try {
      const keys = merged.map((it) => it.key);
      if (!skipServerTypes) {
        await api("/api/notifications/mark-all-read", {
          method: "POST",
          body: {
            branchId: branchId || undefined,
            types: typesParam || undefined,
          },
        });
      }
      addLocalDismissedKeys(keys);
      setLocalReadTick((x) => x + 1);
      setMsg(t("alerts.cleared"));
      await load();
      window.dispatchEvent(new Event("alerts-changed"));
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setClearing(false);
    }
  };

  const onAction = (it) => {
    if (it.action?.path) {
      const h = it.action.hash ? `#${it.action.hash}` : "";
      nav(`${it.action.path}${h}`);
    }
  };

  const unreadCount = merged.filter((x) => !x.read).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <h1 style={{ margin: 0 }}>{t("alerts.pageTitle")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("alerts.intro")}</p>

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={typeLow} onChange={(e) => setTypeLow(e.target.checked)} />
          {t("alerts.type.lowStock")}
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={typeCash} onChange={(e) => setTypeCash(e.target.checked)} />
          {t("alerts.type.cash")}
        </label>

        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginInlineStart: 8 }}>
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={(e) => setShowUnreadOnly(e.target.checked)}
          />
          {t("alerts.unreadOnly")}
        </label>

        <button type="button" className="btn-touch" onClick={load} style={{ marginInlineStart: "auto", background: "var(--surface2)" }}>
          {t("pos.refresh")}
        </button>
      </div>

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>
          {t("alerts.unreadBadge", { n: String(unreadCount) })}
        </span>
        <button type="button" className="btn-touch" onClick={onMarkAllRead} disabled={unreadCount === 0}>
          {t("alerts.markAllRead")}
        </button>
        <button
          type="button"
          className="btn-touch"
          onClick={onClearAll}
          disabled={merged.length === 0 || clearing}
          style={{ background: "var(--danger)", color: "#fff" }}
        >
          {clearing ? t("common.loading") : t("alerts.clearAll")}
        </button>
      </div>

      {msg ? <div style={{ fontSize: 14, color: "var(--muted)" }}>{msg}</div> : null}

      <div style={card}>
        {loading ? (
          <div>{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>{t("alerts.empty")}</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((it) => (
              <li
                key={it.key}
                style={{
                  borderInlineStart: `4px solid ${severityColor(it.severity)}`,
                  padding: "10px 12px",
                  background: it.read ? "var(--surface2)" : "var(--surface)",
                  opacity: it.read ? 0.85 : 1,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{formatTitle(it)}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{formatBody(it)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                      {new Date(it.at).toLocaleString(locale === "en" ? "en-GB" : "ar-SA")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {it.action?.path ? (
                      <button type="button" className="btn-touch" onClick={() => onAction(it)}>
                        {t("alerts.openAction")}
                      </button>
                    ) : null}
                    {!it.read ? (
                      <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => onMarkRead(it)}>
                        {t("alerts.markRead")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
