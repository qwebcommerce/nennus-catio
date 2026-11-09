import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { useAuth } from "../context/AuthContext.jsx";
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

function Kpi({ label, value, hint, tone }) {
  const accent =
    tone === "up"
      ? "#15803d"
      : tone === "down"
        ? "#b91c1c"
        : tone === "warn"
          ? "#c2410c"
          : "var(--text)";
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: accent }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function severityTone(level) {
  switch (String(level || "").toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return { bg: "rgba(220, 38, 38, 0.12)", color: "#b91c1c" };
    case "WARN":
    case "MEDIUM":
      return { bg: "rgba(234, 88, 12, 0.12)", color: "#c2410c" };
    default:
      return { bg: "rgba(100, 116, 139, 0.12)", color: "#475569" };
  }
}

function LevelBadge({ level, label }) {
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
      {label}
    </span>
  );
}

function fmtDelta(pct, t) {
  const n = Number(pct) || 0;
  const sign = n > 0 ? "+" : "";
  return t("commandCenter.deltaPct", { pct: `${sign}${n}` });
}

export default function CommandCenter() {
  const { t, locale } = useI18n();
  const { format: cur } = useOrgCurrency();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const isAdmin = user?.role === "ADMIN";

  const [date, setDate] = useState("");
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const load = useCallback(async () => {
    if (!branchId) {
      setBrief(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({ branchId });
      if (date) q.set("date", date);
      if (isAdmin) q.set("compareBranches", "1");
      const data = await api(`/api/intelligence/brief/daily?${q}`);
      setBrief(data);
    } catch (e) {
      setBrief(null);
      setErr(e?.message || t("commandCenter.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [branchId, date, isAdmin, t]);

  useEffect(() => {
    load();
  }, [load]);

  const headline = useMemo(() => {
    if (!brief?.headline) return "";
    return locale === "en" ? brief.headline.en : brief.headline.ar;
  }, [brief, locale]);

  const shareBody = useMemo(() => {
    if (!brief?.shareText) return "";
    return locale === "en" ? brief.shareText.en : brief.shareText.ar;
  }, [brief, locale]);

  async function copyShare() {
    if (!shareBody) return;
    try {
      await navigator.clipboard.writeText(shareBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function anomalyLabel(code) {
    const key = `commandCenter.anomaly.${code}`;
    const translated = t(key);
    return translated === key ? code : translated;
  }

  if (!branchId) {
    return (
      <div className="page">
        <EmptyState title={t("commandCenter.needBranch")} />
      </div>
    );
  }

  const salesTone =
    brief && brief.sales.deltaPct > 3 ? "up" : brief && brief.sales.deltaPct < -3 ? "down" : null;

  return (
    <div className="page" style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t("commandCenter.title")}</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", maxWidth: 640 }}>
            {t("commandCenter.intro")}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--muted)" }}>
            {t("commandCenter.date")}
            <input
              type="date"
              value={date || brief?.date || ""}
              onChange={(e) => setDate(e.target.value)}
              style={inp}
            />
          </label>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? t("commandCenter.loading") : t("commandCenter.refresh")}
          </button>
          <button type="button" className="btn secondary" onClick={copyShare} disabled={!shareBody}>
            {copied ? t("commandCenter.copied") : t("commandCenter.copyShare")}
          </button>
        </div>
      </header>

      {err ? (
        <div className="card" style={{ padding: 12, color: "#b91c1c" }}>
          {err}
        </div>
      ) : null}

      {brief ? (
        <>
          <section className="card" style={{ padding: 16, background: "linear-gradient(135deg, rgba(15,23,42,0.04), rgba(14,165,233,0.06))" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
              {t("commandCenter.headlineFor", { date: brief.date })}
            </div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.45 }}>{headline}</p>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <Kpi
              label={t("commandCenter.kpiSales")}
              value={cur(brief.sales.focus.total)}
              hint={`${brief.sales.focus.count} · ${fmtDelta(brief.sales.deltaPct, t)}`}
              tone={salesTone}
            />
            <Kpi
              label={t("commandCenter.kpiVsWeek")}
              value={fmtDelta(brief.sales.weekDeltaPct, t)}
              hint={t("commandCenter.kpiVsWeekHint")}
              tone={brief.sales.weekDeltaPct < -10 ? "down" : brief.sales.weekDeltaPct > 10 ? "up" : null}
            />
            <Kpi
              label={t("commandCenter.kpiRestock")}
              value={String(brief.stock.lowCount)}
              hint={t("commandCenter.kpiRestockHint", { n: String(brief.stock.reorderCritical) })}
              tone={brief.stock.reorderCritical > 0 ? "warn" : null}
            />
            <Kpi
              label={t("commandCenter.kpiWaste")}
              value={String(brief.waste.count)}
              hint={t("commandCenter.kpiWasteHint", { value: cur(brief.waste.valueAtRisk) })}
              tone={brief.waste.count > 0 ? "warn" : null}
            />
            <Kpi
              label={t("commandCenter.kpiRefunds")}
              value={cur(brief.refunds.total)}
              hint={`${brief.refunds.count} · ${fmtDelta(brief.refunds.deltaPct, t)}`}
              tone={brief.refunds.count >= 3 ? "warn" : null}
            />
            <Kpi
              label={t("commandCenter.kpiCashier")}
              value={String(brief.cashier.anomalyCount)}
              hint={t("commandCenter.kpiCashierHint")}
              tone={brief.cashier.anomalyCount > 0 ? "warn" : null}
            />
          </div>

          {brief.actions?.length ? (
            <section style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {brief.actions.map((a) => (
                <Link key={a.id} to={a.path} className="btn secondary" style={{ textDecoration: "none" }}>
                  {t(a.labelKey)}
                  {a.count != null ? ` (${a.count})` : ""}
                </Link>
              ))}
            </section>
          ) : null}

          {(brief.anomalies || []).length > 0 ? (
            <section className="card" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{t("commandCenter.anomaliesTitle")}</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {brief.anomalies.map((a) => (
                  <li
                    key={a.code}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span>{anomalyLabel(a.code)}</span>
                    <LevelBadge
                      level={a.level}
                      label={t(`commandCenter.level.${String(a.level || "WARN").toUpperCase()}`)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            <section className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{t("commandCenter.restockTitle")}</h2>
                <Link to="/stock-brain">{t("commandCenter.openStock")}</Link>
              </div>
              {(brief.stock.top || []).length === 0 ? (
                <p style={{ color: "var(--muted)", margin: 0 }}>{t("commandCenter.restockEmpty")}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {brief.stock.top.map((r) => (
                    <li
                      key={r.productId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {productDisplayName(r, locale)}
                      </span>
                      <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {r.currentQty} → +{r.suggestedQty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{t("commandCenter.wasteTitle")}</h2>
                <Link to="/stock-brain">{t("commandCenter.openWaste")}</Link>
              </div>
              {(brief.waste.top || []).length === 0 ? (
                <p style={{ color: "var(--muted)", margin: 0 }}>{t("commandCenter.wasteEmpty")}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {brief.waste.top.map((r, idx) => (
                    <li
                      key={`${r.productId}-${idx}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{productDisplayName(r, locale)}</span>
                      <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {t("commandCenter.daysLeft", { n: String(r.daysUntilExpiry ?? "—") })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{t("commandCenter.pricingTitle")}</h2>
                <Link to="/pricing-brain">{t("commandCenter.openPricing")}</Link>
              </div>
              {(brief.pricing?.top || []).length === 0 ? (
                <p style={{ color: "var(--muted)", margin: 0 }}>{t("commandCenter.pricingEmpty")}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {brief.pricing.top.map((r) => (
                    <li
                      key={r.productId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{productDisplayName(r, locale)}</span>
                      <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        −{r.suggestedDiscountPct}% → {cur(r.suggestedPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card" style={{ padding: 16, overflowX: "auto" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{t("commandCenter.cashierTitle")}</h2>
            {(brief.cashier.alerts || []).length === 0 && (brief.refunds.items || []).length === 0 ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>{t("commandCenter.cashierEmpty")}</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>{t("commandCenter.colType")}</th>
                    <th style={th}>{t("commandCenter.colCashier")}</th>
                    <th style={th}>{t("commandCenter.colAmount")}</th>
                    <th style={th}>{t("commandCenter.colDetail")}</th>
                    <th style={th}>{t("commandCenter.colTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(brief.cashier.alerts || []).map((a) => (
                    <tr key={`d-${a.saleId}`}>
                      <td style={td}>
                        <LevelBadge level={a.level} label={t("commandCenter.rowDiscount")} />
                      </td>
                      <td style={td}>{a.cashier}</td>
                      <td style={td}>{cur(a.discountAmount)}</td>
                      <td style={td}>
                        {a.discountPercent}%
                        {a.missingReason ? ` · ${t("commandCenter.missingReason")}` : ""}
                        {a.invoiceNumber ? ` · #${a.invoiceNumber}` : ""}
                      </td>
                      <td style={td}>
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleString(loc, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {(brief.refunds.items || []).map((r) => (
                    <tr key={`r-${r.id}`}>
                      <td style={td}>
                        <LevelBadge
                          level={r.missingNote ? "HIGH" : r.highValue ? "WARN" : "LOW"}
                          label={t("commandCenter.rowRefund")}
                        />
                      </td>
                      <td style={td}>{r.cashier}</td>
                      <td style={td}>{cur(r.total)}</td>
                      <td style={td}>
                        {r.missingNote
                          ? t("commandCenter.missingNote")
                          : r.note || t("commandCenter.noNote")}
                      </td>
                      <td style={td}>
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString(loc, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {isAdmin && (brief.branches || []).length > 0 ? (
            <section className="card" style={{ padding: 16, overflowX: "auto" }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{t("commandCenter.branchesTitle")}</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>{t("commandCenter.colBranch")}</th>
                    <th style={th}>{t("commandCenter.colTickets")}</th>
                    <th style={th}>{t("commandCenter.colSales")}</th>
                    <th style={th}>{t("commandCenter.colRefunds")}</th>
                  </tr>
                </thead>
                <tbody>
                  {brief.branches.map((b) => (
                    <tr key={b.branchId}>
                      <td style={td}>{b.name}</td>
                      <td style={td}>{b.salesCount}</td>
                      <td style={td}>{cur(b.salesTotal)}</td>
                      <td style={td}>
                        {b.refundCount} · {cur(b.refundTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            {t("commandCenter.shareHint")}
          </p>
        </>
      ) : loading ? (
        <p style={{ color: "var(--muted)" }}>{t("commandCenter.loading")}</p>
      ) : null}
    </div>
  );
}
