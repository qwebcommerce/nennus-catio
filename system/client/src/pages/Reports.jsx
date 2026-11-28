import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { qatarYmd } from "../utils/qatarDate.js";
// Scrollable, searchable histories (fix-rc).
import HistoryPanel from "../components/HistoryPanel.jsx";
import ExpenseHistoryPanel from "../components/ExpenseHistoryPanel.jsx";

function toYMD(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function startOfMonthDate() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYearDate() {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#64748b"];

export default function Reports() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "charts");
  const branchId = useActiveBranchId();
  const canManageExpenses = can("expenses");
  const [from, setFrom] = useState(() => toYMD(startOfMonthDate()));
  const [to, setTo] = useState(() => toYMD(new Date()));
  const [groupBy, setGroupBy] = useState("day");
  const [analytics, setAnalytics] = useState(null);
  const [expenseKey, setExpenseKey] = useState(0);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    category: "OTHER",
    amount: "",
    description: "",
    expenseDate: toYMD(new Date()),
    paidFrom: "CASH",
    payee: "",
    reference: "",
  });
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setMsg("");
    setMsgOk(false);
    try {
      const q = new URLSearchParams();
      q.set("from", from);
      q.set("to", to);
      q.set("groupBy", groupBy);
      if (branchId) q.set("branchId", branchId);
      const a = await api(`/api/reports/analytics?${q.toString()}`);
      setAnalytics(a);
    } catch (e) {
      setMsg(e.message || t("reports.loadError"));
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy, branchId, t]);

  // The expenses history panel reads its own pages; bumping the key reloads it.
  const loadExpenses = useCallback(async () => {
    setExpenseKey((k) => k + 1);
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);


  const applyPreset = (preset) => {
    const end = new Date();
    if (preset === "today") {
      const d = toYMD(new Date());
      setFrom(d);
      setTo(d);
      setGroupBy("day");
    } else if (preset === "month") {
      setFrom(toYMD(startOfMonthDate()));
      setTo(toYMD(end));
      setGroupBy("day");
    } else if (preset === "year") {
      setFrom(toYMD(startOfYearDate()));
      setTo(toYMD(end));
      setGroupBy("month");
    }
  };

  const pieData = useMemo(() => {
    if (!analytics?.expenseByCategory) return [];
    const cat = analytics.expenseByCategory;
    const keys = ["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"];
    return keys
      .map((k) => ({
        name: t(`expense.cat.${k}`),
        value: Number(cat[k] || 0),
        key: k,
      }))
      .filter((x) => x.value > 0);
  }, [analytics, t]);

  const addExpense = async (e) => {
    e.preventDefault();
    setMsg("");
    let done = "";
    try {
      const amountText = String(form.amount).replace(",", ".").trim();
      const amt = Number(amountText);
      if (!Number.isFinite(amt) || amt <= 0 || !/^\d+(\.\d{1,2})?$/.test(amountText)) throw new Error(t("reports.badAmount"));
      const body = {
        category: form.category,
        amount: amountText,
        paidFrom: form.paidFrom,
        description: form.description.trim() || undefined,
        payee: form.payee.trim() || null,
        reference: form.reference.trim() || null,
        // Noon in Qatar so the expense always lands on the chosen Qatar day.
        expenseDate: `${form.expenseDate}T12:00:00+03:00`,
      };
      if (editingExpenseId) {
        await api(`/api/expenses/${editingExpenseId}`, { method: "PATCH", body: { ...body, version: form.version } });
        done = t("reports.expenseUpdated");
        setEditingExpenseId(null);
      } else {
        await api("/api/expenses", { method: "POST", body });
        done = t("reports.expenseAdded");
      }
      setForm((f) => ({ ...f, amount: "", description: "", category: "OTHER", expenseDate: toYMD(new Date()), paidFrom: "CASH", payee: "", reference: "" }));
      await loadExpenses();
      await loadAnalytics();
      // After the reload (which clears the message), so the confirmation stays on screen.
      setMsg(done);
      setMsgOk(true);
    } catch (err) {
      setMsgOk(false);
      setMsg(isStaleEdit(err) ? editErrorMessage(err, t) : err.message || t("reports.saveFailed"));
      if (isStaleEdit(err) && editingExpenseId) {
        // NFR-13: someone else saved this expense first — reload it into the form.
        const rows = await api("/api/expenses").catch(() => null);
        loadExpenses();
        if (Array.isArray(rows)) {
          const fresh = rows.find((row) => row.id === editingExpenseId);
          if (fresh) startEditExpense(fresh);
        }
      }
    }
  };

  const startEditExpense = (row) => {
    setEditingExpenseId(row.id);
    setForm({
      category: row.category || "OTHER",
      amount: String(row.amount ?? ""),
      description: row.description || "",
      expenseDate: qatarYmd(row.expenseDate || new Date()),
      paidFrom: row.paidFrom || "CASH",
      payee: row.payee || "",
      reference: row.reference || "",
      version: row.version,
    });
    setTab("expenses");
  };

  const delExpense = async (id) => {
    if (!window.confirm(t("reports.confirmDeleteExpense"))) return;
    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      if (editingExpenseId === id) {
        setEditingExpenseId(null);
        setForm({ category: "OTHER", amount: "", description: "", expenseDate: toYMD(new Date()), paidFrom: "CASH", payee: "", reference: "" });
      }
      await loadExpenses();
      await loadAnalytics();
    } catch (err) {
      setMsg(err.message || t("reports.deleteFailed"));
    }
  };

  const chartData = analytics?.series || [];

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ marginTop: 0 }}>{t("reports.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("reports.intro")}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn-touch" style={{ background: tab === "charts" ? "var(--accent)" : "var(--surface2)", color: tab === "charts" ? "#fff" : "var(--text)" }} onClick={() => setTab("charts")}>
          {t("reports.tabCharts")}
        </button>
        <button type="button" className="btn-touch" style={{ background: tab === "history" ? "var(--accent)" : "var(--surface2)", color: tab === "history" ? "#fff" : "var(--text)" }} onClick={() => setTab("history")}>
          {t("hist.tab")}
        </button>
        {canManageExpenses ? (
          <button type="button" className="btn-touch" style={{ background: tab === "expenses" ? "var(--accent)" : "var(--surface2)", color: tab === "expenses" ? "#fff" : "var(--text)" }} onClick={() => setTab("expenses")}>
            {t("reports.tabExpenses")}
          </button>
        ) : null}
      </div>

      {tab === "charts" ? (
      <div className="card" style={{ marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>{t("reports.presets")}:</span>
          <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => applyPreset("today")}>
            {t("reports.presetToday")}
          </button>
          <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => applyPreset("month")}>
            {t("reports.presetMonth")}
          </button>
          <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => applyPreset("year")}>
            {t("reports.presetYear")}
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.from")}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ minHeight: 44, padding: "0 10px" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.to")}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ minHeight: 44, padding: "0 10px" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.groupBy")}</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ minHeight: 44, padding: "8px 12px" }}>
              <option value="day">{t("reports.groupDay")}</option>
              <option value="month">{t("reports.groupMonth")}</option>
            </select>
          </label>
          <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => { loadAnalytics(); }}>
            {t("reports.apply")}
          </button>
        </div>
      </div>
      ) : null}

      {tab === "history" ? <HistoryPanel /> : null}

      {msg ? <p role="status" style={{ color: msgOk ? "var(--success, #15803d)" : "var(--danger)" }}>{msg}</p> : null}

      {tab === "charts" && analytics ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.kpiSales")}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{analytics.totals.sales.toFixed(2)}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.kpiExpenses")}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{analytics.totals.expenses.toFixed(2)}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("reports.kpiNet")}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: analytics.totals.net >= 0 ? "var(--accent)" : "var(--danger)" }}>{analytics.totals.net.toFixed(2)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16, height: 360 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("reports.chartSalesVsExpenses")}</div>
            {loading ? (
              <div style={{ padding: 40 }}>{t("common.loading")}</div>
            ) : (
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  <Legend />
                  <Bar dataKey="sales" name={t("reports.seriesSales")} fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name={t("reports.seriesExpenses")} fill="#ef4444" radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="net" name={t("reports.seriesNet")} stroke="#6366f1" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <div className="card" style={{ height: 300 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("reports.chartExpenseMix")}</div>
              {pieData.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>{t("reports.noExpenseData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height="85%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {pieData.map((_, i) => (
                        <Cell key={pieData[i].key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("reports.stats")}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
                <li>
                  {t("reports.statInvoices")}: <strong>{analytics.salesCount}</strong>
                </li>
                <li>
                  {t("reports.statExpenseLines")}: <strong>{analytics.expenseCount}</strong>
                </li>
              </ul>
            </div>
          </div>
        </>
      ) : null}

      {tab === "expenses" && canManageExpenses ? (
        <>
          <form className="card" onSubmit={addExpense} style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <strong>{editingExpenseId ? t("reports.editExpense") : t("reports.addExpense")}</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("expense.category")}</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={{ minHeight: 44, padding: "8px 12px" }}
                >
                  {["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"].map((k) => (
                    <option key={k} value={k}>
                      {t(`expense.cat.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("expense.amount")}</span>
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  inputMode="decimal"
                  required
                  style={{ minHeight: 44, padding: "0 12px" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("fd.paidFrom")}</span>
                <select
                  value={form.paidFrom}
                  onChange={(e) => setForm({ ...form, paidFrom: e.target.value })}
                  required
                  style={{ minHeight: 44, padding: "8px 12px" }}
                >
                  <option value="CASH">{t("fd.source.CASH")}</option>
                  <option value="BANK">{t("fd.source.BANK")}</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("expense.date")}</span>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} style={{ minHeight: 44 }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("exh.payee")}</span>
                <input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} maxLength={120} style={{ minHeight: 44, padding: "0 12px" }} data-testid="expense-payee" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("exh.reference")}</span>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={60} style={{ minHeight: 44, padding: "0 12px" }} data-testid="expense-reference" />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("expense.note")}</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 44, padding: "0 12px" }} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 220 }}>
                {editingExpenseId ? t("common.save") : t("reports.saveExpense")}
              </button>
              {editingExpenseId ? (
                <button
                  type="button"
                  className="btn-touch"
                  onClick={() => {
                    setEditingExpenseId(null);
                    setForm({ category: "OTHER", amount: "", description: "", expenseDate: toYMD(new Date()), paidFrom: "CASH", payee: "", reference: "" });
                  }}
                >
                  {t("common.cancel")}
                </button>
              ) : null}
            </div>
          </form>

          <ExpenseHistoryPanel onEdit={startEditExpense} onDelete={delExpense} reloadKey={expenseKey} />
        </>
      ) : null}
    </div>
  );
}
