import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client.js";
import { PageTabs } from "../components/BizShared.jsx";
import { CsvButton, RangeFields, Tiles, money2, qatarDaysAgo } from "../components/AnalyticsShared.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { statusLabel } from "../utils/statusLabels.js";
import { qatarYmd } from "../utils/qatarDate.js";

const CHANNELS = ["IN_STORE", "VAN", "WEBSITE", "SALES_ORDER"];
const CH_COLORS = { IN_STORE: "#2563eb", VAN: "#f59e0b", WEBSITE: "#10b981", SALES_ORDER: "#8b5cf6" };
const tip = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" };
const shortDay = (key) => String(key || "").slice(5);
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

/**
 * Business analytics (fix-rc): grooming, product sales, new registered users and peak order hours,
 * per Qatar day for a chosen range. Finance → view (server and route); CSV needs Finance → export.
 */
export default function Analytics() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "grooming";
  const [range, setRange] = useState(() => ({ from: qatarDaysAgo(29), to: qatarYmd() }));
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/branches").then((rows) => setBranches(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  const qs = useMemo(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to });
    if (branchId) q.set("branchId", branchId);
    return q.toString();
  }, [range, branchId]);

  return (
    <div className="fd-page an-page">
      <h1 style={{ margin: 0 }}>{t("an.title")}</h1>
      <p className="fd-muted" style={{ margin: 0 }}>{t("an.intro")}</p>
      <p className="an-links">
        <span>{t("an.monthlyLinks")}</span>
        <Link to="/finance">{t("an.openFinance")}</Link>
        <Link to="/dashboard">{t("an.openDashboard")}</Link>
      </p>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <section className="card">
        <RangeFields from={range.from} to={range.to} onChange={setRange}>
          {tab !== "users" ? (
            <label>
              <span>{t("an.location")}</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{t("an.allLocations")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
              </select>
            </label>
          ) : null}
        </RangeFields>
      </section>
      <PageTabs
        value={tab}
        onChange={(id) => setParams(id === "grooming" ? {} : { tab: id })}
        tabs={[
          { id: "grooming", label: t("an.tabGrooming") },
          { id: "products", label: t("an.tabProducts") },
          { id: "users", label: t("an.tabUsers") },
          { id: "peak", label: t("an.tabPeak") },
        ]}
      />
      {tab === "grooming" ? <GroomingTab qs={qs} setMsg={setMsg} /> : null}
      {tab === "products" ? <ProductsTab qs={qs} setMsg={setMsg} /> : null}
      {tab === "users" ? <UsersTab range={range} setMsg={setMsg} /> : null}
      {tab === "peak" ? <PeakTab qs={qs} setMsg={setMsg} /> : null}
    </div>
  );
}

/** Loads `url`; errors go to the page message. */
function useData(url, setMsg) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMsg("");
    api(url)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setMsg(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, loading };
}

function Head({ title, list, query, setMsg }) {
  return (
    <div className="fd-head">
      <h2>{title}</h2>
      <CsvButton list={list} query={query} onError={setMsg} />
    </div>
  );
}

