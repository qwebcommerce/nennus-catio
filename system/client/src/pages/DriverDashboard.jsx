import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, editErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { formatDateTime } from "../utils/qatarDate.js";
import { statusLabel } from "../utils/statusLabels.js";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";
import { ChangeSummary, JobFacts, JobLines, KindBadge, StatusBadge, lineName, money, qtyText } from "../components/DispatchShared.jsx";
import { DamagedList, ReturnCard, VanReturnForm } from "./VehicleDashboard.jsx";
import { ProofUpload } from "../components/BizShared.jsx";

/**
 * fix-rd: "Record payment collected" — money the driver took on delivery. Saved as awaiting the
 * accountant's confirmation (a bank transfer needs its proof file).
 */
function CollectForm({ item, vq, onDone, onCancel }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(String(item.toCollect || ""));
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [proofFileId, setProofFileId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (method === "BANK_TRANSFER" && !proofFileId) return setError(t("drv.collectProofMissing"));
    setBusy(true);
    try {
      const r = await api(`/api/driver/jobs/${item.jobId}/collect${vq}`, { method: "POST", body: { version: item.version, amount, method, reference, proofFileId: proofFileId || undefined, note } });
      onDone(r);
    } catch (x) {
      setError(editErrorMessage(x, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="vr-card rb-sub" onSubmit={submit} data-testid="collect-form">
      <h3 className="rb-h3">{t("drv.collect")}</h3>
      <p className="vr-muted">{t("drv.collectHint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="collect-error">{error}</div> : null}
      <div className="vr-grid">
        <label className="vr-field"><span>{t("drv.collectAmount")}</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="collect-amount" /></label>
        <label className="vr-field"><span>{t("drv.collectMethod")}</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="collect-method">
            <option value="CASH">{t("pc.method.CASH")}</option>
            <option value="BANK_TRANSFER">{t("pc.method.BANK_TRANSFER")}</option>
          </select>
        </label>
        {method === "BANK_TRANSFER" ? (
          <>
            <label className="vr-field"><span>{t("drv.collectReference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} data-testid="collect-reference" /></label>
            <ProofUpload value={proofFileId} onChange={setProofFileId} required label={t("drv.proof")} />
          </>
        ) : null}
        <label className="vr-field"><span>{t("dsp.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      </div>
      <div className="vr-actions">
        <button type="submit" className="btn-touch vr-btn vr-btn--primary" disabled={busy} data-testid="collect-save">{t("drv.collectSave")}</button>
        <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

/** fix-rd: drivers add a new customer (name, phone, optional address / area, notes). */
function NewCustomerForm({ onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: "", phone: "", address: "", area: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) return setError(t("drv.customerNeedName"));
    setBusy(true);
    try {
      const c = await api("/api/customers", { method: "POST", body: { ...f, via: "driver" } });
      onDone(c);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card vr-card" onSubmit={submit} data-testid="customer-form">
      <h2>{t("drv.newCustomer")}</h2>
      {error ? <div role="alert" className="vr-alert" data-testid="customer-error">{error}</div> : null}
      <div className="vr-grid">
        <label className="vr-field"><span>{t("drv.customerName")}</span><input value={f.name} onChange={set("name")} data-testid="customer-name" /></label>
        <label className="vr-field"><span>{t("drv.customerPhone")}</span><input type="tel" value={f.phone} onChange={set("phone")} data-testid="customer-phone" /></label>
        <label className="vr-field"><span>{t("drv.customerAddress")}</span><input value={f.address} onChange={set("address")} data-testid="customer-address" /></label>
        <label className="vr-field"><span>{t("drv.customerArea")}</span><input value={f.area} onChange={set("area")} data-testid="customer-area" /></label>
        <label className="vr-field"><span>{t("drv.customerNotes")}</span><input value={f.notes} onChange={set("notes")} data-testid="customer-notes" /></label>
      </div>
      <div className="vr-actions">
        <button type="submit" className="btn-touch vr-btn vr-btn--primary" disabled={busy} data-testid="customer-save">{t("drv.customerSave")}</button>
        <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

const POLL_MS = 20000;

/** A driver's edit of an order: sent for approval (supervisor / accountant), never applied at once. */
function ChangeForm({ item, vq, onDone, onCancel }) {
  const { t, locale } = useI18n();
  const [qty, setQty] = useState(() => Object.fromEntries(item.lines.map((l) => [l.id, String(l.quantity)])));
  const [address, setAddress] = useState(item.address || "");
  const [note, setNote] = useState(item.note || "");
  const [timeNote, setTimeNote] = useState(item.timeNote || "");
  const [deliveryDate, setDeliveryDate] = useState(item.deliveryDate || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ed = item.editable || {};
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const body = { version: item.version, reason };
    if (ed.lines) body.lines = item.lines.map((l) => ({ lineId: l.id, quantity: Number(qty[l.id]) }));
    if (ed.address) body.address = address;
    if (ed.note) body.note = note;
    if (ed.timeNote) body.timeNote = timeNote;
    if (ed.deliveryDate && deliveryDate) body.deliveryDate = deliveryDate;
    setBusy(true);
    try {
      await api(`/api/driver/jobs/${item.jobId}/change-requests${vq}`, { method: "POST", body });
      onDone();
    } catch (x) {
      setError(editErrorMessage(x, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="vr-card rb-sub" onSubmit={submit} data-testid="change-form">
      <h3 className="rb-h3">{t("drv.requestChange")}</h3>
      <p className="vr-muted">{t("drv.changeHint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="change-error">{error}</div> : null}
      {ed.lines ? (
        <ul className="vr-line-list">
          {item.lines.map((l) => (
            <li key={l.id} className="rb-line">
              <ProductImagePreview url={l.imageUrl} alt="" width={40} height={40} />
              <span className="rb-line__name">{lineName(l, locale)}</span>
              <label className="rb-qty">
                <span className="sr-only">{t("drv.quantity")}</span>
                <input type="number" inputMode="numeric" min="0" step="1" value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} aria-label={`${t("drv.quantity")} ${lineName(l, locale)}`} data-testid="change-qty" />
              </label>
            </li>
          ))}
        </ul>
      ) : <p className="vr-muted" data-testid="lines-locked">{t(item.kind === "SALES_ORDER" ? "drv.linesLockedSo" : "drv.linesLockedPaid")}</p>}
      <div className="vr-grid">
        {ed.address ? <label className="vr-field"><span>{t("dsp.address")}</span><input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="change-address" /></label> : null}
        {ed.timeNote ? <label className="vr-field"><span>{t("dsp.time")}</span><input value={timeNote} onChange={(e) => setTimeNote(e.target.value)} data-testid="change-time" /></label> : null}
        {ed.deliveryDate ? <label className="vr-field"><span>{t("dsp.date")}</span><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label> : null}
        {ed.note ? <label className="vr-field"><span>{t("dsp.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} data-testid="change-note" /></label> : null}
        <label className="vr-field"><span>{t("drv.reason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="change-reason" /></label>
      </div>
      <div className="vr-actions">
        <button type="submit" className="btn-touch vr-btn vr-btn--primary" disabled={busy} data-testid="send-change">{t("drv.sendForApproval")}</button>
        <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function OrderCard({ item, vq, isNew, canAct, onChanged, setError, setNotice }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (path, body, notice) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/driver/jobs/${item.jobId}/${path}${vq}`, { method: "POST", body: { version: item.version, ...body } });
      setMode("");
      setNotice(t(notice, { reference: item.reference }));
      await onChanged();
    } catch (x) {
      setError(editErrorMessage(x, t));
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const booking = item.booking;
  return (
    <li className="card vr-item" data-testid="order-card" data-key={item.key} data-ref={item.reference}>
      <div className="vr-item__head">
        <strong>{item.reference}</strong>
        <span className="vr-badges">
          {item.status === "ASSIGNED" && (isNew || !item.seenAt) ? <span className="vr-badge vr-badge--bad" data-testid="new-badge">{t("drv.new")}</span> : null}
          <KindBadge kind={item.kind} />
          <StatusBadge status={item.status} />
          {item.pendingChange ? <span className="vr-badge vr-badge--warn" data-testid="pending-change">{t("drv.waitingApproval")}</span> : null}
        </span>
      </div>
      {booking ? (
        <p className="vr-muted" data-testid="booking-info">
          {booking.petName ? <b>{booking.petName}</b> : null} {booking.service ? `· ${locale === "en" ? booking.service.nameEn || booking.service.name : booking.service.name}` : ""} · <span data-testid="booking-status">{statusLabel("booking", booking.status, locale)}</span>
        </p>
      ) : null}
      <JobFacts item={item} />
      <JobLines lines={item.lines} />
      {Number(item.awaitingConfirmation) > 0 ? <p className="vr-muted" data-testid="order-awaiting">{t("drv.awaiting", { amount: money(item.awaitingConfirmation, t) })}</p> : null}
      {canAct && item.collectable && mode !== "collect" ? (
        <div className="vr-actions">
          <button type="button" className="btn-touch vr-btn" onClick={() => setMode("collect")} data-testid="collect-btn">{t("drv.collect")} · {money(item.toCollect, t)}</button>
        </div>
      ) : null}
      {canAct && item.status !== "DELIVERED" ? (
        <div className="vr-actions">
          {item.status === "ASSIGNED" && !booking ? (
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy} onClick={() => act("accept", {}, "drv.accepted")} data-testid="accept">{t("drv.accept")}</button>
          ) : null}
          {item.status === "ACCEPTED" && !booking ? (
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy || Boolean(item.pendingChange)} onClick={() => act("deliver", {}, "drv.deliveredOk")} data-testid="deliver">{t("drv.markDelivered")}</button>
          ) : null}
          {booking ? (
            <>
              {["BOOKED", "CONFIRMED", "CHECKED_IN"].includes(booking.status) ? (
                <button type="button" className="btn-touch vr-btn" disabled={busy} onClick={() => act("booking-status", { status: "IN_PROGRESS" }, "drv.bookingStarted")} data-testid="start-booking">{t("drv.startBooking")}</button>
              ) : null}
              <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy} onClick={() => act("booking-status", { status: "DONE" }, "drv.bookingDone")} data-testid="done-booking">{t("drv.bookingDoneBtn")}</button>
              {booking.status !== "IN_PROGRESS" ? (
                <button type="button" className="btn-touch vr-btn" disabled={busy} onClick={() => act("booking-status", { status: "NO_SHOW" }, "drv.bookingNoShow")} data-testid="noshow-booking">{t("drv.noShow")}</button>
              ) : null}
            </>
          ) : null}
          {!booking && !item.pendingChange && (item.editable?.lines || item.editable?.address) ? (
            <button type="button" className="btn-touch vr-btn" onClick={() => setMode(mode === "change" ? "" : "change")} data-testid="edit-order">{t("drv.requestChange")}</button>
          ) : null}
          {!booking ? (
            <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={() => setMode(mode === "decline" ? "" : "decline")} data-testid="decline">{t("drv.decline")}</button>
          ) : null}
        </div>
      ) : null}
      {mode === "decline" ? (
        <div className="vr-grid rb-sub" data-testid="decline-form">
          <label className="vr-field"><span>{t("drv.declineReason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="decline-reason" /></label>
          <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy || !reason.trim()} onClick={() => act("decline", { reason }, "drv.declined")} data-testid="confirm-decline">{t("drv.confirmDecline")}</button>
        </div>
      ) : null}
      {mode === "collect" ? (
        <CollectForm item={item} vq={vq} onCancel={() => setMode("")} onDone={async (r) => { setMode(""); setNotice(t("drv.collectSaved", { amount: money(r.confirmation?.amount, t) })); await onChanged(); }} />
      ) : null}
      {mode === "change" ? <ChangeForm item={item} vq={vq} onCancel={() => setMode("")} onDone={async () => { setMode(""); setNotice(t("drv.changeSent")); await onChanged(); }} /> : null}
      {item.deliveredAt ? <p className="vr-muted">{t("drv.deliveredAt", { at: formatDateTime(item.deliveredAt, locale) })}</p> : null}
    </li>
  );
}

const TABS = ["orders", "stock", "transfers", "returns", "payments", "sales", "done"];

export default function DriverDashboard() {
  const { t, locale } = useI18n();
  const { canModule, user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("orders");
  const [vanData, setVanData] = useState(null);
  const [options, setOptions] = useState({ staff: [], locations: [] });
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const unseenRef = useRef(null);
  // Orders that were new when this screen loaded keep their "New" mark until the driver acts.
  const [fresh, setFresh] = useState(() => new Set());
  const canAct = canModule("driver", "create");
  // The owner may open any van's dashboard (?vehicleId=); a driver always gets their own van.
  const [params] = useSearchParams();
  const vq = params.get("vehicleId") ? `?vehicleId=${encodeURIComponent(params.get("vehicleId"))}` : "";

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/driver/overview${vq}`);
      const newKeys = d.orders.filter((o) => o.status === "ASSIGNED" && !o.seenAt).map((o) => o.key);
      if (newKeys.length) setFresh((prev) => new Set([...prev, ...newKeys]));
      setData(d);
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [vq]);
  const loadVan = useCallback(async (vehicleId) => {
    if (!vehicleId || !canModule("returns", "view")) return;
    try {
      setVanData(await api(`/api/van-returns/vehicles/${encodeURIComponent(vehicleId)}/dashboard`));
    } catch {
      setVanData(null);
    }
  }, [canModule]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === "returns" && data?.van?.id) {
      loadVan(data.van.id);
      if (canModule("returns", "view")) api("/api/van-returns/options").then(setOptions).catch(() => {});
    }
  }, [tab, data?.van?.id]);

  // Seeing the list marks new assignments as seen (logged on the server).
  useEffect(() => {
    if (tab === "orders" && data?.counts?.unseen > 0 && canAct && user?.role !== "ADMIN") {
      api(`/api/driver/seen${vq}`, { method: "POST", body: {} }).then(() => load()).catch(() => {});
    }
  }, [tab, data?.counts?.unseen]);

  // New assignments: poll and toast.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const n = await api(`/api/driver/notifications${vq}`);
        if (unseenRef.current != null && n.unseen > unseenRef.current) {
          showToast(t("drv.newAssigned", { n: n.unseen }), "success");
          await load();
        }
        unseenRef.current = n.unseen;
      } catch {
        /* offline: try again later */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    if (data && unseenRef.current == null) unseenRef.current = data.counts.unseen;
  }, [data]);

  if (!data) {
    return (
      <div className="vr-page rb-driver" data-testid="driver-dashboard">
        <h1>{t("drv.title")}</h1>
        {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : <p className="vr-muted">{t("common.loading")}</p>}
      </div>
    );
  }
  const grooming = data.van.type === "GROOMING";
  const newCount = data.orders.filter((o) => o.status === "ASSIGNED" && (fresh.has(o.key) || !o.seenAt)).length;
  const count = { orders: data.orders.length, done: data.delivered.length, stock: data.stock.lines, transfers: data.transfers.length, returns: data.counts.returnsInVan, payments: data.pendingPayments.orders.length + data.pendingPayments.returns.length, sales: data.sales.count };
  const tabs = TABS.filter((k) => !(grooming && ["transfers"].includes(k)) && !(k === "returns" && !canModule("returns", "view")));
  const arrow = locale === "ar" ? "←" : "→";
  return (
    <div className="vr-page rb-driver" data-testid="driver-dashboard">
      <div className="vr-item__head">
        <h1>{grooming ? t("drv.titleGrooming") : t("drv.title")}</h1>
        {newCount > 0 ? <span className="vr-badge vr-badge--bad" data-testid="unseen-badge">{t("drv.newN", { n: newCount })}</span> : null}
      </div>
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="notice">{notice}</div> : null}
      <section className="card vr-card">
        <dl className="vr-meta">
          <div><dt>{t("dsp.van")}</dt><dd data-testid="van-plate">{data.van.name} · {data.van.plate}</dd></div>
          <div><dt>{t("dsp.vanType")}</dt><dd data-testid="van-type">{t(`dsp.vehicleType.${data.van.type}`)}</dd></div>
          {data.van.branch ? <div><dt>{t("vr.vanLocation")}</dt><dd>{branchDisplayName(data.van.branch, locale)}</dd></div> : null}
          <div><dt>{t("drv.todayDone")}</dt><dd>{data.counts.deliveredToday}</dd></div>
        </dl>
        <div className="vr-actions">
          {canModule("pos", "create") && data.van.branch ? <Link to="/pos" className="btn-touch vr-btn" data-testid="open-till">{t("drv.openTill")}</Link> : null}
          {canModule("customers", "create") ? <button type="button" className="btn-touch vr-btn" onClick={() => setShowCustomerForm(true)} data-testid="new-customer">{t("drv.newCustomer")}</button> : null}
        </div>
      </section>
      {showCustomerForm ? (
        <NewCustomerForm onCancel={() => setShowCustomerForm(false)} onDone={(c) => { setShowCustomerForm(false); setNotice(t("drv.customerSaved", { name: c.name })); }} />
      ) : null}

      <div className="vr-tabs rb-tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`vr-tab${tab === k ? " vr-tab--on" : ""}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>
            {t(grooming && k === "orders" ? "drv.tab.bookings" : `drv.tab.${k}`)} ({count[k] ?? 0})
          </button>
        ))}
      </div>

      {tab === "orders" || tab === "done" ? (
        (tab === "orders" ? data.orders : data.delivered).length ? (
          <ul className="vr-list">
            {(tab === "orders" ? data.orders : data.delivered).map((item) => (
              <OrderCard key={`${item.key}:${item.version}`} item={item} vq={vq} isNew={fresh.has(item.key)} canAct={canAct} onChanged={load} setError={setError} setNotice={setNotice} />
            ))}
          </ul>
        ) : <p className="vr-muted card" data-testid="no-orders">{tab === "orders" ? t(grooming ? "drv.noBookings" : "drv.noOrders") : t("drv.noneDelivered")}</p>
      ) : null}

      {tab === "orders" && data.changeRequests.length ? (
        <section className="card vr-card" data-testid="my-requests">
          <h2>{t("drv.myRequests")}</h2>
          <ul className="vr-list">
            {data.changeRequests.slice(0, 10).map((r) => (
              <li key={r.id} className="vr-item">
                <div className="vr-item__head"><span>{formatDateTime(r.createdAt, locale)}</span><span className={`vr-badge vr-badge--${r.status === "APPROVED" ? "ok" : r.status === "REJECTED" ? "bad" : "warn"}`} data-testid="request-status">{t(`apr.status.${r.status}`)}</span></div>
                <ChangeSummary request={r} />
                {r.decisionNote ? <p className="vr-muted">{r.decisionNote}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "stock" ? (
        <section className="card vr-card" data-testid="van-stock">
          <h2>{t("vr.stockInVan")}</h2>
          {data.stock.items.length ? (
            <ul className="vr-line-list">
              {data.stock.items.map((s) => (
                <li key={`${s.productId}:${s.variantId || ""}`} className="rb-line">
                  <ProductImagePreview url={s.imageUrl} alt="" width={48} height={48} />
                  <span className="rb-line__name">{lineName(s, locale)}{s.sku ? <span className="vr-muted"> · {s.sku}</span> : null}</span>
                  <b className="rb-line__qty">{qtyText(s.quantity, s.sellBy, t)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="vr-muted">{t("vr.vanEmpty")}</p>}
        </section>
      ) : null}

      {tab === "transfers" ? (
        <section className="card vr-card" data-testid="van-transfers">
          <h2>{t("vr.recentTransfers")}</h2>
          {data.transfers.length ? (
            <ul className="vr-simple">
              {data.transfers.map((tr) => (
                <li key={tr.id}>
                  <b>{tr.reference}</b>
                  <span>{tr.direction ? t(`vr.dir.${tr.direction}`) : ""} {branchDisplayName(tr.fromBranch, locale)} {arrow} {branchDisplayName(tr.toBranch, locale)}</span>
                  <span className="vr-muted">{formatDateTime(tr.createdAt, locale)} · {t("vr.itemsN", { n: tr.itemCount })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vr-muted">{t("transfer.noHistory")}</p>}
        </section>
      ) : null}

      {tab === "returns" ? (
        <>
          <section className="card vr-card" data-testid="van-returns">
            <div className="vr-item__head">
              <h2>{t("vr.returns")}</h2>
              {canModule("returns", "create") && data.van.branch ? <button type="button" className="btn-touch vr-btn vr-btn--primary" onClick={() => setShowReturnForm(true)} data-testid="new-return">{t("vr.newReturn")}</button> : null}
            </div>
            {options.ownVanId ? <p className="vr-muted" data-testid="returns-hint">{t("drv.returnsHint")}</p> : null}
            {showReturnForm && data.van.branch ? (
              <VanReturnForm van={data.van.branch} vehicle={data.van} options={options} onCancel={() => setShowReturnForm(false)} onSaved={async (row) => { setShowReturnForm(false); setNotice(t("vr.saved", { reference: row.reference })); await Promise.all([load(), loadVan(data.van.id)]); }} />
            ) : null}
            {vanData?.returns?.length ? (
              <ul className="vr-list">
                {vanData.returns.map((row) => <ReturnCard key={`${row.id}:${row.version}`} row={row} options={options} driverMode={Boolean(options.ownVanId)} onChanged={() => Promise.all([load(), loadVan(data.van.id)])} setError={setError} />)}
              </ul>
            ) : <p className="vr-muted">{t("vr.noReturns")}</p>}
          </section>
          <section className="card vr-card" data-testid="van-damaged">
            <h2>{t("vr.damagedTitle")}</h2>
            <DamagedList rows={vanData?.damaged || []} onChanged={() => loadVan(data.van.id)} setError={setError} />
          </section>
        </>
      ) : null}

      {tab === "payments" ? (
        <section className="card vr-card" data-testid="pending-payments">
          <h2>{t("drv.pendingPayments")}</h2>
          <dl className="vr-meta">
            <div><dt>{t("drv.toCollectOrders")}</dt><dd data-testid="collect-total">{money(data.pendingPayments.ordersTotal, t)}</dd></div>
            <div><dt>{t("drv.owedReturns")}</dt><dd data-testid="owed-total">{money(data.pendingPayments.returnsTotal, t)}</dd></div>
          </dl>
          <ul className="vr-simple">
            {data.pendingPayments.orders.map((o) => (
              <li key={o.key}><span>{o.reference} · {t(`dsp.kind.${o.kind}`)} · {o.customer?.name || ""}{Number(o.awaitingConfirmation) > 0 ? ` · ${t("drv.awaiting", { amount: money(o.awaitingConfirmation, t) })}` : ""}</span><b>{money(o.toCollect, t)}</b></li>
            ))}
            {data.pendingPayments.returns.map((r) => (
              <li key={r.id}><span>{r.reference} · {t("drv.vanReturn")} · {r.customerName || ""}</span><b>{money(r.amountOwed, t)}</b></li>
            ))}
          </ul>
          {!data.pendingPayments.orders.length && !data.pendingPayments.returns.length ? <p className="vr-muted">{t("drv.nothingPending")}</p> : null}
        </section>
      ) : null}

      {tab === "sales" ? (
        <section className="card vr-card" data-testid="van-sales">
          <h2>{t("drv.vanSales")}</h2>
          <p className="vr-muted">{t("drv.salesSummary", { n: data.sales.count, total: money(data.sales.total, t) })}</p>
          <ul className="vr-simple">
            {data.sales.items.map((s) => (
              <li key={s.id}><span>{s.reference} · {formatDateTime(s.createdAt, locale)}{s.customer ? ` · ${s.customer}` : ""}</span><b>{money(s.total, t)}</b></li>
            ))}
          </ul>
        </section>
      ) : null}
      {user?.role === "ADMIN" ? <p className="vr-muted">{t("drv.adminHint")}</p> : null}
    </div>
  );
}
