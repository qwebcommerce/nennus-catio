import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { listSyncQueueRows } from "../offline/syncQueueList.js";
import { addLocalReadKeys, addLocalDismissedKeys, getLocalDismissedKeySet, getLocalReadKeySet } from "../alerts/localRead.js";

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
  const [typeExp, setTypeExp] = useState(true);
  const [typeCash, setTypeCash] = useState(true);
  const [typeSync, setTypeSync] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const [serverItems, setServerItems] = useState([]);
  const [readKeys, setReadKeys] = useState(new Set());
  const [syncRows, setSyncRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const typesParam = useMemo(() => {
    const p = [];
    if (typeLow) p.push("LOW_STOCK");
    if (typeExp) p.push("EXPIRY");
    if (typeCash) p.push("CASH_NO_SESSION");
    return p.join(",");
  }, [typeLow, typeExp, typeCash]);

  const skipServerTypes = !typeLow && !typeExp && !typeCash;

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
      const rows = await listSyncQueueRows();
      setSyncRows(rows);
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

    if (typeSync) {
      for (const row of syncRows) {
        const key = `sync-local:${row.localId}`;
        if (dismissed.has(key)) continue;
        const read = localRead.has(key);
        const hasIssue = !!(row.lastError || (row.retryCount ?? 0) > 0);
        const severity = hasIssue ? "warning" : "info";
        out.push({
          key,
          type: "SYNC_QUEUE",
          severity,
          at: new Date(row.createdAt).toISOString(),
          branchId: row.payload?.branchId ?? null,
          branchName: null,
          branchNameEn: null,
          payload: {
            syncType: row.type,
            clientMutationId: row.clientMutationId,
            lastError: row.lastError,
            retryCount: row.retryCount ?? 0,
          },
          action: { path: "/sync-queue" },
          source: "local",
          read,
        });
      }
    }

    out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return out;
  }, [serverItems, readKeys, syncRows, typeSync, localReadTick]);

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
    if (it.type === "EXPIRY") {
      const name =
        locale === "en" && it.payload?.productNameEn
          ? it.payload.productNameEn
          : it.payload?.productName;
      if (it.payload?.status === "expired") {
        return t("alerts.title.expiryExpired", { name: name || "—" });
      }
      if (it.payload?.status === "soon") {
        return t("alerts.title.expirySoon", {
          name: name || "—",
          days: String(it.payload?.daysUntilExpiry ?? ""),
        });
      }
      return t("alerts.title.expiryToday", { name: name || "—" });
    }
    if (it.type === "CASH_NO_SESSION") {
      return t("alerts.title.cashNoSession");
    }
    if (it.type === "SYNC_QUEUE") {
      return t("alerts.title.sync", { type: String(it.payload?.syncType || "") });
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
    if (it.type === "EXPIRY") {
      return t("alerts.body.expiry", {
        days: String(it.payload?.daysUntilExpiry ?? ""),
        status: String(it.payload?.status ?? ""),
      });
    }
    if (it.type === "CASH_NO_SESSION") {
      return t("alerts.body.cashNoSession");
    }
    if (it.type === "SYNC_QUEUE") {
      if (it.payload?.lastError) return it.payload.lastError;
      return t("alerts.body.syncPending", { n: String(it.payload?.retryCount ?? 0) });
    }
    return "";
  };

  const onMarkRead = async (it) => {
    setMsg("");
    try {
      if (it.key.startsWith("sync-local:")) {
        addLocalReadKeys([it.key]);
        setLocalReadTick((x) => x + 1);
      } else {
        await api("/api/notifications/mark-read", {
          method: "POST",
          body: { keys: [it.key] },
        });
        setReadKeys((prev) => new Set([...prev, it.key]));
      }
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
      const syncKeys = syncRows.map((r) => `sync-local:${r.localId}`);
      if (syncKeys.length) addLocalReadKeys(syncKeys);
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
          <input type="checkbox" checked={typeExp} onChange={(e) => setTypeExp(e.target.checked)} />
          {t("alerts.type.expiry")}
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={typeCash} onChange={(e) => setTypeCash(e.target.checked)} />
          {t("alerts.type.cash")}
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={typeSync} onChange={(e) => setTypeSync(e.target.checked)} />
          {t("alerts.type.sync")}
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

      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
        {t("alerts.footerHint")}{" "}
        <Link to="/sync-queue" style={{ color: "var(--accent)" }}>
          {t("nav.syncQueue")}
        </Link>
      </p>
    </div>
  );
}
