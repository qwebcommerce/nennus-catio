import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { formatDate, formatDateTime, qatarYmd } from "../utils/qatarDate.js";
import StockLineEditor, { baseQuantity, productName, readProofFile, unitLabel, variantName } from "../components/StockLineEditor.jsx";
import { personName } from "./Transfer.jsx";

function qtyText(qty, sellBy, t) {
  if (sellBy === "WEIGHT") return `${(Number(qty) / 1000).toFixed(3).replace(/\.?0+$/, "") || 0} ${t("stockUnit.kg")}`;
  return t("stockUnit.pieces", { pieces: qty });
}

/** File input for a payment proof (image or PDF). */
function ProofInput({ proof, setProof, required, setError, testId }) {
  const { t } = useI18n();
  return (
    <label className="vr-field">
      <span>{required ? t("vr.proofRequired") : t("vr.proofOptional")}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-label={t("vr.proof")}
        data-testid={testId}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          try {
            setProof(file ? await readProofFile(file) : null);
          } catch {
            setError(t("vr.proofBad"));
          }
        }}
      />
      {proof ? <span className="vr-muted">{t("vr.proofReady", { name: proof.fileName })}</span> : null}
    </label>
  );
}

function money(v, t) {
  return `${Number(v || 0).toFixed(2)} ${t("common.currency")}`;
}

