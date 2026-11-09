import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { EmptyState } from "../components/EmptyState.jsx";
import { productDisplayName } from "../utils/productName.js";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: "10px 8px", fontWeight: 600, whiteSpace: "nowrap" };
const td = {
  padding: "10px 8px",
  borderTop: "1px solid var(--border)",
  verticalAlign: "middle",
};

function Kpi({ label, value, hint }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function severityTone(level) {
  switch (String(level || "").toUpperCase()) {
    case "HIGH":
      return { bg: "rgba(220, 38, 38, 0.12)", color: "#b91c1c" };
    case "MEDIUM":
      return { bg: "rgba(234, 88, 12, 0.12)", color: "#c2410c" };
    default:
      return { bg: "rgba(100, 116, 139, 0.12)", color: "#475569" };
  }
}

function SeverityBadge({ level, t }) {
  const tone = severityTone(level);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {t(`costBrain.severity.${String(level || "WATCH").toUpperCase()}`)}
    </span>
  );
}

export default function CostBrain() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const branchId = useActiveBranchId();

  const [tab, setTab] = useState("alerts");
  const [lookbackDays, setLookbackDays] = useState("90");
  const [risePct, setRisePct] = useState("8");
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [best, setBest] = useState([]);
  const [historyProductId, setHistoryProductId] = useState("");
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [histBusy, setHistBusy] = useState(false);
  const [err, setErr] = useState("");

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const loadAll = useCallback(async () => {
    if (!branchId) {
      setOverview(null);
      setAlerts([]);
      setScorecards([]);
      setBest([]);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        branchId,
        lookbackDays: String(Math.max(7, Number(lookbackDays) || 90)),
        risePct: String(Math.max(1, Number(risePct) || 8)),
        n: "5",
      });
      const [ov, al, sc, be] = await Promise.all([
        api(`/api/intelligence/cost/overview?${q}`),
        api(`/api/intelligence/cost/alerts?${q}`),
        api(`/api/intelligence/cost/scorecards?${q}`),
        api(`/api/intelligence/cost/best-suppliers?${q}&limit=40`),
      ]);
      setOverview(ov);
      setAlerts(Array.isArray(al?.alerts) ? al.alerts : []);
      setScorecards(Array.isArray(sc?.suppliers) ? sc.suppliers : []);
      setBest(Array.isArray(be?.items) ? be.items : []);
    } catch (e) {
      setErr(e?.message || t("costBrain.loadFailed"));
      setOverview(null);
      setAlerts([]);
      setScorecards([]);
      setBest([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, lookbackDays, risePct, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function loadHistory(productId) {
    if (!branchId || !productId) return;
    setHistoryProductId(productId);
    setTab("history");
    setHistBusy(true);
    try {
      const q = new URLSearchParams({
        branchId,
        productId,
        lookbackDays: String(Math.max(7, Number(lookbackDays) || 180)),
      });
      const res = await api(`/api/intelligence/cost/history?${q}`);
      setHistory(res);
    } catch (e) {
      setHistory(null);
      setErr(e?.message || t("costBrain.historyFailed"));
    } finally {
      setHistBusy(false);
    }
  }

  if (!branchId) {
    return (
      <div className="page">
        <EmptyState title={t("costBrain.needBranch")} />
      </div>
    );
  }

  const tabs = [
    { id: "alerts", label: t("costBrain.tabAlerts") },
    { id: "scorecards", label: t("costBrain.tabScorecards") },
    { id: "best", label: t("costBrain.tabBest") },
    { id: "history", label: t("costBrain.tabHistory") },
  ];

  return (
    <div className="page" style={{ display: "grid", gap: 16 }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>{t("costBrain.title")}</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", maxWidth: 640 }}>
            {t("costBrain.intro")}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            {t("costBrain.lookback")}
            <input
              type="number"
              min={7}
              max={365}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(e.target.value)}
              style={{ ...inp, width: 88, marginInlineStart: 6 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            {t("costBrain.risePct")}
            <input
              type="number"
              min={1}
              max={100}
              value={risePct}
              onChange={(e) => setRisePct(e.target.value)}
              style={{ ...inp, width: 72, marginInlineStart: 6 }}
            />
          </label>
          <button type="button" className="btn" onClick={loadAll} disabled={loading}>
            {loading ? t("costBrain.loading") : t("costBrain.refresh")}
          </button>
          <Link to="/purchases" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("costBrain.openPurchases")}
          </Link>
          <Link to="/stock-brain" className="btn secondary" style={{ textDecoration: "none" }}>
            {t("costBrain.openStock")}
          </Link>
        </div>
      </header>

      {err ? (
        <div className="card" style={{ padding: 12, color: "#b91c1c" }}>
          {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <Kpi
          label={t("costBrain.kpiAlerts")}
          value={String(overview?.alerts?.count ?? "—")}
          hint={t("costBrain.kpiAlertsHint", { n: String(overview?.alerts?.high ?? 0) })}
        />
        <Kpi
          label={t("costBrain.kpiSuppliers")}
          value={String(overview?.suppliers?.count ?? "—")}
          hint={t("costBrain.kpiSuppliersHint")}
        />
        <Kpi
          label={t("costBrain.kpiMulti")}
          value={String(overview?.best?.multiSupplierSkus ?? "—")}
          hint={t("costBrain.kpiMultiHint")}
        />
        <Kpi
          label={t("costBrain.kpiSavings")}
          value={overview ? cur(overview.best?.estimatedUnitSavings ?? 0) : "—"}
          hint={t("costBrain.kpiSavingsHint")}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={tab === tb.id ? "btn" : "btn secondary"}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "alerts" ? (
        <section className="card" style={{ padding: 16, overflowX: "auto" }}>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
            {t("costBrain.alertsIntro")}
          </p>
          {alerts.length === 0 ? (
            <EmptyState title={t("costBrain.alertsEmpty")} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>{t("costBrain.colProduct")}</th>
                  <th style={th}>{t("costBrain.colSupplier")}</th>
                  <th style={th}>{t("costBrain.colLatest")}</th>
                  <th style={th}>{t("costBrain.colBaseline")}</th>
                  <th style={th}>{t("costBrain.colRise")}</th>
                  <th style={th}>{t("costBrain.colMargin")}</th>
                  <th style={th}>{t("costBrain.colSeverity")}</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={`${a.productId}-${a.supplierId || "any"}-${a.latestAt}`}>
                    <td style={td}>{productDisplayName(a, locale)}</td>
                    <td style={td}>{a.supplierName || "—"}</td>
                    <td style={td}>{cur(a.latestUnitCost)}</td>
                    <td style={td}>{cur(a.baselineUnitCost)}</td>
                    <td style={td}>
                      +{a.risePct}% ({cur(a.riseAbs)})
                    </td>
                    <td style={td}>
                      {a.marginPctBefore != null ? `${a.marginPctBefore}%` : "—"} →{" "}
                      {a.marginPctAfter != null ? `${a.marginPctAfter}%` : "—"}
                    </td>
                    <td style={td}>
                      <SeverityBadge level={a.severity} t={t} />
                    </td>
                    <td style={td}>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => loadHistory(a.productId)}
                      >
                        {t("costBrain.viewHistory")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "scorecards" ? (
        <section className="card" style={{ padding: 16, overflowX: "auto" }}>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
            {t("costBrain.scoreIntro")}
          </p>
          {scorecards.length === 0 ? (
            <EmptyState title={t("costBrain.scoreEmpty")} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>{t("costBrain.colSupplier")}</th>
                  <th style={th}>{t("costBrain.colPurchases")}</th>
                  <th style={th}>{t("costBrain.colSpend")}</th>
                  <th style={th}>{t("costBrain.colSkus")}</th>
                  <th style={th}>{t("costBrain.colCostIndex")}</th>
                  <th style={th}>{t("costBrain.colScore")}</th>
                </tr>
              </thead>
              <tbody>
                {scorecards.map((s) => (
                  <tr key={s.supplierId}>
                    <td style={td}>{s.name}</td>
                    <td style={td}>
                      {s.purchaseCount} · {s.reliabilityProxy?.purchaseFrequencyPerWeek}/
                      {t("costBrain.week")}
                    </td>
                    <td style={td}>
                      {cur(s.totalSpend)} ({s.reliabilityProxy?.volumeSharePct}%)
                    </td>
                    <td style={td}>{s.distinctSkus}</td>
                    <td style={td}>{s.avgUnitCostIndex}</td>
                    <td style={td}>
                      <strong>{s.reliabilityProxy?.score}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "best" ? (
        <section className="card" style={{ padding: 16, overflowX: "auto" }}>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
            {t("costBrain.bestIntro")}
          </p>
          {best.length === 0 ? (
            <EmptyState title={t("costBrain.bestEmpty")} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>{t("costBrain.colProduct")}</th>
                  <th style={th}>{t("costBrain.colBest")}</th>
                  <th style={th}>{t("costBrain.colAlt")}</th>
                  <th style={th}>{t("costBrain.colSave")}</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {best.map((r) => (
                  <tr key={r.productId}>
                    <td style={td}>
                      {productDisplayName(r, locale)}
                      {r.suggestedForReorder ? (
                        <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>
                          {t("costBrain.switchHint")}
                        </div>
                      ) : null}
                    </td>
                    <td style={td}>
                      {r.bestSupplierName || "—"} · {cur(r.bestUnitCost)}
                    </td>
                    <td style={td}>
                      {r.altSupplierName
                        ? `${r.altSupplierName} · ${cur(r.altUnitCost)}`
                        : "—"}
                    </td>
                    <td style={td}>{r.savingsPerUnit > 0 ? cur(r.savingsPerUnit) : "—"}</td>
                    <td style={td}>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => loadHistory(r.productId)}
                      >
                        {t("costBrain.viewHistory")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="card" style={{ padding: 16, overflowX: "auto" }}>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
            {t("costBrain.historyIntro")}
          </p>
          {!historyProductId ? (
            <EmptyState title={t("costBrain.historyPick")} />
          ) : histBusy ? (
            <p style={{ color: "var(--muted)" }}>{t("costBrain.loading")}</p>
          ) : !history || !(history.points || []).length ? (
            <EmptyState title={t("costBrain.historyEmpty")} />
          ) : (
            <>
              <div style={{ marginBottom: 12, fontWeight: 700 }}>
                {productDisplayName(history, locale)}
                {history.currentCost != null ? (
                  <span style={{ fontWeight: 500, color: "var(--muted)", marginInlineStart: 8 }}>
                    {t("costBrain.shelfCost")}: {cur(history.currentCost)}
                    {history.sellPrice != null ? ` · ${t("costBrain.sellPrice")}: ${cur(history.sellPrice)}` : ""}
                  </span>
                ) : null}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>{t("costBrain.colDate")}</th>
                    <th style={th}>{t("costBrain.colSupplier")}</th>
                    <th style={th}>{t("costBrain.colQty")}</th>
                    <th style={th}>{t("costBrain.colUnitCost")}</th>
                    <th style={th}>{t("costBrain.colSubtotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.points.map((p) => (
                    <tr key={p.purchaseItemId}>
                      <td style={td}>
                        {new Date(p.receivedAt).toLocaleString(loc, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td style={td}>{p.supplierName || "—"}</td>
                      <td style={td}>{p.quantity}</td>
                      <td style={td}>{cur(p.unitCost)}</td>
                      <td style={td}>{cur(p.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
