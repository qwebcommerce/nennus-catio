import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Cash() {
  const { t } = useI18n();
  const { can } = useAuth();
  const branchId = useActiveBranchId();
  const canOperate = can("cashSession");
  const [openSession, setOpenSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCounted, setClosingCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [msg, setMsg] = useState("");

  const loadOpen = useCallback(() => {
    const bid = branchId;
    if (!bid) return Promise.resolve();
    return api(`/api/cash-sessions/open?branchId=${bid}`).then(setOpenSession);
  }, [branchId]);

  const loadList = useCallback(() => {
    const bid = branchId;
    const p = new URLSearchParams();
    if (bid) p.set("branchId", bid);
    return api(`/api/cash-sessions?${p.toString()}`).then(setSessions);
  }, [branchId]);

  useEffect(() => {
    loadOpen().catch(() => setOpenSession(null));
    loadList().catch(() => setSessions([]));
  }, [loadOpen, loadList]);

  const openShift = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId;
    if (!bid) return;
    try {
      await api("/api/cash-sessions/open", {
        method: "POST",
        body: { branchId: bid, openingFloat: Number.parseFloat(String(openingFloat).replace(",", ".")) || 0 },
      });
      setOpeningFloat("0");
      await loadOpen();
      await loadList();
      setMsg(t("cash.opened"));
      window.dispatchEvent(new Event("alerts-changed"));
    } catch (x) {
      setMsg(x.message || t("cash.failed"));
    }
  };

  const closeShift = async (e) => {
    e.preventDefault();
    if (!openSession) return;
    setMsg("");
    try {
      await api(`/api/cash-sessions/${openSession.id}/close`, {
        method: "POST",
        body: {
          closingCountedCash: Number.parseFloat(String(closingCounted).replace(",", ".")),
          note: closeNote.trim() || undefined,
        },
      });
      setClosingCounted("");
      setCloseNote("");
      await loadOpen();
      await loadList();
      setMsg(t("cash.closed"));
      window.dispatchEvent(new Event("alerts-changed"));
    } catch (x) {
      setMsg(x.message || t("cash.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("cash.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("cash.intro")}</p>

      <div className="card">
        <strong>{t("cash.status")}</strong>
        {openSession ? (
          <div style={{ marginTop: 8 }}>
            <div>
              {t("cash.openSince")} {new Date(openSession.openedAt).toLocaleString()}
            </div>
            <div>
              {t("cash.openingFloat")} {Number(openSession.openingFloat).toFixed(2)} {t("common.currency")}
            </div>
            <div>
              {t("cash.openedBy")} {openSession.openedBy?.name || "—"}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "var(--muted)" }}>{t("cash.noOpen")}</div>
        )}
      </div>

      {canOperate ? (
        <>
          {!openSession ? (
            <form className="card" onSubmit={openShift} style={{ display: "grid", gap: 12 }}>
              <strong>{t("cash.openForm")}</strong>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("cash.openRequiredHint")}</p>
              <div className="page-form-grid">
                <label className="page-form-field">
                  <span>{t("cash.openingFloat")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    style={inp}
                  />
                </label>
              </div>
              <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 220 }}>
                {t("cash.openBtn")}
              </button>
            </form>
          ) : (
            <form className="card" onSubmit={closeShift} style={{ display: "grid", gap: 12 }}>
              <strong>{t("cash.closeForm")}</strong>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("cash.closeHint")}</p>
              <div className="page-form-grid">
                <label className="page-form-field">
                  <span>{t("cash.countedCash")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={closingCounted}
                    onChange={(e) => setClosingCounted(e.target.value)}
                    style={inp}
                  />
                </label>
                <label className="page-form-field">
                  <span>{t("returns.note")}</span>
                  <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} style={inp} />
                </label>
              </div>
              <button type="submit" className="btn-touch" style={{ background: "var(--warning)", color: "#111", maxWidth: 220 }}>
                {t("cash.closeBtn")}
              </button>
            </form>
          )}
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("cash.noPermissionHint")}</p>
      )}

      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("cash.history")}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("returns.colDate")}</th>
              <th style={th}>{t("cash.openingFloat")}</th>
              <th style={th}>{t("cash.expected")}</th>
              <th style={th}>{t("cash.countedCash")}</th>
              <th style={th}>{t("cash.variance")}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={td}>
                  {new Date(s.openedAt).toLocaleString()}
                  {s.closedAt ? (
                    <>
                      <br />
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>→ {new Date(s.closedAt).toLocaleString()}</span>
                    </>
                  ) : null}
                </td>
                <td style={td}>{Number(s.openingFloat).toFixed(2)}</td>
                <td style={td}>{s.expectedCash != null ? Number(s.expectedCash).toFixed(2) : "—"}</td>
                <td style={td}>{s.closingCountedCash != null ? Number(s.closingCountedCash).toFixed(2) : "—"}</td>
                <td style={td}>
                  {s.cashVariance != null ? (
                    <span style={{ color: Number(s.cashVariance) !== 0 ? "var(--warning)" : "inherit" }}>
                      {Number(s.cashVariance).toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