/** Recording a return collected from a customer into the van (nothing becomes sellable yet). */
export function VanReturnForm({ van, vehicle, options, onSaved, onCancel }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [collectedBy, setCollectedBy] = useState(user?.id || "");
  // fix-rd: sales record the return; "collected by" defaults to the van's driver.
  const vanDriverId = (options.vans || []).find((v) => v.id === van?.id)?.driverId || "";
  const [pickedCollector, setPickedCollector] = useState(false);
  useEffect(() => {
    if (!pickedCollector && vanDriverId) setCollectedBy(vanDriverId);
  }, [vanDriverId, pickedCollector]);
  const [date, setDate] = useState(qatarYmd());
  const [amountOwed, setAmountOwed] = useState("0");
  const [note, setNote] = useState("");
  const [payNow, setPayNow] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payProof, setPayProof] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/products").then((rows) => setProducts((rows || []).filter((p) => p.takesStock !== false))).catch(() => setProducts([]));
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      api(`/api/van-returns/customers?q=${encodeURIComponent(customerQuery)}`).then(setCustomers).catch(() => setCustomers([]));
    }, 250);
    return () => clearTimeout(id);
  }, [customerQuery]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const out = [];
    for (const l of lines) {
      const p = byId.get(l.productId);
      const v = (p?.variants || []).find((x) => x.id === l.variantId) || null;
      if (p?.variants?.length && !v) return setError(t("transfer.pickVariant", { name: productName(p, locale) }));
      if (baseQuantity(l, p, v) == null) return setError(t("transfer.badQty", { name: productName(p, locale) }));
      if (l.condition === "DAMAGED" && !l.photo) return setError(t("vr.photoRequired", { name: productName(p, locale) }));
      out.push({
        productId: l.productId,
        variantId: l.variantId || null,
        unit: l.unit,
        quantity: String(l.quantity).replace(",", "."),
        condition: l.condition || "GOOD",
        ...(l.condition === "DAMAGED" && l.photo ? { photo: { dataBase64: l.photo } } : {}),
      });
    }
    if (!out.length) return setError(t("returns.needLines"));
    if (!customerId && !customerName.trim() && !customerPhone.trim()) return setError(t("vr.needCustomer"));
    if (payNow === "BANK" && !payProof) return setError(t("vr.proofMissing"));
    setBusy(true);
    try {
      const row = await api("/api/van-returns", {
        method: "POST",
        body: {
          vanBranchId: van.id,
          vehicleId: vehicle?.id || null,
          customerId: customerId || null,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          collectedByUserId: collectedBy || undefined,
          collectedAt: date,
          amountOwed: amountOwed || "0",
          note,
          lines: out,
          ...(payNow ? { payment: { method: payNow, reference: payRef, ...(payProof ? { proof: payProof } : {}) } } : {}),
        },
      });
      onSaved(row);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card vr-card" onSubmit={submit} data-testid="return-form">
      <h2>{t("vr.newReturn")}</h2>
      {error ? <div role="alert" className="vr-alert" data-testid="form-error">{error}</div> : null}
      <p className="vr-muted">{t("vr.newReturnHint")}</p>
      <div className="vr-grid">
        <label className="vr-field">
          <span>{t("vr.findCustomer")}</span>
          <input type="search" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder={t("vr.findCustomerHint")} aria-label={t("vr.findCustomer")} />
        </label>
        <label className="vr-field">
          <span>{t("vr.customer")}</span>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              const c = customers.find((x) => x.id === e.target.value);
              if (c) { setCustomerName(c.name || ""); setCustomerPhone(c.phone || ""); }
            }}
            data-testid="customer"
          >
            <option value="">{t("vr.typeCustomer")}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </select>
        </label>
        <label className="vr-field">
          <span>{t("vr.customerName")}</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} data-testid="customer-name" />
        </label>
        <label className="vr-field">
          <span>{t("vr.customerPhone")}</span>
          <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} data-testid="customer-phone" />
        </label>
        <label className="vr-field">
          <span>{t("vr.collectedBy")}</span>
          <select value={collectedBy} onChange={(e) => { setCollectedBy(e.target.value); setPickedCollector(true); }} data-testid="collected-by">
            {options.staff.map((s) => <option key={s.id} value={s.id}>{personName(s, locale)}</option>)}
          </select>
        </label>
        <label className="vr-field">
          <span>{t("vr.date")}</span>
          <input type="date" value={date} max={qatarYmd()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <strong>{t("returns.lines")}</strong>
      <StockLineEditor products={products} lines={lines} setLines={setLines} t={t} locale={locale} withCondition onMessage={setInfo} />
      {info ? <div className="vr-muted" role="status">{info}</div> : null}
      <div className="vr-grid">
        <label className="vr-field">
          <span>{t("vr.amountOwed")}</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amountOwed} onChange={(e) => setAmountOwed(e.target.value)} data-testid="amount-owed" />
        </label>
        <label className="vr-field">
          <span>{t("vr.paidNow")}</span>
          <select value={payNow} onChange={(e) => setPayNow(e.target.value)} data-testid="pay-now">
            <option value="">{t("vr.notPaidYet")}</option>
            <option value="CASH">{t("vr.cash")}</option>
            <option value="BANK">{t("vr.bank")}</option>
          </select>
        </label>
        {payNow ? (
          <label className="vr-field">
            <span>{t("vr.payReference")}</span>
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          </label>
        ) : null}
        {payNow ? <ProofInput proof={payProof} setProof={setPayProof} required={payNow === "BANK"} setError={setError} testId="pay-now-proof" /> : null}
        <label className="vr-field">
          <span>{t("transfer.note")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
      </div>
      <div className="vr-actions">
        <button type="submit" className="btn-touch vr-btn vr-btn--primary" disabled={busy} data-testid="save-return">{busy ? t("common.loading") : t("vr.saveReturn")}</button>
        <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

/** One return: lines, payment and the receive / mark-paid actions. */
export function ReturnCard({ row, options, onChanged, setError, driverMode = false }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  // fix-rd: on the driver dashboard, returns still in the van show their lines and photos at once.
  const [open, setOpen] = useState(driverMode && row.status === "IN_VAN");
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState(null);
  const [locationId, setLocationId] = useState("");
  const [broughtBy, setBroughtBy] = useState(row.collectedBy?.id || "");
  const [busy, setBusy] = useState(false);
  const canReceive = canModule("returns", "edit");
  // fix-rd: paying the customer back is returns → refund (sales, accountant), never the driver.
  const canPay = canModule("returns", "refund");

  useEffect(() => {
    if (!locationId && options.locations?.length) {
      const wh = options.locations.find((l) => l.id === options.defaultLocationId) || options.locations.find((l) => l.kind === "WAREHOUSE") || options.locations[0];
      setLocationId(wh.id);
    }
  }, [options.locations, locationId]);

  const loadDetail = useCallback(() => api(`/api/van-returns/${row.id}`).then(setDetail).catch((e) => setError(e.message)), [row.id, setError]);
  useEffect(() => { if (open) loadDetail(); }, [open, loadDetail, row.version]);

  const act = async (path, body) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/van-returns/${row.id}/${path}`, { method: "POST", body: { version: row.version, ...body } });
      setMode("");
      await onChanged();
    } catch (x) {
      setError(isStaleEdit(x) ? t("common.staleEdit") : x.message);
      if (isStaleEdit(x)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card vr-item" data-testid="return-row" data-ref={row.reference}>
      <button type="button" className="vr-item__head vr-linkbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{row.reference}</strong>
        <span>{formatDate(row.collectedAt, locale)}</span>
      </button>
      <div className="vr-badges">
        <span className={`vr-badge vr-badge--${row.status === "IN_VAN" ? "warn" : "ok"}`} data-testid="return-status">{t(`vr.status.${row.status}`)}</span>
        {Number(row.amountOwed) > 0 ? (
          <span className={`vr-badge vr-badge--${row.paymentStatus === "PAID" ? "ok" : "warn"}`} data-testid="pay-status">
            {row.paymentStatus === "PAID" ? `${t("vr.paid")} · ${t(`vr.method.${row.paidMethod}`)}` : t("vr.unpaid")}
          </span>
        ) : <span className="vr-badge">{t("vr.nothingOwed")}</span>}
        {row.damagedCount ? <span className="vr-badge vr-badge--bad">{t("vr.damagedLines", { n: row.damagedCount })}</span> : null}
      </div>
      <dl className="vr-meta">
        <div><dt>{t("vr.customer")}</dt><dd>{row.customerName || row.customerPhone || "—"}</dd></div>
        <div><dt>{t("vr.amountOwed")}</dt><dd>{money(row.amountOwed, t)}</dd></div>
        <div><dt>{t("vr.collectedBy")}</dt><dd>{personName(row.collectedBy, locale)}</dd></div>
        <div><dt>{t("transfer.items")}</dt><dd>{row.lineCount}</dd></div>
        {row.status === "RECEIVED" ? (
          <>
            <div><dt>{t("vr.receivedAt")}</dt><dd>{branchDisplayName(row.receivedBranch, locale)} · {formatDateTime(row.receivedAt, locale)}</dd></div>
            <div><dt>{t("vr.broughtBackBy")}</dt><dd>{personName(row.broughtBackBy, locale)}</dd></div>
            <div><dt>{t("vr.receivedBy")}</dt><dd>{personName(row.receivedBy, locale)}</dd></div>
          </>
        ) : null}
        {row.paymentStatus === "PAID" ? (
          <div><dt>{t("vr.paidBy")}</dt><dd>{personName(row.paidBy, locale)} · {formatDateTime(row.paidAt, locale)}{row.paidReference ? ` · ${row.paidReference}` : ""}</dd></div>
        ) : null}
        {row.proofUrl ? (
          <div><dt>{t("vr.proof")}</dt><dd><a href={row.proofUrl} target="_blank" rel="noreferrer" data-testid="proof-link">{row.proofName || t("vr.proof")}</a></dd></div>
        ) : null}
      </dl>
      <div className="vr-actions">
        {row.status === "IN_VAN" && canReceive ? (
          <button type="button" className="btn-touch vr-btn" onClick={() => setMode(mode === "receive" ? "" : "receive")} data-testid="receive-btn">{t(driverMode ? "drv.moveToWarehouse" : "vr.receive")}</button>
        ) : null}
        {row.paymentStatus === "UNPAID" && Number(row.amountOwed) > 0 && canPay ? (
          <button type="button" className="btn-touch vr-btn" onClick={() => setMode(mode === "pay" ? "" : "pay")} data-testid="pay-btn">{t("vr.markPaid")}</button>
        ) : null}
      </div>
      {mode === "receive" ? (
        <div className="vr-grid vr-sub" data-testid="receive-form">
          <label className="vr-field">
            <span>{t("vr.receiveAt")}</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="receive-location">
              {(options.locations || []).map((l) => <option key={l.id} value={l.id}>{branchDisplayName(l, locale)}</option>)}
            </select>
          </label>
          {driverMode ? null : (
            <label className="vr-field">
              <span>{t("vr.broughtBackBy")}</span>
              <select value={broughtBy} onChange={(e) => setBroughtBy(e.target.value)} data-testid="brought-by">
                {options.staff.map((s) => <option key={s.id} value={s.id}>{personName(s, locale)}</option>)}
              </select>
            </label>
          )}
          <p className="vr-muted">{t(driverMode ? "drv.moveHint" : "vr.receiveHint")}</p>
          <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={busy} onClick={() => act("receive", driverMode ? { branchId: locationId } : { branchId: locationId, broughtBackByUserId: broughtBy })} data-testid="confirm-receive">
            {t(driverMode ? "drv.confirmMove" : "vr.confirmReceive")}
          </button>
        </div>
      ) : null}
      {mode === "pay" ? (
        <div className="vr-grid vr-sub" data-testid="pay-form">
          <label className="vr-field">
            <span>{t("vr.payMethod")}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="pay-method">
              <option value="CASH">{t("vr.cash")}</option>
              <option value="BANK">{t("vr.bank")}</option>
            </select>
          </label>
          <label className="vr-field">
            <span>{t("vr.payReference")}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} data-testid="pay-reference" />
          </label>
          <ProofInput proof={proof} setProof={setProof} required={method === "BANK"} setError={setError} testId="pay-proof" />
          <p className="vr-muted">{method === "CASH" ? t("vr.cashHint") : t("vr.bankHint")}</p>
          <button
            type="button"
            className="btn-touch vr-btn vr-btn--primary"
            disabled={busy}
            onClick={() => (method === "BANK" && !proof ? setError(t("vr.proofMissing")) : act("pay", { method, reference, ...(proof ? { proof } : {}) }))}
            data-testid="confirm-pay"
          >
            {t("vr.confirmPaid", { amount: money(row.amountOwed, t) })}
          </button>
        </div>
      ) : null}
      {open && detail ? (
        <ul className="vr-line-list" data-testid="return-lines">
          {detail.lines.map((line) => (
            <li key={line.id} className="vr-line vr-line--view">
              <div>
                <strong>{productName(line.product, locale)}{line.variant ? ` · ${variantName(line.variant, locale)}` : ""}</strong>
                <div>
                  {line.enteredQty} {unitLabel(line.unit, { variant: line.variant, t })}
                  {line.unit === "CARTON" ? ` × ${line.piecesPerCarton}` : ""} = {qtyText(line.baseQty, line.product?.sellBy, t)}
                </div>
                <span className={`vr-badge vr-badge--${line.condition === "GOOD" ? "ok" : "bad"}`}>{line.condition === "GOOD" ? t("vr.good") : t("vr.damaged")}</span>
              </div>
              {line.photoUrl ? (
                <a href={line.photoUrl} target="_blank" rel="noreferrer"><img src={line.photoUrl} alt={t("vr.photo")} className="vr-thumb" /></a>
              ) : null}
            </li>
          ))}
          {detail.note ? <li className="vr-muted">{detail.note}</li> : null}
        </ul>
      ) : null}
    </li>
  );
}

export function DamagedList({ rows, onChanged, setError }) {
  const { t, locale } = useI18n();
  const { isOrgOwner } = useAuth();
  const [active, setActive] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (row, path, body) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/van-returns/damaged/${row.id}/${path}`, { method: "POST", body: { version: row.version, note, ...body } });
      setActive(null);
      setAmount("");
      setNote("");
      await onChanged();
    } catch (x) {
      setError(isStaleEdit(x) ? t("common.staleEdit") : x.message);
    } finally {
      setBusy(false);
    }
  };
  if (!rows.length) return <p className="vr-muted">{t("vr.noDamaged")}</p>;
  return (
    <ul className="vr-list">
      {rows.map((row) => (
        <li key={row.id} className="card vr-item" data-testid="damaged-row">
          <div className="vr-item__head">
            <strong>{productName(row.product, locale)}{row.variant ? ` · ${variantName(row.variant, locale)}` : ""}</strong>
            <span className={`vr-badge vr-badge--${row.status === "HELD" ? "bad" : "ok"}`} data-testid="damaged-status">{t(`vr.damagedStatus.${row.status}`)}</span>
          </div>
          <dl className="vr-meta">
            <div><dt>{t("vr.quantity")}</dt><dd>{qtyText(row.quantity, row.product?.sellBy, t)}</dd></div>
            <div><dt>{t("vr.keptAt")}</dt><dd>{branchDisplayName(row.branch, locale)}</dd></div>
            <div><dt>{t("vr.fromReturn")}</dt><dd>{row.vanReturn?.reference} {row.vanReturn?.vehiclePlate ? `· ${row.vanReturn.vehiclePlate}` : ""}</dd></div>
            {row.status === "SOLD" ? <div><dt>{t("vr.soldFor")}</dt><dd>{money(row.saleAmount, t)} · {t(`vr.method.${row.saleMethod}`)}</dd></div> : null}
            {row.resolvedAt ? <div><dt>{t("vr.dealtWith")}</dt><dd>{personName(row.resolvedBy, locale)} · {formatDateTime(row.resolvedAt, locale)}</dd></div> : null}
          </dl>
          {row.photoUrl ? <a href={row.photoUrl} target="_blank" rel="noreferrer"><img src={row.photoUrl} alt={t("vr.photo")} className="vr-thumb" /></a> : null}
          {row.status === "HELD" && isOrgOwner ? (
            <>
              <div className="vr-actions">
                <button type="button" className="btn-touch vr-btn" onClick={() => setActive(active?.id === row.id && active.kind === "off" ? null : { id: row.id, kind: "off" })} data-testid="writeoff-btn">{t("vr.writeOff")}</button>
                <button type="button" className="btn-touch vr-btn" onClick={() => setActive(active?.id === row.id && active.kind === "sell" ? null : { id: row.id, kind: "sell" })} data-testid="sell-btn">{t("vr.sellReduced")}</button>
              </div>
              {active?.id === row.id ? (
                <div className="vr-grid vr-sub">
                  {active.kind === "sell" ? (
                    <>
                      <label className="vr-field"><span>{t("vr.saleAmount")}</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="sale-amount" /></label>
                      <label className="vr-field">
                        <span>{t("vr.payMethod")}</span>
                        <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="sale-method">
                          <option value="CASH">{t("vr.cash")}</option>
                          <option value="CARD">{t("vr.card")}</option>
                          <option value="BANK">{t("vr.bank")}</option>
                        </select>
                      </label>
                    </>
                  ) : <p className="vr-muted">{t("vr.writeOffHint")}</p>}
                  <label className="vr-field"><span>{t("transfer.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
                  <button
                    type="button"
                    className="btn-touch vr-btn vr-btn--primary"
                    disabled={busy}
                    onClick={() => (active.kind === "sell" ? act(row, "sell", { amount, method }) : act(row, "write-off", {}))}
                    data-testid="confirm-damaged"
                  >
                    {active.kind === "sell" ? t("vr.confirmSell") : t("vr.confirmWriteOff")}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Damaged stock from van returns: kept out of sale until the owner deals with it. */
export function DamagedStockPage() {
  const { t } = useI18n();
  const { isOrgOwner } = useAuth();
  const [status, setStatus] = useState("HELD");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const load = useCallback(() => api(`/api/van-returns/damaged${status ? `?status=${status}` : ""}`).then(setRows).catch((e) => setError(e.message)), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="vr-page">
      <h1>{t("vr.damagedTitle")}</h1>
      {error ? <div role="alert" className="vr-alert">{error}</div> : null}
      <p className="vr-muted">{isOrgOwner ? t("vr.damagedIntroOwner") : t("vr.damagedIntro")}</p>
      <label className="vr-field vr-narrow">
        <span>{t("vr.show")}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="damaged-filter">
          <option value="HELD">{t("vr.damagedStatus.HELD")}</option>
          <option value="WRITTEN_OFF">{t("vr.damagedStatus.WRITTEN_OFF")}</option>
          <option value="SOLD">{t("vr.damagedStatus.SOLD")}</option>
          <option value="">{t("vr.all")}</option>
        </select>
      </label>
      <DamagedList rows={rows} onChanged={load} setError={setError} />
    </div>
  );
}

/** Vehicle dashboard: van, stock in it, transfers, returns, payments and damaged stock. */
export default function VehicleDashboard() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ staff: [], locations: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("IN_VAN");
  const [showForm, setShowForm] = useState(false);
  const [showStock, setShowStock] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/van-returns/vehicles/${encodeURIComponent(id)}/dashboard`));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/van-returns/options").then(setOptions).catch(() => {}); }, []);

  const returns = useMemo(() => (data?.returns || []).filter((r) => (tab === "ALL" ? true : r.status === tab)), [data, tab]);
  const arrow = locale === "ar" ? "←" : "→";

  if (!data) {
    return (
      <div className="vr-page">
        <Link to="/vehicles" className="vr-back">{t("vr.backToVehicles")}</Link>
        {error ? <div role="alert" className="vr-alert">{error}</div> : <p className="vr-muted">{t("common.loading")}</p>}
      </div>
    );
  }
  const { vehicle } = data;
  const van = vehicle.branch;
  return (
    <div className="vr-page" data-testid="vehicle-dashboard">
      <Link to="/vehicles" className="vr-back">{t("vr.backToVehicles")}</Link>
      <h1>{vehicle.name}</h1>
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="notice">{notice}</div> : null}
      <section className="card vr-card">
        <dl className="vr-meta">
          <div><dt>{t("shop.plate")}</dt><dd data-testid="plate">{vehicle.plate}</dd></div>
          <div><dt>{t("vr.vanLocation")}</dt><dd>{van ? branchDisplayName(van, locale) : t("vr.noVanLocation")}</dd></div>
          <div><dt>{t("vr.stockInVan")}</dt><dd>{t("vr.stockSummary", { lines: data.stock.lines, pieces: data.stock.pieces })}{data.stock.grams ? ` · ${qtyText(data.stock.grams, "WEIGHT", t)}` : ""}</dd></div>
        </dl>
        <div className="vr-actions">
          {van && canModule("returns", "create") ? (
            <button type="button" className="btn-touch vr-btn vr-btn--primary" onClick={() => { setShowForm(true); setNotice(""); }} data-testid="new-return">{t("vr.newReturn")}</button>
          ) : null}
          <button type="button" className="btn-touch vr-btn" onClick={() => setTab("IN_VAN")} data-testid="goto-receive">{t("vr.receiveAtWarehouse")}</button>
          <Link to="/damaged-stock" className="btn-touch vr-btn vr-btn--ghost">{t("vr.damagedTitle")}</Link>
        </div>
      </section>

      {showForm && van ? (
        <VanReturnForm
          van={van}
          vehicle={vehicle}
          options={options}
          onCancel={() => setShowForm(false)}
          onSaved={async (row) => {
            setShowForm(false);
            setNotice(t("vr.saved", { reference: row.reference }));
            setTab("IN_VAN");
            await load();
          }}
        />
      ) : null}

      <section className="card vr-card">
        <div className="vr-item__head">
          <h2>{t("vr.stockInVan")}</h2>
          <button type="button" className="vr-linkbtn" onClick={() => setShowStock(!showStock)} aria-expanded={showStock}>{showStock ? t("vr.hide") : t("vr.showAll")}</button>
        </div>
        {showStock ? (
          data.stock.items.length ? (
            <ul className="vr-simple">
              {data.stock.items.map((s) => (
                <li key={`${s.productId}:${s.variantId || ""}`}><span>{locale === "en" ? s.nameEn || s.name : s.name}</span><b>{qtyText(s.quantity, s.sellBy, t)}</b></li>
              ))}
            </ul>
          ) : <p className="vr-muted">{t("vr.vanEmpty")}</p>
        ) : null}
      </section>

      {data.transfers ? (
        <section className="card vr-card">
          <div className="vr-item__head">
            <h2>{t("vr.recentTransfers")}</h2>
            <Link to={`/transfer/history?vehicleId=${vehicle.id}`} data-testid="all-transfers">{t("vr.allTransfers")}</Link>
          </div>
          {data.transfers.length ? (
            <ul className="vr-simple">
              {data.transfers.map((tr) => (
                <li key={tr.id}>
                  <Link to={`/transfer/history/${tr.id}`}>{tr.reference}</Link>
                  <span>{tr.direction ? t(`vr.dir.${tr.direction}`) : ""} {branchDisplayName(tr.fromBranch, locale)} {arrow} {branchDisplayName(tr.toBranch, locale)}</span>
                  <span className="vr-muted">{formatDateTime(tr.createdAt, locale)} · {t("vr.itemsN", { n: tr.itemCount })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="vr-muted">{t("transfer.noHistory")}</p>}
        </section>
      ) : null}

      <section className="card vr-card" data-testid="payments">
        <h2>{t("vr.payments")}</h2>
        <dl className="vr-meta">
          <div><dt>{t("vr.unpaid")}</dt><dd data-testid="unpaid-total">{money(data.payments.unpaidTotal, t)} ({data.payments.unpaidCount})</dd></div>
          <div><dt>{t("vr.paid")}</dt><dd data-testid="paid-total">{money(data.payments.paidTotal, t)} ({data.payments.paidCount})</dd></div>
          <div><dt>{t("vr.cash")}</dt><dd>{money(data.payments.paidCash, t)}</dd></div>
          <div><dt>{t("vr.bank")}</dt><dd>{money(data.payments.paidBank, t)}</dd></div>
        </dl>
      </section>

      <section className="card vr-card">
        <h2>{t("vr.returns")}</h2>
        <div className="vr-tabs" role="tablist">
          {[["IN_VAN", data.counts.inVan], ["RECEIVED", data.counts.received], ["ALL", data.counts.all]].map(([key, n]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`vr-tab${tab === key ? " vr-tab--on" : ""}`} onClick={() => setTab(key)} data-testid={`tab-${key}`}>
              {t(`vr.tab.${key}`)} ({n})
            </button>
          ))}
        </div>
        {returns.length ? (
          <ul className="vr-list">
            {returns.map((row) => (
              <ReturnCard key={`${row.id}:${row.version}`} row={row} options={options} onChanged={load} setError={setError} />
            ))}
          </ul>
        ) : <p className="vr-muted">{t("vr.noReturns")}</p>}
      </section>

      <section className="card vr-card">
        <div className="vr-item__head">
          <h2>{t("vr.damagedTitle")}</h2>
          <Link to="/damaged-stock">{t("vr.openDamaged")}</Link>
        </div>
        <DamagedList rows={data.damaged} onChanged={load} setError={setError} />
      </section>
    </div>
  );
}
