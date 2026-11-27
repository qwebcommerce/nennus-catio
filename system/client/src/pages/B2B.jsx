import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, editErrorMessage, resolveApiErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { formatDate, formatDateTime, qatarYmd } from "../utils/qatarDate.js";
import { lineDirhams, money2 } from "../utils/soMoney.js";
import { FileLink, PageTabs, ProofUpload, money, proofNeeded } from "../components/BizShared.jsx";
import PosSubNav from "../components/PosSubNav.jsx";

/**
 * B2B / Wholesale (POS area): delivery note → invoice → cash receipt, on the sales-orders engine
 * (server: routes/b2b.js, lib/b2b.js). Module b2b: view; create = notes and invoices;
 * edit = cash receipts; delete = cancel; export.
 */
const NOTE_STATUSES = ["ISSUED", "DELIVERED", "INVOICED", "PART_PAID", "PAID", "CANCELLED"];
const INVOICE_STATUSES = ["ISSUED", "PART_PAID", "PAID", "OVERDUE", "CANCELLED"];
const METHODS = ["CASH", "BANK_TRANSFER"];
const TERMS = [0, 7, 14, 30, 45, 60, 90];
const emptyLine = () => ({ productId: "", variantId: "", quantity: "1", unitPrice: "", isFree: false });

const dayText = (day, locale) => (day ? formatDate(`${String(day).slice(0, 10)}T12:00:00Z`, locale) : "—");
const custName = (c) => (c ? (c.companyName ? `${c.companyName}${c.name ? ` · ${c.name}` : ""}` : c.name) : "");
const personName = (p, locale) => (p ? (locale === "en" ? p.nameEn || p.name : p.name || p.nameEn) : "—");

