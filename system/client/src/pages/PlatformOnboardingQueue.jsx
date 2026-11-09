import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const FILTERS = ["PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"];

export default function PlatformOnboardingQueue() {
  const { t } = useI18n();
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (s = status) => {
    setLoading(true);
    setErr("");
    api(`/api/platform/onboarding-queue?status=${encodeURIComponent(s)}`)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.message || "Failed to load queue"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("platform.onboardingTitle")}</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{t("platform.onboardingIntro")}</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="btn-touch"
            onClick={() => setStatus(f)}
            style={{
              background: status === f ? "var(--accent)" : "var(--surface2)",
              color: status === f ? "#fff" : "var(--text)",
            }}
          >
            {t(`platform.status.${f}`)}
          </button>
        ))}
      </div>

      {err ? <div className="mkt-error">{err}</div> : null}
      {loading ? <div>{t("common.loading")}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "start", padding: 10 }}>{t("platform.org")}</th>
              <th style={{ textAlign: "start", padding: 10 }}>{t("platform.country")}</th>
              <th style={{ textAlign: "start", padding: 10 }}>{t("platform.docs")}</th>
              <th style={{ textAlign: "start", padding: 10 }}>{t("platform.payment")}</th>
              <th style={{ textAlign: "start", padding: 10 }}>{t("platform.statusLabel")}</th>
              <th style={{ textAlign: "start", padding: 10 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  <strong>{r.legalName || r.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.slug}</div>
                </td>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  {r.country || "—"}
                  {r.city ? ` / ${r.city}` : ""}
                </td>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  {r._count?.onboardingDocuments ?? 0}
                </td>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  {r.paymentDone ? t("platform.paid") : t("platform.unpaid")}
                </td>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  {t(`platform.status.${r.onboardingReviewStatus || "NOT_SUBMITTED"}`)}
                </td>
                <td style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                  <Link to={`/platform/onboarding/${r.id}`}>{t("platform.review")}</Link>
                </td>
              </tr>
            ))}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "var(--muted)" }}>
                  {t("platform.queueEmpty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
