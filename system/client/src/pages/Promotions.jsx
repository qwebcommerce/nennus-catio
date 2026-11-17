import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const KINDS = ["PERCENT", "FIXED", "PRODUCT", "CATEGORY", "BUNDLE", "BOGO"];

export default function Promotions() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const empty = { name: "", nameEn: "", kind: "PERCENT", code: "", percent: "", amount: "", channel: "ALL", productId: "", categoryId: "", buyQty: "", getQty: "", bundleProductIds: "", bundlePrice: "", minOrderAmount: "", startsAt: "", endsAt: "" };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState("");
  const load = () => api("/api/promotions").then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    api("/api/products").then((list) => setProducts(Array.isArray(list) ? list : list.items || [])).catch(() => {});
    api("/api/catalog/categories").then((list) => setCategories(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.promotions")}</h1>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        try {
          await api("/api/promotions", {
            method: "POST",
            body: {
              ...form,
              percent: form.percent === "" ? null : Number(form.percent),
              amount: form.amount === "" ? null : Number(form.amount),
              productId: form.productId || null,
              categoryId: form.categoryId || null,
              buyQty: form.buyQty === "" ? null : Number(form.buyQty),
              getQty: form.getQty === "" ? null : Number(form.getQty),
              bundlePrice: form.bundlePrice === "" ? null : Number(form.bundlePrice),
              bundleProductIds: form.bundleProductIds.split(",").map((id) => id.trim()).filter(Boolean),
              minOrderAmount: form.minOrderAmount === "" ? null : Number(form.minOrderAmount),
              startsAt: form.startsAt || null,
              endsAt: form.endsAt || null,
            },
          });
        } catch (err) {
          setMsg(err.message);
          return;
        }
        setForm(empty);
        load();
      }}>
        <input required placeholder={t("products.nameArField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t("products.nameEnField")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          {KINDS.map((kind) => <option key={kind}>{kind}</option>)}
        </select>
        <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
          {["ALL", "TILL", "WEBSITE", "GROOMING"].map((channel) => <option key={channel}>{channel}</option>)}
        </select>
        <input placeholder={t("shop.code")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="%" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="QAR" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
          <option value="">{t("shop.offerProduct")}</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">{t("shop.offerCategory")}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <input type="number" min="1" placeholder={t("shop.buyQty")} value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: e.target.value })} />
        <input type="number" min="1" placeholder={t("shop.getQty")} value={form.getQty} onChange={(e) => setForm({ ...form, getQty: e.target.value })} />
        <input placeholder={t("shop.bundleIds")} value={form.bundleProductIds} onChange={(e) => setForm({ ...form, bundleProductIds: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder={t("shop.bundlePrice")} value={form.bundlePrice} onChange={(e) => setForm({ ...form, bundlePrice: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder={t("shop.minOrder")} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
        <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        <button className="btn-touch" type="submit">{t("common.add")}</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="card">
          <strong>{row.name} · {row.kind} · {row.channel}</strong>
          <div>{row.code || t("shop.automatic")} · {row.active ? t("shop.active") : t("shop.inactive")}</div>
          <button type="button" onClick={() => api(`/api/promotions/${row.id}`, { method: "PATCH", body: { active: !row.active, version: row.version } }).then(load).catch((e) => { setMsg(editErrorMessage(e, t)); if (isStaleEdit(e)) load(); })}>{row.active ? t("shop.inactive") : t("shop.active")}</button>
        </article>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
