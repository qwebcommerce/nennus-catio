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

const emptyForm = {
  name: "",
  trigger: "INACTIVE_CUSTOMERS",
  channel: "WHATSAPP",
  cooldownDays: "14",
  criteriaDays: "45",
  messageTemplate: "Hi {{name}}, we miss you. Book now and enjoy a special offer.",
};

export default function Automations() {
  const { t } = useI18n();
  const [form, setForm] = useState(emptyForm);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    const [r, l] = await Promise.all([api("/api/automations"), api("/api/automations/logs")]);
    setRules(r || []);
    setLogs(l || []);
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  const createRule = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      await api("/api/automations", {
        method: "POST",
        body: {
          name: form.name,
          trigger: form.trigger,
          channel: form.channel,
          cooldownDays: Number(form.cooldownDays) || 14,
          criteriaJson:
            form.trigger === "INACTIVE_CUSTOMERS"
              ? { inactiveDays: Number(form.criteriaDays) || 45 }
              : { missedDays: Number(form.criteriaDays) || 7 },
          messageTemplate: form.messageTemplate,
        },
      });
      setForm(emptyForm);
      await loadAll();
      setMsg(t("automations.msgCreated"));
    } catch (x) {
      setMsg(x.message || t("automations.msgCreateFail"));
    } finally {
      setLoading(false);
    }
  };

  const runRule = async (id) => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api(`/api/automations/${id}/run`, { method: "POST" });
      await loadAll();
      setMsg(
        t("automations.runDone", {
          processed: String(r.run.processed),
          sent: String(r.run.sent),
          failed: String(r.run.failed),
        }),
      );
    } catch (x) {
      setMsg(x.message || t("automations.msgRunFail"));
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (rule) => {
    setLoading(true);
    try {
      await api(`/api/automations/${rule.id}`, {
        method: "PATCH",
        body: { active: !rule.active },
      });
      await loadAll();
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm(t("automations.deleteConfirm"))) return;
    setLoading(true);
    setMsg("");
    try {
      await api(`/api/automations/${id}`, { method: "DELETE" });
      await loadAll();
      setMsg(t("automations.msgDeleted"));
    } catch (x) {
      setMsg(x.message || t("automations.msgCreateFail"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("automations.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("automations.intro")}</p>

      <form className="card" onSubmit={createRule} style={{ display: "grid", gap: 10 }}>
        <strong>{t("automations.newRule")}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ ...inp, minWidth: 220 }}
            placeholder={t("automations.ruleNamePh")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            style={{ ...inp, minWidth: 180 }}
            value={form.trigger}
            onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
          >
            <option value="INACTIVE_CUSTOMERS">{t("automations.triggerInactive")}</option>
            <option value="MISSED_APPOINTMENTS">{t("automations.triggerMissed")}</option>
          </select>
          <select
            style={{ ...inp, minWidth: 130 }}
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
          >
            <option value="WHATSAPP">WHATSAPP</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">EMAIL</option>
          </select>
          <input
            type="number"
            min={1}
            style={{ ...inp, width: 150 }}
            value={form.criteriaDays}
            onChange={(e) => setForm((f) => ({ ...f, criteriaDays: e.target.value }))}
            placeholder={t("automations.criteriaDaysPh")}
          />
          <input
            type="number"
            min={1}
            style={{ ...inp, width: 150 }}
            value={form.cooldownDays}
            onChange={(e) => setForm((f) => ({ ...f, cooldownDays: e.target.value }))}
            placeholder={t("automations.cooldownDaysPh")}
          />
        </div>
        <textarea
          style={{ ...inp, minHeight: 90 }}
          value={form.messageTemplate}
          onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
          placeholder={t("automations.templatePh")}
        />
        <button type="submit" className="btn-touch" disabled={loading} style={{ background: "var(--accent)", color: "#fff", maxWidth: 220 }}>
          {t("automations.createRule")}
        </button>
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("automations.rulesTitle")}</strong>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("automations.thName")}</th>
                <th style={th}>{t("automations.thTrigger")}</th>
                <th style={th}>{t("automations.thChannel")}</th>
                <th style={th}>{t("automations.thStatus")}</th>
                <th style={th}>{t("automations.thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.trigger === "INACTIVE_CUSTOMERS" ? t("automations.triggerInactive") : r.trigger === "MISSED_APPOINTMENTS" ? t("automations.triggerMissed") : r.trigger}</td>
                  <td style={td}>{r.channel}</td>
                  <td style={td}>{r.active ? "ACTIVE" : "OFF"}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn-touch" onClick={() => runRule(r.id)} disabled={loading}>
                        {t("automations.runNow")}
                      </button>
                      <button type="button" className="btn-touch" onClick={() => toggleRule(r)} disabled={loading}>
                        {r.active ? t("commissions.disable") : t("commissions.enable")}
                      </button>
                      <button
                        type="button"
                        className="btn-touch"
                        onClick={() => deleteRule(r.id)}
                        disabled={loading}
                        style={{ background: "var(--danger)", color: "#fff" }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length ? (
                <tr>
                  <td style={td} colSpan={5}>{t("automations.noRules")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("automations.logTitle")}</strong>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("commissions.thTime")}</th>
                <th style={th}>{t("automations.thRule")}</th>
                <th style={th}>{t("loyalty.colCustomer")}</th>
                <th style={th}>{t("automations.thChannel")}</th>
                <th style={th}>{t("automations.thStatus")}</th>
                <th style={th}>{t("automations.thMessage")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{new Date(l.createdAt).toLocaleString()}</td>
                  <td style={td}>{l.rule?.name || "—"}</td>
                  <td style={td}>{l.customer?.name || "—"}</td>
                  <td style={td}>{l.channel}</td>
                  <td style={td}>{l.status}</td>
                  <td style={td}>{l.message || l.error || "—"}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr><td style={td} colSpan={6}>{t("automations.noLog")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
