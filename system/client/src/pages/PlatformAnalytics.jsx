import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function PlatformAnalytics() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/platform/analytics")
      .then(setData)
      .catch((e) => setErr(e.message || "Failed to load analytics"));
  }, []);

  if (err) return <div className="mkt-error">{err}</div>;
  if (!data) return <div style={{ padding: 24 }}>{t("common.loading")}</div>;

  const cards = [
    { label: t("platform.analyticsOrgs"), value: data.orgCount },
    { label: t("platform.analyticsUsers"), value: data.userCount },
    { label: t("platform.analyticsPending"), value: data.pendingReviews },
    {
      label: t("platform.analyticsPayments"),
      value: `${Number(data.paymentsTotalSar || 0).toFixed(2)} SAR`,
      sub: `${data.paymentsCount || 0} ${t("platform.analyticsTxns")}`,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t("platform.analyticsTitle")}</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{t("platform.analyticsIntro")}</p>
        </div>
        <Link to="/platform/onboarding" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
          {t("platform.reviewQueue")} ({data.pendingReviews})
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{c.value}</div>
            {c.sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{c.sub}</div> : null}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("platform.byCountry")}</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {(data.byCountry || []).map((r) => (
              <li key={r.country} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{r.country}</span>
                <strong>{r.count}</strong>
              </li>
            ))}
            {!data.byCountry?.length ? <li style={{ color: "var(--muted)" }}>—</li> : null}
          </ul>
        </section>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("platform.byPlan")}</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {(data.byPlan || []).map((r) => (
              <li key={r.plan} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{r.plan}</span>
                <strong>{r.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t("platform.recentPayments")}</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "start", padding: 8 }}>{t("platform.org")}</th>
              <th style={{ textAlign: "start", padding: 8 }}>{t("platform.amount")}</th>
              <th style={{ textAlign: "start", padding: 8 }}>{t("platform.date")}</th>
            </tr>
          </thead>
          <tbody>
            {(data.recentPurchases || []).map((p) => (
              <tr key={p.id}>
                <td style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                  {p.organizationName}
                  {p.country ? ` (${p.country})` : ""}
                </td>
                <td style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                  {p.amount != null ? `${Number(p.amount).toFixed(2)} ${p.currency || "SAR"}` : "—"}
                </td>
                <td style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                  {p.purchasedAt ? new Date(p.purchasedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {!data.recentPurchases?.length ? (
              <tr>
                <td colSpan={3} style={{ padding: 12, color: "var(--muted)" }}>
                  {t("platform.noPayments")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
