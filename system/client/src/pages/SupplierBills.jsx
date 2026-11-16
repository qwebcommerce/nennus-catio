import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDate } from "../utils/qatarDate.js";

const BUCKETS = ["0-30", "31-60", "61-90", "90+"];

function money(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * Supplier bills (FR-104, FR-105): amount, paid and owed; open bills by supplier and by age;
 * pay part or all of a bill from cash or the bank. The server refuses overpayment.
 */
export function SupplierBills({ suppliers = [], refreshKey = 0 }) {
  const { t, locale } = useI18n();
  const [bills, setBills] = useState([]);
  const [aging, setAging] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [age, setAge] = useState("");
  const [pay, setPay] = useState({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (supplierId) q.set("supplierId", supplierId);
    if (openOnly) q.set("open", "1");
    if (age) q.set("age", age);
    const [rows, summary] = await Promise.all([
      api(`/api/purchase-orders/bills?${q.toString()}`),
      api("/api/purchase-orders/bills/aging"),
    ]);
    setBills(rows);
    setAging(summary);
  }, [supplierId, openOnly, age]);

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [load, refreshKey]);

  const submitPayment = async (bill) => {
    const entry = pay[bill.id] || {};
    const amount = String(entry.amount ?? bill.owed).trim();
    const method = entry.method || "CASH";
    setMsg("");
    try {
      await api(`/api/purchase-orders/bills/${bill.id}/payments`, {
        method: "POST",
        body: { amount, method, note: entry.note || undefined },
      });
      setPay((prev) => ({ ...prev, [bill.id]: {} }));
      setMsg(t("fd.bills.paid"));
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const setEntry = (id, key, value) => setPay((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2>{t("po.bills")}</h2>

      {aging ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <strong>{t("fd.bills.aging")}</strong>
          <table className="fd-table">
            <thead>
              <tr>
                <th>{t("po.supplier")}</th>
                {BUCKETS.map((b) => <th key={b} className="num">{t("fd.bills.days", { range: b })}</th>)}
                <th className="num">{t("fd.bills.owed")}</th>
              </tr>
            </thead>
            <tbody>
              {aging.suppliers.map((row) => (
                <tr key={row.supplierId}>
                  <td>
                    <button type="button" className="fd-linkish" onClick={() => setSupplierId(row.supplierId)}>{row.supplier}</button>
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b} className="num">
                      {row.buckets[b] ? <button type="button" className="fd-linkish" onClick={() => { setSupplierId(row.supplierId); setAge(b); setOpenOnly(true); }}>{money(row.buckets[b])}</button> : "—"}
                    </td>
                  ))}
                  <td className="num"><strong>{money(row.owed)}</strong></td>
                </tr>
              ))}
              {!aging.suppliers.length ? <tr><td colSpan={6}>{t("fd.bills.noneOpen")}</td></tr> : null}
            </tbody>
            {aging.suppliers.length ? (
              <tfoot>
                <tr>
                  <th>{t("common.total")}</th>
                  {BUCKETS.map((b) => <th key={b} className="num">{money(aging.totals[b])}</th>)}
                  <th className="num">{money(aging.owed)}</th>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}

      <div className="fd-filters">
        <label>
          <span>{t("po.supplier")}</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{t("fd.all")}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          <span>{t("fd.bills.age")}</span>
          <select value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="">{t("fd.all")}</option>
            {BUCKETS.map((b) => <option key={b} value={b}>{t("fd.bills.days", { range: b })}</option>)}
          </select>
        </label>
        <label className="fd-check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span>{t("fd.bills.openOnly")}</span>
        </label>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="fd-table">
          <thead>
            <tr>
              <th>{t("fd.date")}</th>
              <th>{t("po.supplier")}</th>
              <th className="num">{t("fd.amount")}</th>
              <th className="num">{t("fd.bills.paidCol")}</th>
              <th className="num">{t("fd.bills.owed")}</th>
              <th className="num">{t("fd.bills.ageDays")}</th>
              <th>{t("fd.status")}</th>
              <th>{t("fd.bills.payment")}</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const entry = pay[bill.id] || {};
              return (
                <tr key={bill.id}>
                  <td>{formatDate(bill.createdAt, locale)}</td>
                  <td>{bill.supplier?.name}</td>
                  <td className="num">{money(bill.amount)}</td>
                  <td className="num">{money(bill.amountPaid)}</td>
                  <td className="num"><strong>{money(bill.owed)}</strong></td>
                  <td className="num">{bill.ageDays}</td>
                  <td>{statusLabel("bill", bill.status, locale)}</td>
                  <td>
                    {bill.status !== "PAID" ? (
                      <form className="fd-pay" onSubmit={(e) => { e.preventDefault(); submitPayment(bill); }}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={bill.owed}
                          required
                          inputMode="decimal"
                          aria-label={t("fd.amount")}
                          value={entry.amount ?? money(bill.owed)}
                          onChange={(e) => setEntry(bill.id, "amount", e.target.value)}
                        />
                        <select aria-label={t("fd.paidFrom")} value={entry.method || "CASH"} onChange={(e) => setEntry(bill.id, "method", e.target.value)}>
                          <option value="CASH">{t("fd.source.CASH")}</option>
                          <option value="BANK">{t("fd.source.BANK")}</option>
                        </select>
                        <button type="submit" className="btn-touch">{t("po.payBill")}</button>
                      </form>
                    ) : null}
                    {(bill.payments || []).length ? (
                      <details>
                        <summary>{t("fd.bills.history", { n: bill.payments.length })}</summary>
                        {bill.payments.map((p) => (
                          <div key={p.id} className="fd-muted">
                            {formatDate(p.paidAt, locale)} · {money(p.amount)} · {t(`fd.source.${p.method}`)}
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!bills.length ? <tr><td colSpan={8}>{t("fd.noRows")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {msg ? <div role="status">{msg}</div> : null}
    </section>
  );
}
