import React, { useMemo, useState } from "react";
import { CsvButton, RangeFields, money2, qatarDaysAgo } from "./AnalyticsShared.jsx";
import { MoreFooter, usePagedHistory } from "./HistoryPanel.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { formatDate, formatTime, qatarYmd } from "../utils/qatarDate.js";

/**
 * Expenses history (Reports → Expenses): every expense in the range, newest expense date first,
 * filtered by "paid from" (cash / bank) and category, searched by payee, receipt number or note,
 * paged on the server. Totals cover the whole filtered set (they match Finance's expenses).
 * `reloadKey` changes after an add / edit / delete so the list is read again.
 */
export default function ExpenseHistoryPanel({ onEdit, onDelete, reloadKey = 0 }) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState(() => ({ from: qatarDaysAgo(89), to: qatarYmd() }));
  const [paidFrom, setPaidFrom] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to, limit: "50" });
    if (paidFrom) p.set("paidFrom", paidFrom);
    if (category) p.set("category", category);
    if (q) p.set("q", q);
    p.set("_", String(reloadKey));
    return p.toString();
  }, [range, paidFrom, category, q, reloadKey]);
  const h = usePagedHistory("/api/analytics/expenses", query, setMsg);

  return (
    <section className="card fd-card an-history" data-testid="expense-history">
      <div className="fd-head">
        <h2>{t("exh.title")}</h2>
        <CsvButton list="expense-history" query={query} onError={setMsg} />
      </div>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <RangeFields from={range.from} to={range.to} onChange={setRange}>
        <label>
          <span>{t("exh.paidFrom")}</span>
          <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} data-testid="exh-paidfrom">
            <option value="">{t("exh.allSources")}</option>
            <option value="CASH">{t("fd.source.CASH")}</option>
            <option value="BANK">{t("fd.source.BANK")}</option>
          </select>
        </label>
        <label>
          <span>{t("expense.category")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("hist.allTypes")}</option>
            {["RENT", "PAYROLL", "ELECTRICITY", "INTERNET", "OTHER"].map((k) => <option key={k} value={k}>{t(`expense.cat.${k}`)}</option>)}
          </select>
        </label>
      </RangeFields>
      <form className="an-search" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("exh.searchPh")} aria-label={t("hist.search")} data-testid="exh-search" />
        <button type="submit" className="btn-touch">{t("hist.apply")}</button>
        {q ? <button type="button" className="btn-touch" onClick={() => { setSearch(""); setQ(""); }}>{t("hist.clear")}</button> : null}
      </form>
      {h.totals ? (
        <div className="fd-totals" data-testid="exh-totals">
          <span>{t("exh.total")}: <strong>{money2(h.totals.total)}</strong> ({h.totals.count})</span>
          <span>{t("fd.source.CASH")}: <strong>{money2(h.totals.CASH)}</strong></span>
          <span>{t("fd.source.BANK")}: <strong>{money2(h.totals.BANK)}</strong></span>
        </div>
      ) : null}
      <div className="an-table-wrap an-scroll">
        <table className="fd-table" data-testid="exh-table">
          <thead>
            <tr>
              <th>{t("expense.date")}</th>
              <th>{t("exh.recorded")}</th>
              <th>{t("exh.payee")}</th>
              <th>{t("expense.category")}</th>
              <th>{t("exh.paidFrom")}</th>
              <th className="num">{t("expense.amount")}</th>
              {onEdit || onDelete ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {h.rows.map((row) => (
              <tr key={row.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatDate(row.expenseDate, locale)}</td>
                <td style={{ whiteSpace: "nowrap" }}><small>{formatDate(row.createdAt, locale)}</small> <span>{formatTime(row.createdAt, locale)}</span></td>
                <td>
                  <div>{row.payee || "—"}</div>
                  {row.reference ? <small className="fd-muted" dir="ltr">{row.reference}</small> : null}
                  {row.description ? <div><small className="fd-muted">{row.description}</small></div> : null}
                </td>
                <td>{t(`expense.cat.${row.category}`)}</td>
                <td>{t(`fd.source.${row.paidFrom || "CASH"}`)}</td>
                <td className="num">{money2(row.amount)}</td>
                {onEdit || onDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {onEdit ? <button type="button" className="btn-touch" onClick={() => onEdit(row)}>{t("common.edit")}</button> : null}
                      {onDelete ? <button type="button" className="btn-touch" style={{ background: "var(--danger)", color: "#fff" }} onClick={() => onDelete(row.id)}>{t("common.delete")}</button> : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!h.rows.length && !h.loading ? <tr><td colSpan={7}>{t("exh.none")}</td></tr> : null}
          </tbody>
        </table>
        <MoreFooter h={h} count={h.rows.length} total={h.totals?.count || 0} t={t} />
      </div>
    </section>
  );
}

