import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

const inp = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
};

const th = { padding: "8px 10px", textAlign: "start" };
const td = { padding: "8px 10px", verticalAlign: "middle" };

export default function PlatformUsers() {
  const { t, locale } = useI18n();
  const [orgs, setOrgs] = useState([]);
  const [filterOrgId, setFilterOrgId] = useState("");
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    organizationId: "",
    email: "",
    password: "",
    name: "",
    role: "CASHIER",
    branchId: "",
  });

  const loadOrgs = () => api("/api/platform/organizations").then(setOrgs);

  const loadUsers = () => {
    const q = filterOrgId ? `?organizationId=${encodeURIComponent(filterOrgId)}` : "";
    return api(`/api/platform/users${q}`).then(setUsers);
  };

  useEffect(() => {
    loadOrgs().catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr("");
    loadUsers()
      .catch((e) => setErr(e.message || "Error"))
      .finally(() => setLoading(false));
  }, [filterOrgId]);

  useEffect(() => {
    if (!form.organizationId) {
      setBranches([]);
      return;
    }
    api(`/api/platform/branches?organizationId=${encodeURIComponent(form.organizationId)}`)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [form.organizationId]);

  const create = async (e) => {
    e.preventDefault();
    setErr("");
    await api("/api/platform/users", {
      method: "POST",
      body: {
        ...form,
        branchId: form.branchId || null,
      },
    });
    setForm({
      organizationId: form.organizationId,
      email: "",
      password: "",
      name: "",
      role: "CASHIER",
      branchId: "",
    });
    await loadUsers();
  };

  const updateRole = async (u, role) => {
    await api(`/api/platform/users/${u.id}`, { method: "PATCH", body: { role } });
    await loadUsers();
  };

  const del = async (id) => {
    if (!confirm(t("users.confirmDelete"))) return;
    await api(`/api/platform/users/${id}`, { method: "DELETE" });
    await loadUsers();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("platform.users")}</h1>

      {err ? (
        <div className="card" style={{ color: "var(--danger, #c00)", fontSize: 14 }}>
          {err}
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label style={{ fontSize: 14, color: "var(--muted)" }}>{t("platform.filterOrg")}</label>
        <select
          value={filterOrgId}
          onChange={(e) => setFilterOrgId(e.target.value)}
          style={{ ...inp, maxWidth: 280 }}
        >
          <option value="">{t("platform.allOrgs")}</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.slug || o.id.slice(0, 8)})
            </option>
          ))}
        </select>
      </div>

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("users.newUser")}</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <select
            required
            value={form.organizationId}
            onChange={(e) => setForm({ ...form, organizationId: e.target.value, branchId: "" })}
            style={inp}
          >
            <option value="">{t("platform.newUserOrg")} *</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            placeholder={t("products.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("login.email")}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("login.password")}
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inp}
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inp}>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CASHIER">Cashier</option>
          </select>
          <select
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            style={inp}
            disabled={!form.organizationId}
          >
            <option value="">{t("users.noBranch")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchDisplayName(b, locale)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}>
          {t("common.add")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 16 }}>{t("common.loading")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("products.name")}</th>
                <th style={th}>{t("login.email")}</th>
                <th style={th}>{t("platform.colOrg")}</th>
                <th style={th}>{t("users.colRole")}</th>
                <th style={th}>{t("products.branch")}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    <span style={{ fontSize: 12 }}>{u.organization?.name}</span>
                    <br />
                    <code style={{ fontSize: 11, color: "var(--muted)" }}>{u.organization?.slug || ""}</code>
                  </td>
                  <td style={td}>
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u, e.target.value)}
                      style={{ ...inp, minWidth: 120 }}
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MANAGER">Manager</option>
                      <option value="CASHIER">Cashier</option>
                    </select>
                  </td>
                  <td style={td}>
                    {u.branch ? branchDisplayName(u.branch, locale) : "—"}
                  </td>
                  <td style={td}>
                    <button type="button" className="btn-touch" onClick={() => del(u.id)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
