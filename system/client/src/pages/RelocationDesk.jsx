import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const NEXT = {
  SUBMITTED: ["DOCUMENTS_REQUESTED", "UNDER_REVIEW", "CANCELLED"],
  DOCUMENTS_REQUESTED: ["CANCELLED"],
  DOCUMENTS_RECEIVED: ["UNDER_REVIEW", "DOCUMENTS_REQUESTED", "CANCELLED"],
  UNDER_REVIEW: ["DOCUMENTS_REQUESTED", "CANCELLED"],
  PAID: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};

export default function RelocationDesk() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [quote, setQuote] = useState({});
  const [bankRef, setBankRef] = useState({});
  const [msg, setMsg] = useState("");
  const load = () => api("/api/relocation").then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  const openDoc = async (id, docId) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/relocation/${id}/documents/${docId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    });
    if (!res.ok) return setMsg(t("shop.documentFail"));
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob));
  };
  const fail = (e) => setMsg(e.message);
  const captured = (row) => (row.payments || []).filter((p) => p.kind === "PAYMENT" && ["CAPTURED", "REJECTED"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
  const refunded = (row) => (row.payments || []).filter((p) => p.kind === "REFUND" && ["CAPTURED", "PENDING"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
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
          <strong>{row.reference || row.id} · {row.customer?.name} · {row.destination} · {row.status}</strong>
          {(row.payments || []).map((p) => (
            <div key={p.id} style={{ fontSize: 13, color: "var(--muted)" }}>
              {p.kind} · {p.method} · {Number(p.amount).toFixed(2)} QAR · {p.status}{p.reference ? ` · ${p.reference}` : ""}
            </div>
          ))}
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
          <textarea placeholder={t("customers.notes")} defaultValue={row.staffNotes || ""} onBlur={(e) => api(`/api/relocation/${row.id}/notes`, { method: "POST", body: { staffNotes: e.target.value } }).catch((err) => setMsg(err.message))} />
          {["UNDER_REVIEW", "QUOTE_SENT"].includes(row.status) ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={quote[row.id] || ""} onChange={(e) => setQuote({ ...quote, [row.id]: e.target.value })} />
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/quote`, { method: "POST", body: { amount: Number(quote[row.id]) } }).then(load).catch((e) => setMsg(e.message))}>{t("shop.sendQuote")}</button>
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
              const amount = window.prompt(t("shop.refundAmount"), String((captured(row) - refunded(row)).toFixed(2)));
              if (!amount) return;
              api(`/api/relocation/${row.id}/refund`, { method: "POST", body: { amount: Number(amount) } }).then(load).catch(fail);
            }}>{t("shop.refund")}</button>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(NEXT[row.status] || []).map((status) => (
              <button key={status} type="button" onClick={() => setStatus(row, status)}>{status}</button>
            ))}
          </div>
        </article>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
