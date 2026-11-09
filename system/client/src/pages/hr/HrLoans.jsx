import React, { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

export default function HrLoans() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ employeeId: "", principal: "", description: "" });

  const load = async () => {
    setMsg("");
    try {
      const [loans, em] = await Promise.all([
        api("/api/employee-loans"),
        api("/api/employees"),
      ]);
      setList(loans);
      setEmployees(em.filter((e) => e.status === "ACTIVE"));
    } catch (e) {
      setMsg(e.message || t("hr.loadError"));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.employeeId || !form.principal) return;
    setMsg("");
    try {
      await api("/api/employee-loans", {
        method: "POST",
        body: {
          employeeId: form.employeeId,
          principal: Number(String(form.principal).replace(",", ".")),
          description: form.description.trim() || undefined,
        },
      });
      setForm({ employeeId: "", principal: "", description: "" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("hr.loansIntro")}</p>
      {msg ? <p style={{ color: "var(--danger, #c62828)" }}>{msg}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, width: "100%" }}>
        <select
          value={form.employeeId}
          onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          style={{ minHeight: 40, minWidth: 200 }}
        >
          <option value="">{t("hr.pickEmployee")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          placeholder={t("hr.loanAmount")}
          value={form.principal}
          onChange={(e) => setForm({ ...form, principal: e.target.value })}
          style={{ minHeight: 40, width: 120 }}
        />
        <input
          placeholder={t("hr.loanNote")}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={{ minHeight: 40, flex: 1, minWidth: 160 }}
        />
        <button type="button" className="btn-touch" onClick={submit}>
          {t("hr.addLoan")}
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
            <th>{t("hr.empName")}</th>
            <th>{t("hr.principal")}</th>
            <th>{t("hr.paid")}</th>
            <th>{t("hr.remaining")}</th>
            <th>{t("hr.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: "var(--muted)" }}>
                {t("hr.emptyLoans")}
              </td>
            </tr>
          ) : null}
          {list.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>{r.employee?.name}</td>
              <td>{Number(r.principal).toFixed(2)}</td>
              <td>{Number(r.paidAmount).toFixed(2)}</td>
              <td>{r.remaining != null ? Number(r.remaining).toFixed(2) : "—"}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
