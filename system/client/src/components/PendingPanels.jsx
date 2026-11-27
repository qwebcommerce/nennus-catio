import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDate, qatarYmd } from "../utils/qatarDate.js";
import { downloadExport, money } from "./BizShared.jsx";

function dayText(day, locale) {
  return day ? formatDate(`${day}T12:00:00Z`, locale) : "—";
}

/** End of the current Qatar month ("YYYY-MM-DD"). */
function monthEnd() {
  const [y, m] = qatarYmd().split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Pending payments: owed to us (sales-order installments, on-account balances) and owed by us
 * (supplier and freight bills), as of a date, by customer or supplier. side = "tous" | "byus" | "".
 */
export function PendingPayments({ side = "" }) {
  const { t, locale } = useI18n();
  const [asOf, setAsOf] = useState(qatarYmd());
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const { canModule } = useAuth();

  useEffect(() => {
    if (side !== "byus") api("/api/customers").then((rows) => setCustomers(Array.isArray(rows) ? rows : rows?.items || [])).catch(() => {});
    if (side !== "tous" && canModule("purchasing", "view")) api("/api/suppliers").then(setSuppliers).catch(() => {});
  }, [side]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (asOf) q.set("asOf", asOf);
    if (customerId) q.set("customerId", customerId);
    if (supplierId) q.set("supplierId", supplierId);
    if (side) q.set("side", side);
    setMsg("");
    api(`/api/pending/payments?${q}`).then(setData).catch((e) => setMsg(e.message));
  }, [asOf, customerId, supplierId, side]);

  const exportCsv = async () => {
    const q = new URLSearchParams();
    if (asOf) q.set("asOf", asOf);
    if (customerId) q.set("customerId", customerId);
    if (supplierId) q.set("supplierId", supplierId);
    if (side) q.set("side", side);
    setMsg(await downloadExport("pending", "csv", locale, q.toString()));
  };

  const table = (rows, title, total) => (
    <section className="card fd-card">
      <div className="fd-head">
        <h2>{title}</h2>
        <strong>{money(total)}</strong>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fd-table biz-pending-table">
          <thead>
            <tr>
              <th>{t("so.dueDate")}</th>
              <th>{t("so.counterparty")}</th>
              <th>{t("so.kind")}</th>
              <th>{t("fd.reference")}</th>
              <th className="num">{t("fd.amount")}</th>
              <th className="num">{t("fd.bills.paidCol")}</th>
              <th className="num">{t("pc.awaitingCol")}</th>
              <th className="num">{t("fd.bills.owed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.overdue ? "biz-overdue" : ""}>
                <td>
                  {dayText(r.dueDate, locale)}
                  {r.overdue ? <span className="biz-badge biz-badge--bad"> {t("so.overdue")}</span> : r.dueThisWeek ? <span className="biz-badge"> {t("so.dueThisWeek")}</span> : null}
                </td>
                <td>{r.counterparty}</td>
                <td>{statusLabel("pendingKind", r.kind, locale)}</td>
                <td>{r.salesOrderId ? <Link to={`/sales-orders?open=${r.salesOrderId}`}>{r.reference}</Link> : r.reference || "—"}</td>
                <td className="num">{money(r.amount)}</td>
                <td className="num">{money(r.paid)}</td>
                <td className="num" data-testid="pending-awaiting">{Number(r.awaiting) ? money(r.awaiting) : "—"}</td>
                <td className="num"><strong>{money(r.owed)}</strong></td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={8}>{t("so.nothingPending")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="fd-page">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <div className="fd-filters">
        <label>
          <span>{t("so.asOf")}</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <button type="button" className="btn-touch" onClick={() => setAsOf(monthEnd())}>{t("so.monthEnd")}</button>
        {side !== "byus" ? (
          <label>
            <span>{t("fd.customer")}</span>
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); if (e.target.value) setSupplierId(""); }}>
              <option value="">{t("fd.all")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} (${c.name})` : c.name}</option>)}
            </select>
          </label>
        ) : null}
        {side !== "tous" && suppliers.length ? (
          <label>
            <span>{t("po.supplier")}</span>
            <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); if (e.target.value) setCustomerId(""); }}>
              <option value="">{t("fd.all")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn-touch" onClick={exportCsv}>CSV</button>
      </div>
      {data ? (
        <>
          <div className="biz-kpis">
            {side !== "byus" ? (
              <>
                <div className="biz-kpi"><span>{t("so.owedToUs")}</span><strong>{money(data.totals.owedToUs)}</strong></div>
                <div className="biz-kpi biz-kpi--bad"><span>{t("so.overdue")}</span><strong>{money(data.totals.overdueToUs)}</strong></div>
                <div className="biz-kpi"><span>{t("so.dueThisWeek")}</span><strong>{money(data.totals.dueThisWeekToUs)}</strong></div>
                <div className="biz-kpi" data-testid="kpi-awaiting"><span>{t("pc.awaitingCol")}</span><strong>{money(data.totals.awaitingToUs)}</strong></div>
              </>
            ) : null}
            {side !== "tous" ? (
              <>
                <div className="biz-kpi"><span>{t("so.owedByUs")}</span><strong>{money(data.totals.owedByUs)}</strong></div>
                <div className="biz-kpi biz-kpi--bad"><span>{t("so.overdueByUs")}</span><strong>{money(data.totals.overdueByUs)}</strong></div>
              </>
            ) : null}
          </div>
          {side !== "byus" ? table(data.toUs, t("so.owedToUs"), data.totals.owedToUs) : null}
          {side !== "tous" ? table(data.byUs, t("so.owedByUs"), data.totals.owedByUs) : null}
        </>
      ) : null}
    </div>
  );
}

/** Pending stock: purchase-order quantity to receive and sales-order quantity to deliver. */
export function PendingStock() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/api/pending/stock").then(setData).catch((e) => setMsg(e.message));
  }, []);
  const name = (r) => (locale === "en" ? r.productEn || r.product : r.product || r.productEn);
  const table = (rows, title, dateLabel) => (
    <section className="card fd-card">
      <h2>{title} ({rows.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="fd-table">
          <thead>
            <tr>
              <th>{t("po.product")}</th>
              <th className="num">{t("po.quantity")}</th>
              <th>{dateLabel}</th>
              <th>{t("so.counterparty")}</th>
              <th>{t("fd.reference")}</th>
              <th>{t("fd.location")}</th>
              <th>{t("so.paid")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.reference}-${i}`}>
                <td>{name(r)}{r.isFree ? <span className="biz-badge"> {t("so.free")}</span> : null}</td>
                <td className="num">{r.quantity} {r.unit === "kg" ? t("so.kg") : t("so.pcs")}</td>
                <td>{dayText(r.date, locale)}</td>
                <td>{r.counterparty}</td>
                <td>{r.salesOrderId ? <Link to={`/sales-orders?open=${r.salesOrderId}`}>{r.reference}</Link> : r.reference}</td>
                <td>{locale === "en" ? r.locationEn : r.location}</td>
                <td>{statusLabel("paidStatus", r.paidStatus, locale)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={7}>{t("so.nothingPending")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="fd-page">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <div className="fd-filters">
        <button type="button" className="btn-touch" onClick={async () => setMsg(await downloadExport("pendingstock", "csv", locale))}>CSV</button>
      </div>
      {data ? (
        <>
          {table(data.incoming, t("so.incoming"), t("so.expectedDate"))}
          {table(data.outgoing, t("so.outgoing"), t("so.deliveryDate"))}
        </>
      ) : null}
    </div>
  );
}

/** Per supplier and freight company: billed, paid, prepaid, balance. */
export function SupplierBalances() {
  const { t, locale } = useI18n();
  const [asOf, setAsOf] = useState(qatarYmd());
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api(`/api/suppliers/balances?asOf=${asOf}`).then(setData).catch((e) => setMsg(e.message));
  }, [asOf]);
  return (
    <div className="fd-page">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <div className="fd-filters">
        <label>
          <span>{t("so.asOf")}</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <button type="button" className="btn-touch" onClick={async () => setMsg(await downloadExport("supplierbalances", "csv", locale, `asOf=${asOf}`))}>CSV</button>
      </div>
      {data ? (
        <section className="card fd-card">
          <h2>{t("so.supplierBalances")}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="fd-table biz-balances">
              <thead>
                <tr>
                  <th>{t("po.supplier")}</th>
                  <th className="num">{t("so.billed")}</th>
                  <th className="num">{t("fd.bills.paidCol")}</th>
                  <th className="num">{t("so.prepaid")}</th>
                  <th className="num">{t("so.balance")}</th>
                  <th className="num">{t("so.overdue")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.supplierId}>
                    <td>{r.supplier}{r.isFreight ? <span className="biz-badge"> {t("so.freightCompany")}</span> : null}</td>
                    <td className="num">{money(r.billed)}</td>
                    <td className="num">{money(r.paid)}</td>
                    <td className="num">{money(r.prepaid)}{Number(r.prepaidUnapplied) ? <small className="fd-muted"> ({t("so.unapplied")} {money(r.prepaidUnapplied)})</small> : null}</td>
                    <td className="num"><strong>{money(r.balance)}</strong></td>
                    <td className="num">{Number(r.overdue) ? money(r.overdue) : "—"}</td>
                  </tr>
                ))}
                {!data.rows.length ? <tr><td colSpan={6}>{t("fd.noRows")}</td></tr> : null}
              </tbody>
              {data.rows.length ? (
                <tfoot>
                  <tr>
                    <th>{t("common.total")}</th>
                    <th className="num">{money(data.totals.billed)}</th>
                    <th className="num">{money(data.totals.paid)}</th>
                    <th className="num">{money(data.totals.prepaid)}</th>
                    <th className="num">{money(data.totals.balance)}</th>
                    <th className="num">{money(data.totals.overdue)}</th>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <p className="fd-muted">{t("so.balanceHint")}</p>
        </section>
      ) : null}
    </div>
  );
}

