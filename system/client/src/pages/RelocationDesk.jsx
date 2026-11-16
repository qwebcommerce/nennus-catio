import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDateTime } from "../utils/qatarDate.js";
import { money2, toDirhams } from "../utils/money.js";

const NEXT = {
  SUBMITTED: ["DOCUMENTS_REQUESTED", "UNDER_REVIEW", "CANCELLED"],
  DOCUMENTS_REQUESTED: ["CANCELLED"],
  DOCUMENTS_RECEIVED: ["UNDER_REVIEW", "DOCUMENTS_REQUESTED", "CANCELLED"],
  UNDER_REVIEW: ["DOCUMENTS_REQUESTED", "CANCELLED"],
  PAID: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};

export default function RelocationDesk() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [quote, setQuote] = useState({});
  const [bankRef, setBankRef] = useState({});
  const [msg, setMsg] = useState("");
  const load = () => api("/api/relocation").then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  /** NFR-13: edits send the version they were loaded at; a stale copy shows the notice and reloads. */
  const editFailed = (err) => {
    setMsg(editErrorMessage(err, t));
    if (isStaleEdit(err)) load();
  };
  const saveNotes = (row, staffNotes) => {
    if ((row.staffNotes || "") === staffNotes) return;
    api(`/api/relocation/${row.id}/notes`, { method: "POST", body: { staffNotes, version: row.version } })
      .then((saved) => setRows((list) => list.map((r) => (r.id === row.id ? { ...r, staffNotes: saved.staffNotes, version: saved.version } : r))))
      .catch(editFailed);
  };
  /**
   * Documents are downloaded through a 5-minute signed link and served as an attachment
   * (never rendered as a same-origin page).
   */
  const openDoc = async (id, docId) => {
    try {
      const link = await api(`/api/relocation/${id}/documents/${docId}/link`);
      const a = document.createElement("a");
      a.href = `${import.meta.env.VITE_API_URL || ""}${link.url}`;
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setMsg(t("shop.documentFail"));
    }
  };
  const fail = (e) => setMsg(e.message);
  const captured = (row) => (row.payments || []).filter((p) => p.kind === "PAYMENT" && ["CAPTURED", "REJECTED"].includes(p.status)).reduce((s, p) => s + toDirhams(p.amount), 0) / 100;
  const refunded = (row) => (row.payments || []).filter((p) => p.kind === "REFUND" && ["CAPTURED", "PENDING"].includes(p.status)).reduce((s, p) => s + toDirhams(p.amount), 0) / 100;
  const setStatus = (row, status) => {
    const body = { status };
    if (status === "CANCELLED" && captured(row) - refunded(row) > 0) {
      if (window.confirm(t("shop.refundDecision"))) body.refundDecision = "FULL_REFUND";
      else {
        const note = window.prompt(t("shop.keepReason"));
        if (!note) return;
        body.refundDecision = "NO_REFUND";
        body.note = note;
      }
    }
    api(`/api/relocation/${row.id}/status`, { method: "POST", body }).then(load).catch(fail);
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.relocation")}</h1>
      {rows.map((row) => (
        <article key={row.id} className="card" style={{ display: "grid", gap: 6 }}>
          <strong>{row.reference || row.id} · {row.customer?.name} · {row.destination} · {statusLabel("relocation", row.status, locale)}</strong>
          {row.createdAt ? <div>{formatDateTime(row.createdAt, locale)}</div> : null}
          {(row.payments || []).map((p) => (
            <div key={p.id} style={{ fontSize: 13, color: "var(--muted)" }}>
              {p.kind} · {p.method} · {Number(p.amount).toFixed(2)} QAR · {p.status}{p.reference ? ` · ${p.reference}` : ""}
            </div>
          ))}
          {row.gatewayPaymentId && (row.status === "QUOTE_SENT" || row.paymentReview) ? (
            <div>
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/check-payment`, { method: "POST", body: {} })
                .then((r) => { setMsg(t("shop.checkPaymentResult", { status: r.gatewayStatus, outcome: r.outcome })); return load(); })
                .catch(fail)}>{t("shop.checkPayment")}</button>
            </div>
          ) : null}
          {row.paymentReview ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: "var(--danger, #b42318)" }}>
              <strong>{t("shop.paymentReview")}: {t(`shop.reviewReason.${row.paymentReviewReason || "AMOUNT_MISMATCH"}`)}</strong>
              {row.status === "QUOTE_SENT" ? (
                <button type="button" onClick={() => api(`/api/relocation/${row.id}/resolve-payment`, { method: "POST", body: { accept: true } }).then(load).catch(fail)}>{t("shop.keepPayment")}</button>
              ) : null}
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/resolve-payment`, { method: "POST", body: { accept: false } }).then(load).catch(fail)}>{t("shop.refundPayment")}</button>
            </div>
          ) : null}
          <div>{row.petSummary}</div>
          {(row.pets || []).map((link) => <div key={link.petId}>{link.pet?.name}</div>)}
          {(row.documents || []).map((doc) => (
            <button key={doc.id} type="button" onClick={() => openDoc(row.id, doc.id)}>{doc.fileName}</button>
          ))}
          <textarea key={`${row.id}-${row.version}`} placeholder={t("customers.notes")} defaultValue={row.staffNotes || ""} onBlur={(e) => saveNotes(row, e.target.value)} />
          {["UNDER_REVIEW", "QUOTE_SENT"].includes(row.status) ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={quote[row.id] || ""} onChange={(e) => setQuote({ ...quote, [row.id]: e.target.value })} />
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/quote`, { method: "POST", body: { amount: Number(quote[row.id]), version: row.version } }).then(load).catch(editFailed)}>{t("shop.sendQuote")}</button>
            </div>
          ) : null}
          {row.status === "QUOTE_SENT" ? (
            <>
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/pay`, { method: "POST", body: { method: "CASH", amount: Number(row.quoteAmount) } }).then(load).catch(fail)}>{t("shop.cashPaid")} · {Number(row.quoteAmount).toFixed(2)} QAR</button>
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder={t("shop.transferRef")} value={bankRef[row.id] || ""} onChange={(e) => setBankRef({ ...bankRef, [row.id]: e.target.value })} />
                <button type="button" disabled={!bankRef[row.id]} onClick={() => api(`/api/relocation/${row.id}/pay`, { method: "POST", body: { method: "BANK", amount: Number(row.quoteAmount), reference: bankRef[row.id] } }).then(load).catch(fail)}>{t("shop.bankPaid")}</button>
              </div>
            </>
          ) : null}
          {captured(row) - refunded(row) > 0 ? (
            <button type="button" onClick={() => {
              const amount = window.prompt(t("shop.refundAmount"), money2(toDirhams(captured(row)) - toDirhams(refunded(row))));
              if (!amount) return;
              api(`/api/relocation/${row.id}/refund`, { method: "POST", body: { amount: Number(amount) } }).then(load).catch(fail);
            }}>{t("shop.refund")}</button>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(NEXT[row.status] || []).map((status) => (
              <button key={status} type="button" onClick={() => setStatus(row, status)}>{statusLabel("relocation", status, locale)}</button>
            ))}
          </div>
        </article>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
