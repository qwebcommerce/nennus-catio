import React, { useCallback, useEffect, useState } from "react";
import { api, editErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { formatDateTime } from "../utils/qatarDate.js";
import { ChangeSummary, JobFacts, KindBadge, money, personLabel } from "../components/DispatchShared.jsx";

/** fix-rb: supervisors / accountants (and the owner) approve or reject drivers' order edits. */

function RequestCard({ r, canDecide, onChanged, setError, setNotice }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/driver-approvals/${r.id}/${action}`, { method: "POST", body: { version: r.version, ...(action === "reject" ? { reason } : {}) } });
      setNotice(t(action === "approve" ? "apr.approvedOk" : "apr.rejectedOk", { reference: r.job?.reference || "" }));
      await onChanged();
    } catch (x) {
      setError(editErrorMessage(x, t));
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const tone = r.status === "APPROVED" ? "ok" : r.status === "REJECTED" ? "bad" : "warn";
  return (
    <li className="card vr-item" data-testid="request-card" data-ref={r.job?.reference}>
      <div className="vr-item__head">
        <strong>{r.job?.reference}</strong>
        <span className="vr-badges">{r.job ? <KindBadge kind={r.job.kind} /> : null}<span className={`vr-badge vr-badge--${tone}`} data-testid="request-status">{t(`apr.status.${r.status}`)}</span></span>
      </div>
      <p className="vr-muted">{t("apr.askedBy", { name: personLabel(r.requestedBy, locale), at: formatDateTime(r.createdAt, locale) })}{r.job?.vehicle ? ` · ${r.job.vehicle.plate}` : ""}</p>
      <ChangeSummary request={r} />
      {r.preview ? (
        <p data-testid="total-preview"><b>{t("apr.totalChange", { before: money(r.preview.totalBefore, t), after: money(r.preview.totalAfter, t) })}</b> · {t("apr.paidSoFar", { paid: money(r.preview.amountPaid, t) })}</p>
      ) : null}
      {r.reason ? <p className="vr-muted">{t("apr.driverReason")}: {r.reason}</p> : null}
      {r.job ? <details><summary>{t("apr.orderDetails")}</summary><JobFacts item={r.job} showDriver /></details> : null}
      {r.status !== "PENDING" ? (
        <p className="vr-muted" data-testid="decision">{t("apr.decidedBy", { name: personLabel(r.decidedBy, locale), at: formatDateTime(r.decidedAt, locale) })}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</p>
      ) : canDecide ? (
        <>
          <div className="vr-actions">
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy} onClick={() => decide("approve")} data-testid="approve">{t("apr.approve")}</button>
            <button type="button" className="btn-touch vr-btn" disabled={busy} onClick={() => setMode(mode === "reject" ? "" : "reject")} data-testid="reject">{t("apr.reject")}</button>
          </div>
          {mode === "reject" ? (
            <div className="vr-grid">
              <label className="vr-field"><span>{t("apr.rejectReason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reject-reason" /></label>
              <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy || !reason.trim()} onClick={() => decide("reject")} data-testid="confirm-reject">{t("apr.confirmReject")}</button>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export default function DriverApprovals() {
  const { t } = useI18n();
  const { canModule } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api(`/api/driver-approvals?status=${status}`));
    } catch (e) {
      setError(e.message);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="vr-page" data-testid="approvals-page">
      <h1>{t("apr.title")}</h1>
      <p className="vr-muted">{t("apr.hint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="notice">{notice}</div> : null}
      <div className="vr-tabs" role="tablist">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={`vr-tab${status === s ? " vr-tab--on" : ""}`} onClick={() => setStatus(s)} data-testid={`tab-${s}`}>
            {t(`apr.status.${s}`)} ({data?.counts?.[s] ?? 0})
          </button>
        ))}
      </div>
      {data?.items?.length ? (
        <ul className="vr-list">
          {data.items.map((r) => <RequestCard key={`${r.id}:${r.version}`} r={r} canDecide={canModule("driverApprovals", "edit")} onChanged={load} setError={setError} setNotice={setNotice} />)}
        </ul>
      ) : <p className="card vr-muted" data-testid="empty">{data ? t("apr.empty") : t("common.loading")}</p>}
    </div>
  );
}
