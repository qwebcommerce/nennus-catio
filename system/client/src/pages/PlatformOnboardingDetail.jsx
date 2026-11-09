import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const BASE = import.meta.env.VITE_API_URL || "";

export default function PlatformOnboardingDetail() {
  const { orgId } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");

  const load = () =>
    api(`/api/platform/organizations/${encodeURIComponent(orgId)}/onboarding`)
      .then((d) => {
        setData(d);
        setNote(d.organization?.onboardingReviewNote || "");
      })
      .catch((e) => setErr(e.message || "Failed to load"));

  useEffect(() => {
    load();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const openDoc = async (docType) => {
    setErr("");
    try {
      const res = await fetch(
        `${BASE}/api/platform/organizations/${encodeURIComponent(orgId)}/documents/${encodeURIComponent(docType)}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      if (!res.ok) throw new Error("Could not open document");
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewType(blob.type || "");
    } catch (e) {
      setErr(e.message || "Document error");
    }
  };

  const decide = async (action) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await api(`/api/platform/organizations/${encodeURIComponent(orgId)}/onboarding/${action}`, {
        method: "POST",
        body: { note },
      });
      setMsg(action === "approve" ? t("platform.approved") : t("platform.rejected"));
      await load();
      if (action === "approve") {
        setTimeout(() => nav("/platform/onboarding"), 800);
      }
    } catch (e) {
      setErr(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (err && !data) return <div className="mkt-error">{err}</div>;
  if (!data) return <div style={{ padding: 24 }}>{t("common.loading")}</div>;

  const o = data.organization;

  const fields = [
    ["Legal name", o.legalName || o.name],
    ["Slug", o.slug],
    ["Country / city", `${o.country || "—"} / ${o.city || "—"}`],
    ["Address", o.addressText],
    ["CR number", o.crNumber],
    ["License", o.licenseNumber],
    ["Owner", o.ownerFullName],
    ["Owner ID", o.ownerIdNumber],
    ["Owner phone", o.ownerPhone],
    ["Authorized", o.authorizedPersonName],
    ["VAT", o.vatNumber],
    ["Tax #", o.taxNumber],
    ["IBAN", o.iban],
    ["Vertical", o.businessVertical],
    ["Plan", `${o.plan}${o.selectedPlanInterval ? ` / ${o.selectedPlanInterval}` : ""}`],
    ["Payment", o.paymentDone ? "Paid" : "Unpaid"],
    ["Status", o.onboardingReviewStatus],
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link to="/platform/onboarding">← {t("platform.backQueue")}</Link>
          <h1 style={{ margin: "8px 0 0" }}>{o.legalName || o.name}</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
            {t(`platform.status.${o.onboardingReviewStatus || "NOT_SUBMITTED"}`)}
          </p>
        </div>
      </div>

      {err ? <div className="mkt-error">{err}</div> : null}
      {msg ? <div style={{ color: "var(--accent)" }}>{msg}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("platform.companyDetails")}</h3>
          <dl style={{ display: "grid", gap: 10, margin: 0 }}>
            {fields.map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
                <dt style={{ color: "var(--muted)", fontSize: 12 }}>{k}</dt>
                <dd style={{ margin: 0 }}>{v || "—"}</dd>
              </div>
            ))}
          </dl>

          <h4>{t("platform.admins")}</h4>
          <ul>
            {(data.admins || []).map((u) => (
              <li key={u.id}>
                {u.name} — {u.email}
              </li>
            ))}
          </ul>

          <h4>{t("platform.documents")}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(data.documents || []).map((d) => (
              <button
                key={d.id}
                type="button"
                className="btn-touch"
                style={{ background: "var(--surface2)" }}
                onClick={() => openDoc(d.docType)}
              >
                {d.docType} ({d.fileName})
              </button>
            ))}
            {!data.documents?.length ? <span style={{ color: "var(--muted)" }}>—</span> : null}
          </div>

          {previewUrl ? (
            <div style={{ marginTop: 16 }}>
              <h4>{t("platform.preview")}</h4>
              {previewType.startsWith("image/") ? (
                <img src={previewUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />
              ) : (
                <iframe title="doc" src={previewUrl} style={{ width: "100%", height: 420, border: "1px solid var(--border)" }} />
              )}
            </div>
          ) : null}
        </section>

        <section className="card" style={{ padding: 16, alignSelf: "start" }}>
          <h3 style={{ marginTop: 0 }}>{t("platform.decision")}</h3>
          <label style={{ display: "grid", gap: 6 }}>
            <span>{t("platform.reviewNote")}</span>
            <textarea
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: "100%", borderRadius: 10, padding: 10 }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-touch"
              disabled={busy || o.onboardingReviewStatus === "APPROVED"}
              onClick={() => decide("approve")}
              style={{ background: "#15803d", color: "#fff" }}
            >
              {t("platform.approve")}
            </button>
            <button
              type="button"
              className="btn-touch"
              disabled={busy}
              onClick={() => decide("reject")}
              style={{ background: "#b91c1c", color: "#fff" }}
            >
              {t("platform.reject")}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            {t("platform.decisionHint")}
          </p>
        </section>
      </div>
    </div>
  );
}
