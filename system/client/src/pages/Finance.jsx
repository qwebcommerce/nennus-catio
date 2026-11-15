import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function Finance() {
  const { t } = useI18n();
  const [channel, setChannel] = useState("");
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branches, setBranches] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/branches").then(setBranches).catch(() => {}); }, []);
  const query = new URLSearchParams();
  if (channel) query.set("channel", channel);
  if (branchId) query.set("branchId", branchId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();
  useEffect(() => {
    api(`/api/finance/summary${qs ? `?${qs}` : ""}`).then(setSummary).catch((e) => setMsg(e.message));
  }, [qs]);
  const download = async (list, format) => {
    const lang = localStorage.getItem("petstore-lang") === "en" ? "en" : "ar";
    const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/exports/${list}?format=${format}&lang=${lang}${qs ? `&${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    });
    if (!res.ok) return setMsg(t("shop.documentFail"));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${list}.${format}`;
    link.click();
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.finance")}</h1>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
        <option value="">{t("shop.allChannels")}</option>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
      <select value={channel} onChange={(e) => setChannel(e.target.value)}>
        <option value="">{t("shop.allChannels")}</option>
        <option value="IN_STORE">{t("shop.channelStore")}</option>
        <option value="VAN">{t("shop.channelVan")}</option>
        <option value="WEBSITE">{t("shop.channelWeb")}</option>
      </select>
      {summary ? (
        <section className="card" style={{ display: "grid", gap: 6 }}>
          <div>{t("shop.revenue")} {money(summary.revenue)}</div>
          <div>{t("shop.cogs")} {money(summary.cogs)}</div>
          <div>{t("shop.refunds")} {money(summary.refunds)}</div>
          <div>{t("shop.gross")} {money(summary.grossProfit)}</div>
          <div>{t("shop.expenses")} {money(summary.expenses)}</div>
          <div>{t("shop.net")} {money(summary.netProfit)}</div>
          <div>{t("shop.stockValue")} {money(summary.stockValue)}</div>
          <div>{t("shop.moneyIn")} {money(summary.moneyIn)}</div>
          <div>{t("shop.moneyOut")} {money(summary.moneyOut)}</div>
          <div>{t("shop.supplierPayments")} {money(summary.supplierPayments)}</div>
          {Object.entries(summary.channels || {}).map(([key, row]) => (
            <div key={key}>{key}: {money(row.revenue)} − {money(row.cogs)} = {money(row.grossProfit)}</div>
          ))}
        </section>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["orders", "customers", "products", "bookings", "bills", "payments", "expenses", "cashups", "profit"].map((list) => (
          <span key={list}>
            {["csv", "xlsx", "pdf"].map((format) => (
              <button key={format} type="button" onClick={() => download(list, format)}>{list} {format}</button>
            ))}
          </span>
        ))}
      </div>
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
