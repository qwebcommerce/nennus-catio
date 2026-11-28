import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { formatDateTime } from "../utils/qatarDate.js";
// fix-re: Offers | Grooming coupons tabs
import { PromoTabs } from "./Coupons.jsx";

const KINDS = ["PERCENT", "FIXED", "PRODUCT", "CATEGORY", "BUNDLE", "BOGO"];
const CHANNELS = ["ALL", "TILL", "WEBSITE", "GROOMING"];
/** The fields each offer type uses (the others are hidden so nothing irrelevant is sent). */
const FIELDS = {
  PERCENT: ["percent", "minOrderAmount"],
  FIXED: ["amount", "minOrderAmount"],
  PRODUCT: ["productId", "percent", "amount"],
  CATEGORY: ["categoryId", "percent", "amount"],
  BUNDLE: ["bundleProductIds", "bundlePrice"],
  BOGO: ["productId", "buyQty", "getQty"],
};
const inp = { width: "100%", boxSizing: "border-box", minWidth: 0 };
const fld = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", alignItems: "end" };

export default function Promotions() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const empty = { name: "", nameEn: "", kind: "PERCENT", code: "", percent: "", amount: "", channel: "ALL", productId: "", categoryId: "", buyQty: "", getQty: "", bundleProductIds: [], bundlePrice: "", minOrderAmount: "", startsAt: "", endsAt: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api("/api/promotions").then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    api("/api/products").then((list) => setProducts(Array.isArray(list) ? list : list.items || [])).catch(() => {});
    api("/api/catalog/categories").then((list) => setCategories(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);
  const uses = (field) => FIELDS[form.kind].includes(field);
  const nameOf = (row) => (locale === "en" ? row?.nameEn || row?.name : row?.name || row?.nameEn) || "";
  const label = (group, key) => {
    const text = t(`promo.${group}.${key}`);
    return text === `promo.${group}.${key}` ? key : text;
  };
  const num = (field, cast = Number) => (!uses(field) || form[field] === "" ? null : cast(form[field]));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/api/promotions", {
        method: "POST",
        body: {
          name: form.name,
          nameEn: form.nameEn,
          kind: form.kind,
          channel: form.channel,
          code: form.code,
          percent: num("percent"),
          amount: num("amount"),
          productId: uses("productId") ? form.productId || null : null,
          categoryId: uses("categoryId") ? form.categoryId || null : null,
          buyQty: num("buyQty"),
          getQty: num("getQty"),
          bundlePrice: num("bundlePrice"),
          bundleProductIds: uses("bundleProductIds") ? form.bundleProductIds : [],
          minOrderAmount: num("minOrderAmount"),
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
        },
      });
      setForm(empty);
      setMsg(t("promo.created"));
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (row) =>
    api(`/api/promotions/${row.id}`, { method: "PATCH", body: { active: !row.active, version: row.version } })
      .then(() => { setMsg(row.active ? t("promo.paused") : t("promo.resumed")); return load(); })
      .catch((e) => { setMsg(editErrorMessage(e, t)); if (isStaleEdit(e)) load(); });
  const field = (name, text, input) => (uses(name) ? <label style={fld}><span>{text}</span>{input}</label> : null);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.promotions")}</h1>
      <PromoTabs value="offers" />
      {msg ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{msg}</div> : null}
      <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={submit}>
        <div style={grid}>
          <label style={fld}><span>{t("products.nameArField")}</span><input style={inp} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label style={fld}><span>{t("products.nameEnField")}</span><input style={inp} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></label>
          <label style={fld}>
            <span>{t("promo.kind")}</span>
            <select style={inp} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((kind) => <option key={kind} value={kind}>{label("kind", kind)}</option>)}
            </select>
          </label>
          <label style={fld}>
            <span>{t("promo.channel")}</span>
            <select style={inp} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {CHANNELS.map((channel) => <option key={channel} value={channel}>{label("channel", channel)}</option>)}
            </select>
          </label>
          <label style={fld}>
            <span>{t("shop.code")}</span>
            <input style={inp} placeholder={t("promo.codeHint")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </label>
          {field("productId", t("shop.offerProduct"),
            <select style={inp} required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">—</option>
              {products.map((product) => <option key={product.id} value={product.id}>{nameOf(product)}</option>)}
            </select>)}
          {field("categoryId", t("shop.offerCategory"),
            <select style={inp} required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">—</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{nameOf(category)}</option>)}
            </select>)}
          {field("percent", t("promo.percent"), <input style={inp} type="number" min="0.01" max="100" step="0.01" required={form.kind === "PERCENT"} value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />)}
          {field("amount", t("promo.amount"), <input style={inp} type="number" min="0.01" step="0.01" required={form.kind === "FIXED"} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />)}
          {field("buyQty", t("shop.buyQty"), <input style={inp} type="number" min="1" step="1" required value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: e.target.value })} />)}
          {field("getQty", t("shop.getQty"), <input style={inp} type="number" min="1" step="1" required value={form.getQty} onChange={(e) => setForm({ ...form, getQty: e.target.value })} />)}
          {field("bundleProductIds", t("promo.bundleProducts"),
            <select style={{ ...inp, minHeight: 120 }} multiple value={form.bundleProductIds} onChange={(e) => setForm({ ...form, bundleProductIds: [...e.target.selectedOptions].map((o) => o.value) })}>
              {products.map((product) => <option key={product.id} value={product.id}>{nameOf(product)}</option>)}
            </select>)}
          {field("bundlePrice", t("shop.bundlePrice"), <input style={inp} type="number" min="0.01" step="0.01" required value={form.bundlePrice} onChange={(e) => setForm({ ...form, bundlePrice: e.target.value })} />)}
          {field("minOrderAmount", t("shop.minOrder"), <input style={inp} type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />)}
          <label style={fld}><span>{t("promo.startsAt")}</span><input style={inp} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label style={fld}><span>{t("promo.endsAt")}</span><input style={inp} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        </div>
        <button className="btn-touch" type="submit" disabled={busy}>{t("common.add")}</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="card" style={{ display: "grid", gap: 4 }}>
          <strong>{nameOf(row)} · {label("kind", row.kind)} · {label("channel", row.channel)}</strong>
          <div>
            {row.code || t("shop.automatic")} · {row.active ? t("shop.active") : t("shop.inactive")}
            {row.endsAt ? ` · ${t("promo.endsAt")}: ${formatDateTime(row.endsAt, locale)}` : ""}
          </div>
          <div>
            <button type="button" onClick={() => toggle(row)}>{row.active ? t("promo.pause") : t("promo.resume")}</button>
          </div>
        </article>
      ))}
    </div>
  );
}
