import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { DashboardCard } from "../components/DashboardCard.jsx";
import { TopTenList } from "../components/TopTenList.jsx";
import { DashIcon } from "../components/DashIcon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { printPaperClass } from "../utils/printPaper.js";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { LowStockList } from "../components/LowStockList.jsx";

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  color: "var(--text)",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
};

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function Dashboard() {
  const { sizes } = usePrintSettings();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const navigate = useNavigate();
  const branchId = useActiveBranchId();
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState(null);
  const [byProduct, setByProduct] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [topServices, setTopServices] = useState([]);
  const [salesByEmployees, setSalesByEmployees] = useState([]);
  const [byBranch, setByBranch] = useState([]);

  useEffect(() => {
    const q = branchId ? `?branchId=${branchId}` : "";
    const run = async () => {
      // Load dashboard in small batches — parallel fan-out exhausts Supabase session pools.
      const s = await api(`/api/dashboard/summary${q}`);
      setSummary(s);
      const p = await api(`/api/dashboard/sales-by-product${q}`);
      setByProduct(p);
      const m = await api(`/api/dashboard/monthly-profit${q}`);
      setMonthly(m);
      const [tp, tc] = await Promise.all([
        api(`/api/dashboard/top-products-month${q}`),
        api(`/api/dashboard/top-customers-month${q}`),
      ]);
      setTopProducts(Array.isArray(tp) ? tp : []);
      setTopCustomers(Array.isArray(tc) ? tc : []);
      const [ts, se] = await Promise.all([
        api(`/api/dashboard/top-services-month${q}`),
        api(`/api/dashboard/sales-by-employees-month${q}`),
      ]);
      setTopServices(Array.isArray(ts) ? ts : []);
      setSalesByEmployees(Array.isArray(se) ? se : []);
      if (user?.role === "ADMIN" && !branchId) {
        try {
          const bb = await api("/api/dashboard/sales-by-branch");
          setByBranch(Array.isArray(bb) ? bb : []);
        } catch {
          setByBranch([]);
        }
      } else {
        setByBranch([]);
      }
    };
    run().catch(() => {});
  }, [branchId, user?.role]);

  const lowStockPath = "/purchases";

  const employeeRowName = (r) => {
    if (locale === "en" && r.nameEn?.trim()) return r.nameEn.trim();
    return r.name;
  };

  const printReports = () => {
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 150);
    });
  };

  const q = query.trim().toLowerCase();
  const filterName = (name) => !q || String(name || "").toLowerCase().includes(q);

  const filteredProducts = useMemo(
    () => byProduct.filter((r) => filterName(r.name)),
    [byProduct, q],
  );
  const filteredTopProducts = useMemo(
    () => topProducts.filter((r) => filterName(r.name)),
    [topProducts, q],
  );
  const filteredCustomers = useMemo(
    () => topCustomers.filter((r) => filterName(r.name)),
    [topCustomers, q],
  );

  const chartPeak = filteredProducts.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0);
  const monthTotal = summary ? Number(summary.salesMonthTotal) || 0 : 0;
  const watermark = monthTotal >= 1000 ? `${(monthTotal / 1000).toFixed(1)}k` : String(Math.round(monthTotal));

  const profitDelta = useMemo(() => {
    if (!monthly?.length || monthly.length < 2) return null;
    const a = Number(monthly[monthly.length - 2]?.profit) || 0;
    const b = Number(monthly[monthly.length - 1]?.profit) || 0;
    if (a === 0) return b > 0 ? { pct: "+100%", up: true } : null;
    const pct = ((b - a) / Math.abs(a)) * 100;
    const up = pct >= 0;
    return { pct: `${up ? "+" : ""}${pct.toFixed(1)}%`, up };
  }, [monthly]);

  return (
    <div className="dash-page">
      <div className={`dashboard-print-area ${printPaperClass(sizes.reports)}`}>
        <header className="dash-top">
          <div className="dash-top-title">
            <h1>{t("dashboard.title")}</h1>
            <p>{t("dashboard.overviewSub")}</p>
          </div>

          <label className="dash-search dashboard-print-hide">
            <DashIcon name="search" size={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dashboard.searchPlaceholder")}
              aria-label={t("dashboard.searchPlaceholder")}
            />
          </label>

          <div className="dash-top-actions dashboard-print-hide">
            <button type="button" className="dash-btn-primary" onClick={printReports} title={t("dashboard.printHint")}>
              <DashIcon name="print" size={16} />
              {t("dashboard.print")}
            </button>
            <Link to="/alerts" className="dash-icon-btn" title={t("nav.notifications")} aria-label={t("nav.notifications")}>
              <DashIcon name="bell" size={18} />
            </Link>
          </div>
        </header>

        {!summary ? (
          <div className="dash-shell-card dash-loading">{t("common.loading")}</div>
        ) : (
          <div className="dash-layout">
            <div className="dash-main-col">
              <div className="dash-section-label">{t("dashboard.overview")}</div>

              <div className="dash-mini-kpis">
                {["IN_STORE", "VAN", "WEBSITE"].map((key) => (
                  <div key={key} className="dash-mini-kpi">
                    <strong>{cur(summary.channelsToday?.[key]?.total || 0)}</strong>
                    <span>{t(key === "VAN" ? "shop.channelVan" : key === "WEBSITE" ? "shop.channelWeb" : "shop.channelStore")} · {summary.channelsToday?.[key]?.count || 0}</span>
                  </div>
                ))}
                <div className="dash-mini-kpi"><strong>{summary.waitingOrders || 0}</strong><span>{t("shop.waiting")}</span></div>
                <div className="dash-mini-kpi"><strong>{summary.todayGrooming || 0}</strong><span>{t("shop.todayGrooming")}</span></div>
              </div>
              <div className="dash-hero-kpis">
                <DashboardCard
                  title={t("dashboard.salesTodayValue")}
                  value={cur(summary.salesTodayTotal)}
                  hint={t("dashboard.salesTodayCountHint", { count: String(summary.salesTodayCount) })}
                  icon="cart"
                  tone="blue"
                  trend={summary.salesTodayCount > 0 ? `+${summary.salesTodayCount}` : "0"}
                  trendPositive={summary.salesTodayCount > 0}
                />
                <DashboardCard
                  title={t("dashboard.monthTotal")}
                  value={cur(summary.salesMonthTotal)}
                  hint={
                    profitDelta
                      ? t("dashboard.profitTrendHint", { pct: profitDelta.pct })
                      : t("dashboard.profitHint")
                  }
                  icon="wallet"
                  tone="ink"
                  trend={profitDelta?.pct}
                  trendPositive={profitDelta?.up !== false}
                />
              </div>

              <div className="dash-mini-kpis">
                <div className="dash-mini-kpi">
                  <span className="dash-mini-ico tone-sky">
                    <DashIcon name="spark" size={18} />
                  </span>
                  <div>
                    <strong>{cur(summary.estimatedProfitMonth)}</strong>
                    <span>{t("dashboard.profitMonth")}</span>
                  </div>
                </div>
                <div
                  className="dash-mini-kpi"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(lowStockPath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(lowStockPath);
                  }}
                >
                  <span className="dash-mini-ico tone-warn">
                    <DashIcon name="alert" size={18} />
                  </span>
                  <div>
                    <strong>{String(summary.lowStockAlerts)}</strong>
                    <span>{t("dashboard.lowStock")}</span>
                  </div>
                </div>
              </div>

              <LowStockList items={summary.lowStockItems || summary.lowStockList} branchId={branchId} />

              <section className="dash-shell-card dash-customers-strip">
                <div className="dash-strip-head">
                  <h3>{t("dashboard.topCustomersMonth")}</h3>
                  <Link to="/customers" className="dash-link-all">
                    {t("dashboard.viewAll")}
                    <span aria-hidden>→</span>
                  </Link>
                </div>
                {!filteredCustomers.length ? (
                  <div className="dash-empty">{t("dashboard.topTenEmpty")}</div>
                ) : (
                  <div className="dash-avatar-row">
                    {filteredCustomers.slice(0, 8).map((c, i) => (
                      <div key={`${c.name}-${i}`} className="dash-avatar-item" title={`${c.name} · ${cur(c.value)}`}>
                        <div className={`dash-avatar tone-${(i % 5) + 1}`}>{initials(c.name)}</div>
                        <span>{c.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="dash-shell-card dash-chart-card">
                <div className="dash-chart-head">
                  <div>
                    <h3>{t("dashboard.chartByProduct")}</h3>
                    <p>{t("dashboard.productViewSub")}</p>
                  </div>
                </div>
                <div className="dash-chart-wrap">
                  <div className="dash-chart-watermark" aria-hidden>
                    {watermark}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={filteredProducts.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 8" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={48}
                      />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [cur(v), t("dashboard.tooltipSales")]} />
                      <Bar dataKey="value" radius={[10, 10, 10, 10]} maxBarSize={36}>
                        {filteredProducts.slice(0, 12).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={Number(entry.value) === chartPeak && chartPeak > 0 ? "url(#dashBarHot)" : "url(#dashBarMute)"}
                          />
                        ))}
                      </Bar>
                      <defs>
                        <linearGradient id="dashBarHot" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38BDF8" />
                          <stop offset="100%" stopColor="#2563EB" />
                        </linearGradient>
                        <linearGradient id="dashBarMute" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.9" />
                          <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.55" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {byBranch.length > 1 ? (
                <section className="dash-shell-card dash-chart-card">
                  <div className="dash-chart-head">
                    <div>
                      <h3>{t("dashboard.chartByBranch")}</h3>
                      <p>{t("dashboard.branchViewSub")}</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byBranch}>
                      <CartesianGrid strokeDasharray="3 8" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [cur(v), t("dashboard.tooltipSales")]} />
                      <Bar dataKey="value" fill="#2563EB" radius={[10, 10, 10, 10]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              ) : null}

              <section className="dash-shell-card dash-chart-card">
                <div className="dash-chart-head">
                  <div>
                    <h3>{t("dashboard.chartProfit")}</h3>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 8" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [cur(v), t("dashboard.tooltipProfit")]} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#2563EB"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#38BDF8", stroke: "#2563EB", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </section>

            </div>

            <aside className="dash-side-col">
              <TopTenList
                title={t("dashboard.topProductsMonth")}
                emptyLabel={t("dashboard.topTenEmpty")}
                metricLabel={t("dashboard.topProductsMetric")}
                actionLabel={t("dashboard.viewAllProducts")}
                onAction={() => navigate("/products")}
                rows={filteredTopProducts.slice(0, 6).map((r, i) => ({
                  name: r.name,
                  value: cur(r.value),
                  sub:
                    r.quantity != null
                      ? t("dashboard.topProductsQty", { count: String(r.quantity) })
                      : undefined,
                  status: i === filteredTopProducts.length - 1 && i > 2 ? "offline" : "active",
                  statusLabel:
                    i === filteredTopProducts.length - 1 && i > 2
                      ? t("dashboard.statusQuiet")
                      : t("dashboard.statusActive"),
                }))}
              />

              <div className="dash-aside-card">
                <div className="dash-aside-head">
                  <h3>{t("dashboard.salesByEmployeesMonth")}</h3>
                </div>
                {!salesByEmployees.length ? (
                  <div className="dash-empty">{t("dashboard.salesByEmployeesEmpty")}</div>
                ) : (
                  <ul className="dash-comment-list">
                    {salesByEmployees.slice(0, 5).map((r, i) => (
                      <li key={`${r.name}-${i}`} className="dash-comment-row">
                        <div className={`dash-avatar sm tone-${(i % 5) + 1}`}>{initials(employeeRowName(r))}</div>
                        <div className="dash-comment-body">
                          <div className="dash-comment-top">
                            <strong>{employeeRowName(r)}</strong>
                            <span>{cur(r.value)}</span>
                          </div>
                          <p>
                            {r.orders != null
                              ? t("dashboard.salesByEmployeesOrders", { count: String(r.orders) })
                              : t("dashboard.salesByEmployeesMetric")}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <TopTenList
                title={t("dashboard.topServicesMonth")}
                emptyLabel={t("dashboard.topTenEmpty")}
                metricLabel={t("dashboard.topServicesMetric")}
                variant="compact"
                rows={topServices.slice(0, 5).map((r, i) => ({
                  name: r.name,
                  value: cur(r.value),
                  sub:
                    r.count != null
                      ? t("dashboard.topServicesCount", { count: String(r.count) })
                      : undefined,
                  status: "active",
                  statusLabel: t("dashboard.statusActive"),
                }))}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
