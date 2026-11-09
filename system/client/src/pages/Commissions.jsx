import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Commissions() {
  const { t } = useI18n();
  const [employees, setEmployees] = useState([]);
  const [rules, setRules] = useState([]);
  const [entries, setEntries] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [percent, setPercent] = useState("10");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [emps, rs, es] = await Promise.all([
      api("/api/employees"),
      api("/api/commissions/rules"),
      api("/api/commissions/entries"),
    ]);
    setEmployees(emps || []);
    setRules(rs || []);
    setEntries(es?.entries || []);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const addRule = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/commissions/rules", {
        method: "POST",
        body: { employeeId, percent: Number(percent) || 0 },
      });
      await load();
      setMsg(t("commissions.msgSaved"));
    } catch (x) {
      setMsg(x.message || t("commissions.msgSaveFail"));
    }
  };

  const toggleRule = async (rule) => {
    await api(`/api/commissions/rules/${rule.id}`, {
      method: "PATCH",
      body: { active: !rule.active },
    });
    await load();
  };

  const total = entries.reduce((s, e) => s + Number(e.commissionAmount || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("commissions.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("commissions.intro")}</p>

      <form className="card" onSubmit={addRule} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("commissions.employee")}</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ ...inp, minWidth: 220 }}>
            <option value="">{t("commissions.pickEmployee")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("commissions.percent")}</span>
          <input type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} style={{ ...inp, width: 120 }} />
        </label>
        <button className="btn-touch" type="submit" style={{ background: "var(--accent)", color: "#fff" }}>
          {t("commissions.saveRule")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("commissions.rulesTitle")}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("commissions.employee")}</th>
              <th style={th}>{t("commissions.thPercent")}</th>
              <th style={th}>{t("commissions.thStatus")}</th>
              <th style={th}>{t("commissions.thAction")}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.employee?.name || "—"}</td>
                <td style={td}>{Number(r.percent || 0).toFixed(2)}%</td>
                <td style={td}>{r.active ? "ACTIVE" : "OFF"}</td>
                <td style={td}>
                  <button type="button" className="btn-touch" onClick={() => toggleRule(r)}>
                    {r.active ? t("commissions.disable") : t("commissions.enable")}
                  </button>
                </td>
              </tr>
            ))}
            {!rules.length ? <tr><td style={td} colSpan={4}>{t("commissions.noRules")}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("commissions.entriesTitle", { total: total.toFixed(2) })}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("commissions.thTime")}</th>
              <th style={th}>{t("commissions.employee")}</th>
              <th style={th}>{t("commissions.thBase")}</th>
              <th style={th}>{t("commissions.thPercent")}</th>
              <th style={th}>{t("commissions.thCommission")}</th>
              <th style={th}>{t("commissions.thAppointment")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={td}>{new Date(e.createdAt).toLocaleString()}</td>
                <td style={td}>{e.employee?.name || "—"}</td>
                <td style={td}>{Number(e.baseAmount || 0).toFixed(2)}</td>
                <td style={td}>{Number(e.percent || 0).toFixed(2)}%</td>
                <td style={td}>{Number(e.commissionAmount || 0).toFixed(2)}</td>
                <td style={td}>{e.appointmentId || "—"}</td>
              </tr>
            ))}
            {!entries.length ? <tr><td style={td} colSpan={6}>{t("commissions.noEntries")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
