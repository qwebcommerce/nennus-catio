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
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

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
  const [tab, setTab] = useState("charts");
  const branchId = useActiveBranchId();
  const canManageExpenses = can("expenses");
  const [from, setFrom] = useState(() => toYMD(startOfMonthDate()));
  const [to, setTo] = useState(() => toYMD(new Date()));
  const [groupBy, setGroupBy] = useState("day");
  const [analytics, setAnalytics] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    category: "OTHER",
    amount: "",
    description: "",
    expenseDate: toYMD(new Date()),
  });
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const q = new URLSearchParams();
      q.set("from", new Date(from + "T00:00:00").toISOString());
      q.set("to", new Date(to + "T23:59:59").toISOString());
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

  const loadExpenses = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      q.set("from", new Date(from + "T00:00:00").toISOString());
      q.set("to", new Date(to + "T23:59:59").toISOString());
      const rows = await api(`/api/expenses?${q.toString()}`);
      setExpenseList(rows);
    } catch {
      setExpenseList([]);
    }
  }, [from, to]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

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
    try {
      const amt = Number(String(form.amount).replace(",", "."));
      if (!Number.isFinite(amt) || amt < 0) throw new Error(t("reports.badAmount"));
      const body = {
        category: form.category,
        amount: amt,
        description: form.description.trim() || undefined,
        expenseDate: new Date(form.expenseDate + "T12:00:00").toISOString(),
      };
      if (editingExpenseId) {
        await api(`/api/expenses/${editingExpenseId}`, { method: "PATCH", body });
        setMsg(t("reports.expenseUpdated"));
        setEditingExpenseId(null);
      } else {
        await api("/api/expenses", { method: "POST", body });
      }
      setForm((f) => ({ ...f, amount: "", description: "", category: "OTHER", expenseDate: toYMD(new Date()) }));
      await loadExpenses();
      await loadAnalytics();
    } catch (err) {
      setMsg(err.message || t("reports.saveFailed"));
    }
  };

  const startEditExpense = (row) => {
    setEditingExpenseId(row.id);
    setForm({
      category: row.category || "OTHER",
      amount: String(row.amount ?? ""),
      description: row.description || "",
      expenseDate: toYMD(row.expenseDate || new Date()),
    });
    setTab("expenses");
  };

  const delExpense = async (id) => {
    if (!window.confirm(t("reports.confirmDeleteExpense"))) return;
    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      if (editingExpenseId === id) {
        setEditingExpenseId(null);
        setForm({ category: "OTHER", amount: "", description: "", expenseDate: toYMD(new Date()) });
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
        {canManageExpenses ? (
          <button type="button" className="btn-touch" style={{ background: tab === "expenses" ? "var(--accent)" : "var(--surface2)", color: tab === "expenses" ? "#fff" : "var(--text)" }} onClick={() => setTab("expenses")}>
            {t("reports.tabExpenses")}
          </button>
        ) : null}
      </div>

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
          <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => { loadAnalytics(); loadExpenses(); }}>
            {t("reports.apply")}
          </button>
        </div>
      </div>

      {msg ? <p style={{ color: "var(--danger)" }}>{msg}</p> : null}

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
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("expense.date")}</span>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} style={{ minHeight: 44 }} />
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
                    setForm({ category: "OTHER", amount: "", description: "", expenseDate: toYMD(new Date()) });
                  }}
                >
                  {t("common.cancel")}
                </button>
              ) : null}
            </div>
          </form>

          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
                  <th style={{ padding: 8 }}>{t("expense.date")}</th>
                  <th style={{ padding: 8 }}>{t("expense.category")}</th>
                  <th style={{ padding: 8 }}>{t("expense.amount")}</th>
                  <th style={{ padding: 8 }}>{t("expense.note")}</th>
                  <th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {expenseList.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(row.expenseDate).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SA")}</td>
                    <td style={{ padding: 8 }}>{t(`expense.cat.${row.category}`)}</td>
                    <td style={{ padding: 8, fontWeight: 600 }}>{Number(row.amount).toFixed(2)}</td>
                    <td style={{ padding: 8 }}>{row.description || "—"}</td>
                    <td style={{ padding: 8 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" className="btn-touch" onClick={() => startEditExpense(row)}>
                          {t("common.edit")}
                        </button>
                        <button type="button" className="btn-touch" style={{ background: "var(--danger)", color: "#fff" }} onClick={() => delExpense(row.id)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expenseList.length === 0 ? <p style={{ padding: 12, color: "var(--muted)" }}>{t("reports.noExpensesInRange")}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
