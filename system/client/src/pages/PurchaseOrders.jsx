import React, { useEffect, useState } from "react";
import { api, editErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { SupplierBills } from "./SupplierBills.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { branchDisplayName } from "../utils/displayLabels.js";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { PageTabs } from "../components/BizShared.jsx";
import { PendingPayments, PendingStock, SupplierBalances } from "../components/PendingPanels.jsx";
import { PoExtras } from "../components/PoExtras.jsx";
// fix-rg: printable PO / status sheet / vouchers and the payment + receipt status pair
import { PoDocument, SupplierVoucher } from "../components/docs/PurchaseDocs.jsx";
import { StatusFilters, StatusPair, statusQuery } from "../components/docs/DocShared.jsx";

const TERMS = [0, 7, 14, 30, 60];

const inp = { width: "100%", boxSizing: "border-box", minWidth: 0 };
const fld = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const lineGrid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" };
const emptyLine = () => ({ productId: "", variantId: "", quantity: "1", unitCost: "" });

export default function PurchaseOrders() {
  const { t, locale } = useI18n();
  const branchId = useActiveBranchId();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [receive, setReceive] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [termsDays, setTermsDays] = useState("");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "orders";
  const { canModule } = useAuth();
  // fix-rg: one open document at a time ({ type: "po" | "status", id } or { type: "voucher", kind, id }).
  const [doc, setDoc] = useState(null);
  const [sf, setSf] = useState({});
  const openDoc = (d) => { setDoc(d); window.scrollTo?.(0, 0); };
  const openVoucher = (kind, id) => openDoc({ type: "voucher", kind, id });

  const load = async () => {
    const [orderRows, supplierRows, productRows] = await Promise.all([
      api(`/api/purchase-orders?${statusQuery(sf)}`),
      api("/api/suppliers"),
      api(`/api/products?includeInactive=1&branchId=${branchId || ""}`),
    ]);
    setOrders(orderRows);
    setSuppliers(supplierRows);
    setProducts(Array.isArray(productRows) ? productRows : productRows.items || []);
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [branchId, sf.payment, sf.delivery, sf.situation]);

  const productOf = (id) => products.find((row) => row.id === id);
  const lineName = (line) => {
    const product = productOf(line.productId);
    const variant = product?.variants?.find((v) => v.id === line.variantId);
    const name = product ? (locale === "en" ? product.nameEn || product.name : product.name || product.nameEn) : line.productId;
    return variant ? `${name} · ${locale === "en" ? variant.labelEn || variant.label : variant.label}` : name;
  };
  const setLine = (i, patch) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  /** Runs one action; errors show at the top instead of being lost. */
  const run = async (fn, done) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await fn();
      if (done) setMsg(done);
      await load();
    } catch (err) {
      setMsg(editErrorMessage(err, t) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e) => {
    e.preventDefault();
    // A product with variants is stocked per variant: the line must say which one.
    if (lines.some((l) => productOf(l.productId)?.variants?.length && !l.variantId)) {
      setMsg(t("po.variantRequired"));
      return;
    }
    run(async () => {
      await api("/api/purchase-orders", {
        method: "POST",
        body: {
          supplierId,
          branchId,
          ...(expectedDate ? { expectedDate } : {}),
          ...(termsDays !== "" ? { paymentTermsDays: Number(termsDays) } : {}),
          lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId || null, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
        },
      });
      setLines([emptyLine()]);
    }, t("po.created"));
  };
  const receiveQty = (order, line) => receive[line.id] ?? String(line.quantity - line.quantityReceived);
  const receiveOrder = (order) => {
    const body = order.lines
      .filter((line) => line.quantity > line.quantityReceived)
      .map((line) => ({ id: line.id, quantity: Number(receiveQty(order, line)) || 0 }));
    if (!body.some((line) => line.quantity > 0)) {
      setMsg(t("po.nothingToReceive"));
      return;
    }
    run(async () => {
      await api(`/api/purchase-orders/${order.id}/receive`, { method: "POST", body: { lines: body } });
      setReceive({});
    }, t("po.received"));
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("po.title")}</h1>
      {msg ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{msg}</div> : null}
      <PageTabs
        value={tab}
        onChange={(id) => setParams(id === "orders" ? {} : { tab: id })}
        tabs={[
          { id: "orders", label: t("po.title") },
          { id: "stock", label: t("so.pendingStock") },
          ...(canModule("finance", "view") ? [{ id: "pending", label: t("so.pendingPayments") }] : []),
          { id: "balances", label: t("so.supplierBalances") },
        ]}
      />
      {tab === "stock" ? <PendingStock /> : null}
      {tab === "pending" ? <PendingPayments side="byus" /> : null}
      {tab === "balances" ? <SupplierBalances /> : null}
      {tab === "orders" && doc ? (
        doc.type === "voucher"
          ? <SupplierVoucher key={`${doc.kind}:${doc.id}`} kind={doc.kind} id={doc.id} onClose={() => setDoc(null)} />
          : <PoDocument key={`${doc.type}:${doc.id}`} orderId={doc.id} mode={doc.type} onClose={() => setDoc(null)} />
      ) : null}
      {tab === "orders" ? (<>
      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <label style={fld}>
          <span>{t("po.supplier")}</span>
          <select style={inp} required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.filter((s) => s.isActive !== false && !s.isFreight).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div style={lineGrid}>
          <label style={fld}>
            <span>{t("so.expectedDate")}</span>
            <input style={inp} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </label>
          <label style={fld}>
            <span>{t("so.paymentTerms")}</span>
            <select style={inp} value={termsDays} onChange={(e) => setTermsDays(e.target.value)}>
              <option value="">{t("so.supplierDefault")}</option>
              {TERMS.map((d) => <option key={d} value={d}>{d ? t("so.netDays", { n: d }) : t("so.dueOnReceipt")}</option>)}
            </select>
          </label>
        </div>
        {lines.map((line, i) => {
          const product = productOf(line.productId);
          return (
            <div key={i} style={lineGrid}>
              <label style={fld}>
                <span>{t("po.product")}</span>
                <select style={inp} required value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value, variantId: "" })}>
                  <option value="">—</option>
                  {products.map((row) => <option key={row.id} value={row.id}>{locale === "en" ? row.nameEn || row.name : row.name || row.nameEn}</option>)}
                </select>
              </label>
              {product?.variants?.length ? (
                <label style={fld}>
                  <span>{t("pos.variant")}</span>
                  <select style={inp} required value={line.variantId} onChange={(e) => setLine(i, { variantId: e.target.value })}>
                    <option value="">—</option>
                    {product.variants.map((v) => <option key={v.id} value={v.id}>{locale === "en" ? v.labelEn || v.label : v.label}</option>)}
                  </select>
                </label>
              ) : null}
              <label style={fld}>
                <span>{t("po.quantity")}{product?.sellBy === "WEIGHT" ? ` (${t("po.grams")})` : ""}</span>
                <input style={inp} required type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </label>
              <label style={fld}>
                <span>{t("po.unitCost")}{product?.sellBy === "WEIGHT" ? ` (${t("pos.perKg")})` : ""}</span>
                <input style={inp} required type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
              </label>
              {lines.length > 1 ? (
                <button type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>{t("po.removeLine")}</button>
              ) : null}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>{t("po.addLine")}</button>
          <button className="btn-touch" type="submit" disabled={busy} style={{ background: "var(--accent)", color: "#fff" }}>{t("po.create")}</button>
        </div>
      </form>
      <div className="fd-filters rg-filters" aria-label={t("st.sit.label")}>
        <StatusFilters po value={sf} onChange={setSf} />
      </div>
      {!orders.length && (sf.payment || sf.delivery || sf.situation) ? <div className="card">{t("st.noMatch")}</div> : null}
      {orders.map((order) => {
        const open = ["SENT", "PARTIALLY_RECEIVED"].includes(order.status);
        return (
          <article key={order.id} className="card" style={{ display: "grid", gap: 6 }}>
            <strong>{order.supplier?.name} · {statusLabel("purchaseOrder", order.status, locale)} <span className="fd-muted">PO {order.id.slice(-6).toUpperCase()}</span></strong>
            <div><StatusPair pair={order.statusPair} po amounts /></div>
            <div>{order.branch ? branchDisplayName(order.branch, locale) : ""}</div>
            {order.lines.map((line) => (
              <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 200px" }}>
                  {lineName(line)} · {line.quantityReceived}/{line.quantity}
                  {productOf(line.productId)?.sellBy === "WEIGHT" ? ` g · ${Number(line.unitCost).toFixed(2)} ${t("pos.perKg")}` : ` · ${Number(line.unitCost).toFixed(2)}`}
                </span>
                {open && line.quantity > line.quantityReceived ? (
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span>{t("po.receiveNow")}</span>
                    <input
                      type="number"
                      min="0"
                      max={line.quantity - line.quantityReceived}
                      step="1"
                      style={{ width: 90, boxSizing: "border-box" }}
                      value={receiveQty(order, line)}
                      onChange={(e) => setReceive((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  </label>
                ) : null}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {order.status === "DRAFT" ? (
                <button type="button" disabled={busy} onClick={() => run(() => api(`/api/purchase-orders/${order.id}/send`, { method: "POST", body: { version: order.version } }), t("po.sent"))}>{t("po.send")}</button>
              ) : null}
              {open ? <button type="button" disabled={busy} onClick={() => receiveOrder(order)}>{t("po.receiveSelected")}</button> : null}
              <button type="button" onClick={() => openDoc({ type: "po", id: order.id })}>{t("doc.po.print")}</button>
              {order.status !== "DRAFT" ? <button type="button" onClick={() => openDoc({ type: "status", id: order.id })}>{t("doc.po.statusPrint")}</button> : null}
              {["DRAFT", "SENT"].includes(order.status) ? (
                <button type="button" disabled={busy} onClick={() => window.confirm(t("po.confirmCancel")) && run(() => api(`/api/purchase-orders/${order.id}/cancel`, { method: "POST", body: { version: order.version } }), t("po.cancelled"))}>{t("po.cancel")}</button>
              ) : null}
            </div>
            <PoExtras order={order} suppliers={suppliers} onChanged={load} setMsg={setMsg} onVoucher={openVoucher} />
          </article>
        );
      })}
      <SupplierBills suppliers={suppliers} refreshKey={orders} onVoucher={openVoucher} />
      </>) : null}
    </div>
  );
}
