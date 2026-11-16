import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDateTime } from "../utils/qatarDate.js";

const NEXT = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  READY_FOR_PICKUP: ["COLLECTED", "CANCELLED"],
};

export default function OnlineOrders() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const load = () => {
    const q = new URLSearchParams();
    if (day) q.set("day", day);
    if (search.trim()) q.set("q", search.trim());
    if (reviewOnly) q.set("review", "1");
    return api(`/api/online-orders${q.toString() ? `?${q}` : ""}`).then(setRows).catch((e) => setMsg(e.message));
  };
  useEffect(() => { load(); }, [day, reviewOnly]);
  const refunded = (row) => (row.refunds || []).reduce((sum, r) => sum + Number(r.total), 0);
  const resolve = (row, accept) =>
    api(`/api/online-orders/${row.id}/resolve-payment`, { method: "POST", body: { accept } }).then(load).catch((e) => setMsg(e.message));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.staffOrders")}</h1>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          {t("shop.deliveryDay")}
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <form onSubmit={(e) => { e.preventDefault(); load(); }}>
          <input placeholder={t("shop.searchReference")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <label>
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} /> {t("shop.reviewOnly")}
        </label>
      </div>
      {rows.map((row) => (
        <article key={row.id} className="card">
          <strong>{row.reference || row.id} · {row.customer?.name || "—"} · {statusLabel("order", row.webStatus, locale)} · {statusLabel("fulfillment", row.fulfillment, locale)}</strong>
          {row.createdAt ? <div>{formatDateTime(row.createdAt, locale)}</div> : null}
          <div>
            {Number(row.total).toFixed(2)} QAR
            {Number(row.amountPaid) > 0 ? ` · ${t("shop.paid")} ${Number(row.amountPaid).toFixed(2)}` : ""}
            {refunded(row) > 0 ? ` · ${t("shop.refunds")} ${refunded(row).toFixed(2)}` : ""}
          </div>
          {row.deliveryDate ? <div>{String(row.deliveryDate).slice(0, 10)} · {row.deliveryAddress}</div> : null}
          {row.fleetwizReference ? <div>FleetWiz {row.fleetwizReference} · {row.fleetwizStatus}</div> : null}
          {row.paymentReview ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: "var(--danger, #b42318)" }}>
              <strong>{t("shop.paymentReview")}: {t(`shop.reviewReason.${row.paymentReviewReason || "AMOUNT_MISMATCH"}`)}</strong>
              {(row.payments || []).filter((p) => p.status === "REVIEW").map((p) => (
                <span key={p.id}>{Number(p.amount).toFixed(2)} QAR</span>
              ))}
              <button type="button" onClick={() => resolve(row, true)}>{t("shop.keepPayment")}</button>
              <button type="button" onClick={() => resolve(row, false)}>{t("shop.refundPayment")}</button>
            </div>
          ) : null}
          {row.gatewayPaymentId && Number(row.amountPaid) > refunded(row) ? (
            <button type="button" onClick={() => {
              const amount = window.prompt(t("shop.refundAmount"), String((Number(row.amountPaid) - refunded(row)).toFixed(2)));
              if (!amount) return;
              const restock = row.webStatus !== "CANCELLED" && window.confirm(t("shop.restock"));
              api(`/api/online-orders/${row.id}/refund`, { method: "POST", body: { amount: Number(amount), restock } }).then(load).catch((e) => setMsg(e.message));
            }}>{t("shop.refund")}</button>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {row.fulfillment === "DELIVERY" && !["PENDING_PAYMENT", "CANCELLED"].includes(row.webStatus) ? (
              <button type="button" onClick={() => api(`/api/online-orders/${row.id}/dispatch`, { method: "POST", body: {} }).then(load).catch((e) => setMsg(e.message))}>FleetWiz</button>
            ) : null}
            {(NEXT[row.webStatus] || []).map((status) => (
              <button key={status} type="button" onClick={() => api(`/api/online-orders/${row.id}/status`, { method: "POST", body: { status } }).then(load).catch((e) => setMsg(e.message))}>
                {statusLabel("order", status, locale)}
              </button>
            ))}
          </div>
        </article>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
