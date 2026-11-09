import React, { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

const inp = {
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  width: "100%",
  boxSizing: "border-box",
};

export default function HrEmployees() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [branches, setBranches] = useState([]);
  const [userCandidates, setUserCandidates] = useState([]);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    phone: "",
    jobTitle: "",
    branchId: "",
    userId: "",
    defaultBaseSalary: "",
    status: "ACTIVE",
    notes: "",
  });

  const load = async () => {
    setMsg("");
    try {
      const [em, br, uc] = await Promise.all([
        api("/api/employees"),
        api("/api/branches"),
        api("/api/employees/user-candidates").catch(() => []),
      ]);
      setList(em);
      setBranches(br);
      setUserCandidates(Array.isArray(uc) ? uc : []);
    } catch (e) {
      setMsg(e.message || t("hr.loadError"));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = async () => {
    try {
      const uc = await api("/api/employees/user-candidates");
      setUserCandidates(Array.isArray(uc) ? uc : []);
    } catch {
      setUserCandidates([]);
    }
    setEditing("new");
    setForm({
      name: "",
      nameEn: "",
      phone: "",
      jobTitle: "",
      branchId: "",
      userId: "",
      defaultBaseSalary: "",
      status: "ACTIVE",
      notes: "",
    });
  };

  const openEdit = async (row) => {
    let uc = [];
    try {
      uc = await api("/api/employees/user-candidates");
    } catch {
      uc = [];
    }
    const byId = new Map((Array.isArray(uc) ? uc : []).map((u) => [u.id, u]));
    if (row.user && !byId.has(row.user.id)) {
      byId.set(row.user.id, row.user);
    }
    setUserCandidates([...byId.values()]);
    setEditing(row.id);
    setForm({
      name: row.name,
      nameEn: row.nameEn || "",
      phone: row.phone || "",
      jobTitle: row.jobTitle || "",
      branchId: row.branchId || "",
      userId: row.userId || "",
      defaultBaseSalary:
        row.defaultBaseSalary != null ? String(row.defaultBaseSalary) : "",
      status: row.status,
      notes: row.notes || "",
    });
  };

  const save = async () => {
    setMsg("");
    try {
      const body = {
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || null,
        phone: form.phone.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        branchId: form.branchId ? form.branchId : null,
        userId: form.userId ? form.userId : null,
        defaultBaseSalary: form.defaultBaseSalary
          ? Number(String(form.defaultBaseSalary).replace(",", "."))
          : null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (editing === "new") {
        await api("/api/employees", { method: "POST", body });
      } else {
        await api(`/api/employees/${editing}`, { method: "PATCH", body });
      }
      setEditing(null);
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  const remove = async (row) => {
    if (!window.confirm(t("hr.confirmDeleteEmployee"))) return;
    try {
      await api(`/api/employees/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(e.message || t("hr.saveError"));
    }
  };

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("hr.employeesIntro")}</p>
      {msg ? <p style={{ color: "var(--danger, #c62828)" }}>{msg}</p> : null}
      <button type="button" className="btn-touch" style={{ marginBottom: 16 }} onClick={openNew}>
        {t("hr.addEmployee")}
      </button>

      {(editing === "new" || (editing && editing !== "new")) && (
        <div
          className="card page-form-grid"
          style={{
            marginBottom: 20,
          }}
        >
          <input
            placeholder={t("hr.empName")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("hr.empPhone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("hr.empJob")}
            value={form.jobTitle}
            onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            style={inp}
          />
          <label className="page-form-field">
            <span>{t("hr.empBranch")}</span>
            <select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              style={inp}
            >
              <option value="">{t("hr.noBranch")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="page-form-field">
            <span>{t("hr.linkUser")}</span>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              style={inp}
            >
              <option value="">{t("hr.noUser")}</option>
              {userCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <input
            placeholder={t("hr.defaultBase")}
            value={form.defaultBaseSalary}
            onChange={(e) => setForm({ ...form, defaultBaseSalary: e.target.value })}
            style={inp}
          />
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            style={inp}
          >
            <option value="ACTIVE">{t("hr.statusActive")}</option>
            <option value="ON_LEAVE">{t("hr.statusLeave")}</option>
            <option value="TERMINATED">{t("hr.statusTerminated")}</option>
          </select>
          <textarea
            placeholder={t("hr.notes")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            style={{ ...inp, maxWidth: "100%", minHeight: 60 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-touch" onClick={save}>
              {t("common.save")}
            </button>
            <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
            <th>{t("hr.empName")}</th>
            <th>{t("hr.colBranch")}</th>
            <th>{t("hr.defaultBase")}</th>
            <th>{t("hr.colStatus")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: "var(--muted)" }}>
                {t("hr.emptyEmployees")}
              </td>
            </tr>
          ) : null}
          {list.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 4px" }}>{r.name}</td>
              <td>{r.branch?.name || "—"}</td>
              <td>{r.defaultBaseSalary != null ? Number(r.defaultBaseSalary).toFixed(2) : "—"}</td>
              <td>{r.status}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" className="btn-touch" onClick={() => openEdit(r)}>
                  {t("common.edit")}
                </button>{" "}
                <button type="button" className="btn-touch" style={{ background: "var(--danger)", color: "#fff" }} onClick={() => remove(r)}>
                  {t("common.delete")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
