import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, editErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { branchDisplayName } from "../utils/displayLabels.js";
import { formatDate, formatDateTime, qatarYmd } from "../utils/qatarDate.js";
import { lineDirhams, money2, percentDirhams } from "../utils/soMoney.js";
import { FileLink, PageTabs, ProofUpload, downloadExport, money, proofNeeded } from "../components/BizShared.jsx";
import { PendingPayments, PendingStock } from "../components/PendingPanels.jsx";

const PAY_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "FAWRAN", "PAYMENT_LINK"];
const STATUSES = ["DRAFT", "CONFIRMED", "PARTLY_DELIVERED", "DELIVERED", "COMPLETED", "CANCELLED"];
const TERMS = [0, 7, 14, 30, 60];
const emptyLine = () => ({ productId: "", variantId: "", quantity: "1", unitPrice: "", isFree: false });
const emptyInst = (pct, due) => ({ mode: "percent", value: String(pct), dueDate: due });

function dayText(day, locale) {
  return day ? formatDate(`${String(day).slice(0, 10)}T12:00:00Z`, locale) : "—";
}
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

/** B2B / project sales orders: payment plan, installment payments with proof, deliveries. */
export default function SalesOrders() {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | order
  const openId = params.get("open") || "";

  const load = async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (overdueOnly) qs.set("overdue", "1");
    if (q.trim()) qs.set("q", q.trim());
    setOrders(await api(`/api/sales-orders?${qs}`));
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [status, overdueOnly]);

  const open = (id) => {
    setEditing(null);
    setParams(id ? { open: id } : {});
  };

  if (editing) {
    return (
      <div className="fd-page">
        <OrderEditor
          order={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); load().catch(() => {}); open(saved.id); }}
        />
      </div>
    );
  }
  if (openId) {
    return (
      <div className="fd-page">
        <OrderDetail id={openId} onBack={() => { open(""); load().catch(() => {}); }} onEdit={(o) => setEditing(o)} />
      </div>
    );
  }

  return (
    <div className="fd-page">
      <h1>{t("so.title")}</h1>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <PageTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "orders", label: t("so.title") },
          ...(canModule("finance", "view") ? [{ id: "pending", label: t("so.pendingPayments") }] : []),
          { id: "stock", label: t("so.pendingStock") },
        ]}
      />
      {tab === "pending" ? <PendingPayments side="tous" /> : null}
      {tab === "stock" ? <PendingStock /> : null}
      {tab === "orders" ? (
        <>
          <div className="fd-filters">
            {canModule("salesOrders", "create") ? (
              <button type="button" className="btn-touch biz-primary" onClick={() => setEditing("new")}>{t("so.new")}</button>
            ) : null}
            <label>
              <span>{t("fd.status")}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t("fd.all")}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel("salesOrder", s, locale)}</option>)}
              </select>
            </label>
            <label className="fd-check">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              <span>{t("so.overdueOnly")}</span>
            </label>
            <form onSubmit={(e) => { e.preventDefault(); load().catch((er) => setMsg(er.message)); }} style={{ display: "flex", gap: 6, alignItems: "flex-end", minWidth: 0 }}>
              <label>
                <span>{t("so.search")}</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("so.searchPh")} />
              </label>
              <button type="submit" className="btn-touch">{t("so.searchBtn")}</button>
            </form>
            <button type="button" className="btn-touch" onClick={async () => setMsg(await downloadExport("salesorders", "csv", locale))}>CSV</button>
          </div>
          <div className="biz-list">
            {orders.map((o) => (
              <button key={o.id} type="button" className="card biz-order" onClick={() => open(o.id)}>
                <div className="biz-order__top">
                  <strong>{o.reference}</strong>
                  <span>
                    <span className="biz-badge">{statusLabel("salesOrder", o.status, locale)}</span>
                    <span className={`biz-badge${o.paidStatus === "PAID" ? " biz-badge--ok" : ""}`}>{statusLabel("paidStatus", o.paidStatus, locale)}</span>
                    {o.overdue ? <span className="biz-badge biz-badge--bad">{t("so.overdue")}</span> : null}
                  </span>
                </div>
                <div>{o.customer?.companyName || o.customer?.name}{o.customer?.companyName ? ` · ${o.customer.name}` : ""}</div>
                <div className="fd-muted">
                  {t("common.total")} {money(o.total)} · {t("so.balance")} {money(o.balance)} · {t("so.deliveryDate")} {dayText(o.deliveryDate, locale)}
                </div>
              </button>
            ))}
            {!orders.length ? <div className="card">{t("so.none")}</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ editor

function OrderEditor({ order, onCancel, onSaved }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const activeBranch = useActiveBranchId();
  const canPrice = canModule("salesOrders", "edit");
  const canFree = canModule("complimentary", "create");
  const today = qatarYmd();
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    customerId: order?.customerId || "",
    branchId: order?.branchId || activeBranch || "",
    deliveryDate: order?.deliveryDate ? String(order.deliveryDate).slice(0, 10) : addDays(today, 7),
    paymentTerms: order?.paymentTerms || "",
    paymentTermsDays: order?.paymentTermsDays ?? "",
    note: order?.note || "",
    discountAmount: order && Number(order.discountAmount) ? String(order.discountAmount) : "",
    freeReason: order?.freeReason || "",
  }));
  const [lines, setLines] = useState(() =>
    order?.lines?.length
      ? order.lines.map((l) => ({ productId: l.productId, variantId: l.variantId || "", quantity: String(l.product?.sellBy === "WEIGHT" ? l.quantity / 1000 : l.quantity), unitPrice: String(l.unitPrice), isFree: l.isFree }))
      : [emptyLine()],
  );
  const [plan, setPlan] = useState(() =>
    order?.installments?.length
      ? order.installments.map((i) => (i.percent != null ? { mode: "percent", value: String(Number(i.percent)), dueDate: String(i.dueDate).slice(0, 10) } : { mode: "amount", value: String(i.amount), dueDate: String(i.dueDate).slice(0, 10) }))
      : [emptyInst(100, today)],
  );

  useEffect(() => {
    api("/api/customers").then((rows) => setCustomers(Array.isArray(rows) ? rows : [])).catch(() => {});
    api("/api/branches").then((rows) => setBranches((rows || []).filter((b) => b.isActive !== false))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!form.branchId) return;
    api(`/api/products?branchId=${form.branchId}`).then((rows) => setProducts(Array.isArray(rows) ? rows : rows?.items || [])).catch((e) => setMsg(e.message));
  }, [form.branchId]);

  const productOf = (id) => products.find((p) => p.id === id);
  const listPrice = (line) => {
    const p = productOf(line.productId);
    const v = p?.variants?.find((x) => x.id === line.variantId);
    return v ? Number(v.price) : p ? Number(p.price) : 0;
  };
  const setLine = (i, patch) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setInst = (i, patch) => setPlan((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const qtyOf = (line) => {
    const p = productOf(line.productId);
    const n = Number(line.quantity) || 0;
    return p?.sellBy === "WEIGHT" ? Math.round(n * 1000) : Math.round(n);
  };

  // Totals preview in whole dirhams (the server computes the same).
  const preview = useMemo(() => {
    let subtotal = 0;
    for (const line of lines) {
      if (!line.productId || line.isFree) continue;
      const price = line.unitPrice !== "" ? line.unitPrice : listPrice(line);
      subtotal += lineDirhams(price, qtyOf(line), productOf(line.productId)?.sellBy);
    }
    const discount = Math.min(Math.round(Number(form.discountAmount || 0) * 100) || 0, subtotal);
    const total = subtotal - discount;
    let before = 0;
    const amounts = plan.map((inst, i) => {
      if (i === plan.length - 1) return total - before;
      const a = inst.mode === "percent" ? percentDirhams(total, inst.value) : Math.round(Number(inst.value || 0) * 100);
      before += a;
      return a;
    });
    return { subtotal, discount, total, amounts };
  }, [lines, form.discountAmount, plan, products]);

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    if (lines.some((l) => productOf(l.productId)?.variants?.length && !l.variantId)) {
      setMsg(t("po.variantRequired"));
      return;
    }
    const body = {
      ...form,
      paymentTermsDays: form.paymentTermsDays === "" ? null : Number(form.paymentTermsDays),
      lines: lines.filter((l) => l.productId).map((l) => ({
        productId: l.productId,
        variantId: l.variantId || null,
        quantity: qtyOf(l),
        ...(l.unitPrice !== "" ? { unitPrice: l.unitPrice } : {}),
        isFree: Boolean(l.isFree),
      })),
      plan: plan.map((i) => (i.mode === "percent" ? { percent: i.value, dueDate: i.dueDate } : { amount: i.value, dueDate: i.dueDate })),
      ...(order ? { version: order.version } : {}),
    };
    setBusy(true);
    try {
      const saved = await api(order ? `/api/sales-orders/${order.id}` : "/api/sales-orders", { method: order ? "PUT" : "POST", body });
      onSaved(saved);
    } catch (err) {
      setMsg(editErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const anyFree = lines.some((l) => l.isFree);
  const name = (p) => (locale === "en" ? p.nameEn || p.name : p.name || p.nameEn);
  return (
    <form onSubmit={save} className="fd-page" aria-label={t("so.editor")}>
      <h1>{order ? `${t("so.edit")} ${order.reference}` : t("so.new")}</h1>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <section className="card fd-card">
        <div className="biz-grid">
          <label>
            <span>{t("fd.customer")} *</span>
            <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">—</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} (${c.name})` : c.name}{c.isBusiness ? ` · ${t("so.business")}` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>{t("so.sellingLocation")} *</span>
            <select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label>
            <span>{t("so.deliveryDate")}</span>
            <input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
          </label>
          <label>
            <span>{t("so.paymentTerms")}</span>
            <input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder={t("so.paymentTermsPh")} />
          </label>
          <label>
            <span>{t("so.termsDays")}</span>
            <select value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}>
              <option value="">—</option>
              {TERMS.map((d) => <option key={d} value={d}>{d ? t("so.netDays", { n: d }) : t("so.dueOnReceipt")}</option>)}
            </select>
          </label>
          <label>
            <span>{t("so.note")}</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="card fd-card">
        <h2>{t("so.lines")}</h2>
        {lines.map((line, i) => {
          const p = productOf(line.productId);
          return (
            <div key={i} className="biz-line">
              <label>
                <span>{t("po.product")}</span>
                <select required value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value, variantId: "", unitPrice: "" })}>
                  <option value="">—</option>
                  {products.map((row) => <option key={row.id} value={row.id}>{name(row)}</option>)}
                </select>
              </label>
              {p?.variants?.length ? (
                <label>
                  <span>{t("pos.variant")}</span>
                  <select required value={line.variantId} onChange={(e) => setLine(i, { variantId: e.target.value, unitPrice: "" })}>
                    <option value="">—</option>
                    {p.variants.filter((v) => v.isActive !== false).map((v) => <option key={v.id} value={v.id}>{locale === "en" ? v.labelEn || v.label : v.label}</option>)}
                  </select>
                </label>
              ) : null}
              <label>
                <span>{t("po.quantity")}{p?.sellBy === "WEIGHT" ? ` (${t("so.kg")})` : ""}</span>
                <input required type="number" min={p?.sellBy === "WEIGHT" ? "0.001" : "1"} step={p?.sellBy === "WEIGHT" ? "0.001" : "1"} value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </label>
              <label>
                <span>{t("so.unitPrice")}{p?.sellBy === "WEIGHT" ? ` (${t("pos.perKg")})` : ""}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!canPrice || line.isFree}
                  value={line.unitPrice !== "" ? line.unitPrice : p ? listPrice(line).toFixed(2) : ""}
                  onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  title={canPrice ? "" : t("so.priceManagersOnly")}
                />
              </label>
              {canFree ? (
                <label className="biz-check">
                  <input type="checkbox" checked={line.isFree} onChange={(e) => setLine(i, { isFree: e.target.checked })} />
                  <span>{t("so.freeLine")}</span>
                </label>
              ) : null}
              {lines.length > 1 ? <button type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>{t("po.removeLine")}</button> : null}
            </div>
          );
        })}
        <div className="biz-actions">
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>{t("po.addLine")}</button>
        </div>
        {!canPrice ? <p className="fd-muted">{t("so.priceManagersOnly")}</p> : null}
        {anyFree ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>{t("so.freeReason")} *</span>
            <input required value={form.freeReason} onChange={(e) => setForm({ ...form, freeReason: e.target.value })} placeholder={t("so.freeReasonPh")} />
          </label>
        ) : null}
        <div className="biz-grid">
          <label>
            <span>{t("so.orderDiscount")}</span>
            <input type="number" min="0" step="0.01" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} />
          </label>
        </div>
        <div className="fd-totals">
          <span>{t("so.subtotal")}: <strong>{money2(preview.subtotal)}</strong></span>
          <span>{t("so.orderDiscount")}: <strong>{money2(preview.discount)}</strong></span>
          <span>{t("common.total")}: <strong data-testid="so-total">{money2(preview.total)}</strong></span>
        </div>
      </section>

      <section className="card fd-card">
        <h2>{t("so.plan")}</h2>
        <p className="fd-muted">{t("so.planHint")}</p>
        {plan.map((inst, i) => (
          <div key={i} className="biz-line">
            <label>
              <span>{t("so.installment", { n: i + 1 })}</span>
              <select value={inst.mode} onChange={(e) => setInst(i, { mode: e.target.value })}>
                <option value="percent">%</option>
                <option value="amount">{t("fd.amount")}</option>
              </select>
            </label>
            <label>
              <span>{inst.mode === "percent" ? t("so.percent") : t("fd.amount")}</span>
              <input type="number" min="0" step={inst.mode === "percent" ? "0.001" : "0.01"} value={inst.value} onChange={(e) => setInst(i, { value: e.target.value })} aria-label={`${t("so.installment", { n: i + 1 })} ${inst.mode === "percent" ? t("so.percent") : t("fd.amount")}`} />
            </label>
            <label>
              <span>{t("so.dueDate")}</span>
              <input type="date" required value={inst.dueDate} onChange={(e) => setInst(i, { dueDate: e.target.value })} aria-label={`${t("so.installment", { n: i + 1 })} ${t("so.dueDate")}`} />
            </label>
            <span className="fd-muted">= {money2(preview.amounts[i] || 0)}</span>
            {plan.length > 1 ? <button type="button" onClick={() => setPlan((prev) => prev.filter((_, j) => j !== i))}>{t("po.removeLine")}</button> : null}
          </div>
        ))}
        <div className="biz-actions">
          {plan.length < 4 ? <button type="button" onClick={() => setPlan((prev) => [...prev, emptyInst(0, addDays(today, 14 * prev.length))])}>{t("so.addInstallment")}</button> : null}
          <button type="button" onClick={() => setPlan([emptyInst(50, today), emptyInst(50, addDays(today, 14))])}>{t("so.plan5050")}</button>
        </div>
      </section>

      <div className="biz-actions">
        <button type="submit" className="btn-touch biz-primary" disabled={busy}>{t("so.saveDraft")}</button>
        <button type="button" className="btn-touch" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ detail

