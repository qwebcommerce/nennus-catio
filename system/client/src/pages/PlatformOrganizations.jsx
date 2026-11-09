import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { BUSINESS_VERTICAL_IDS, isMvpVerticalEnabled } from "../lib/businessVerticalIds.js";

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

const emptyPlanForm = {
  organizationId: "",
  plan: "PREMIUM",
  maxBranches: "3",
  amount: "",
  currency: "SAR",
  reference: "",
  note: "",
  purchasedAt: new Date().toISOString().slice(0, 10),
};

export default function PlatformOrganizations() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [form, setForm] = useState({
    organizationName: "",
    organizationSlug: "",
    businessVertical: "",
    branchName: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
  });
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editVertical, setEditVertical] = useState("");
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planBusy, setPlanBusy] = useState(false);

  const load = () =>
    api("/api/platform/organizations")
      .then(setRows)
      .catch((e) => setErr(e.message || "Error"));

  useEffect(() => {
    setLoading(true);
    setErr("");
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setErr("");
    setOkMsg("");
    await api("/api/platform/organizations", {
      method: "POST",
      body: {
        organizationName: form.organizationName,
        organizationSlug: form.organizationSlug,
        businessVertical: form.businessVertical.trim() || undefined,
        branchName: form.branchName || undefined,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        adminName: form.adminName,
      },
    });
    setForm({
      organizationName: "",
      organizationSlug: "",
      businessVertical: "",
      branchName: "",
      adminEmail: "",
      adminPassword: "",
      adminName: "",
    });
    await load();
  };

  const startEdit = (o) => {
    setEditId(o.id);
    setEditName(o.name);
    setEditSlug(o.slug || "");
    setEditVertical(o.businessVertical || "");
  };

  const saveEdit = async () => {
    if (!editId) return;
    setErr("");
    await api(`/api/platform/organizations/${editId}`, {
      method: "PATCH",
      body: {
        name: editName,
        slug: editSlug,
        businessVertical: editVertical.trim() || null,
      },
    });
    setEditId(null);
    await load();
  };

  const recordPlan = async (e) => {
    e.preventDefault();
    if (!planForm.organizationId) {
      setErr(t("platform.pickOrg"));
      return;
    }
    setPlanBusy(true);
    setErr("");
    setOkMsg("");
    try {
      await api(`/api/platform/organizations/${planForm.organizationId}/plan-purchases`, {
        method: "POST",
        body: {
          plan: planForm.plan,
          maxBranches: Number(planForm.maxBranches) || 1,
          amount: planForm.amount === "" ? null : planForm.amount,
          currency: planForm.currency || "SAR",
          reference: planForm.reference || undefined,
          note: planForm.note || undefined,
          purchasedAt: planForm.purchasedAt
            ? new Date(`${planForm.purchasedAt}T12:00:00`).toISOString()
            : undefined,
        },
      });
      setOkMsg(t("platform.planRecorded"));
      setPlanForm((f) => ({ ...emptyPlanForm, organizationId: f.organizationId }));
      await load();
    } catch (x) {
      setErr(x.message || "Error");
    } finally {
      setPlanBusy(false);
    }
  };

  const selectedOrg = rows.find((o) => o.id === planForm.organizationId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("platform.orgs")}</h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("platform.envHint")}</p>

      {err ? (
        <div className="card" style={{ color: "var(--danger, #c00)", fontSize: 14 }}>
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>
          {okMsg}
        </div>
      ) : null}

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("platform.createOrg")}</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <input
            placeholder={t("platform.orgName")}
            required
            value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.slug")}
            required
            value={form.organizationSlug}
            onChange={(e) =>
              setForm({ ...form, organizationSlug: e.target.value.toLowerCase() })
            }
            style={inp}
          />
          <select
            aria-label={t("platform.businessVertical")}
            value={form.businessVertical}
            onChange={(e) => setForm({ ...form, businessVertical: e.target.value })}
            style={inp}
          >
            <option value="">{t("platform.businessVertical")} ({t("common.none")})</option>
            {BUSINESS_VERTICAL_IDS.map((id) => (
              <option key={id} value={id} disabled={!isMvpVerticalEnabled(id)}>
                {t(`register.vertical.${id}`)}
                {!isMvpVerticalEnabled(id) ? ` (${t("register.comingSoon")})` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder={t("platform.branchName")}
            value={form.branchName}
            onChange={(e) => setForm({ ...form, branchName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminName")}
            required
            value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminEmail")}
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminPassword")}
            type="password"
            required
            minLength={6}
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            style={inp}
          />
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 220 }}>
          {t("common.add")}
        </button>
      </form>

      <form className="card" onSubmit={recordPlan} style={{ display: "grid", gap: 10 }}>
        <strong>{t("platform.recordPlan")}</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <select
            required
            value={planForm.organizationId}
            onChange={(e) => setPlanForm({ ...planForm, organizationId: e.target.value })}
            style={inp}
            aria-label={t("platform.pickOrg")}
          >
            <option value="">{t("platform.pickOrg")}</option>
            {rows.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={planForm.plan}
            onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value })}
            style={inp}
            aria-label={t("platform.plan")}
          >
            <option value="FREE">{t("plan.name.FREE")}</option>
            <option value="PREMIUM">{t("plan.name.PREMIUM")}</option>
          </select>
          <input
            type="number"
            min={1}
            max={1000}
            required
            placeholder={t("platform.maxBranches")}
            value={planForm.maxBranches}
            onChange={(e) => setPlanForm({ ...planForm, maxBranches: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.amount")}
            value={planForm.amount}
            onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.currency")}
            value={planForm.currency}
            onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value.toUpperCase() })}
            style={inp}
          />
          <input
            type="date"
            value={planForm.purchasedAt}
            onChange={(e) => setPlanForm({ ...planForm, purchasedAt: e.target.value })}
            style={inp}
            aria-label={t("platform.purchasedAt")}
          />
          <input
            placeholder={t("platform.reference")}
            value={planForm.reference}
            onChange={(e) => setPlanForm({ ...planForm, reference: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.note")}
            value={planForm.note}
            onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })}
            style={inp}
          />
        </div>
        {selectedOrg ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {t("platform.currentPlan")}: {selectedOrg.plan || "FREE"} · {t("platform.maxBranches")}:{" "}
            {selectedOrg.maxBranches ?? "—"}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn-touch"
          disabled={planBusy}
          style={{ background: "var(--accent)", color: "#fff", maxWidth: 320 }}
        >
          {t("platform.recordPlanBtn")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 16 }}>{t("common.loading")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("platform.orgName")}</th>
                <th style={th}>{t("platform.slug")}</th>
                <th style={th}>{t("platform.businessVertical")}</th>
                <th style={th}>{t("platform.plan")}</th>
                <th style={th}>{t("platform.branchesCount")}</th>
                <th style={th}>{t("platform.usersCount")}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                  {editId === o.id ? (
                    <>
                      <td style={td}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inp} />
                      </td>
                      <td style={td}>
                        <input
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                          style={inp}
                        />
                      </td>
                      <td style={td}>
                        <select
                          value={editVertical}
                          onChange={(e) => setEditVertical(e.target.value)}
                          style={inp}
                          aria-label={t("platform.businessVertical")}
                        >
                          <option value="">{t("common.none")}</option>
                          {BUSINESS_VERTICAL_IDS.filter(isMvpVerticalEnabled).map((id) => (
                            <option key={id} value={id}>
                              {t(`register.vertical.${id}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={td}>{o.plan || "FREE"}</td>
                      <td style={td}>{o._count?.branches ?? "—"}</td>
                      <td style={td}>{o._count?.users ?? "—"}</td>
                      <td style={td}>
                        <button type="button" className="btn-touch" onClick={saveEdit} style={{ marginInlineEnd: 8 }}>
                          {t("platform.saveOrg")}
                        </button>
                        <button type="button" className="btn-touch" onClick={() => setEditId(null)}>
                          {t("common.cancel")}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{o.name}</td>
                      <td style={td}>
                        <code style={{ fontSize: 12 }}>{o.slug || "—"}</code>
                      </td>
                      <td style={td}>
                        {o.businessVertical
                          ? t(`register.vertical.${o.businessVertical}`)
                          : t("common.none")}
                      </td>
                      <td style={td}>
                        {o.plan || "FREE"}
                        {o.maxBranches != null ? ` · ≤${o.maxBranches}` : ""}
                      </td>
                      <td style={td}>{o._count?.branches ?? "—"}</td>
                      <td style={td}>{o._count?.users ?? "—"}</td>
                      <td style={td}>
                        <button
                          type="button"
                          className="btn-touch"
                          onClick={() => startEdit(o)}
                          style={{ marginInlineEnd: 8 }}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className="btn-touch"
                          onClick={() =>
                            setPlanForm((f) => ({
                              ...f,
                              organizationId: o.id,
                              plan: o.plan || "PREMIUM",
                              maxBranches: String(o.maxBranches || 3),
                            }))
                          }
                        >
                          {t("platform.recordPlan")}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
