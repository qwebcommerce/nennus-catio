import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, editErrorMessage, isStaleEdit, resolveApiErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatDateTime } from "../utils/qatarDate.js";
import { qatarToday } from "../utils/qatarTime.js";
import { PageTabs } from "../components/BizShared.jsx";

/**
 * fix-re: generated grooming coupons (docs/testing/coupons.md). Routes:
 *   /promotions/coupons            batches (+ new batch)
 *   /promotions/coupons/:id        every code with its status and uses
 *   /promotions/coupons/:id/print  printable sheet (cards or a list)
 * Rights: promotions view / create (generate) / edit (disable, enable) / export (CSV).
 */
const inp = { width: "100%", boxSizing: "border-box", minWidth: 0 };
const fld = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" };
const STATUSES = ["UNUSED", "PART_USED", "HELD", "USED", "EXPIRED", "DISABLED"];
const TONE = { UNUSED: "#067647", PART_USED: "#b54708", HELD: "#b54708", USED: "#344054", EXPIRED: "#b42318", DISABLED: "#b42318" };

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function PromoTabs({ value }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <PageTabs
      tabs={[{ id: "offers", label: t("cp.tabOffers") }, { id: "coupons", label: t("cp.tabCoupons") }]}
      value={value}
      onChange={(id) => navigate(id === "offers" ? "/promotions" : "/promotions/coupons")}
    />
  );
}

function useNames() {
  const { locale } = useI18n();
  return (row) => (locale === "en" ? row?.nameEn || row?.name : row?.name || row?.nameEn) || "";
}

function discountText(t, b) {
  return b.discountType === "PERCENT" ? `${b.percent}%` : `${Number(b.amount).toFixed(2)} ${t("common.currency")}`;
}

function packagesText(t, b, nameOf) {
  return b.allPackages ? t("cp.allPackages") : (b.packages || []).map(nameOf).join("، ");
}

function batchState(t, b) {
  if (!b.active) return { text: t("cp.state.disabled"), tone: "#b42318" };
  if (b.expired) return { text: t("cp.state.expired"), tone: "#b42318" };
  if (b.notStarted) return { text: t("cp.state.notStarted"), tone: "#b54708" };
  return { text: t("cp.state.active"), tone: "#067647" };
}

function Badge({ text, tone }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, border: `1px solid ${tone}`, color: tone, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}

function Stat({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800 }} className="num">{value}</div>
    </div>
  );
}

function Stats({ s }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }} data-testid="coupon-stats">
      <Stat label={t("cp.st.generated")} value={s.generated} />
      <Stat label={t("cp.st.used")} value={s.used} />
      <Stat label={t("cp.st.held")} value={s.held} />
      <Stat label={t("cp.st.remaining")} value={s.remaining} />
      <Stat label={t("cp.st.expired")} value={s.expired} />
      <Stat label={t("cp.st.discount")} value={Number(s.discount).toFixed(2)} />
      <Stat label={t("cp.st.bookingValue")} value={Number(s.bookingValue).toFixed(2)} />
      <Stat label={t("cp.st.paid")} value={Number(s.paid).toFixed(2)} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── list + create