/** Dashboard card: totals owed to us / by us, overdue, due this week, pending stock lines. */
export function PendingSummaryCard() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  useEffect(() => {
    api("/api/pending/summary").then(setData).catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <section className="card biz-summary" aria-label={t("so.pendingTitle")}>
      <div className="fd-head">
        <h2>{t("so.pendingTitle")}</h2>
        <Link to="/finance?tab=pending">{t("so.viewAll")}</Link>
      </div>
      <div className="biz-kpis">
        <div className="biz-kpi"><span>{t("so.owedToUs")}</span><strong>{money(data.owedToUs)}</strong></div>
        <div className="biz-kpi biz-kpi--bad"><span>{t("so.overdue")}</span><strong>{money(data.overdueToUs)}</strong></div>
        <div className="biz-kpi"><span>{t("so.dueThisWeek")}</span><strong>{money(data.dueThisWeekToUs)}</strong></div>
        <div className="biz-kpi"><span>{t("so.owedByUs")}</span><strong>{money(data.owedByUs)}</strong></div>
      </div>
      <div className="biz-kpis biz-kpis--small">
        <Link to="/purchase-orders?tab=stock" className="biz-kpi"><span>{t("so.incoming")}</span><strong>{data.incomingLines}</strong></Link>
        <Link to="/purchase-orders?tab=stock" className="biz-kpi"><span>{t("so.outgoing")}</span><strong>{data.outgoingLines}</strong></Link>
      </div>
    </section>
  );
}
