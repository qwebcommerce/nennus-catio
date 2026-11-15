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
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.relocation")}</h1>
      {rows.map((row) => (
        <article key={row.id} className="card" style={{ display: "grid", gap: 6 }}>
          <strong>{row.customer?.name} · {row.destination} · {row.status}</strong>
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
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/pay`, { method: "POST", body: { method: "CASH" } }).then(load)}>{t("shop.cashPaid")}</button>
              <button type="button" onClick={() => api(`/api/relocation/${row.id}/pay`, { method: "POST", body: { method: "BANK" } }).then(load)}>{t("shop.bankPaid")}</button>
            </>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(NEXT[row.status] || []).map((status) => (
              <button key={status} type="button" onClick={() => api(`/api/relocation/${row.id}/status`, { method: "POST", body: { status } }).then(load).catch((e) => setMsg(e.message))}>{status}</button>
            ))}
          </div>
        </article>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
