import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, editErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { formatDateTime } from "../utils/qatarDate.js";
import { JobFacts, JobLines, KindBadge, StatusBadge, areaName, personLabel } from "../components/DispatchShared.jsx";

/** fix-rb: assign orders to drivers (and home grooming visits to grooming vans), grouped by zone. */

const KIND_FILTERS = ["", "DELIVERY", "WEB_ORDER", "POS_DELIVERY", "SALES_ORDER", "GROOMING"];

function ItemDetail({ item, areas, canEdit, onSaved, setError }) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ areaId: item.area?.id || "", address: item.address || "", timeNote: item.timeNote || "", note: item.note || "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/api/dispatch/items/${encodeURIComponent(item.key)}`).then(setDetail).catch((e) => setError(e.message)), [item.key]);
  useEffect(() => { load(); }, [load]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/dispatch/items/${encodeURIComponent(item.key)}`, { method: "PATCH", body: { ...form, version: detail?.version ?? undefined } });
      await onSaved();
    } catch (x) {
      setError(editErrorMessage(x, t));
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vr-card rb-sub" data-testid="item-detail">
      <JobLines lines={item.lines} />
      {canEdit && item.status !== "DELIVERED" ? (
        <form className="vr-grid" onSubmit={save} data-testid="item-edit">
          <label className="vr-field"><span>{t("dsp.area")}</span>
            <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} data-testid="edit-area">
              <option value="">{t("dsp.noZone")}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{areaName(a, locale)}{a.zone || a.city ? ` · ${a.zone || a.city}` : ""}</option>)}
            </select>
          </label>
          <label className="vr-field"><span>{t("dsp.address")}</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="vr-field"><span>{t("dsp.time")}</span><input value={form.timeNote} onChange={(e) => setForm({ ...form, timeNote: e.target.value })} /></label>
          <label className="vr-field"><span>{t("dsp.note")}</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button type="submit" className="btn-touch vr-btn" disabled={busy} data-testid="save-item">{t("common.save")}</button>
        </form>
      ) : null}
      <h3 className="rb-h3">{t("dsp.history")}</h3>
      {detail?.events?.length ? (
        <ul className="vr-simple" data-testid="history">
          {detail.events.map((ev) => (
            <li key={ev.id}>
              <span><b>{t(`dsp.event.${ev.type}`)}</b>{ev.meta?.to?.vehicle ? ` → ${ev.meta.to.vehicle}${ev.meta.to.driver ? ` (${ev.meta.to.driver})` : ""}` : ""}{ev.note ? ` · ${ev.note}` : ""}</span>
              <span className="vr-muted">{personLabel(ev.user, locale)} · {formatDateTime(ev.createdAt, locale)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="vr-muted">{t("dsp.noHistory")}</p>}
    </div>
  );
}

export default function Dispatch() {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const canAssign = canModule("dispatch", "create");
  const canEdit = canModule("dispatch", "edit");
  const [kind, setKind] = useState("");
  const [show, setShow] = useState("unassigned");
  const [data, setData] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/dispatch/queue?show=${show}${kind ? `&kind=${kind}` : ""}`);
      setData(d);
      setAreas(d.areas || []);
      const keys = new Set(d.groups.flatMap((g) => g.items.map((i) => i.key)));
      setSelected((prev) => new Set([...prev].filter((k) => keys.has(k))));
    } catch (e) {
      setError(e.message);
    }
  }, [show, kind]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => (data?.groups || []).flatMap((g) => g.items), [data]);
  const chosen = items.filter((i) => selected.has(i.key));
  const groomingChosen = chosen.some((i) => i.kind === "GROOMING");
  const deliveryChosen = chosen.some((i) => i.kind !== "GROOMING");
  const targets = useMemo(() => {
    const out = [];
    for (const v of data?.vans || []) {
      if (groomingChosen && v.type !== "GROOMING") continue;
      if (deliveryChosen && v.type !== "DELIVERY") continue;
      const load = t("dsp.workload", { n: v.workload.open });
      if (v.drivers.length) for (const d of v.drivers) out.push({ value: `driver:${d.id}`, label: `${personLabel(d, locale)} · ${v.plate} · ${t(`dsp.vehicleType.${v.type}`)} (${load})` });
      out.push({ value: `vehicle:${v.id}`, label: `${v.name} · ${v.plate} · ${t(`dsp.vehicleType.${v.type}`)} (${load})` });
    }
    return out;
  }, [data, groomingChosen, deliveryChosen, locale]);
  useEffect(() => {
    if (target && !targets.some((x) => x.value === target)) setTarget("");
  }, [targets]);

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleGroup = (g) => setSelected((prev) => {
    const next = new Set(prev);
    const all = g.items.every((i) => next.has(i.key));
    for (const i of g.items) if (all) next.delete(i.key); else next.add(i.key);
    return next;
  });

  const run = async (path, extra, okKey) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api(path, { method: "POST", body: { items: chosen.map((i) => ({ key: i.key, version: i.version ?? undefined })), ...extra } });
      setNotice(t(okKey, { n: r.assigned ?? r.unassigned ?? chosen.length }));
      setSelected(new Set());
      await load();
    } catch (x) {
      setError(editErrorMessage(x, t));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const assign = () => {
    const [type, id] = target.split(":");
    run("/api/dispatch/assign", type === "driver" ? { driverUserId: id } : { vehicleId: id }, "dsp.assignedN");
  };

  return (
    <div className="vr-page rb-dispatch" data-testid="dispatch-page">
      <h1>{t("dsp.title")}</h1>
      <p className="vr-muted">{t("dsp.hint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="notice">{notice}</div> : null}

      <section className="card vr-card">
        <div className="vr-grid">
          <label className="vr-field"><span>{t("dsp.show")}</span>
            <select value={show} onChange={(e) => setShow(e.target.value)} data-testid="show-filter">
              {["unassigned", "assigned", "all"].map((s) => <option key={s} value={s}>{t(`dsp.showOpt.${s}`)}</option>)}
            </select>
          </label>
          <label className="vr-field"><span>{t("dsp.kindFilter")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="kind-filter">
              {KIND_FILTERS.map((k) => <option key={k || "all"} value={k}>{t(k ? `dsp.kindOpt.${k}` : "dsp.kindOpt.all")}</option>)}
            </select>
          </label>
        </div>
        {data ? (
          <details className="rb-vans" data-testid="vans">
            <summary>{t("dsp.vansWorkload", { n: data.vans.length })}</summary>
            <ul className="vr-simple">
              {data.vans.map((v) => (
                <li key={v.id} data-testid="van-row">
                  <span>{v.name} · {v.plate} · {t(`dsp.vehicleType.${v.type}`)}{v.drivers.length ? ` · ${v.drivers.map((d) => personLabel(d, locale)).join(", ")}` : ""}</span>
                  <b>{t("dsp.workloadFull", { assigned: v.workload.assigned, accepted: v.workload.accepted, done: v.workload.deliveredToday })}</b>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {!data ? <p className="vr-muted">{t("common.loading")}</p> : null}
      {data && !data.groups.length ? <p className="card vr-muted" data-testid="empty">{t("dsp.empty")}</p> : null}
      {(data?.groups || []).map((g) => (
        <section key={g.zone || "_none"} className="card vr-card" data-testid="zone-group" data-zone={g.zone || ""}>
          <div className="vr-item__head">
            <h2>{g.zone || t("dsp.noZone")} ({g.count})</h2>
            {canAssign ? (
              <label className="rb-check"><input type="checkbox" checked={g.items.every((i) => selected.has(i.key))} onChange={() => toggleGroup(g)} data-testid="select-zone" /> {t("dsp.selectZone")}</label>
            ) : null}
          </div>
          <ul className="vr-list">
            {g.items.map((item) => (
              <li key={item.key} className="vr-item rb-item" data-testid="dispatch-item" data-key={item.key} data-ref={item.reference}>
                <div className="rb-item__row">
                  {canAssign ? <input type="checkbox" className="rb-item__check" checked={selected.has(item.key)} onChange={() => toggle(item.key)} aria-label={item.reference} data-testid="select-item" /> : null}
                  <div className="rb-item__main">
                    <div className="vr-item__head">
                      <strong>{item.reference}</strong>
                      <span className="vr-badges"><KindBadge kind={item.kind} /><StatusBadge status={item.status} />{item.pendingChange ? <span className="vr-badge vr-badge--warn">{t("drv.waitingApproval")}</span> : null}</span>
                    </div>
                    <JobFacts item={item} showDriver />
                    <button type="button" className="vr-linkbtn" onClick={() => setOpen(open === item.key ? "" : item.key)} aria-expanded={open === item.key} data-testid="open-item">{open === item.key ? t("vr.hide") : t("dsp.details")}</button>
                  </div>
                </div>
                {open === item.key ? <ItemDetail item={item} areas={areas} canEdit={canEdit} onSaved={load} setError={setError} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {canAssign ? (
        <section className="card vr-card rb-assignbar" data-testid="assign-bar">
          <span>{t("dsp.selectedN", { n: chosen.length })}</span>
          <label className="vr-field"><span>{t("dsp.assignTo")}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="assign-target">
              <option value="">{t("dsp.chooseDriver")}</option>
              {targets.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <div className="vr-actions">
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy || !chosen.length || !target} onClick={assign} data-testid="assign">{t("dsp.assign")}</button>
            {canEdit ? (
              <button type="button" className="btn-touch vr-btn" disabled={busy || !chosen.length || !chosen.every((i) => ["ASSIGNED", "ACCEPTED", "DECLINED"].includes(i.status))} onClick={() => run("/api/dispatch/unassign", {}, "dsp.unassignedN")} data-testid="unassign">{t("dsp.unassign")}</button>
            ) : null}
          </div>
          {groomingChosen && deliveryChosen ? <p className="vr-muted">{t("dsp.mixedKinds")}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
