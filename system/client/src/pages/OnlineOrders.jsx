import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDateTime } from "../utils/qatarDate.js";

const NEXT = {
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  READY_FOR_PICKUP: ["COLLECTED"],
};

export default function OnlineOrders() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [day, setDay] = useState("");
  const load = () => api(day ? `/api/online-orders?day=${day}` : "/api/online-orders").then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [day]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.staffOrders")}</h1>
      <label>
        {t("shop.deliveryDay")}
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      {rows.map((row) => (
        <article key={row.id} className="card">
          <strong>{row.customer?.name || "—"} · {statusLabel("order", row.webStatus, locale)} · {statusLabel("fulfillment", row.fulfillment, locale)}</strong>
          {row.createdAt ? <div>{formatDateTime(row.createdAt, locale)}</div> : null}
          <div>{Number(row.total).toFixed(2)} QAR</div>
          {row.deliveryDate ? <div>{String(row.deliveryDate).slice(0, 10)} · {row.deliveryAddress}</div> : null}
          {row.fleetwizReference ? <div>FleetWiz {row.fleetwizReference} · {row.fleetwizStatus}</div> : null}
          {row.paymentReview ? (
            <button type="button" onClick={() => api(`/api/online-orders/${row.id}/resolve-payment`, { method: "POST", body: { accept: true } }).then(load).catch((e) => setMsg(e.message))}>{t("shop.acceptPayment")}</button>
          ) : null}
          {row.gatewayPaymentId && !["PENDING_PAYMENT", "CANCELLED"].includes(row.webStatus) ? (
            <button type="button" onClick={() => {
              const amount = window.prompt(t("shop.refundAmount"), String(row.total));
              if (!amount) return;
              const restock = window.confirm(t("shop.restock"));
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