function OrderDetail({ id, onBack, onEdit }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [order, setOrder] = useState(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "CASH", reference: "", paidAt: qatarYmd(), note: "", proofFileId: "" });
  const [proofKey, setProofKey] = useState(0);
  const [deliver, setDeliver] = useState({});
  const [printView, setPrintView] = useState(false);
  const canAct = canModule("salesOrders", "create");

  const load = async () => {
    const o = await api(`/api/sales-orders/${id}`);
    setOrder(o);
    setPay((p) => ({ ...p, amount: p.amount || (Number(o.balance) > 0 ? String(o.installments.find((i) => Number(i.owed) > 0)?.owed || o.balance) : "") }));
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [id]);

  const run = async (fn, done) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    setOk("");
    try {
      const res = await fn();
      if (done) setOk(done);
      if (res?.stockShort) setMsg(t("so.stockShortWarn"));
      await load();
    } catch (err) {
      const short = err.data?.short;
      setMsg(short?.length ? `${editErrorMessage(err, t)} — ${short.map((s) => `${s.product}: ${s.available}/${s.needed}`).join(", ")}` : editErrorMessage(err, t));
      if (err.code === "STALE_EDIT") await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  if (!order) return <div className="fd-page">{msg ? <div role="alert" className="fd-alert">{msg}</div> : t("common.loading")}</div>;
  const open = ["CONFIRMED", "PARTLY_DELIVERED", "DELIVERED"].includes(order.status);
  const deliverable = ["CONFIRMED", "PARTLY_DELIVERED"].includes(order.status);
  const lineName = (l) => {
    const n = locale === "en" ? l.product?.nameEn || l.product?.name : l.product?.name || l.product?.nameEn;
    const v = l.variant ? ` · ${locale === "en" ? l.variant.labelEn || l.variant.label : l.variant.label}` : "";
    return `${n}${v}`;
  };
  const qty = (l, n) => (l.product?.sellBy === "WEIGHT" ? `${(n / 1000).toFixed(3)} ${t("so.kg")}` : n);
  const stockOf = (lineId) => order.stock?.find((s) => s.lineId === lineId);

  const submitPay = (e) => {
    e.preventDefault();
    if (proofNeeded(pay.method) && !pay.proofFileId) {
      setMsg(t("so.proofRequired"));
      return;
    }
    run(async () => {
      await api(`/api/sales-orders/${order.id}/payments`, { method: "POST", body: pay });
      setPay({ amount: "", method: pay.method, reference: "", paidAt: qatarYmd(), note: "", proofFileId: "" });
      setProofKey((k) => k + 1);
    }, t("so.paymentSaved"));
  };
  const submitDelivery = (e) => {
    e.preventDefault();
    const lines = order.lines
      .filter((l) => l.quantityPending > 0)
      .map((l) => ({ lineId: l.id, quantity: deliver[l.id] !== undefined ? (l.product?.sellBy === "WEIGHT" ? Math.round(Number(deliver[l.id]) * 1000) : Number(deliver[l.id])) : l.quantityPending }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) {
      setMsg(t("so.nothingToDeliver"));
      return;
    }
    run(async () => {
      await api(`/api/sales-orders/${order.id}/deliveries`, { method: "POST", body: { lines } });
      setDeliver({});
    }, t("so.delivered"));
  };

  const doc = (
    <div className="print-invoice biz-print-doc">
      <h2 style={{ margin: "0 0 8px" }}>{t("so.invoiceTitle")} {order.reference}</h2>
      <div>{order.customer?.companyName || order.customer?.name}{order.customer?.companyName ? ` — ${order.customer.name}` : ""}</div>
      <div>{t("so.sellingLocation")}: {branchDisplayName(order.branch || {}, locale)} · {t("so.deliveryDate")}: {dayText(order.deliveryDate, locale)}</div>
      {order.paymentTerms ? <div>{t("so.paymentTerms")}: {order.paymentTerms}</div> : null}
      <table>
        <thead>
          <tr><th>{t("po.product")}</th><th>{t("po.quantity")}</th><th>{t("so.unitPrice")}</th><th>{t("so.lineTotal")}</th></tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id}>
              <td>{lineName(l)}</td>
              <td>{qty(l, l.quantity)}</td>
              <td>{l.isFree ? "—" : money(l.unitPrice)}</td>
              <td>{l.isFree ? t("so.free") : money(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        {Number(order.discountAmount) ? <div>{t("so.orderDiscount")}: −{money(order.discountAmount)}</div> : null}
        <div><strong>{t("common.total")}: {money(order.total)} {t("common.currency")}</strong></div>
        <div>{t("so.paid")}: {money(order.amountPaid)} · {t("so.balance")}: {money(order.balance)}</div>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>#</th><th>{t("so.dueDate")}</th><th>{t("fd.amount")}</th><th>{t("so.paid")}</th></tr></thead>
        <tbody>
          {order.installments.map((i) => (
            <tr key={i.id}><td>{i.seq}</td><td>{dayText(i.dueDate, locale)}</td><td>{money(i.amount)}</td><td>{money(i.amountPaid)}</td></tr>
          ))}
        </tbody>
      </table>
      {order.freeReason ? <div>{t("so.freeReason")}: {order.freeReason}</div> : null}
    </div>
  );

  return (
    <div className="fd-page">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      {ok ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{ok}</div> : null}
      <div className="biz-actions">
        <button type="button" className="btn-touch" onClick={onBack}>← {t("so.back")}</button>
        <button type="button" className="btn-touch" onClick={() => setPrintView((v) => !v)}>{printView ? t("so.closeInvoice") : t("so.viewInvoice")}</button>
        {printView ? <button type="button" className="btn-touch" onClick={() => window.print()}>{t("so.print")}</button> : null}
      </div>
      {printView ? doc : null}
      <h1>
        {order.reference} <span className="biz-badge">{statusLabel("salesOrder", order.status, locale)}</span>
        <span className={`biz-badge${order.paidStatus === "PAID" ? " biz-badge--ok" : ""}`}>{statusLabel("paidStatus", order.paidStatus, locale)}</span>
        {order.overdue ? <span className="biz-badge biz-badge--bad">{t("so.overdue")}</span> : null}
      </h1>
      <section className="card fd-card">
        <div><strong>{order.customer?.companyName || order.customer?.name}</strong>{order.customer?.companyName ? ` · ${order.customer.name}` : ""}{order.customer?.phone ? ` · ${order.customer.phone}` : ""}</div>
        <div>{t("so.sellingLocation")}: {branchDisplayName(order.branch || {}, locale)}</div>
        <div>{t("so.deliveryDate")}: {dayText(order.deliveryDate, locale)}</div>
        {order.paymentTerms ? <div>{t("so.paymentTerms")}: {order.paymentTerms}</div> : null}
        {order.note ? <div>{t("so.note")}: {order.note}</div> : null}
        <div className="biz-kpis">
          <div className="biz-kpi"><span>{t("common.total")}</span><strong>{money(order.total)}</strong></div>
          <div className="biz-kpi"><span>{t("so.paid")}</span><strong>{money(order.amountPaid)}</strong></div>
          <div className="biz-kpi"><span>{t("so.balance")}</span><strong>{money(order.balance)}</strong></div>
          <div className="biz-kpi"><span>{t("so.revenueRecognised")}</span><strong>{money(order.deliveredRevenue)}</strong></div>
        </div>
        <div className="biz-actions">
          {order.status === "DRAFT" && canAct ? (
            <>
              <button type="button" className="btn-touch" onClick={() => onEdit(order)}>{t("so.edit")}</button>
              <button type="button" className="btn-touch biz-primary" disabled={busy} onClick={() => run(() => api(`/api/sales-orders/${order.id}/confirm`, { method: "POST", body: { version: order.version } }), t("so.confirmed"))}>{t("so.confirm")}</button>
            </>
          ) : null}
          {["DRAFT", "CONFIRMED"].includes(order.status) && canModule("salesOrders", "delete") && !order.lines.some((l) => l.quantityDelivered > 0) && Number(order.amountPaid) === 0 ? (
            <button
              type="button"
              className="btn-touch"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(t("so.cancelReason"));
                if (reason) run(() => api(`/api/sales-orders/${order.id}/cancel`, { method: "POST", body: { version: order.version, reason } }), t("so.cancelledMsg"));
              }}
            >
              {t("so.cancelOrder")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="card fd-card">
        <h2>{t("so.lines")}</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="fd-table">
            <thead>
              <tr>
                <th>{t("po.product")}</th>
                <th className="num">{t("po.quantity")}</th>
                <th className="num">{t("so.unitPrice")}</th>
                <th className="num">{t("so.lineTotal")}</th>
                <th className="num">{t("so.deliveredCol")}</th>
                <th className="num">{t("so.pendingCol")}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => {
                const st = stockOf(l.id);
                return (
                  <tr key={l.id}>
                    <td>
                      {lineName(l)}
                      {l.isFree ? <span className="biz-badge biz-badge--ok"> {t("so.free")}</span> : null}
                      {Number(l.unitPrice) !== Number(l.listPrice) && !l.isFree ? <span className="biz-badge"> {t("so.priceChanged", { n: money(l.listPrice) })}</span> : null}
                      {st?.short ? <span className="biz-badge biz-badge--bad"> {t("so.shortBy", { n: qty(l, st.short) })}</span> : null}
                    </td>
                    <td className="num">{qty(l, l.quantity)}</td>
                    <td className="num">{l.isFree ? "—" : money(l.unitPrice)}</td>
                    <td className="num">{l.isFree ? t("so.free") : money(l.subtotal)}</td>
                    <td className="num">{qty(l, l.quantityDelivered)}</td>
                    <td className="num">{qty(l, l.quantityPending)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {Number(order.discountAmount) ? <div className="fd-muted">{t("so.orderDiscount")}: −{money(order.discountAmount)}</div> : null}
        {order.freeReason ? <div className="fd-muted">{t("so.freeReason")}: {order.freeReason}</div> : null}
      </section>

      <section className="card fd-card">
        <h2>{t("so.plan")}</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="fd-table">
            <thead>
              <tr><th>#</th><th>{t("so.dueDate")}</th><th className="num">{t("fd.amount")}</th><th className="num">{t("so.paid")}</th><th className="num">{t("fd.bills.owed")}</th><th>{t("fd.status")}</th></tr>
            </thead>
            <tbody>
              {order.installments.map((i) => (
                <tr key={i.id} className={i.overdue ? "biz-overdue" : ""}>
                  <td>{i.seq}{i.percent != null ? ` (${Number(i.percent)}%)` : ""}</td>
                  <td>{dayText(i.dueDate, locale)}</td>
                  <td className="num">{money(i.amount)}</td>
                  <td className="num">{money(i.amountPaid)}</td>
                  <td className="num">{money(i.owed)}</td>
                  <td>{i.overdue ? <span className="biz-badge biz-badge--bad">{t("so.overdue")}</span> : statusLabel("paidStatus", i.status, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && canAct && Number(order.balance) > 0 ? (
        <form className="card fd-card" onSubmit={submitPay} aria-label={t("so.recordPayment")}>
          <h2>{t("so.recordPayment")}</h2>
          <div className="biz-grid">
            <label>
              <span>{t("fd.amount")}</span>
              <input type="number" required min="0.01" step="0.01" max={order.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </label>
            <label>
              <span>{t("so.method")}</span>
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                {PAY_METHODS.map((m) => <option key={m} value={m}>{statusLabel("payment", m, locale)}</option>)}
              </select>
            </label>
            <label>
              <span>{t("so.reference")}</span>
              <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={t("so.transferReferenceHint")} />
            </label>
            <label>
              <span>{t("so.paidOn")}</span>
              <input type="date" max={qatarYmd()} value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
            </label>
            <ProofUpload key={proofKey} value={pay.proofFileId} onChange={(v) => setPay((p) => ({ ...p, proofFileId: v }))} required={proofNeeded(pay.method)} />
          </div>
          <div className="biz-actions">
            <button type="submit" className="btn-touch biz-primary" disabled={busy}>{t("so.savePayment")}</button>
          </div>
          <p className="fd-muted">{t("so.proofRule")}</p>
        </form>
      ) : null}

      {order.payments.length ? (
        <section className="card fd-card">
          <h2>{t("so.payments")}</h2>
          {order.payments.map((p) => (
            <div key={p.id} className="biz-pay-row">
              <span>{formatDateTime(p.paidAt, locale)}</span>
              <strong>{money(p.amount)}</strong>
              <span>{statusLabel("payment", p.method, locale)}</span>
              {p.reference ? <span>· {p.reference}</span> : null}
              {p.proofFile ? <FileLink file={p.proofFile} label={t("so.viewProof")} /> : null}
            </div>
          ))}
        </section>
      ) : null}

      {deliverable && canAct ? (
        <form className="card fd-card" onSubmit={submitDelivery} aria-label={t("so.recordDelivery")}>
          <h2>{t("so.recordDelivery")}</h2>
          <p className="fd-muted">{t("so.deliveryHint")}</p>
          {order.lines.filter((l) => l.quantityPending > 0).map((l) => (
            <label key={l.id} className="biz-pay-row">
              <span style={{ flex: "1 1 180px" }}>{lineName(l)} ({t("so.pendingCol")} {qty(l, l.quantityPending)})</span>
              <input
                type="number"
                min="0"
                step={l.product?.sellBy === "WEIGHT" ? "0.001" : "1"}
                max={l.product?.sellBy === "WEIGHT" ? l.quantityPending / 1000 : l.quantityPending}
                style={{ width: 110 }}
                aria-label={`${t("so.deliverNow")} ${lineName(l)}`}
                value={deliver[l.id] ?? (l.product?.sellBy === "WEIGHT" ? l.quantityPending / 1000 : l.quantityPending)}
                onChange={(e) => setDeliver((prev) => ({ ...prev, [l.id]: e.target.value }))}
              />
            </label>
          ))}
          <div className="biz-actions">
            <button type="submit" className="btn-touch biz-primary" disabled={busy}>{t("so.deliver")}</button>
          </div>
        </form>
      ) : null}

      {order.deliveries.length ? (
        <section className="card fd-card">
          <h2>{t("so.deliveries")}</h2>
          {order.deliveries.map((d) => (
            <div key={d.id} className="biz-pay-row">
              <span>{formatDateTime(d.deliveredAt, locale)}</span>
              <span>{d.lines.map((dl) => { const l = order.lines.find((x) => x.id === dl.lineId); return l ? `${lineName(l)} × ${qty(l, dl.quantity)}` : ""; }).join(", ")}</span>
              <span className="fd-muted">{t("so.revenue")} {money(d.revenue)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
