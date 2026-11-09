import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

function emptyManualLines() {
  return [
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ];
}

export default function Accounting() {
  const { t } = useI18n();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [trial, setTrial] = useState(null);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualDesc, setManualDesc] = useState("");
  const [manualLines, setManualLines] = useState(() => emptyManualLines());
  const [manualList, setManualList] = useState([]);

  const activeAccounts = useMemo(
    () => (accounts || []).filter((a) => a.active !== false),
    [accounts]
  );

  const loadAccounts = async () => {
    setLoading(true);
    setMsg("");
    try {
      const list = await api("/api/accounting/accounts");
      setAccounts(Array.isArray(list) ? list : list?.accounts || []);
      if (!(Array.isArray(list) ? list : list?.accounts || []).length) {
        setMsg(t("accounting.noAccounts"));
      }
    } catch (e) {
      setMsg(e.message || t("accounting.msgInitFail"));
    } finally {
      setLoading(false);
    }
  };

  const loadManualJournals = async () => {
    try {
      const q = new URLSearchParams();
      q.set("manualOnly", "1");
      q.set("from", new Date(`${from}T00:00:00`).toISOString());
      q.set("to", new Date(`${to}T23:59:59`).toISOString());
      const rows = await api(`/api/accounting/journals?${q.toString()}`);
      setManualList(Array.isArray(rows) ? rows : []);
    } catch {
      setManualList([]);
    }
  };

  useEffect(() => {
    loadAccounts().catch(() => {});
  }, []);

  const initAccounts = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await api("/api/accounting/accounts/init-defaults", { method: "POST" });
      setAccounts(res.accounts || []);
      setMsg(t("accounting.msgInitDone", { n: String(res.count || 0) }));
    } catch (e) {
      setMsg(e.message || t("accounting.msgInitFail"));
    } finally {
      setLoading(false);
    }
  };

  const rebuild = async () => {
    setLoading(true);
    setMsg("");
    try {
      await api("/api/accounting/journals/rebuild", {
        method: "POST",
        body: {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
        },
      });
      setMsg(t("accounting.msgRebuildDone"));
      await loadManualJournals();
    } catch (e) {
      setMsg(e.message || t("accounting.msgRebuildFail"));
    } finally {
      setLoading(false);
    }
  };

  const loadTrial = async () => {
    setLoading(true);
    setMsg("");
    try {
      const q = new URLSearchParams();
      q.set("from", new Date(`${from}T00:00:00`).toISOString());
      q.set("to", new Date(`${to}T23:59:59`).toISOString());
      const res = await api(`/api/accounting/trial-balance?${q.toString()}`);
      setTrial(res);
      setMsg(res.balanced ? t("accounting.msgBalanced") : t("accounting.msgUnbalanced"));
      await loadManualJournals();
    } catch (e) {
      setMsg(e.message || t("accounting.msgTrialFail"));
    } finally {
      setLoading(false);
    }
  };

  const postManual = async () => {
    setLoading(true);
    setMsg("");
    try {
      await api("/api/accounting/journals", {
        method: "POST",
        body: {
          entryDate: new Date(`${manualDate}T12:00:00`).toISOString(),
          description: manualDesc.trim(),
          lines: manualLines.map((l) => ({
            accountId: l.accountId,
            debit: Number(String(l.debit).replace(",", ".")) || 0,
            credit: Number(String(l.credit).replace(",", ".")) || 0,
          })),
        },
      });
      setManualDesc("");
      setManualLines(emptyManualLines());
      setMsg(t("accounting.msgManualDone"));
      await loadManualJournals();
      await loadTrial();
    } catch (e) {
      setMsg(e.message || t("accounting.msgManualFail"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("accounting.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("accounting.intro")}</p>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("accounting.step1")}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-touch" type="button" onClick={loadAccounts} disabled={loading} style={{ maxWidth: 260 }}>
            {t("accounting.loadAccounts")}
          </button>
          <button className="btn-touch" type="button" onClick={initAccounts} disabled={loading} style={{ maxWidth: 260, background: "var(--accent)", color: "#fff" }}>
            {t("accounting.initBtn")}
          </button>
        </div>
        {accounts.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                  <th style={{ padding: "6px 8px" }}>{t("accounting.thCode")}</th>
                  <th style={{ padding: "6px 8px" }}>{t("accounting.thAccount")}</th>
                  <th style={{ padding: "6px 8px" }}>{t("accounting.thType")}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id || a.code} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px" }}>{a.code}</td>
                    <td style={{ padding: "6px 8px" }}>{a.name}</td>
                    <td style={{ padding: "6px 8px" }}>{a.type || a.accountType || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("accounting.noAccounts")}</div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("accounting.step2")}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
          <button className="btn-touch" type="button" onClick={rebuild} disabled={loading} style={{ background: "var(--accent)", color: "#fff" }}>
            {t("accounting.generateJournals")}
          </button>
          <button className="btn-touch" type="button" onClick={loadTrial} disabled={loading}>
            {t("accounting.showTrial")}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("accounting.step3")}</strong>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("accounting.manualIntro")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={inp} />
          <input
            style={{ ...inp, flex: "1 1 220px" }}
            value={manualDesc}
            onChange={(e) => setManualDesc(e.target.value)}
            placeholder={t("accounting.manualDescPh")}
          />
        </div>
        {manualLines.map((line, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(160px, 2fr) 1fr 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              style={inp}
              value={line.accountId}
              onChange={(e) => {
                const next = [...manualLines];
                next[idx] = { ...next[idx], accountId: e.target.value };
                setManualLines(next);
              }}
            >
              <option value="">{t("accounting.pickAccount")}</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <input
              style={inp}
              type="number"
              min={0}
              step="0.01"
              placeholder={t("accounting.thDebit")}
              value={line.debit}
              onChange={(e) => {
                const next = [...manualLines];
                next[idx] = { ...next[idx], debit: e.target.value, credit: e.target.value ? "" : next[idx].credit };
                setManualLines(next);
              }}
            />
            <input
              style={inp}
              type="number"
              min={0}
              step="0.01"
              placeholder={t("accounting.thCredit")}
              value={line.credit}
              onChange={(e) => {
                const next = [...manualLines];
                next[idx] = { ...next[idx], credit: e.target.value, debit: e.target.value ? "" : next[idx].debit };
                setManualLines(next);
              }}
            />
            <button
              type="button"
              className="btn-touch"
              disabled={manualLines.length <= 2}
              onClick={() => setManualLines(manualLines.filter((_, i) => i !== idx))}
            >
              {t("common.delete")}
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-touch"
            onClick={() => setManualLines([...manualLines, { accountId: "", debit: "", credit: "" }])}
          >
            {t("accounting.addLine")}
          </button>
          <button
            type="button"
            className="btn-touch"
            style={{ background: "var(--accent)", color: "#fff" }}
            disabled={loading || !manualDesc.trim()}
            onClick={postManual}
          >
            {t("accounting.postManual")}
          </button>
          <button type="button" className="btn-touch" disabled={loading} onClick={loadManualJournals}>
            {t("accounting.refreshManual")}
          </button>
        </div>
        {manualList.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                  <th style={th}>{t("accounting.thDate")}</th>
                  <th style={th}>{t("accounting.thDesc")}</th>
                  <th style={th}>{t("accounting.thLines")}</th>
                </tr>
              </thead>
              <tbody>
                {manualList.map((j) => (
                  <tr key={j.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>{String(j.entryDate).slice(0, 10)}</td>
                    <td style={td}>{j.description}</td>
                    <td style={td}>
                      {(j.lines || [])
                        .map(
                          (l) =>
                            `${l.account?.code || "?"} D${Number(l.debit || 0).toFixed(2)}/C${Number(l.credit || 0).toFixed(2)}`
                        )
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {trial ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <strong>{t("accounting.trialTitle")}</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("accounting.thCode")}</th>
                <th style={th}>{t("accounting.thAccount")}</th>
                <th style={th}>{t("accounting.thType")}</th>
                <th style={th}>{t("accounting.thDebit")}</th>
                <th style={th}>{t("accounting.thCredit")}</th>
              </tr>
            </thead>
            <tbody>
              {trial.lines?.map((l) => (
                <tr key={l.accountCode}>
                  <td style={td}>{l.accountCode}</td>
                  <td style={td}>{l.accountName}</td>
                  <td style={td}>{l.type}</td>
                  <td style={td}>{Number(l.debit || 0).toFixed(2)}</td>
                  <td style={td}>{Number(l.credit || 0).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>
                  {t("accounting.totals")}
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{Number(trial.totals?.debit || 0).toFixed(2)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{Number(trial.totals?.credit || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