function BatchList() {
  const { t } = useI18n();
  const { canModule } = useAuth();
  const navigate = useNavigate();
  const nameOf = useNames();
  const [data, setData] = useState(null);
  const [packages, setPackages] = useState([]);
  const today = qatarToday();
  const empty = { name: "", nameEn: "", prefix: "", allPackages: false, packageIds: [], discountType: "PERCENT", percent: "", amount: "", validFrom: today, validUntil: addDays(today, 30), codeCount: "20", usesPerCode: "1", onePerCustomer: false, minAmount: "", channel: "BOTH", releaseOnPaidCancel: false };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api("/api/coupons").then(setData).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    api("/api/coupons/packages").then(setPackages).catch(() => setPackages([]));
  }, []);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const togglePackage = (id) => setForm({ ...form, packageIds: form.packageIds.includes(id) ? form.packageIds.filter((x) => x !== id) : [...form.packageIds, id] });
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const row = await api("/api/coupons", {
        method: "POST",
        body: {
          ...form,
          percent: form.discountType === "PERCENT" ? Number(form.percent) : null,
          amount: form.discountType === "AMOUNT" ? form.amount : null,
          codeCount: Number(form.codeCount),
          usesPerCode: Number(form.usesPerCode || 1),
          minAmount: form.minAmount || null,
        },
      });
      setForm(empty);
      navigate(`/promotions/coupons/${row.id}`, { state: { created: row.stats.generated } });
    } catch (x) {
      setMsg(x.message);
    } finally {
      setBusy(false);
    }
  };
  const tot = data?.totals;
  return (
    <>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("cp.intro")}</p>
      {msg ? <div className="card" role="alert" style={{ color: "var(--danger, #b42318)" }}>{msg}</div> : null}
      {canModule("promotions", "create") ? (
        <form className="card" onSubmit={submit} style={{ display: "grid", gap: 10 }} data-testid="coupon-new">
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("cp.newBatch")}</h2>
          <div style={grid}>
            <label style={fld}><span>{t("cp.name")}</span><input style={inp} required name="name" value={form.name} onChange={set("name")} /></label>
            <label style={fld}><span>{t("cp.nameEn")}</span><input style={inp} name="nameEn" value={form.nameEn} onChange={set("nameEn")} /></label>
            <label style={fld}><span>{t("cp.prefix")}</span><input style={inp} name="prefix" maxLength={10} placeholder={t("cp.prefixHint")} value={form.prefix} onChange={set("prefix")} /></label>
          </div>
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, minWidth: 0 }}>
            <legend>{t("cp.packages")}</legend>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700 }}>
              <input type="checkbox" name="allPackages" checked={form.allPackages} onChange={set("allPackages")} /> {t("cp.allPackages")}
            </label>
            {!form.allPackages ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
                {packages.map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" data-package={p.id} checked={form.packageIds.includes(p.id)} onChange={() => togglePackage(p.id)} />
                    {nameOf(p)} <span style={{ color: "var(--muted)" }}>({Number(p.price).toFixed(2)})</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
          <div style={grid}>
            <label style={fld}><span>{t("cp.discountType")}</span>
              <select style={inp} name="discountType" value={form.discountType} onChange={set("discountType")}>
                <option value="PERCENT">{t("cp.type.PERCENT")}</option>
                <option value="AMOUNT">{t("cp.type.AMOUNT")}</option>
              </select>
            </label>
            {form.discountType === "PERCENT" ? (
              <label style={fld}><span>{t("cp.percent")}</span><input style={inp} required name="percent" type="number" min="1" max="100" step="1" value={form.percent} onChange={set("percent")} /></label>
            ) : (
              <label style={fld}><span>{t("cp.amount")}</span><input style={inp} required name="amount" inputMode="decimal" value={form.amount} onChange={set("amount")} /></label>
            )}
            <label style={fld}><span>{t("cp.validFrom")}</span><input style={inp} required name="validFrom" type="date" value={form.validFrom} onChange={set("validFrom")} /></label>
            <label style={fld}><span>{t("cp.validUntil")}</span><input style={inp} required name="validUntil" type="date" value={form.validUntil} onChange={set("validUntil")} /></label>
            <label style={fld}><span>{t("cp.count")}</span><input style={inp} required name="codeCount" type="number" min="1" max="1000" value={form.codeCount} onChange={set("codeCount")} /></label>
            <label style={fld}><span>{t("cp.usesPerCode")}</span><input style={inp} name="usesPerCode" type="number" min="1" max="1000" value={form.usesPerCode} onChange={set("usesPerCode")} /></label>
            <label style={fld}><span>{t("cp.minAmount")}</span><input style={inp} name="minAmount" inputMode="decimal" value={form.minAmount} onChange={set("minAmount")} /></label>
            <label style={fld}><span>{t("cp.channel")}</span>
              <select style={inp} name="channel" value={form.channel} onChange={set("channel")}>
                {["BOTH", "WEBSITE", "DESK"].map((c) => <option key={c} value={c}>{t(`cp.channel.${c}`)}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="onePerCustomer" checked={form.onePerCustomer} onChange={set("onePerCustomer")} /> {t("cp.onePerCustomer")}</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="releaseOnPaidCancel" checked={form.releaseOnPaidCancel} onChange={set("releaseOnPaidCancel")} /> {t("cp.releaseOnPaidCancel")}</label>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("cp.noStack")}</div>
          <div><button type="submit" className="btn-touch" disabled={busy} style={{ background: "var(--accent)", color: "#fff" }}>{t("cp.generate")}</button></div>
        </form>
      ) : null}

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t("cp.batches")}</h2>
        {tot ? <Stats s={{ generated: tot.generated, used: tot.used, held: tot.held, remaining: data.batches.reduce((x, b) => x + b.stats.remaining, 0), expired: data.batches.reduce((x, b) => x + b.stats.expired, 0), discount: tot.discount, bookingValue: tot.bookingValue, paid: tot.paid }} /> : null}
        {data && !data.batches.length ? <div style={{ color: "var(--muted)" }}>{t("cp.none")}</div> : null}
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))" }}>
          {(data?.batches || []).map((b) => {
            const st = batchState(t, b);
            return (
              <Link key={b.id} to={`/promotions/coupons/${b.id}`} className="card" data-batch={b.id} style={{ textDecoration: "none", color: "inherit", display: "grid", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                  <strong style={{ overflowWrap: "anywhere" }}>{nameOf(b)}</strong>
                  <Badge {...st} />
                </div>
                <div>{t("cp.off", { v: discountText(t, b) })} · {packagesText(t, b, nameOf)}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("cp.validRange", { from: b.validFrom, until: b.validUntil })} · {t(`cp.channel.${b.channel}`)}{b.prefix ? ` · ${b.prefix}-` : ""}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 13 }}>
                  <span>{t("cp.st.generated")}: <b>{b.stats.generated}</b></span>
                  <span>{t("cp.st.used")}: <b>{b.stats.used}</b></span>
                  <span>{t("cp.st.held")}: <b>{b.stats.held}</b></span>
                  <span>{t("cp.st.remaining")}: <b>{b.stats.remaining}</b></span>
                  <span>{t("cp.st.expired")}: <b>{b.stats.expired}</b></span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 13 }}>
                  <span>{t("cp.st.discount")}: <b>{Number(b.stats.discount).toFixed(2)}</b></span>
                  <span>{t("cp.st.bookingValue")}: <b>{Number(b.stats.bookingValue).toFixed(2)}</b></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ───────────────────────────────────────────────────────────────── one batch
async function downloadCsv(id, name) {
  const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/coupons/${id}/export`, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
  if (!res.ok) return resolveApiErrorMessage(await res.json().catch(() => null), "Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "coupons"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "";
}

function useBatch(id) {
  const [batch, setBatch] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => api(`/api/coupons/${id}`).then(setBatch).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { batch, msg, setMsg, load };
}

function BatchDetail({ id, created }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const nameOf = useNames();
  const { batch, msg, setMsg, load } = useBatch(id);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const codes = useMemo(() => (batch?.codes || []).filter((c) => (!status || c.status === status) && (!search || c.code.replace(/-/g, "").includes(search.toUpperCase().replace(/[^A-Z0-9]/g, "")))), [batch, status, search]);
  if (!batch) return <div className="card">{msg || t("common.loading")}</div>;
  const st = batchState(t, batch);
  const failed = (x) => { setMsg(editErrorMessage(x, t)); if (isStaleEdit(x)) load(); };
  const toggleBatch = () => api(`/api/coupons/${batch.id}`, { method: "PATCH", body: { active: !batch.active, version: batch.version } }).then(load).catch(failed);
  const toggleCode = (c) => api(`/api/coupons/codes/${c.id}`, { method: "PATCH", body: { active: !c.active, version: c.version } }).then(load).catch(failed);
  return (
    <>
      <Link to="/promotions/coupons">{t("cp.back")}</Link>
      {created ? <div className="card" role="status">{t("cp.generated", { n: created })}</div> : null}
      {msg ? <div className="card" role="alert" style={{ color: "var(--danger, #b42318)" }}>{msg}</div> : null}
      <section className="card" style={{ display: "grid", gap: 8 }} data-testid="coupon-batch">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, overflowWrap: "anywhere" }}>{nameOf(batch)}</h2>
          <Badge {...st} />
        </div>
        <div>{t("cp.off", { v: discountText(t, batch) })} · {packagesText(t, batch, nameOf)}</div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          {t("cp.validRange", { from: batch.validFrom, until: batch.validUntil })} · {t(`cp.channel.${batch.channel}`)} · {t("cp.usesPerCode")}: {batch.usesPerCode}
          {batch.onePerCustomer ? ` · ${t("cp.onePerCustomer")}` : ""}
          {batch.minAmount ? ` · ${t("cp.minAmount")}: ${Number(batch.minAmount).toFixed(2)}` : ""}
          {batch.releaseOnPaidCancel ? ` · ${t("cp.releaseOnPaidCancel")}` : ""}
        </div>
        <Stats s={batch.stats} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canModule("promotions", "edit") ? <button type="button" className="btn-touch" onClick={toggleBatch}>{batch.active ? t("cp.disableBatch") : t("cp.enableBatch")}</button> : null}
          {canModule("promotions", "export") ? <button type="button" className="btn-touch" onClick={async () => setMsg(await downloadCsv(batch.id, batch.prefix || "coupons"))}>{t("cp.exportCsv")}</button> : null}
          <Link className="btn-touch" to={`/promotions/coupons/${batch.id}/print`}>{t("cp.print")}</Link>
        </div>
      </section>
      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t("cp.codes")} ({codes.length})</h2>
        <div style={grid}>
          <label style={fld}><span>{t("cp.filterStatus")}</span>
            <select style={inp} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("cp.filterAll")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`cp.status.${s}`)}</option>)}
            </select>
          </label>
          <label style={fld}><span>{t("cp.search")}</span><input style={inp} name="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {codes.map((c) => (
            <div key={c.id} data-code={c.code} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, display: "grid", gap: 6, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <code dir="ltr" style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{c.code}</code>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge text={t(`cp.status.${c.status}`)} tone={TONE[c.status] || "#344054"} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("cp.uses", { u: c.usedCount, m: c.maxUses })}</span>
                  {canModule("promotions", "edit") ? <button type="button" className="btn-touch" onClick={() => toggleCode(c)}>{c.active ? t("cp.disableCode") : t("cp.enableCode")}</button> : null}
                </span>
              </div>
              {c.uses.map((u) => (
                <div key={u.id} data-use={u.status} style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 13, color: u.status === "RELEASED" ? "var(--muted)" : "inherit" }}>
                  <span><b>{t(`cp.useStatus.${u.status}`)}</b></span>
                  <span>{t("cp.usedBy")}: {u.customer?.name || t("cp.walkIn")}</span>
                  <span>{t("cp.booking")}: {u.booking?.reference || "—"}</span>
                  <span>{t(`cp.useChannel.${u.channel}`)}</span>
                  <span>{t("cp.usedAt")}: {formatDateTime(u.committedAt || u.releasedAt || u.createdAt, locale)}</span>
                  <span>−{Number(u.discount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ───────────────────────────────────────────────────────────────── print sheet
function PrintSheet({ id }) {
  const { t } = useI18n();
  const nameOf = useNames();
  const { batch, msg } = useBatch(id);
  const [layout, setLayout] = useState("cards");
  const [onlyUnused, setOnlyUnused] = useState(true);
  if (!batch) return <div className="card">{msg || t("common.loading")}</div>;
  const codes = batch.codes.filter((c) => !onlyUnused || c.status === "UNUSED");
  const off = t("cp.off", { v: discountText(t, batch) });
  const pk = packagesText(t, batch, nameOf);
  const until = t("cp.cardValid", { d: batch.validUntil });
  return (
    <>
      <div className="dashboard-print-hide" style={{ display: "grid", gap: 10 }}>
        <Link to={`/promotions/coupons/${batch.id}`}>← {nameOf(batch)}</Link>
        <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={fld}><span>{t("cp.layout")}</span>
            <select name="layout" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="cards">{t("cp.layoutCards")}</option>
              <option value="list">{t("cp.layoutList")}</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="onlyUnused" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} /> {t("cp.onlyUnused")}</label>
          <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => window.print()}>{t("cp.printNow")}</button>
        </div>
      </div>
      <div className="dashboard-print-area" data-testid="coupon-sheet" style={{ background: "#fff", color: "#111", padding: 8, borderRadius: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{nameOf(batch)} — {off}</h2>
        {layout === "cards" ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))" }}>
            {codes.map((c) => (
              <div key={c.id} className="coupon-card" style={{ border: "2px dashed #555", borderRadius: 10, padding: 10, display: "grid", gap: 4, breakInside: "avoid", pageBreakInside: "avoid", textAlign: "center" }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{t("cp.cardTitle")}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{off}</div>
                <div style={{ fontSize: 13 }}>{t("cp.cardFor", { p: pk })}</div>
                <code dir="ltr" style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, whiteSpace: "nowrap", border: "1px solid #111", borderRadius: 6, padding: "4px 6px" }}>{c.code}</code>
                <div style={{ fontSize: 12 }}>{until} · {t(`cp.cardWhere.${batch.channel}`)}</div>
                {batch.usesPerCode === 1 ? <div style={{ fontSize: 11 }}>{t("cp.cardOnce")}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr><th style={pth}>#</th><th style={pth}>{t("cp.codes")}</th><th style={pth}>{t("cp.packages")}</th><th style={pth}>{t("cp.validUntil")}</th></tr>
            </thead>
            <tbody>
              {codes.map((c, i) => (
                <tr key={c.id}><td style={ptd}>{i + 1}</td><td style={ptd}><code dir="ltr" style={{ fontWeight: 800 }}>{c.code}</code></td><td style={ptd}>{pk} · {off}</td><td style={ptd}>{batch.validUntil}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
const pth = { textAlign: "start", borderBottom: "1px solid #111", padding: 4 };
const ptd = { borderBottom: "1px solid #ccc", padding: 4, overflowWrap: "anywhere" };

export default function Coupons() {
  const { t } = useI18n();
  const { id, view } = useParams();
  const created = typeof window !== "undefined" ? window.history.state?.usr?.created : null;
  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div className="dashboard-print-hide" style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>{view === "print" ? t("cp.printTitle") : t("cp.title")}</h1>
        <PromoTabs value="coupons" />
      </div>
      {!id ? <BatchList /> : view === "print" ? <PrintSheet id={id} /> : <BatchDetail id={id} created={created} />}
    </div>
  );
}
