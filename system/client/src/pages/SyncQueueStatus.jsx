import React, { useCallback, useEffect, useState } from "react";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { listSyncQueueRows, removeSyncQueueItem } from "../offline/syncQueueList.js";
import { retrySyncQueueItem } from "../offline/syncQueue.js";

const card = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
};

export default function SyncQueueStatus() {
  const { t } = useI18n();
  const { online, syncing, pendingCount, runSync, refreshPending } = useOffline();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSyncQueueRows();
      setRows(list);
      await refreshPending();
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 8000);
    return () => clearInterval(id);
  }, [load]);

  const onSyncNow = async () => {
    setMsg("");
    try {
      const n = await runSync();
      if (n > 0) setMsg(t("syncQueue.syncedN").replace("{{n}}", String(n)));
      await load();
    } catch (e) {
      setMsg(e?.message || t("syncQueue.syncFailed"));
    }
  };

  const onRemove = async (localId) => {
    if (!window.confirm(t("syncQueue.confirmRemove"))) return;
    setMsg("");
    try {
      await removeSyncQueueItem(localId);
      await load();
      await refreshPending();
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  const onRetry = async (localId) => {
    setMsg("");
    try {
      await retrySyncQueueItem(localId);
      await load();
      await refreshPending();
      if (online) {
        const n = await runSync();
        if (n > 0) setMsg(t("syncQueue.syncedN").replace("{{n}}", String(n)));
        await load();
      } else {
        setMsg(t("syncQueue.retryQueued"));
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <h1 style={{ margin: 0 }}>{t("syncQueue.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("syncQueue.intro")}</p>

      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <span>
          {online ? t("syncQueue.statusOnline") : t("syncQueue.statusOffline")}
        </span>
        <span style={{ color: "var(--muted)" }}>|</span>
        <span>
          {t("syncQueue.pending")}: <strong>{pendingCount}</strong>
        </span>
        {syncing ? (
          <span style={{ color: "var(--accent)" }}>{t("offline.syncing")}</span>
        ) : null}
        <button type="button" className="btn-touch" onClick={onSyncNow} disabled={!online || syncing} style={{ marginInlineStart: "auto" }}>
          {t("syncQueue.syncNow")}
        </button>
        <button type="button" className="btn-touch" onClick={load} style={{ background: "var(--surface2)" }}>
          {t("pos.refresh")}
        </button>
      </div>

      {msg ? (
        <div style={{ fontSize: 14, color: "var(--muted)" }}>{msg}</div>
      ) : null}

      <div style={card}>
        {loading ? (
          <div>{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>{t("syncQueue.empty")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                  <th style={th}>{t("syncQueue.colType")}</th>
                  <th style={th}>{t("syncQueue.colId")}</th>
                  <th style={th}>{t("syncQueue.colTime")}</th>
                  <th style={th}>{t("syncQueue.colRetries")}</th>
                  <th style={th}>{t("syncQueue.colError")}</th>
                  <th style={th}>{t("syncQueue.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.localId} style={r.status === "failed" ? { background: "color-mix(in srgb, var(--danger) 8%, transparent)" } : undefined}>
                    <td style={td}>
                      {r.type}
                      {r.status === "failed" ? (
                        <div style={{ color: "var(--danger)", fontSize: 11 }}>{t("syncQueue.statusFailed")}</div>
                      ) : null}
                    </td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }} title={r.clientMutationId}>
                      {(r.clientMutationId || "").slice(0, 10)}…
                    </td>
                    <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={td}>{r.retryCount ?? 0}</td>
                    <td style={{ ...td, maxWidth: 220, wordBreak: "break-word" }}>{r.lastError || "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {r.status === "failed" ? (
                          <button
                            type="button"
                            className="btn-touch"
                            style={{ fontSize: 12, padding: "6px 10px", background: "var(--accent)", color: "#fff" }}
                            onClick={() => onRetry(r.localId)}
                          >
                            {t("syncQueue.retry")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-touch"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          onClick={() => onRemove(r.localId)}
                        >
                          {t("syncQueue.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("syncQueue.hint")}</p>
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: "1px solid var(--border)" };
const td = { padding: "10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