function GroomingTab({ qs, setMsg }) {
  const { t } = useI18n();
  const { data, loading } = useData(`/api/analytics/grooming?${qs}`, setMsg);
  if (!data) return <p className="fd-muted">{loading ? t("an.loading") : ""}</p>;
  const tot = data.totals;
  return (
    <>
      <Tiles items={[
        { label: t("an.g.bookings"), value: tot.bookings },
        { label: t("an.g.done"), value: tot.done, tone: "ok" },
        { label: t("an.g.pending"), value: tot.pending, tone: "info" },
        { label: t("an.g.cancelled"), value: tot.cancelled, tone: "bad" },
        { label: t("an.g.noShow"), value: tot.noShow, tone: "warn" },
        { label: t("an.g.doneValue"), value: money2(tot.doneValue) },
        { label: t("an.g.paid"), value: money2(tot.paid) },
      ]} />
      <section className="card fd-card">
        <Head title={t("an.tabGrooming")} list="grooming-daily" query={qs} setMsg={setMsg} />
        <p className="fd-muted">{t("an.g.hint")}</p>
        <div className="an-chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.days.map((d) => ({ ...d, label: shortDay(d.day) }))}>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip contentStyle={tip} />
              <Legend />
              <Bar dataKey="done" stackId="g" name={t("an.g.done")} fill="#10b981" />
              <Bar dataKey="pending" stackId="g" name={t("an.g.pending")} fill="#2563eb" />
              <Bar dataKey="cancelled" stackId="g" name={t("an.g.cancelled")} fill="#ef4444" />
              <Bar dataKey="noShow" stackId="g" name={t("an.g.noShow")} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="an-table-wrap">
          <table className="fd-table" data-testid="grooming-table">
            <thead>
              <tr>
                <th>{t("an.day")}</th>
                <th className="num">{t("an.g.bookings")}</th>
                <th className="num">{t("an.g.done")}</th>
                <th className="num">{t("an.g.pending")}</th>
                <th className="num">{t("an.g.cancelled")}</th>
                <th className="num">{t("an.g.noShow")}</th>
                <th className="num">{t("an.g.doneValue")}</th>
                <th className="num">{t("an.g.paid")}</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td className="num">{d.bookings}</td>
                  <td className="num">{d.done}</td>
                  <td className="num">{d.pending}</td>
                  <td className="num">{d.cancelled}</td>
                  <td className="num">{d.noShow}</td>
                  <td className="num">{money2(d.doneValue)}</td>
                  <td className="num">{money2(d.paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="an-total">
                <td>{t("an.total")}</td>
                <td className="num">{tot.bookings}</td>
                <td className="num">{tot.done}</td>
                <td className="num">{tot.pending}</td>
                <td className="num">{tot.cancelled}</td>
                <td className="num">{tot.noShow}</td>
                <td className="num">{money2(tot.doneValue)}</td>
                <td className="num">{money2(tot.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

function ProductsTab({ qs, setMsg }) {
  const { t, locale } = useI18n();
  const { data, loading } = useData(`/api/analytics/products?${qs}`, setMsg);
  if (!data) return <p className="fd-muted">{loading ? t("an.loading") : ""}</p>;
  const tot = data.totals;
  const chName = (ch) => statusLabel("channel", ch, locale);
  return (
    <>
      <Tiles items={[
        { label: t("an.p.orders"), value: tot.orders },
        { label: t("an.p.amount"), value: money2(tot.amount), tone: "ok" },
        { label: t("an.p.pendingWeb"), value: tot.pendingWeb, tone: "info" },
        { label: t("an.p.pendingSo"), value: tot.pendingSo, tone: "info" },
        { label: t("an.p.cancelled"), value: tot.cancelled, tone: "bad" },
      ]} />
      <p className="fd-muted" style={{ margin: 0 }}>{t("an.p.pendingNow", { web: String(data.pendingNow.web), so: String(data.pendingNow.salesOrders) })}</p>
      <section className="card fd-card">
        <h2>{t("an.p.byChannel")}</h2>
        <Tiles items={CHANNELS.map((ch) => ({ label: `${chName(ch)} · ${tot.channels[ch].orders}`, value: money2(tot.channels[ch].amount) }))} />
      </section>
      <section className="card fd-card">
        <Head title={t("an.tabProducts")} list="products-daily" query={qs} setMsg={setMsg} />
        <p className="fd-muted">{t("an.p.hint")}</p>
        <div className="an-chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.days.map((d) => ({ label: shortDay(d.day), ...Object.fromEntries(CHANNELS.map((ch) => [ch, d.channels[ch].amount])) }))}>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip contentStyle={tip} formatter={(v) => money2(v)} />
              <Legend />
              {CHANNELS.map((ch) => <Bar key={ch} dataKey={ch} stackId="p" name={chName(ch)} fill={CH_COLORS[ch]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="an-table-wrap">
          <table className="fd-table" data-testid="products-table">
            <thead>
              <tr>
                <th>{t("an.day")}</th>
                <th className="num">{t("an.p.orders")}</th>
                <th className="num">{t("an.p.amount")}</th>
                {CHANNELS.map((ch) => <th key={ch} className="num">{chName(ch)}</th>)}
                <th className="num">{t("an.p.pendingWeb")}</th>
                <th className="num">{t("an.p.pendingSo")}</th>
                <th className="num">{t("an.p.cancelled")}</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td className="num">{d.orders}</td>
                  <td className="num">{money2(d.amount)}</td>
                  {CHANNELS.map((ch) => <td key={ch} className="num">{d.channels[ch].orders ? `${money2(d.channels[ch].amount)} (${d.channels[ch].orders})` : "—"}</td>)}
                  <td className="num">{d.pendingWeb}</td>
                  <td className="num">{d.pendingSo}</td>
                  <td className="num">{d.cancelled}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="an-total">
                <td>{t("an.total")}</td>
                <td className="num">{tot.orders}</td>
                <td className="num">{money2(tot.amount)}</td>
                {CHANNELS.map((ch) => <td key={ch} className="num">{`${money2(tot.channels[ch].amount)} (${tot.channels[ch].orders})`}</td>)}
                <td className="num">{tot.pendingWeb}</td>
                <td className="num">{tot.pendingSo}</td>
                <td className="num">{tot.cancelled}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="card fd-card">
        <Head title={t("an.p.top")} list="top-products" query={qs} setMsg={setMsg} />
        {!data.topProducts.length ? <p className="fd-muted">{t("an.noData")}</p> : (
          <div className="an-table-wrap">
            <table className="fd-table" data-testid="top-products">
              <thead>
                <tr><th>#</th><th>{t("an.p.product")}</th><th className="num">{t("an.p.qty")}</th><th className="num">{t("an.p.amount")}</th></tr>
              </thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.rank}</td>
                    <td>{locale === "en" ? p.nameEn : p.name}</td>
                    <td className="num">{`${p.quantity} ${t(`an.unit.${p.unit}`)}`}</td>
                    <td className="num">{money2(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function UsersTab({ range, setMsg }) {
  const { t } = useI18n();
  const [groupBy, setGroupBy] = useState("day");
  const qs = new URLSearchParams({ from: range.from, to: range.to, groupBy }).toString();
  const { data, loading } = useData(`/api/analytics/users?${qs}`, setMsg);
  return (
    <section className="card fd-card">
      <div className="fd-head">
        <h2>{t("an.tabUsers")}</h2>
        <label className="an-inline">
          <span>{t("an.u.groupBy")}</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="day">{t("an.u.day")}</option>
            <option value="week">{t("an.u.week")}</option>
            <option value="month">{t("an.u.month")}</option>
          </select>
        </label>
        <CsvButton list="new-users" query={qs} onError={setMsg} />
      </div>
      <p className="fd-muted">{t("an.u.hint")}</p>
      {!data ? <p className="fd-muted">{loading ? t("an.loading") : ""}</p> : (
        <>
          <Tiles items={[{ label: t("an.u.registered"), value: data.totals.registered, tone: "ok" }, { label: t("an.u.verified"), value: data.totals.verified }]} />
          <div className="an-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.periods.map((p) => ({ ...p, label: groupBy === "month" ? p.period.slice(0, 7) : shortDay(p.period) }))}>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="registered" name={t("an.u.registered")} fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="an-table-wrap">
            <table className="fd-table" data-testid="users-table">
              <thead><tr><th>{t("an.u.period")}</th><th className="num">{t("an.u.registered")}</th><th className="num">{t("an.u.verified")}</th></tr></thead>
              <tbody>
                {data.periods.map((p) => <tr key={p.period}><td>{p.period}</td><td className="num">{p.registered}</td><td className="num">{p.verified}</td></tr>)}
              </tbody>
              <tfoot><tr className="an-total"><td>{t("an.total")}</td><td className="num">{data.totals.registered}</td><td className="num">{data.totals.verified}</td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PeakTab({ qs: baseQs, setMsg }) {
  const { t, locale } = useI18n();
  const [channel, setChannel] = useState("");
  const qs = channel ? `${baseQs}&channel=${channel}` : baseQs;
  const { data, loading } = useData(`/api/analytics/peak-hours?${qs}`, setMsg);
  const peak = data?.totals?.peakHour != null ? data.hours[data.totals.peakHour] : null;
  return (
    <section className="card fd-card">
      <div className="fd-head">
        <h2>{t("an.k.byHour")}</h2>
        <label className="an-inline">
          <span>{t("an.k.channel")}</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} data-testid="peak-channel">
            <option value="">{t("an.k.allChannels")}</option>
            {CHANNELS.map((ch) => <option key={ch} value={ch}>{statusLabel("channel", ch, locale)}</option>)}
          </select>
        </label>
        <CsvButton list="peak-hours" query={qs} onError={setMsg} />
      </div>
      <p className="fd-muted">{t("an.k.hint")}</p>
      {!data ? <p className="fd-muted">{loading ? t("an.loading") : ""}</p> : (
        <>
          {peak ? <p className="an-peak"><strong>{t("an.k.peak", { hour: `${hourLabel(peak.hour)}–${String(peak.hour).padStart(2, "0")}:59`, orders: String(peak.orders) })}</strong></p> : <p className="fd-muted">{t("an.noData")}</p>}
          <div className="an-chart" data-testid="peak-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.hours.map((h) => ({ ...h, label: String(h.hour).padStart(2, "0") }))}>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={tip} labelFormatter={(l) => `${l}:00`} />
                <Bar dataKey="orders" name={t("an.p.orders")} fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3 className="an-sub">{t("an.k.byWeekday")}</h3>
          <div className="an-bars" data-testid="weekday-bars">
            {(() => {
              const max = Math.max(1, ...data.weekdays.map((w) => w.orders));
              return data.weekdays.map((w) => (
                <div key={w.weekday} className="an-bar-row">
                  <span className="an-bar-label">{t(`an.wd.${w.weekday}`)}</span>
                  <span className="an-bar-track"><span className="an-bar-fill" style={{ width: `${(w.orders / max) * 100}%` }} /></span>
                  <span className="an-bar-value">{w.orders}</span>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </section>
  );
}
