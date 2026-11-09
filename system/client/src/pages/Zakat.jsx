import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export default function Zakat() {
  const { t } = useI18n();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const [snap, setSnap] = useState(null);
  const [msg, setMsg] = useState("");
  const [nisab, setNisab] = useState("");
  const [ratePct, setRatePct] = useState("2.5");
  const [manualAdd, setManualAdd] = useState("");
  const [manualDeduct, setManualDeduct] = useState("");

  const load = () => {
    setMsg("");
    const q = new URLSearchParams();
    if (branchId) q.set("branchId", branchId);
    return api(`/api/zakat/snapshot?${q.toString()}`)
      .then(setSnap)
      .catch((e) => {
        setMsg(e.message || t("zakat.loadError"));
        setSnap(null);
      });
  };

  useEffect(() => {
    load();
  }, [branchId]);

  const nisabNum = round2(Number(String(nisab).replace(",", ".")) || 0);
  const rateNum = Math.min(100, Math.max(0, Number(String(ratePct).replace(",", ".")) || 0));
  const addNum = round2(Number(String(manualAdd).replace(",", ".")) || 0);
  const dedNum = round2(Number(String(manualDeduct).replace(",", ".")) || 0);

  const base = snap ? snap.suggestedBase + addNum - dedNum : 0;
  const aboveNisab = Math.max(0, base - nisabNum);
  const zakatDue = round2((aboveNisab * rateNum) / 100);

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ marginTop: 0 }}>{t("zakat.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>{t("zakat.intro")}</p>

      <button type="button" className="btn-touch" style={{ marginBottom: 16, background: "var(--surface2)" }} onClick={() => load()}>
        {t("zakat.refresh")}
      </button>

      {msg ? <p style={{ color: "var(--danger)" }}>{msg}</p> : null}

      {snap ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px" }}>{t("zakat.rowStock")}</td>
                  <td style={{ padding: "10px 6px", fontWeight: 700, textAlign: "end" }}>
                    {snap.stockValueAtCost.toFixed(2)} {t("common.currency")}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px" }}>{t("zakat.rowReceivables")}</td>
                  <td style={{ padding: "10px 6px", fontWeight: 700, textAlign: "end" }}>
                    {snap.receivables.toFixed(2)} {t("common.currency")}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px" }}>{t("zakat.rowEmployeeLoans")}</td>
                  <td style={{ padding: "10px 6px", fontWeight: 700, textAlign: "end" }}>
                    {snap.employeeLoansOutstanding.toFixed(2)} {t("common.currency")}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px" }}>{t("zakat.rowCashSessions")}</td>
                  <td style={{ padding: "10px 6px", fontWeight: 700, textAlign: "end" }}>
                    {snap.cashInOpenSessions.toFixed(2)} {t("common.currency")}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 6px" }}>{t("zakat.rowSuggested")}</td>
                  <td style={{ padding: "10px 6px", fontWeight: 800, textAlign: "end", fontSize: 16 }}>
                    {snap.suggestedBase.toFixed(2)} {t("common.currency")}
                  </td>
                </tr>
              </tbody>
            </table>
            {snap.inventoryLinesWithoutCost > 0 ? (
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--warning)" }}>{t("zakat.warnNoCost", { n: snap.inventoryLinesWithoutCost })}</p>
            ) : null}
            <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--muted)" }}>{t("zakat.noteCash")}</p>
          </div>

          <div className="card" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            <strong>{t("zakat.sectionManual")}</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("zakat.nisab")}</span>
                <input
                  value={nisab}
                  onChange={(e) => setNisab(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("zakat.rate")}</span>
                <input
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  inputMode="decimal"
                  style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("zakat.manualAdd")}</span>
                <input
                  value={manualAdd}
                  onChange={(e) => setManualAdd(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("zakat.manualDeduct")}</span>
                <input
                  value={manualDeduct}
                  onChange={(e) => setManualDeduct(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              {t("zakat.baseAfterManual")}: <strong>{round2(base).toFixed(2)}</strong> {t("common.currency")}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              {t("zakat.aboveNisab")}: <strong>{aboveNisab.toFixed(2)}</strong> {t("common.currency")}
            </p>
            <div
              style={{
                marginTop: 8,
                padding: 14,
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              {t("zakat.estimatedDue")}: {zakatDue.toFixed(2)} {t("common.currency")}
            </div>
          </div>

          {snap.sessionBreakdown?.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <strong>{t("zakat.sessionDetail")}</strong>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
                    <th style={{ padding: "6px 4px", textAlign: "end" }}>{t("zakat.colEstimated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.sessionBreakdown.map((s) => (
                    <tr key={s.sessionId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 4px", textAlign: "end" }}>
                        {Number(s.estimatedCash).toFixed(2)} {t("common.currency")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{t("zakat.disclaimer")}</p>
        </>
      ) : (
        !msg && <p>{t("common.loading")}</p>
      )}
    </div>
  );
}
