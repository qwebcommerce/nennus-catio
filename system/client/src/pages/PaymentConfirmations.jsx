import React, { useCallback, useEffect, useState } from "react";
import { api, editErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { formatDateTime } from "../utils/qatarDate.js";
import { branchDisplayName } from "../utils/displayLabels.js";
import { FileLink } from "../components/BizShared.jsx";
import { ConfirmBadge } from "../components/PaymentConfirmShared.jsx";
import { personName } from "./Transfer.jsx";

const STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "REJECTED", "ALL"];
const KINDS = ["B2B_RECEIPT", "SO_PAYMENT", "ACCOUNT_PAYMENT"];
const METHODS = ["CASH", "BANK_TRANSFER", "CARD"];

/**
 * fix-rd: the accountant's queue. Money collected outside the till waits here until it is
 * confirmed (then it counts in finance) or rejected with a reason. Nobody decides on money they
 * collected or recorded themselves (the top admin excepted).
 */
function Row({ row, canDecide, onDone, setError }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [mode, setMode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const own = user?.role !== "ADMIN" && (row.collectedBy?.id === user?.id || row.recordedBy?.id === user?.id);
  const act = async (path, body, notice) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/payment-confirmations/${encodeURIComponent(row.key)}/${path}`, { method: "POST", body: { version: row.version, ...body } });
      setMode("");
      onDone(t(notice, { amount: `${row.amount} ${t("common.currency")}` }));
    } catch (x) {
      setError(editErrorMessage(x, t));
      onDone("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="card vr-item" data-testid="pc-row" data-key={row.key} data-kind={row.kind}>
      <div className="vr-item__head">
        <strong data-testid="pc-amount">{row.amount} {t("common.currency")}</strong>
        <span className="vr-badges">
          <ConfirmBadge status={row.status} />
          <span className="vr-badge">{t(`pc.kind.${row.kind}`)}</span>
          <span className="vr-badge">{t(`pc.method.${row.method}`) === `pc.method.${row.method}` ? row.method : t(`pc.method.${row.method}`)}</span>
          {row.viaDriver ? <span className="vr-badge vr-badge--warn" data-testid="pc-driver">{t("pc.viaDriver")}</span> : null}
        </span>
      </div>
      <dl className="vr-meta">
        <div><dt>{t("pc.customer")}</dt><dd data-testid="pc-customer">{row.customer?.name || "—"}{row.customer?.phone ? ` · ${row.customer.phone}` : ""}</dd></div>
        <div><dt>{t("pc.document")}</dt><dd data-testid="pc-document">{[row.document, row.invoiceRef && row.invoiceRef !== row.document ? row.invoiceRef : null, ...(row.kind === "B2B_RECEIPT" ? row.orderRefs : [])].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt>{t("pc.date")}</dt><dd>{formatDateTime(row.paidAt, locale)}</dd></div>
        <div><dt>{t("pc.collectedBy")}</dt><dd data-testid="pc-collector">{personName(row.collectedBy, locale)}</dd></div>
        <div><dt>{t("pc.recordedBy")}</dt><dd>{personName(row.recordedBy, locale)}</dd></div>
        {row.reference ? <div><dt>{t("pc.reference")}</dt><dd>{row.reference}</dd></div> : null}
        {row.branch ? <div><dt>{t("b2b.location")}</dt><dd>{branchDisplayName(row.branch, locale)}{row.cashSession ? ` · ${t("pc.inSession", { state: t(row.cashSession.closed ? "pc.sessionClosed" : "pc.sessionOpen") })}` : ""}</dd></div> : null}
        <div><dt>{t("pc.proof")}</dt><dd>{row.proofFile ? <FileLink file={row.proofFile} label={t("pc.viewProof")} /> : <span className="vr-muted">{t("pc.noProof")}</span>}</dd></div>
        {row.status === "CONFIRMED" ? (
          <div><dt>{t("pc.status.CONFIRMED")}</dt><dd>{row.confirmedBy ? t("pc.decidedBy", { who: personName(row.confirmedBy, locale), at: formatDateTime(row.confirmedAt, locale) }) : `${t("pc.migrated")} · ${formatDateTime(row.confirmedAt, locale)}`}</dd></div>
        ) : null}
        {row.status === "REJECTED" ? (
          <div><dt>{t("pc.status.REJECTED")}</dt><dd data-testid="pc-reject-reason">{t("pc.decidedBy", { who: personName(row.rejectedBy, locale), at: formatDateTime(row.rejectedAt, locale) })} · {row.rejectReason}</dd></div>
        ) : null}
      </dl>
      {row.status === "PENDING_CONFIRMATION" && canDecide ? (
        own ? <p className="vr-muted" data-testid="pc-own">{t("pc.ownPayment")}</p> : (
          <div className="vr-actions">
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy} onClick={() => act("confirm", {}, "pc.confirmed")} data-testid="pc-confirm">{t("pc.confirm")}</button>
            <button type="button" className="btn-touch vr-btn vr-btn--ghost" disabled={busy} onClick={() => setMode(mode === "reject" ? "" : "reject")} data-testid="pc-reject">{t("pc.reject")}</button>
          </div>
        )
      ) : null}
      {mode === "reject" ? (
        <div className="vr-grid vr-sub" data-testid="pc-reject-form">
          <label className="vr-field"><span>{t("pc.rejectReason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="pc-reason" /></label>
          <div className="vr-actions">
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy || !reason.trim()} onClick={() => act("reject", { reason }, "pc.rejected")} data-testid="pc-confirm-reject">{t("pc.confirmReject")}</button>
            <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={() => setMode("")}>{t("pc.cancel")}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function PaymentConfirmations() {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const canDecide = canModule("paymentConfirm", "edit");
  const [filters, setFilters] = useState({ status: "PENDING_CONFIRMATION", kind: "", method: "", collectedById: "", from: "", to: "", q: "" });
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try {
      setData(await api(`/api/payment-confirmations${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e.message);
    }
  }, [filters]);
  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load]);
  // Collector filter: everyone seen collecting in the lists loaded so far.
  useEffect(() => {
    if (!data?.rows) return;
    setStaff((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const r of data.rows) if (r.collectedBy?.id) byId.set(r.collectedBy.id, r.collectedBy);
      return [...byId.values()];
    });
  }, [data]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div className="vr-page" data-testid="pc-page">
      <h1>{t("pc.title")}</h1>
      <p className="vr-muted">{t("pc.hint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="pc-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="pc-notice">{notice}</div> : null}
      <div className="card vr-card vr-grid" data-testid="pc-filters">
        <label className="vr-field"><span>{t("pc.statusLabel")}</span>
          <select value={filters.status} onChange={set("status")} data-testid="pc-filter-status">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`pc.status.${s}`)}</option>)}
          </select>
        </label>
        <label className="vr-field"><span>{t("pc.kindLabel")}</span>
          <select value={filters.kind} onChange={set("kind")} data-testid="pc-filter-kind">
            <option value="">{t("pc.all")}</option>
            {KINDS.map((k) => <option key={k} value={k}>{t(`pc.kind.${k}`)}</option>)}
          </select>
        </label>
        <label className="vr-field"><span>{t("pc.methodLabel")}</span>
          <select value={filters.method} onChange={set("method")} data-testid="pc-filter-method">
            <option value="">{t("pc.all")}</option>
            {METHODS.map((m) => <option key={m} value={m}>{t(`pc.method.${m}`)}</option>)}
          </select>
        </label>
        {staff.length ? (
          <label className="vr-field"><span>{t("pc.collectedBy")}</span>
            <select value={filters.collectedById} onChange={set("collectedById")} data-testid="pc-filter-collector">
              <option value="">{t("pc.all")}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{personName(s, locale)}</option>)}
            </select>
          </label>
        ) : null}
        <label className="vr-field"><span>{t("pc.from")}</span><input type="date" value={filters.from} onChange={set("from")} /></label>
        <label className="vr-field"><span>{t("pc.to")}</span><input type="date" value={filters.to} onChange={set("to")} /></label>
        <label className="vr-field"><span>{t("pc.search")}</span><input type="search" value={filters.q} onChange={set("q")} data-testid="pc-search" /></label>
      </div>
      {data ? <p className="vr-muted" data-testid="pc-total">{t("pc.total", { n: data.totals.count, amount: `${data.totals.amount} ${t("common.currency")}` })}</p> : null}
      {data?.rows?.length ? (
        <ul className="vr-list">
          {data.rows.map((row) => (
            <Row key={`${row.key}:${row.version}`} row={row} canDecide={canDecide} setError={setError} onDone={async (msg) => { if (msg) setNotice(msg); await load(); }} />
          ))}
        </ul>
      ) : data ? <p className="vr-muted card" data-testid="pc-none">{t("pc.none")}</p> : <p className="vr-muted">{t("common.loading")}</p>}
    </div>
  );
}
