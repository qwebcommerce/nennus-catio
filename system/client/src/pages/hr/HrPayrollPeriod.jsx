import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

export default function HrPayrollPeriod() {
  const { periodId } = useParams();
  const { t } = useI18n();
  const [period, setPeriod] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [newLine, setNewLine] = useState({
    employeeId: "",
    baseAmount: "",
    allowancesTotal: "0",
    deductionsTotal: "0",
    loanDeduction: "0",
  });
  const [notesDraft, setNotesDraft] = useState("");

  const load = useCallback(async () => {
    if (!periodId) return;
    setMsg("");
    try {
      const [p, em] = await Promise.all([
        api(`/api/payroll/periods/${periodId}`),
        api("/api/employees"),
      ]);
      setPeriod(p);
      setNotesDraft(p.notes || "");
      setEmployees(em.filter((e) => e.status === "ACTIVE"));
    } catch (e) {
      setMsg(e.message || t("hr.loadError"));
    }
  }, [periodId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateLine = async (line, patch) => {
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/lines/${line.id}`, {
        method: "PATCH",
        body: patch,
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const generateLines = async () => {
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/generate-lines`, { method: "POST" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const addLine = async () => {
    if (!newLine.employeeId) return;
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/lines`, {
        method: "POST",
        body: {
          employeeId: newLine.employeeId,
          baseAmount: Number(String(newLine.baseAmount).replace(",", ".")) || 0,
          allowancesTotal: Number(String(newLine.allowancesTotal).replace(",", ".")) || 0,
          deductionsTotal: Number(String(newLine.deductionsTotal).replace(",", ".")) || 0,
          loanDeduction: Number(String(newLine.loanDeduction).replace(",", ".")) || 0,
        },
      });
      setNewLine({
        employeeId: "",
        baseAmount: "",
        allowancesTotal: "0",
        deductionsTotal: "0",
        loanDeduction: "0",
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const approve = async () => {
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/approve`, { method: "POST" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const markPaid = async () => {
    if (!window.confirm(t("hr.confirmMarkPaid"))) return;
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/mark-paid`, { method: "POST" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const saveNotes = async () => {
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}`, {
        method: "PATCH",
        body: { notes: notesDraft },
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const deleteLine = async (line) => {
    if (!window.confirm(t("hr.confirmDeleteLine"))) return;
    setMsg("");
    try {
      await api(`/api/payroll/periods/${periodId}/lines/${line.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  if (!period) {
    return (
      <div>
        {msg || t("common.loading")}
        <div style={{ marginTop: 12 }}>
          <Link to="/hr/payroll">{t("hr.backPayroll")}</Link>
        </div>
      </div>
    );
  }

  const draft = period.status === "DRAFT";
  const approved = period.status === "APPROVED";

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link to="/hr/payroll">{t("hr.backPayroll")}</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>
        {period.year} / {period.month} — {period.status}
      </h2>
      {msg ? <p style={{ color: "var(--danger, #c62828)" }}>{msg}</p> : null}

      {draft ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 16, maxWidth: 520 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("hr.notes")}</span>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}
            />
          </label>
          <button type="button" className="btn-touch" style={{ maxWidth: 200 }} onClick={saveNotes}>
            {t("hr.saveNotes")}
          </button>
        </div>
      ) : period.notes ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{period.notes}</p>
      ) : null}

      {draft ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn-touch" onClick={generateLines}>
            {t("hr.generateFromEmployees")}
          </button>
          <button type="button" className="btn-touch" style={{ background: "var(--accent)" }} onClick={approve}>
            {t("hr.approve")}
          </button>
        </div>
      ) : null}
      {approved ? (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn-touch" style={{ background: "var(--success, #0d9488)" }} onClick={markPaid}>
            {t("hr.markPaid")}
          </button>
        </div>
      ) : null}

      {draft ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
            marginBottom: 16,
            alignItems: "end",
          }}
        >
          <select
            value={newLine.employeeId}
            onChange={(e) => setNewLine({ ...newLine, employeeId: e.target.value })}
            style={{ minHeight: 40 }}
          >
            <option value="">{t("hr.pickEmployee")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            placeholder={t("hr.base")}
            value={newLine.baseAmount}
            onChange={(e) => setNewLine({ ...newLine, baseAmount: e.target.value })}
          />
          <button type="button" className="btn-touch" onClick={addLine}>
            {t("hr.addLine")}
          </button>
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
              <th>{t("hr.empName")}</th>
              <th>{t("hr.base")}</th>
              <th>{t("hr.allowances")}</th>
              <th>{t("hr.deductions")}</th>
              <th>{t("hr.loanDed")}</th>
              <th>{t("hr.net")}</th>
              {draft ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {period.lines?.map((line) => (
              <tr key={line.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 4px" }}>{line.employee?.name}</td>
                <td>
                  {draft ? (
                    <input
                      defaultValue={Number(line.baseAmount)}
                      style={{ width: 90 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) {
                          updateLine(line, { baseAmount: v });
                        }
                      }}
                    />
                  ) : (
                    Number(line.baseAmount).toFixed(2)
                  )}
                </td>
                <td>
                  {draft ? (
                    <input
                      defaultValue={Number(line.allowancesTotal)}
                      style={{ width: 90 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) updateLine(line, { allowancesTotal: v });
                      }}
                    />
                  ) : (
                    Number(line.allowancesTotal).toFixed(2)
                  )}
                </td>
                <td>
                  {draft ? (
                    <input
                      defaultValue={Number(line.deductionsTotal)}
                      style={{ width: 90 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) updateLine(line, { deductionsTotal: v });
                      }}
                    />
                  ) : (
                    Number(line.deductionsTotal).toFixed(2)
                  )}
                </td>
                <td>
                  {draft ? (
                    <input
                      defaultValue={Number(line.loanDeduction)}
                      style={{ width: 90 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) updateLine(line, { loanDeduction: v });
                      }}
                    />
                  ) : (
                    Number(line.loanDeduction).toFixed(2)
                  )}
                </td>
                <td>{Number(line.netAmount).toFixed(2)}</td>
                {draft ? (
                  <td>
                    <button
                      type="button"
                      className="btn-touch"
                      style={{ background: "var(--danger)", color: "#fff" }}
                      onClick={() => deleteLine(line)}
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>{t("hr.markPaidHint")}</p>
    </div>
  );
}
