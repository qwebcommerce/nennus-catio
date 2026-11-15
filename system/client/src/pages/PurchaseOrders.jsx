import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

export default function PurchaseOrders() {
  const { t } = useI18n();
  const branchId = useActiveBranchId();
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ supplierId: "", productId: "", variantId: "", quantity: "1", unitCost: "" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [orderRows, billRows, supplierRows, productRows] = await Promise.all([
      api("/api/purchase-orders"),
      api("/api/purchase-orders/bills"),
      api("/api/suppliers"),
      api(`/api/products?includeInactive=1&branchId=${branchId || ""}`),
    ]);
    setOrders(orderRows);
    setBills(billRows);
    setSuppliers(supplierRows);
    setProducts(Array.isArray(productRows) ? productRows : productRows.items || []);
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [branchId]);

  const create = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/purchase-orders", {
        method: "POST",
        body: {
          supplierId: form.supplierId,
          branchId,
          lines: [{ productId: form.productId, variantId: form.variantId || null, quantity: Number(form.quantity), unitCost: Number(form.unitCost) }],
        },
      });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  };
  const product = products.find((row) => row.id === form.productId);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("po.title")}</h1>
      <form className="card" onSubmit={create} style={{ display: "grid", gap: 8 }}>
        <select required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
          <option value="">{t("po.supplier")}</option>
          {suppliers.filter((s) => s.isActive !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value, variantId: "" })}>
          <option value="">{t("po.product")}</option>
          {products.map((row) => <option key={row.id} value={row.id}>{row.nameEn || row.name}</option>)}
        </select>
        {product?.variants?.length ? (
          <select value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })}>
            <option value="">{t("pos.variant")}</option>
            {product.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        ) : null}
        <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input required type="number" min="0" step="0.01" placeholder={t("po.unitCost")} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
        <button className="btn-touch" type="submit">{t("po.create")}</button>
      </form>
      {orders.map((order) => (
        <article key={order.id} className="card">
          <strong>{order.supplier?.name} · {order.status}</strong>
          <div>{order.branch?.name}</div>
          {order.lines.map((line) => (
            <div key={line.id}>{line.quantityReceived}/{line.quantity} · {Number(line.unitCost).toFixed(2)}</div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {order.status === "DRAFT" ? <button type="button" onClick={() => api(`/api/purchase-orders/${order.id}/send`, { method: "POST", body: {} }).then(load)}>{t("po.send")}</button> : null}
            {["SENT", "PARTIALLY_RECEIVED"].includes(order.status) ? (
              <button type="button" onClick={() => api(`/api/purchase-orders/${order.id}/receive`, { method: "POST", body: { lines: order.lines.map((line) => ({ id: line.id, quantity: line.quantity - line.quantityReceived })) } }).then(load)}>{t("po.receive")}</button>
            ) : null}
          </div>
        </article>
      ))}
      <h2>{t("po.bills")}</h2>
      {bills.map((bill) => {
        const balance = Number(bill.amount) - Number(bill.amountPaid);
        return (
          <article key={bill.id} className="card">
            <div>{bill.supplier?.name} · {bill.status} · {t("po.balance")} {balance.toFixed(2)}</div>
            {bill.status !== "PAID" ? (
              <button type="button" onClick={() => api(`/api/purchase-orders/bills/${bill.id}/payments`, { method: "POST", body: { amount: balance, method: "BANK" } }).then(load)}>{t("po.payBill")}</button>
            ) : null}
          </article>
        );
      })}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
