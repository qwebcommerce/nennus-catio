import React, { useEffect, useMemo, useState } from "react";
import { api, resolveApiErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDateTime, qatarYmd } from "../utils/qatarDate.js";
import { useSearchParams } from "react-router-dom";
import { PageTabs } from "../components/BizShared.jsx";
import { PendingPayments, PendingStock, SupplierBalances } from "../components/PendingPanels.jsx";

function money(n) {
  return Number(n || 0).toFixed(2);
}

const CHANNELS = ["IN_STORE", "VAN", "WEBSITE", "GROOMING", "RELOCATION", "SALES_ORDER"];
const EXPORTS = ["transactions", "profit", "stockvalue", "bills", "payments", "expenses", "cashups", "orders", "bookings", "customers", "products", "salesorders", "pending", "pendingstock", "supplierbalances"];

function Row({ label, value, strong, indent }) {
  return (
    <div className={`fd-row${strong ? " fd-row--strong" : ""}${indent ? " fd-row--indent" : ""}`}>
      <span>{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}

/**
 * Finance (FR-103, FR-107, FR-110 to FR-112): profit and loss, money in and out, stock value,
 * and the list of sales and refunds. Dates are inclusive Qatar days.
 */
export default function Finance() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const today = qatarYmd();
  const [channel, setChannel] = useState("");
  const [branchId, setBranchId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [branches, setBranches] = useState([]);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  const qs = useMemo(() => {
    const query = new URLSearchParams();
    if (channel) query.set("channel", channel);
    if (branchId) query.set("branchId", branchId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return query.toString();
  }, [channel, branchId, from, to]);

  useEffect(() => {
    setMsg("");
    api(`/api/finance/summary?${qs}`).then(setSummary).catch((e) => setMsg(e.message));
  }, [qs]);
  useEffect(() => {
    api(`/api/finance/transactions?${qs}${type ? `&type=${type}` : ""}`).then(setList).catch((e) => setMsg(e.message));
  }, [qs, type]);

  const download = async (name, format) => {
    setMsg("");
    const lang = locale === "en" ? "en" : "ar";
    const extra = name === "transactions" && type ? `&type=${type}` : "";
    const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/exports/${name}?format=${format}&lang=${lang}&${qs}${extra}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setMsg(resolveApiErrorMessage(data, t("shop.documentFail")));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}-${lang}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const branchName = (id) => branchDisplayName(branches.find((b) => b.id === id) || { name: "" }, locale);
  const mi = summary?.moneyInDetail;
  const mo = summary?.moneyOutDetail;

  return (
    <div className="fd-page">
      <h1>{t("shop.finance")}</h1>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <PageTabs
        value={tab}
        onChange={(id) => setParams(id === "overview" ? {} : { tab: id })}
        tabs={[
          { id: "overview", label: t("so.overview") },
          { id: "pending", label: t("so.pendingPayments") },
          { id: "stock", label: t("so.pendingStock") },
          { id: "balances", label: t("so.supplierBalances") },
        ]}
      />
      {tab === "pending" ? <PendingPayments /> : null}
      {tab === "stock" ? <PendingStock /> : null}
      {tab === "balances" ? <SupplierBalances /> : null}
      {tab === "overview" ? (<>

      <div className="fd-filters">
        <label><span>{t("fd.from")}</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span>{t("fd.to")}</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <label>
          <span>{t("fd.location")}</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t("fd.allLocations")}</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branchDisplayName(branch, locale)}</option>)}
          </select>
        </label>
        <label>
          <span>{t("fd.channel")}</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t("shop.allChannels")}</option>
            {CHANNELS.map((key) => <option key={key} value={key}>{statusLabel("channel", key, locale)}</option>)}
          </select>
        </label>
      </div>
      <p className="fd-muted">{t("fd.datesHint")}</p>

      {summary ? (
        <div className="fd-grid">
          <section className="card fd-card">
            <h2>{t("fd.pnl")}</h2>
            <Row label={t("shop.revenue")} value={summary.revenue} strong />
            {CHANNELS.map((key) => <Row key={key} indent label={statusLabel("channel", key, locale)} value={summary.channels?.[key]?.revenue} />)}
            <Row label={t("shop.refunds")} value={-summary.refunds} />
            {CHANNELS.map((key) => (summary.channels?.[key]?.refunds ? <Row key={key} indent label={statusLabel("channel", key, locale)} value={-summary.channels[key].refunds} /> : null))}
            <Row label={t("shop.cogs")} value={-summary.cogs} />
            <Row label={t("so.complimentaryLine")} value={-(summary.complimentary || 0)} />
            {Number(summary.freightOnSold) ? <Row label={t("so.freightOnSold")} value={-summary.freightOnSold} /> : null}
            <Row label={t("shop.gross")} value={summary.grossProfit} strong />
            <Row label={t("shop.expenses")} value={-summary.expenses} />
            <Row label={t("shop.net")} value={summary.netProfit} strong />
          </section>
          <section className="card fd-card">
            <h2>{t("fd.moneyInOut")}</h2>
            <Row label={t("shop.moneyIn")} value={summary.moneyIn} strong />
            <Row indent label={t("fd.cashTaken")} value={mi?.cashSales} />
            <Row indent label={t("fd.cardTaken")} value={mi?.cardSales} />
            <Row indent label={t("fd.bankTaken")} value={mi?.bankSales} />
            <Row indent label={t("fd.fawranTaken")} value={mi?.fawranSales} />
            <Row indent label={t("fd.groomingIn")} value={mi?.grooming} />
            <Row indent label={t("fd.relocationIn")} value={mi?.relocation} />
            <Row indent label={t("fd.collections")} value={mi?.accountCollections} />
            <Row indent label={t("so.soPaymentsIn")} value={mi?.salesOrders} />
            <Row indent label={t("so.bankTransferIn")} value={mi?.bankTransfer} />
            {["cash", "card", "bank", "fawran"].map((key) => (
              <Row key={`in-${key}`} indent label={`${t("fd.byMethod")}: ${t(`fd.method.${key}`)}`} value={mi?.[key]} />
            ))}
            <Row label={t("shop.moneyOut")} value={summary.moneyOut} strong />
            <Row indent label={t("fd.refundsCash")} value={mo?.refundsCash} />
            <Row indent label={t("fd.refundsCard")} value={mo?.refundsCard} />
            <Row indent label={t("fd.refundsBank")} value={mo?.refundsBank} />
            <Row indent label={t("fd.refundsFawran")} value={mo?.refundsFawran} />
            <Row indent label={t("fd.supplierCash")} value={mo?.supplierPaymentsCash} />
            <Row indent label={t("fd.supplierBank")} value={mo?.supplierPaymentsBank} />
            <Row indent label={t("so.prepaymentsOut")} value={Number(mo?.supplierPrepaymentsCash || 0) + Number(mo?.supplierPrepaymentsBank || 0)} />
            <Row indent label={t("fd.expensesCash")} value={mo?.expensesCash} />
            <Row indent label={t("fd.expensesBank")} value={mo?.expensesBank} />
            {["cash", "card", "bank", "fawran"].map((key) => (
              <Row key={`out-${key}`} indent label={`${t("fd.byMethod")}: ${t(`fd.method.${key}`)}`} value={mo?.[key]} />
            ))}
            <Row label={t("fd.net")} value={summary.net} strong />
            {channel ? <p className="fd-muted">{t("fd.channelNote")}</p> : null}
          </section>
          <section className="card fd-card">
            <h2>{t("shop.stockValue")}</h2>
            {(summary.stockValueByLocation || []).map((row) => (
              <Row key={row.branchId} label={locale === "en" ? row.locationEn || row.location : row.location} value={row.value} />
            ))}
            <Row label={t("common.total")} value={summary.stockValue} strong />
          </section>
        </div>
      ) : null}

      <section className="card fd-card">
        <div className="fd-head">
          <h2>{t("fd.salesRefunds")}</h2>
          <label>
            <span className="sr-only">{t("fd.type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t("fd.type")}>
              <option value="">{t("fd.allTypes")}</option>
              <option value="sale">{`${statusLabel("txType", "SALE", locale)} / ${statusLabel("txType", "PAYMENT", locale)}`}</option>
              <option value="refund">{statusLabel("txType", "REFUND", locale)}</option>
            </select>
          </label>
          <span className="fd-export">
            {["csv", "xlsx", "pdf"].map((format) => (
              <button key={format} type="button" className="btn-touch" onClick={() => download("transactions", format)}>{format.toUpperCase()}</button>
            ))}
          </span>
        </div>
        {list ? (
          <>
            <div className="fd-totals">
              <span>{t("shop.revenue")}: <strong>{money(list.totals.sales)}</strong> ({list.totals.saleCount})</span>
              <span>{t("shop.refunds")}: <strong>{money(list.totals.refunds)}</strong> ({list.totals.refundCount})</span>
              <span>{t("fd.net")}: <strong>{money(list.totals.net)}</strong></span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="fd-table">
                <thead>
                  <tr>
                    <th>{t("fd.date")}</th>
                    <th>{t("fd.type")}</th>
                    <th>{t("fd.reference")}</th>
                    <th>{t("fd.channel")}</th>
                    <th>{t("fd.location")}</th>
                    <th>{t("fd.customer")}</th>
                    <th>{t("fd.payment")}</th>
                    <th className="num">{t("fd.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td>{formatDateTime(row.date, locale)}</td>
                      <td>{statusLabel("txType", row.type, locale)}</td>
                      <td>{row.reference}</td>
                      <td>{statusLabel("channel", row.channel, locale)}</td>
                      <td>{locale === "en" ? row.locationEn || row.location : row.location || branchName(row.branchId)}</td>
                      <td>{row.customer || "—"}</td>
                      <td>{statusLabel("payment", row.paymentMethod, locale)}</td>
                      <td className="num">{money(row.amount)}</td>
                    </tr>
                  ))}
                  {!list.rows.length ? <tr><td colSpan={8}>{t("fd.noRows")}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="fd-muted">{t("fd.serviceNote")}</p>
            {list.truncated ? <p className="fd-muted">{t("fd.truncated")}</p> : null}
          </>
        ) : null}
      </section>

      <section className="card fd-card">
        <h2>{t("fd.exports")}</h2>
        <p className="fd-muted">{t("fd.exportsHint")}</p>
        <div className="fd-export-grid">
          {EXPORTS.map((name) => (
            <div key={name} className="fd-export-row">
              <span>{t(`fd.export.${name}`)}</span>
              <span className="fd-export">
                {["csv", "xlsx", "pdf"].map((format) => (
                  <button key={format} type="button" className="btn-touch" onClick={() => download(name, format)}>{format.toUpperCase()}</button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>
      </>) : null}
    </div>
  );
}
