import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { CsvButton, RangeFields, money2, qatarDaysAgo } from "./AnalyticsShared.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { formatDate, formatTime, qatarYmd } from "../utils/qatarDate.js";

const METHODS = ["CASH", "CARD", "ONLINE", "FAWRAN", "PAYMENT_LINK", "BANK_TRANSFER", "BANK", "SPLIT", "ON_DELIVERY", "ON_ACCOUNT"];
const CHANNELS = ["IN_STORE", "VAN", "WEBSITE", "GROOMING", "RELOCATION", "SALES_ORDER"];

/**
 * Pages through `url?…&cursor=` (server keyset paging) and loads the next page when the sentinel
 * scrolls into view (a "Load more" button does the same). `query` resets the list.
 */
export function usePagedHistory(path, query, setMsg) {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const gen = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (reset) => {
    if (busy.current && !reset) return;
    const my = reset ? ++gen.current : gen.current;
    busy.current = true;
    setLoading(true);
    try {
      const page = await api(`${path}?${query}${!reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (my !== gen.current) return;
      setRows((prev) => (reset ? page.rows : [...prev, ...page.rows]));
      setTotals(page.totals);
      setCursor(page.nextCursor);
      setDone(!page.nextCursor);
    } catch (e) {
      if (my === gen.current) setMsg(e.message);
    } finally {
      if (my === gen.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [path, query, cursor, setMsg]);

  useEffect(() => {
    setRows([]);
    setCursor(null);
    setDone(false);
    setMsg("");
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query]);

  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load(false);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load, done, rows.length]);

  return { rows, totals, done, loading, more: () => load(false), sentinel, reload: () => load(true) };
}

/** Date and Qatar time cells. */
export function DateTimeCells({ value, locale }) {
  return (
    <>
      <td style={{ whiteSpace: "nowrap" }}>{formatDate(value, locale)}</td>
      <td style={{ whiteSpace: "nowrap" }}>{formatTime(value, locale)}</td>
    </>
  );
}

export function MoreFooter({ h, count, total, t }) {
  return (
    <div className="an-more" ref={h.sentinel}>
      <span className="fd-muted">{t("hist.shown", { n: String(count), total: String(total) })}</span>
      {h.done ? <span className="fd-muted">{count ? t("hist.end") : ""}</span> : (
        <button type="button" className="btn-touch" disabled={h.loading} onClick={h.more}>{h.loading ? t("an.loading") : t("hist.loadMore")}</button>
      )}
    </div>
  );
}

/**
 * Transactions history (Reports → History): every sale, refund and payment as in Finance's list,
 * filtered by dates / payment method / channel / type, searched by customer phone or any
 * receipt / order reference, paged on the server. Totals are for the whole filtered set.
 */
export default function HistoryPanel() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState(() => ({ from: qatarDaysAgo(29), to: qatarYmd() }));
  const [method, setMethod] = useState("");
  const [channel, setChannel] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to, limit: "50" });
    if (method) p.set("method", method);
    if (channel) p.set("channel", channel);
    if (type) p.set("type", type);
    if (q) p.set("q", q);
    return p.toString();
  }, [range, method, channel, type, q]);
  const h = usePagedHistory("/api/analytics/history", query, setMsg);
  const total = h.totals ? h.totals.saleCount + h.totals.refundCount : 0;

  return (
    <section className="card fd-card an-history" data-testid="history-panel">
      <div className="fd-head">
        <h2>{t("hist.title")}</h2>
        <CsvButton list="history" query={query} onError={setMsg} />
      </div>
      <p className="fd-muted">{t("hist.hint")}</p>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <RangeFields from={range.from} to={range.to} onChange={setRange}>
        <label>
          <span>{t("hist.method")}</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="hist-method">
            <option value="">{t("hist.allMethods")}</option>
            {METHODS.map((m) => <option key={m} value={m}>{statusLabel("payment", m, locale)}</option>)}
          </select>
        </label>
        <label>
          <span>{t("hist.channel")}</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t("an.k.allChannels")}</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{statusLabel("channel", c, locale)}</option>)}
          </select>
        </label>
        <label>
          <span>{t("hist.type")}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("hist.allTypes")}</option>
            <option value="sale">{`${statusLabel("txType", "SALE", locale)} / ${statusLabel("txType", "PAYMENT", locale)}`}</option>
            <option value="refund">{statusLabel("txType", "REFUND", locale)}</option>
          </select>
        </label>
      </RangeFields>
      <form className="an-search" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("hist.searchPh")} aria-label={t("hist.search")} data-testid="hist-search" />
        <button type="submit" className="btn-touch">{t("hist.apply")}</button>
        {q ? <button type="button" className="btn-touch" onClick={() => { setSearch(""); setQ(""); }}>{t("hist.clear")}</button> : null}
      </form>
      {h.totals ? (
        <div className="fd-totals" data-testid="hist-totals">
          <span>{t("hist.sales")}: <strong>{money2(h.totals.sales)}</strong> ({h.totals.saleCount})</span>
          <span>{t("hist.refunds")}: <strong>{money2(h.totals.refunds)}</strong> ({h.totals.refundCount})</span>
          <span>{t("hist.net")}: <strong>{money2(h.totals.net)}</strong></span>
        </div>
      ) : null}
      <div className="an-table-wrap an-scroll">
        <table className="fd-table" data-testid="hist-table">
          <thead>
            <tr>
              <th>{t("hist.date")}</th>
              <th>{t("hist.time")}</th>
              <th>{t("hist.reference")}</th>
              <th>{t("hist.customer")}</th>
              <th>{t("hist.method")}</th>
              <th>{t("hist.channel")}</th>
              <th className="num">{t("hist.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {h.rows.map((row) => (
              <tr key={`${row.type}-${row.id}`} className={row.type === "REFUND" ? "an-refund" : ""}>
                <DateTimeCells value={row.date} locale={locale} />
                <td>
                  <div>{row.reference}</div>
                  <small className="fd-muted">{statusLabel("txType", row.type, locale)}</small>
                </td>
                <td>
                  <div>{row.customer || "—"}</div>
                  {row.phone ? <small className="fd-muted" dir="ltr">{row.phone}</small> : null}
                </td>
                <td>{row.paymentMethod ? statusLabel("payment", row.paymentMethod, locale) : "—"}</td>
                <td>{statusLabel("channel", row.channel, locale)}</td>
                <td className="num">{money2(row.amount)}</td>
              </tr>
            ))}
            {!h.rows.length && !h.loading ? <tr><td colSpan={7}>{t("hist.none")}</td></tr> : null}
          </tbody>
        </table>
        <MoreFooter h={h} count={h.rows.length} total={total} t={t} />
      </div>
    </section>
  );
}
