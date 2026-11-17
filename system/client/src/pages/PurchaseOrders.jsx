import React, { useEffect, useState } from "react";
import { api, editErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { SupplierBills } from "./SupplierBills.jsx";
import { statusLabel } from "../utils/statusLabels.js";
import { branchDisplayName } from "../utils/displayLabels.js";

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

  const load = async () => {
    const [orderRows, supplierRows, productRows] = await Promise.all([
      api("/api/purchase-orders"),
      api("/api/suppliers"),
      api(`/api/products?includeInactive=1&branchId=${branchId || ""}`),
    ]);
    setOrders(orderRows);
    setSuppliers(supplierRows);
    setProducts(Array.isArray(productRows) ? productRows : productRows.items || []);
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [branchId]);

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
      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <label style={fld}>
          <span>{t("po.supplier")}</span>
          <select style={inp} required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.filter((s) => s.isActive !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
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
                <span>{t("po.quantity")}</span>
                <input style={inp} required type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </label>
              <label style={fld}>
                <span>{t("po.unitCost")}</span>
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
          <button className="btn-touch" type="submit" disabled={busy}>{t("po.create")}</button>
        </div>
      </form>
      {orders.map((order) => {
        const open = ["SENT", "PARTIALLY_RECEIVED"].includes(order.status);
        return (
          <article key={order.id} className="card" style={{ display: "grid", gap: 6 }}>
            <strong>{order.supplier?.name} · {statusLabel("purchaseOrder", order.status, locale)}</strong>
            <div>{order.branch ? branchDisplayName(order.branch, locale) : ""}</div>
            {order.lines.map((line) => (
              <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 200px" }}>{lineName(line)} · {line.quantityReceived}/{line.quantity} · {Number(line.unitCost).toFixed(2)}</span>
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
              {["DRAFT", "SENT"].includes(order.status) ? (
                <button type="button" disabled={busy} onClick={() => window.confirm(t("po.confirmCancel")) && run(() => api(`/api/purchase-orders/${order.id}/cancel`, { method: "POST", body: { version: order.version } }), t("po.cancelled"))}>{t("po.cancel")}</button>
              ) : null}
            </div>
          </article>
        );
      })}
      <SupplierBills suppliers={suppliers} refreshKey={orders} />
    </div>
  );
}
