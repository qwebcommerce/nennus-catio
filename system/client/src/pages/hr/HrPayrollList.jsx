import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

export default function HrPayrollList() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const load = async () => {
    setMsg("");
    try {
      const rows = await api("/api/payroll/periods");
      setList(rows);
    } catch (e) {
      setMsg(e.message || t("hr.loadError"));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createPeriod = async () => {
    setMsg("");
    try {
      await api("/api/payroll/periods", {
        method: "POST",
        body: { year: Number(year), month: Number(month) },
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("hr.payrollIntro")}</p>
      {msg ? <p style={{ color: "var(--danger, #c62828)" }}>{msg}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ minHeight: 40, width: 100 }}
          aria-label="year"
        />
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ minHeight: 40 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={String(m)}>
              {m}
            </option>
          ))}
        </select>
        <button type="button" className="btn-touch" onClick={createPeriod}>
          {t("hr.createPeriod")}
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
            <th>{t("hr.colPeriod")}</th>
            <th>{t("hr.colStatus")}</th>
            <th>{t("hr.colLines")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 16, color: "var(--muted)" }}>
                {t("hr.emptyPayroll")}
              </td>
            </tr>
          ) : null}
          {list.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>
                {r.year} / {r.month}
              </td>
              <td>{r.status}</td>
              <td>{r._count?.lines ?? 0}</td>
              <td>
                <Link to={`/hr/payroll/${r.id}`} className="btn-touch" style={{ display: "inline-block", textDecoration: "none" }}>
                  {t("hr.open")}
                </Link>
                {r.status === "DRAFT" ? (
                  <button
                    type="button"
                    className="btn-touch"
                    style={{ marginInlineStart: 8, background: "var(--danger)", color: "#fff" }}
                    onClick={async () => {
                      if (!window.confirm(t("hr.confirmDeletePeriod"))) return;
                      setMsg("");
                      try {
                        await api(`/api/payroll/periods/${r.id}`, { method: "DELETE" });
                        await load();
                      } catch (e) {
                        setMsg(e.message || t("hr.saveError"));
                      }
                    }}
                  >
                    {t("common.delete")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
