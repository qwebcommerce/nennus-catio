import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

export default function Users() {
  const { t, locale } = useI18n();
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [maxUsers, setMaxUsers] = useState(10);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "CASHIER",
    branchId: "",
  });

  const atLimit = users.length >= maxUsers;

  const load = async () => {
    const data = await api("/api/users");
    if (Array.isArray(data)) {
      setUsers(data);
      setMaxUsers(10);
      return;
    }
    setUsers(Array.isArray(data?.users) ? data.users : []);
    setMaxUsers(data?.maxUsers ?? 10);
  };

  useEffect(() => {
    load().catch(() => {});
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setFormError("");
    if (atLimit) {
      setFormError(t("users.limitReached", { max: maxUsers }));
      return;
    }
    if (form.role !== "ADMIN" && !form.branchId) {
      setFormError(t("users.branchRequired"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: { ...form, branchId: form.branchId || null },
      });
      setForm({ email: "", password: "", name: "", role: "CASHIER", branchId: "" });
      await load();
      await refreshUser?.();
      showToast(t("users.toastCreated"), "success");
    } catch (err) {
      setFormError(err.message || "Failed");
      showToast(err.message || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const updateRole = async (u, role) => {
    if (u.isOrgOwner) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { role } });
      await load();
    } catch (err) {
      showToast(err.message || "Failed", "error");
      await load();
    }
  };

  const updateBranch = async (u, branchId) => {
    if (u.isOrgOwner) return;
    if (u.role !== "ADMIN" && !branchId) {
      showToast(t("users.branchRequired"), "error");
      await load();
      return;
    }
    try {
      await api(`/api/users/${u.id}`, {
        method: "PATCH",
        body: { branchId: branchId || null },
      });
      await load();
    } catch (err) {
      showToast(err.message || "Failed", "error");
      await load();
    }
  };

  const del = async (u) => {
    if (u.isOrgOwner) return;
    if (!confirm(t("users.confirmDelete"))) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      await load();
      await refreshUser?.();
      showToast(t("users.toastDeleted"), "success");
    } catch (err) {
      showToast(err.message || "Failed", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t("users.title")}</h1>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>
          {t("users.limit", { count: users.length, max: maxUsers })}
        </span>
      </div>

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("users.newUser")}</strong>
        {atLimit ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
            {t("users.limitReached", { max: maxUsers })}
          </p>
        ) : null}
        {formError ? (
          <div style={{ color: "var(--danger)", fontSize: 13 }}>{formError}</div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <input
            placeholder={t("products.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={atLimit || busy}
            style={inp}
          />
          <input
            placeholder={t("login.email")}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={atLimit || busy}
            style={inp}
          />
          <input
            placeholder={t("login.password")}
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            disabled={atLimit || busy}
            style={inp}
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            disabled={atLimit || busy}
            style={inp}
          >
            <option value="MANAGER">{t("role.MANAGER")}</option>
            <option value="CASHIER">{t("role.CASHIER")}</option>
            <option value="ASSOCIATE">{t("role.ASSOCIATE")}</option>
          </select>
          <select
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            required={form.role !== "ADMIN"}
            disabled={atLimit || busy}
            style={inp}
          >
            <option value="">{t("users.pickBranch")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchDisplayName(b, locale)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn-touch"
          disabled={atLimit || busy}
          style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}
        >
          {t("common.add")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("products.name")}</th>
              <th style={th}>{t("login.email")}</th>
              <th style={th}>{t("users.colRole")}</th>
              <th style={th}>{t("products.branch")}</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = Boolean(u.isOrgOwner);
              return (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <div style={{ fontWeight: locked ? 700 : 500 }}>{u.name}</div>
                    {locked ? (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {t("users.orgOwnerBadge")}
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    {locked ? (
                      <span style={lockedPill}>{t(`role.${u.role}`)}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => updateRole(u, e.target.value)}
                        style={{ ...inp, minWidth: 140 }}
                      >
                        <option value="ADMIN">{t("role.ADMIN")}</option>
                        <option value="MANAGER">{t("role.MANAGER")}</option>
                        <option value="CASHIER">{t("role.CASHIER")}</option>
                        <option value="ASSOCIATE">{t("role.ASSOCIATE")}</option>
                      </select>
                    )}
                  </td>
                  <td style={td}>
                    {locked ? (
                      <span style={{ color: "var(--muted)" }}>
                        {u.branch
                          ? branchDisplayName(u.branch, locale)
                          : t("users.noBranch")}
                      </span>
                    ) : (
                      <select
                        value={u.branchId || ""}
                        onChange={(e) => updateBranch(u, e.target.value)}
                        style={{ ...inp, minWidth: 160 }}
                      >
                        <option value="">
                          {u.role === "ADMIN" ? t("users.noBranch") : t("users.pickBranch")}
                        </option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {branchDisplayName(b, locale)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      className="btn-touch"
                      disabled={locked}
                      title={locked ? t("users.ownerLockedHint") : undefined}
                      style={{
                        background: locked ? "var(--surface2)" : "var(--danger)",
                        color: locked ? "var(--muted)" : "#fff",
                        opacity: locked ? 0.65 : 1,
                        cursor: locked ? "not-allowed" : "pointer",
                      }}
                      onClick={() => del(u)}
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const lockedPill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--accent) 12%, var(--surface2))",
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 13,
};

const inp = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: 10 };
const td = { padding: 10 };