async function downloadB2b(kind, query) {
  const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/b2b/export/${kind}?${query}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return resolveApiErrorMessage(data, "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `b2b-${kind}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "";
}

function StatusBadge({ kind, value }) {
  const { t } = useI18n();
  const good = value === "PAID";
  const bad = value === "CANCELLED" || value === "OVERDUE";
  return <span className={`biz-badge${good ? " biz-badge--ok" : ""}${bad ? " biz-badge--bad" : ""}`} data-status={value}>{t(`b2b.${kind}Status.${value}`)}</span>;
}

export default function B2B() {
  const { t } = useI18n();
  const { canModule } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "notes";
  const openNote = params.get("note") || "";
  const openInvoice = params.get("invoice") || "";
  const openReceipt = params.get("receipt") || "";
  const [meta, setMeta] = useState({ customers: [], staff: [], branches: [], me: "" });
  const [msg, setMsg] = useState("");
  const [newNote, setNewNote] = useState(false);

  useEffect(() => {
    api("/api/b2b/meta").then(setMeta).catch((e) => setMsg(e.message));
  }, []);

  const go = (next) => {
    setNewNote(false);
    setParams(next);
  };

  let body;
  if (newNote) {
    body = <NoteEditor meta={meta} onCancel={() => setNewNote(false)} onSaved={(n) => go({ tab: "notes", note: n.id })} />;
  } else if (openNote) {
    body = <NoteDetail id={openNote} onBack={() => go({ tab: "notes" })} onOpenInvoice={(id) => go({ tab: "invoices", invoice: id })} />;
  } else if (openInvoice) {
    body = <InvoiceDetail id={openInvoice} meta={meta} onBack={() => go({ tab: "invoices" })} onOpenNote={(id) => go({ tab: "notes", note: id })} onOpenReceipt={(id) => go({ tab: "receipts", receipt: id })} />;
  } else if (openReceipt) {
    body = <ReceiptDetail id={openReceipt} onBack={() => go({ tab: "receipts" })} onOpenInvoice={(id) => go({ tab: "invoices", invoice: id })} />;
  } else {
    body = (
      <>
        <PageTabs
          value={tab}
          onChange={(id) => go({ tab: id })}
          tabs={[
            { id: "notes", label: t("b2b.tabNotes") },
            { id: "invoices", label: t("b2b.tabInvoices") },
            { id: "receipts", label: t("b2b.tabReceipts") },
            { id: "pending", label: t("b2b.tabPending") },
          ]}
        />
        {tab === "notes" ? (
          <NotesList meta={meta} onNew={canModule("b2b", "create") ? () => setNewNote(true) : null} onOpen={(id) => go({ tab: "notes", note: id })} onInvoiced={(inv) => go({ tab: "invoices", invoice: inv.id })} />
        ) : null}
        {tab === "invoices" ? <InvoicesList meta={meta} onOpen={(id) => go({ tab: "invoices", invoice: id })} /> : null}
        {tab === "receipts" ? <ReceiptsList meta={meta} onOpen={(id) => go({ tab: "receipts", receipt: id })} /> : null}
        {tab === "pending" ? <PendingByCustomer onOpenInvoice={(id) => go({ tab: "invoices", invoice: id })} onOpenNote={(id) => go({ tab: "notes", note: id })} onInvoiced={(inv) => go({ tab: "invoices", invoice: inv.id })} /> : null}
      </>
    );
  }

  return (
    <div className="fd-page b2b-page">
      <PosSubNav />
      <h1>{t("b2b.title")}</h1>
      <p className="fd-muted" style={{ marginTop: 0 }}>{t("b2b.intro")}</p>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      {body}
    </div>
  );
}

// ------------------------------------------------------------------ shared filters

function Filters({ meta, value, onChange, statuses, statusKind, extra, onExport }) {
  const { t } = useI18n();
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="fd-filters b2b-filters">
      {extra}
      <label>
        <span>{t("b2b.customer")}</span>
        <select value={value.customerId} onChange={(e) => set({ customerId: e.target.value })} aria-label={t("b2b.customer")}>
          <option value="">{t("fd.all")}</option>
          {meta.customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
        </select>
      </label>
      {statuses ? (
        <label>
          <span>{t("fd.status")}</span>
          <select value={value.status} onChange={(e) => set({ status: e.target.value })} aria-label={t("fd.status")}>
            <option value="">{t("fd.all")}</option>
            {statuses.map((s) => <option key={s} value={s}>{t(`b2b.${statusKind}Status.${s}`)}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        <span>{t("b2b.from")}</span>
        <input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} aria-label={t("b2b.from")} />
      </label>
      <label>
        <span>{t("b2b.to")}</span>
        <input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} aria-label={t("b2b.to")} />
      </label>
      <label>
        <span>{t("so.search")}</span>
        <input value={value.q} onChange={(e) => set({ q: e.target.value })} placeholder={t("b2b.searchPh")} />
      </label>
      {onExport ? <button type="button" className="btn-touch" onClick={onExport}>CSV</button> : null}
    </div>
  );
}

const blankFilter = () => ({ customerId: "", status: "", from: "", to: "", q: "" });
const qs = (f, extra = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  return p.toString();
};

// ------------------------------------------------------------------ delivery notes

function NotesList({ meta, onNew, onOpen, onInvoiced }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [filter, setFilter] = useState(blankFilter);
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const query = qs(filter);
  useEffect(() => {
    const id = setTimeout(() => api(`/api/b2b/delivery-notes?${query}`).then(setRows).catch((e) => setMsg(e.message)), 200);
    return () => clearTimeout(id);
  }, [query]);
  const selected = rows.filter((r) => picked[r.id]);
  const canInvoice = canModule("b2b", "create");
  const invoice = async () => {
    setMsg("");
    if (new Set(selected.map((r) => r.customerId)).size > 1) {
      setMsg(t("b2b.oneCustomer"));
      return;
    }
    setBusy(true);
    try {
      const inv = await api("/api/b2b/invoices", { method: "POST", body: { deliveryNoteIds: selected.map((r) => r.id) } });
      onInvoiced(inv);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <Filters
        meta={meta}
        value={filter}
        onChange={setFilter}
        statuses={NOTE_STATUSES}
        statusKind="note"
        extra={onNew ? <button type="button" className="btn-touch biz-primary" onClick={onNew}>{t("b2b.newNote")}</button> : null}
        onExport={canModule("b2b", "export") ? async () => setMsg(await downloadB2b("notes", query)) : null}
      />
      {canInvoice && selected.length ? (
        <div className="card b2b-selection" role="status">
          <span>{t("b2b.selectedNotes", { n: selected.length, total: money2(selected.reduce((s, r) => s + Math.round(Number(r.total) * 100), 0)) })}</span>
          <button type="button" className="btn-touch biz-primary" disabled={busy} onClick={invoice}>{t("b2b.createInvoice")}</button>
        </div>
      ) : null}
      <div className="biz-list">
        {rows.map((n) => (
          <div key={n.id} className="card biz-order b2b-row" data-note={n.dnReference}>
            {canInvoice && n.b2bStatus === "DELIVERED" ? (
              <label className="b2b-pick">
                <input type="checkbox" checked={Boolean(picked[n.id])} onChange={(e) => setPicked((p) => ({ ...p, [n.id]: e.target.checked }))} aria-label={`${t("b2b.pickForInvoice")} ${n.dnReference}`} />
              </label>
            ) : null}
            <button type="button" className="b2b-row__main" onClick={() => onOpen(n.id)}>
              <div className="biz-order__top">
                <strong>{n.dnReference}</strong>
                <span><StatusBadge kind="note" value={n.b2bStatus} />{n.invoice ? <span className="biz-badge">{n.invoice.reference}</span> : null}</span>
              </div>
              <div>{custName(n.customer)}</div>
              <div className="fd-muted">
                {t("common.total")} {money(n.total)} · {t("b2b.deliveryDate")} {dayText(n.deliveryDate, locale)} · {branchDisplayName(n.branch || {}, locale)}
              </div>
            </button>
          </div>
        ))}
        {!rows.length ? <div className="card">{t("b2b.noNotes")}</div> : null}
      </div>
    </>
  );
}

function NoteEditor({ meta, onCancel, onSaved }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const canPrice = canModule("salesOrders", "edit");
  const canFree = canModule("complimentary", "create");
  const today = qatarYmd();
  const mainBranch = meta.branches.find((b) => b.isMain) || meta.branches[0];
  const [form, setForm] = useState({
    customerId: "",
    branchId: mainBranch?.id || "",
    deliveryDate: today,
    paymentTermsDays: "30",
    note: "",
    discountAmount: "",
    freeReason: "",
    deliver: true,
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!form.branchId && mainBranch) setForm((f) => ({ ...f, branchId: mainBranch.id }));
  }, [mainBranch?.id]);
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
  const qtyOf = (line) => {
    const p = productOf(line.productId);
    const n = Number(line.quantity) || 0;
    return p?.sellBy === "WEIGHT" ? Math.round(n * 1000) : Math.round(n);
  };
  const setLine = (i, patch) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const preview = useMemo(() => {
    let subtotal = 0;
    for (const line of lines) {
      if (!line.productId || line.isFree) continue;
      const price = line.unitPrice !== "" ? line.unitPrice : listPrice(line);
      subtotal += lineDirhams(price, qtyOf(line), productOf(line.productId)?.sellBy);
    }
    const discount = Math.min(Math.round(Number(form.discountAmount || 0) * 100) || 0, subtotal);
    return { subtotal, discount, total: subtotal - discount };
  }, [lines, form.discountAmount, products]);
  const name = (p) => (locale === "en" ? p.nameEn || p.name : p.name || p.nameEn);

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    if (lines.some((l) => productOf(l.productId)?.variants?.length && !l.variantId)) {
      setMsg(t("po.variantRequired"));
      return;
    }
    setBusy(true);
    try {
      const saved = await api("/api/b2b/delivery-notes", {
        method: "POST",
        body: {
          ...form,
          paymentTermsDays: form.paymentTermsDays === "" ? null : Number(form.paymentTermsDays),
          lines: lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            variantId: l.variantId || null,
            quantity: qtyOf(l),
            ...(l.unitPrice !== "" ? { unitPrice: l.unitPrice } : {}),
            isFree: Boolean(l.isFree),
          })),
        },
      });
      onSaved(saved);
    } catch (err) {
      setMsg(editErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} aria-label={t("b2b.newNote")} className="b2b-editor">
      <h2>{t("b2b.newNote")}</h2>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <section className="card fd-card">
        <div className="biz-grid">
          <label>
            <span>{t("b2b.customer")} *</span>
            <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} aria-label={t("b2b.customer")}>
              <option value="">—</option>
              {meta.customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
            </select>
          </label>
          <label>
            <span>{t("so.sellingLocation")} *</span>
            <select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} aria-label={t("so.sellingLocation")}>
              {meta.branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label>
            <span>{t("b2b.deliveryDate")}</span>
            <input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} aria-label={t("b2b.deliveryDate")} />
          </label>
          <label>
            <span>{t("so.termsDays")}</span>
            <select value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} aria-label={t("so.termsDays")}>
              {TERMS.map((d) => <option key={d} value={d}>{d ? t("so.netDays", { n: d }) : t("so.dueOnReceipt")}</option>)}
            </select>
          </label>
          <label>
            <span>{t("so.note")}</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
        {!meta.customers.length ? <p className="fd-muted">{t("b2b.noBusinessCustomers")}</p> : null}
      </section>
      <section className="card fd-card">
        <h3>{t("so.lines")}</h3>
        {lines.map((line, i) => {
          const p = productOf(line.productId);
          return (
            <div key={i} className="biz-line" data-line={i}>
              <label>
                <span>{t("po.product")}</span>
                <select required value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value, variantId: "", unitPrice: "" })} aria-label={`${t("po.product")} ${i + 1}`}>
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
                <input required type="number" min={p?.sellBy === "WEIGHT" ? "0.001" : "1"} step={p?.sellBy === "WEIGHT" ? "0.001" : "1"} value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label={`${t("po.quantity")} ${i + 1}`} />
              </label>
              <label>
                <span>{t("so.unitPrice")}</span>
                <input type="number" min="0" step="0.01" disabled={!canPrice || line.isFree} value={line.unitPrice !== "" ? line.unitPrice : p ? listPrice(line).toFixed(2) : ""} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
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
        {lines.some((l) => l.isFree) ? (
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
          <span>{t("common.total")}: <strong data-testid="b2b-note-total">{money2(preview.total)}</strong></span>
        </div>
        <label className="biz-check">
          <input type="checkbox" checked={form.deliver} onChange={(e) => setForm({ ...form, deliver: e.target.checked })} />
          <span>{t("b2b.deliverNow")}</span>
        </label>
        <p className="fd-muted">{t("b2b.deliverNowHint")}</p>
      </section>
      <div className="biz-actions">
        <button type="submit" className="btn-touch biz-primary" disabled={busy}>{t("b2b.issueNote")}</button>
        <button type="button" className="btn-touch" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function lineName(l, locale) {
  const p = l.product || {};
  const base = locale === "en" ? p.nameEn || p.name : p.name || p.nameEn;
  const v = l.variant ? ` (${locale === "en" ? l.variant.labelEn || l.variant.label : l.variant.label})` : "";
  return `${base || ""}${v}`;
}
function qtyText(l, q, t) {
  return l.product?.sellBy === "WEIGHT" ? `${(q / 1000).toFixed(3)} ${t("so.kg")}` : String(q);
}

function PrintHeader({ title, reference }) {
  const { t, locale } = useI18n();
  return (
    <div className="b2b-print-head">
      <h2 style={{ margin: "0 0 4px" }}>{title} {reference}</h2>
      <div className="fd-muted">{t("b2b.printedOn")} {formatDateTime(new Date(), locale)}</div>
    </div>
  );
}

function NoteDetail({ id, onBack, onOpenInvoice }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [note, setNote] = useState(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [printView, setPrintView] = useState(false);
  const [withPrices, setWithPrices] = useState(false);
  const load = () => api(`/api/b2b/delivery-notes/${id}`).then(setNote).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);
  if (!note) return msg ? <div role="alert" className="fd-alert">{msg}</div> : <div className="card">{t("common.loading")}</div>;
  const act = async (fn, done) => {
    setMsg(""); setOk(""); setBusy(true);
    try { await fn(); setOk(done); await load(); } catch (e) { setMsg(editErrorMessage(e, t)); } finally { setBusy(false); }
  };
  const doc = (
    <div className="print-invoice biz-print-doc b2b-print" data-doc="delivery-note">
      <PrintHeader title={t("b2b.deliveryNote")} reference={note.dnReference} />
      <div><strong>{custName(note.customer)}</strong>{note.customer?.phone ? ` · ${note.customer.phone}` : ""}</div>
      {note.customer?.address ? <div>{note.customer.address}</div> : null}
      <div>{t("so.sellingLocation")}: {branchDisplayName(note.branch || {}, locale)}</div>
      <div>{t("b2b.deliveryDate")}: {dayText(note.deliveryDate, locale)}{note.deliveredAt ? ` · ${t("b2b.deliveredAt")}: ${formatDateTime(note.deliveredAt, locale)}` : ""}</div>
      <table>
        <thead>
          <tr><th>#</th><th>{t("po.product")}</th><th>{t("po.quantity")}</th>{withPrices ? <><th>{t("so.unitPrice")}</th><th>{t("so.lineTotal")}</th></> : null}</tr>
        </thead>
        <tbody>
          {note.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{lineName(l, locale)}{l.isFree ? ` — ${t("so.free")}` : ""}</td>
              <td>{qtyText(l, l.quantity, t)}</td>
              {withPrices ? <><td>{l.isFree ? "—" : money(l.unitPrice)}</td><td>{l.isFree ? t("so.free") : money(l.subtotal)}</td></> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {withPrices ? (
        <div style={{ marginTop: 8 }}>
          {Number(note.discountAmount) ? <div>{t("so.orderDiscount")}: −{money(note.discountAmount)}</div> : null}
          <strong>{t("common.total")}: {money(note.total)} {t("common.currency")}</strong>
        </div>
      ) : null}
      {note.note ? <div>{t("so.note")}: {note.note}</div> : null}
      <div className="b2b-sign">
        <div>{t("b2b.receivedBy")}: ____________________</div>
        <div>{t("b2b.signature")}: ____________________</div>
      </div>
    </div>
  );
  return (
    <div className="b2b-detail">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      {ok ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{ok}</div> : null}
      <div className="biz-actions">
        <button type="button" className="btn-touch" onClick={onBack}>← {t("so.back")}</button>
        <button type="button" className="btn-touch" onClick={() => setPrintView((v) => !v)}>{printView ? t("b2b.closePrint") : t("b2b.printNote")}</button>
        {printView ? (
          <>
            <label className="biz-check"><input type="checkbox" checked={withPrices} onChange={(e) => setWithPrices(e.target.checked)} /><span>{t("b2b.showPrices")}</span></label>
            <button type="button" className="btn-touch" onClick={() => window.print()}>{t("so.print")}</button>
          </>
        ) : null}
      </div>
      {printView ? doc : null}
      <h2>
        {note.dnReference} <StatusBadge kind="note" value={note.b2bStatus} />
        {note.invoice ? <button type="button" className="fd-linkish" onClick={() => onOpenInvoice(note.invoice.id)}>{note.invoice.reference}</button> : null}
      </h2>
      <section className="card fd-card">
        <div><strong>{custName(note.customer)}</strong></div>
        <div>{t("so.sellingLocation")}: {branchDisplayName(note.branch || {}, locale)}</div>
        <div>{t("b2b.deliveryDate")}: {dayText(note.deliveryDate, locale)}{note.deliveredAt ? ` · ${t("b2b.deliveredAt")}: ${formatDateTime(note.deliveredAt, locale)}` : ""}</div>
        <div className="fd-muted">{t("b2b.order")} {note.reference} · {t("b2b.issuedBy")} {personName(note.user, locale)}</div>
        <table className="b2b-table">
          <thead><tr><th>{t("po.product")}</th><th>{t("po.quantity")}</th><th>{t("b2b.delivered")}</th><th>{t("so.unitPrice")}</th><th>{t("so.lineTotal")}</th></tr></thead>
          <tbody>
            {note.lines.map((l) => (
              <tr key={l.id}>
                <td>{lineName(l, locale)}</td>
                <td>{qtyText(l, l.quantity, t)}</td>
                <td>{qtyText(l, l.quantityDelivered, t)}</td>
                <td>{l.isFree ? "—" : money(l.unitPrice)}</td>
                <td>{l.isFree ? t("so.free") : money(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fd-totals">
          {Number(note.discountAmount) ? <span>{t("so.orderDiscount")}: <strong>−{money(note.discountAmount)}</strong></span> : null}
          <span>{t("common.total")}: <strong data-testid="b2b-note-detail-total">{money(note.total)}</strong></span>
          <span>{t("so.paid")}: <strong>{money(note.amountPaid)}</strong></span>
        </div>
        {note.freeReason ? <div>{t("so.freeReason")}: {note.freeReason}</div> : null}
      </section>
      <div className="biz-actions">
        {note.b2bStatus === "ISSUED" && canModule("b2b", "create") ? (
          <button type="button" className="btn-touch biz-primary" disabled={busy} onClick={() => act(() => api(`/api/b2b/delivery-notes/${note.id}/deliver`, { method: "POST", body: { version: note.version } }), t("b2b.deliveredOk"))}>
            {t("b2b.deliverNote")}
          </button>
        ) : null}
        {note.b2bStatus === "ISSUED" && canModule("b2b", "delete") ? (
          <button
            type="button"
            className="btn-touch"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt(t("b2b.cancelReason"));
              if (reason) act(() => api(`/api/b2b/delivery-notes/${note.id}/cancel`, { method: "POST", body: { version: note.version, reason } }), t("b2b.cancelledOk"));
            }}
          >
            {t("b2b.cancelNote")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ invoices

function InvoicesList({ meta, onOpen }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [filter, setFilter] = useState(blankFilter);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const query = qs(filter);
  useEffect(() => {
    const id = setTimeout(() => api(`/api/b2b/invoices?${query}`).then(setRows).catch((e) => setMsg(e.message)), 200);
    return () => clearTimeout(id);
  }, [query]);
  return (
    <>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <Filters meta={meta} value={filter} onChange={setFilter} statuses={INVOICE_STATUSES} statusKind="invoice" onExport={canModule("b2b", "export") ? async () => setMsg(await downloadB2b("invoices", query)) : null} />
      <div className="biz-list">
        {rows.map((inv) => (
          <button key={inv.id} type="button" className="card biz-order" onClick={() => onOpen(inv.id)} data-invoice={inv.reference}>
            <div className="biz-order__top">
              <strong>{inv.reference}</strong>
              <span><StatusBadge kind="invoice" value={inv.status} />{inv.overdue ? <StatusBadge kind="invoice" value="OVERDUE" /> : null}</span>
            </div>
            <div>{custName(inv.customer)}</div>
            <div className="fd-muted">
              {t("common.total")} {money(inv.total)} · {t("so.balance")} {money(inv.balance)} · {t("b2b.invoiceDate")} {dayText(inv.invoiceDate, locale)} · {t("so.dueDate")} {dayText(inv.dueDate, locale)}
            </div>
          </button>
        ))}
        {!rows.length ? <div className="card">{t("b2b.noInvoices")}</div> : null}
      </div>
    </>
  );
}

function InvoiceDetail({ id, meta, onBack, onOpenNote, onOpenReceipt }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [inv, setInv] = useState(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [printView, setPrintView] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "CASH", bankReference: "", paidAt: qatarYmd(), note: "", proofFileId: "", collectedById: "" });
  const [proofKey, setProofKey] = useState(0);
  const load = () => api(`/api/b2b/invoices/${id}`).then((row) => { setInv(row); setPay((p) => ({ ...p, amount: p.amount || row.balance })); }).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);
  if (!inv) return msg ? <div role="alert" className="fd-alert">{msg}</div> : <div className="card">{t("common.loading")}</div>;
  const open = inv.status === "ISSUED" || inv.status === "PART_PAID";
  const collector = pay.collectedById || meta.me;
  const record = async (e) => {
    e.preventDefault();
    setMsg(""); setOk(""); setBusy(true);
    try {
      const r = await api(`/api/b2b/invoices/${inv.id}/receipts`, { method: "POST", body: { ...pay, collectedById: collector } });
      setOk(t("b2b.receiptOk", { ref: r.receipt.reference }));
      setPay({ amount: "", method: "CASH", bankReference: "", paidAt: qatarYmd(), note: "", proofFileId: "", collectedById: "" });
      setProofKey((k) => k + 1);
      setInv(r.invoice);
      setPay((p) => ({ ...p, amount: r.invoice.balance }));
    } catch (err) {
      setMsg(editErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    const reason = window.prompt(t("b2b.cancelReason"));
    if (!reason) return;
    setBusy(true);
    try {
      setInv(await api(`/api/b2b/invoices/${inv.id}/cancel`, { method: "POST", body: { version: inv.version, reason } }));
      setOk(t("b2b.cancelledOk"));
    } catch (e) {
      setMsg(editErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  const doc = (
    <div className="print-invoice biz-print-doc b2b-print" data-doc="invoice">
      <PrintHeader title={t("b2b.invoice")} reference={inv.reference} />
      <div><strong>{custName(inv.customer)}</strong>{inv.customer?.phone ? ` · ${inv.customer.phone}` : ""}</div>
      {inv.customer?.address ? <div>{inv.customer.address}</div> : null}
      <div>{t("b2b.invoiceDate")}: {dayText(inv.invoiceDate, locale)} · {t("so.dueDate")}: {dayText(inv.dueDate, locale)}{inv.paymentTermsDays != null ? ` (${inv.paymentTermsDays ? t("so.netDays", { n: inv.paymentTermsDays }) : t("so.dueOnReceipt")})` : ""}</div>
      <table>
        <thead><tr><th>{t("b2b.deliveryNote")}</th><th>{t("po.product")}</th><th>{t("po.quantity")}</th><th>{t("so.unitPrice")}</th><th>{t("so.lineTotal")}</th></tr></thead>
        <tbody>
          {inv.orders.flatMap((o) => o.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i === 0 ? `${o.dnReference} · ${dayText(o.deliveredAt || o.deliveryDate, locale)}` : ""}</td>
              <td>{lineName(l, locale)}</td>
              <td>{qtyText(l, l.quantity, t)}</td>
              <td>{l.isFree ? "—" : money(l.unitPrice)}</td>
              <td>{l.isFree ? t("so.free") : money(l.subtotal)}</td>
            </tr>
          )))}
          {inv.orders.filter((o) => Number(o.discountAmount)).map((o) => (
            <tr key={`${o.id}-disc`}><td>{o.dnReference}</td><td colSpan={3}>{t("so.orderDiscount")}</td><td>−{money(o.discountAmount)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <div><strong>{t("common.total")}: {money(inv.total)} {t("common.currency")}</strong></div>
        <div>{t("so.paid")}: {money(inv.amountPaid)}</div>
        <div><strong>{t("b2b.amountDue")}: {money(inv.balance)} {t("common.currency")}</strong> · {t("so.dueDate")}: {dayText(inv.dueDate, locale)}</div>
      </div>
      {inv.note ? <div>{t("so.note")}: {inv.note}</div> : null}
    </div>
  );
  return (
    <div className="b2b-detail">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      {ok ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{ok}</div> : null}
      <div className="biz-actions">
        <button type="button" className="btn-touch" onClick={onBack}>← {t("so.back")}</button>
        <button type="button" className="btn-touch" onClick={() => setPrintView((v) => !v)}>{printView ? t("b2b.closePrint") : t("b2b.printInvoice")}</button>
        {printView ? <button type="button" className="btn-touch" onClick={() => window.print()}>{t("so.print")}</button> : null}
      </div>
      {printView ? doc : null}
      <h2>
        {inv.reference} <StatusBadge kind="invoice" value={inv.status} />
        {inv.overdue ? <StatusBadge kind="invoice" value="OVERDUE" /> : null}
      </h2>
      <section className="card fd-card">
        <div><strong>{custName(inv.customer)}</strong></div>
        <div>{t("b2b.invoiceDate")}: {dayText(inv.invoiceDate, locale)} · {t("so.dueDate")}: {dayText(inv.dueDate, locale)}{inv.overdue ? ` · ${t("b2b.daysOverdue", { n: inv.daysOverdue })}` : ""}</div>
        <div className="fd-totals">
          <span>{t("common.total")}: <strong data-testid="b2b-inv-total">{money(inv.total)}</strong></span>
          <span>{t("so.paid")}: <strong data-testid="b2b-inv-paid">{money(inv.amountPaid)}</strong></span>
          <span>{t("so.balance")}: <strong data-testid="b2b-inv-balance">{money(inv.balance)}</strong></span>
        </div>
        <h3>{t("b2b.tabNotes")}</h3>
        <ul className="b2b-mini-list">
          {inv.orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="fd-linkish" onClick={() => onOpenNote(o.id)}>{o.dnReference}</button> · {dayText(o.deliveredAt || o.deliveryDate, locale)} · {money(o.total)}
            </li>
          ))}
        </ul>
        <h3>{t("b2b.tabReceipts")}</h3>
        <ul className="b2b-mini-list">
          {inv.receipts.map((r) => (
            <li key={r.id}>
              <button type="button" className="fd-linkish" onClick={() => onOpenReceipt(r.id)}>{r.reference}</button> · {formatDateTime(r.paidAt, locale)} · {t(`b2b.method.${r.method}`)} · {money(r.amount)} · {t("b2b.collectedBy")} {personName(r.collectedBy, locale)}
              {r.proofFile ? <> · <FileLink file={r.proofFile} label={t("so.viewProof")} /></> : null}
            </li>
          ))}
          {!inv.receipts.length ? <li className="fd-muted">{t("b2b.noReceipts")}</li> : null}
        </ul>
      </section>
      {open && canModule("b2b", "edit") ? (
        <form className="card fd-card" onSubmit={record} aria-label={t("b2b.newReceipt")}>
          <h3>{t("b2b.newReceipt")}</h3>
          <div className="biz-grid">
            <label>
              <span>{t("fd.amount")} *</span>
              <input required type="number" min="0.01" step="0.01" max={inv.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-label={t("fd.amount")} />
            </label>
            <label>
              <span>{t("b2b.methodLabel")}</span>
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label={t("b2b.methodLabel")}>
                {METHODS.map((m) => <option key={m} value={m}>{t(`b2b.method.${m}`)}</option>)}
              </select>
            </label>
            <label>
              <span>{t("b2b.collectedBy")}</span>
              <select value={collector} onChange={(e) => setPay({ ...pay, collectedById: e.target.value })} aria-label={t("b2b.collectedBy")}>
                {meta.staff.map((s) => <option key={s.id} value={s.id}>{personName(s, locale)} · {t(`role.${s.role}`)}</option>)}
              </select>
            </label>
            <label>
              <span>{t("b2b.paidOn")}</span>
              <input type="date" max={qatarYmd()} value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} aria-label={t("b2b.paidOn")} />
            </label>
            {pay.method === "BANK_TRANSFER" ? (
              <label>
                <span>{t("b2b.bankReference")}</span>
                <input value={pay.bankReference} onChange={(e) => setPay({ ...pay, bankReference: e.target.value })} aria-label={t("b2b.bankReference")} />
              </label>
            ) : null}
            <label>
              <span>{t("so.note")}</span>
              <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
            </label>
          </div>
          <ProofUpload key={proofKey} value={pay.proofFileId} onChange={(v) => setPay((p) => ({ ...p, proofFileId: v }))} required={proofNeeded(pay.method)} />
          <div className="biz-actions">
            <button type="submit" className="btn-touch biz-primary" disabled={busy || (proofNeeded(pay.method) && !pay.proofFileId)}>{t("b2b.recordReceipt")}</button>
          </div>
        </form>
      ) : null}
      {inv.status === "ISSUED" && !inv.receipts.length && canModule("b2b", "delete") ? (
        <div className="biz-actions"><button type="button" className="btn-touch" disabled={busy} onClick={cancel}>{t("b2b.cancelInvoice")}</button></div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ receipts

function ReceiptsList({ meta, onOpen }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [filter, setFilter] = useState(() => ({ ...blankFilter(), method: "" }));
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const query = qs(filter);
  useEffect(() => {
    const id = setTimeout(() => api(`/api/b2b/receipts?${query}`).then(setRows).catch((e) => setMsg(e.message)), 200);
    return () => clearTimeout(id);
  }, [query]);
  return (
    <>
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <Filters
        meta={meta}
        value={filter}
        onChange={setFilter}
        extra={
          <label>
            <span>{t("b2b.methodLabel")}</span>
            <select value={filter.method} onChange={(e) => setFilter({ ...filter, method: e.target.value })} aria-label={t("b2b.methodLabel")}>
              <option value="">{t("fd.all")}</option>
              {METHODS.map((m) => <option key={m} value={m}>{t(`b2b.method.${m}`)}</option>)}
            </select>
          </label>
        }
        onExport={canModule("b2b", "export") ? async () => setMsg(await downloadB2b("receipts", query)) : null}
      />
      <div className="biz-list">
        {rows.map((r) => (
          <button key={r.id} type="button" className="card biz-order" onClick={() => onOpen(r.id)} data-receipt={r.reference}>
            <div className="biz-order__top">
              <strong>{r.reference}</strong>
              <span className="biz-badge">{t(`b2b.method.${r.method}`)}</span>
            </div>
            <div>{custName(r.customer)} · {r.invoice?.reference}</div>
            <div className="fd-muted">{money(r.amount)} · {formatDateTime(r.paidAt, locale)} · {t("b2b.collectedBy")} {personName(r.collectedBy, locale)}</div>
          </button>
        ))}
        {!rows.length ? <div className="card">{t("b2b.noReceipts")}</div> : null}
      </div>
    </>
  );
}

function ReceiptDetail({ id, onBack, onOpenInvoice }) {
  const { t, locale } = useI18n();
  const [r, setR] = useState(null);
  const [msg, setMsg] = useState("");
  const [printView, setPrintView] = useState(false);
  useEffect(() => { api(`/api/b2b/receipts/${id}`).then(setR).catch((e) => setMsg(e.message)); }, [id]);
  if (!r) return msg ? <div role="alert" className="fd-alert">{msg}</div> : <div className="card">{t("common.loading")}</div>;
  const balance = (Number(r.invoice?.total || 0) - Number(r.invoice?.amountPaid || 0)).toFixed(2);
  const doc = (
    <div className="print-invoice biz-print-doc b2b-print" data-doc="receipt">
      <PrintHeader title={t("b2b.receipt")} reference={r.reference} />
      <div>{t("b2b.receivedFrom")}: <strong>{custName(r.customer)}</strong></div>
      <div>{t("b2b.invoice")}: {r.invoice?.reference} · {t("b2b.invoiceDate")}: {dayText(r.invoice?.invoiceDate, locale)}</div>
      <table>
        <tbody>
          <tr><th>{t("fd.amount")}</th><td><strong>{money(r.amount)} {t("common.currency")}</strong></td></tr>
          <tr><th>{t("b2b.methodLabel")}</th><td>{t(`b2b.method.${r.method}`)}{r.bankReference ? ` · ${r.bankReference}` : ""}</td></tr>
          <tr><th>{t("b2b.paidOn")}</th><td>{formatDateTime(r.paidAt, locale)}</td></tr>
          <tr><th>{t("b2b.collectedBy")}</th><td>{personName(r.collectedBy, locale)}</td></tr>
          <tr><th>{t("b2b.invoiceBalance")}</th><td>{balance}</td></tr>
        </tbody>
      </table>
      <div className="b2b-sign"><div>{t("b2b.signature")}: ____________________</div></div>
    </div>
  );
  return (
    <div className="b2b-detail">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <div className="biz-actions">
        <button type="button" className="btn-touch" onClick={onBack}>← {t("so.back")}</button>
        <button type="button" className="btn-touch" onClick={() => setPrintView((v) => !v)}>{printView ? t("b2b.closePrint") : t("b2b.printReceipt")}</button>
        {printView ? <button type="button" className="btn-touch" onClick={() => window.print()}>{t("so.print")}</button> : null}
      </div>
      {printView ? doc : null}
      <h2>{r.reference} <span className="biz-badge">{t(`b2b.method.${r.method}`)}</span></h2>
      <section className="card fd-card">
        <div><strong>{custName(r.customer)}</strong></div>
        <div>{t("b2b.invoice")}: <button type="button" className="fd-linkish" onClick={() => onOpenInvoice(r.invoiceId)}>{r.invoice?.reference}</button></div>
        <div>{t("fd.amount")}: <strong data-testid="b2b-receipt-amount">{money(r.amount)}</strong></div>
        <div>{t("b2b.paidOn")}: {formatDateTime(r.paidAt, locale)}</div>
        <div>{t("b2b.collectedBy")}: <span data-testid="b2b-receipt-collector">{personName(r.collectedBy, locale)}</span> · {t("b2b.recordedBy")}: {personName(r.user, locale)}</div>
        <div>{t("b2b.location")}: {branchDisplayName(r.branch || {}, locale)}{r.cashSessionId ? ` · ${t("b2b.inCashSession")}` : ""}</div>
        {r.bankReference ? <div>{t("b2b.bankReference")}: {r.bankReference}</div> : null}
        {r.proofFile ? <FileLink file={r.proofFile} label={t("so.viewProof")} /> : null}
        <ul className="b2b-mini-list">
          {r.payments.map((p) => <li key={p.id}>{p.order?.dnReference}: {money(p.amount)}</li>)}
        </ul>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ pending by customer

function PendingByCustomer({ onOpenInvoice, onOpenNote, onInvoiced }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => api("/api/b2b/pending").then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  if (!data) return msg ? <div role="alert" className="fd-alert">{msg}</div> : <div className="card">{t("common.loading")}</div>;
  const invoiceAll = async (c) => {
    try {
      onInvoiced(await api("/api/b2b/invoices", { method: "POST", body: { deliveryNoteIds: c.notInvoiced.map((n) => n.id) } }));
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <div className="b2b-pending">
      {msg ? <div role="alert" className="fd-alert">{msg}</div> : null}
      <div className="fd-totals card" style={{ padding: 12 }}>
        <span>{t("b2b.owedTotal")}: <strong data-testid="b2b-pending-owed">{money(data.totals.owed)}</strong></span>
        <span>{t("b2b.overdueTotal")}: <strong>{money(data.totals.overdue)}</strong></span>
        <span>{t("b2b.notInvoicedTotal")}: <strong>{money(data.totals.notInvoiced)}</strong></span>
      </div>
      {data.customers.map((c) => (
        <section key={c.customerId} className="card fd-card" data-customer={c.customerId}>
          <h3 style={{ margin: 0 }}>{c.customer}</h3>
          <div className="fd-muted">{t("b2b.owed")} {money(c.owed)} · {t("b2b.overdueTotal")} {money(c.overdue)} · {t("b2b.notInvoicedTotal")} {money(c.notInvoicedTotal)}</div>
          {c.invoices.length ? (
            <div className="b2b-table-wrap">
              <table className="b2b-table">
                <thead><tr><th>{t("b2b.invoice")}</th><th>{t("b2b.invoiceDate")}</th><th>{t("so.dueDate")}</th><th>{t("common.total")}</th><th>{t("b2b.owed")}</th><th /></tr></thead>
                <tbody>
                  {c.invoices.map((inv) => (
                    <tr key={inv.id} className={inv.overdue ? "b2b-overdue" : ""}>
                      <td><button type="button" className="fd-linkish" onClick={() => onOpenInvoice(inv.id)}>{inv.reference}</button></td>
                      <td>{dayText(inv.invoiceDate, locale)}</td>
                      <td>{dayText(inv.dueDate, locale)}</td>
                      <td>{money(inv.total)}</td>
                      <td>{money(inv.owed)}</td>
                      <td>{inv.overdue ? <span className="biz-badge biz-badge--bad">{t("b2b.daysOverdue", { n: inv.daysOverdue })}</span> : <StatusBadge kind="invoice" value={inv.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {c.notInvoiced.length ? (
            <div>
              <strong>{t("b2b.deliveredNotInvoiced")}</strong>
              <ul className="b2b-mini-list">
                {c.notInvoiced.map((n) => (
                  <li key={n.id}><button type="button" className="fd-linkish" onClick={() => onOpenNote(n.id)}>{n.dnReference}</button> · {n.deliveredAt ? formatDate(n.deliveredAt, locale) : "—"} · {money(n.total)}</li>
                ))}
              </ul>
              {canModule("b2b", "create") ? <button type="button" className="btn-touch" onClick={() => invoiceAll(c)}>{t("b2b.invoiceThese")}</button> : null}
            </div>
          ) : null}
        </section>
      ))}
      {!data.customers.length ? <div className="card">{t("b2b.nothingPending")}</div> : null}
    </div>
  );
}
