import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";
import { readCart, writeCart } from "../../site/cartStore.js";
import { CartLines } from "./CartLines.jsx";
import { statusLabel } from "../../utils/statusLabels.js";
import { formatDateTime } from "../../utils/qatarDate.js";

const TOKEN_KEY = "nennus.shopToken";

function shopApi(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api(path, { ...options, headers });
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

function lineTotal(line) {
  if (line.sellBy === "WEIGHT") return (Number(line.price) * Number(line.quantity)) / 1000;
  return Number(line.price) * Number(line.quantity);
}

export function ShopCatalog() {
  const { t, locale } = useI18n();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [petTypeId, setPetTypeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    shopApi("/api/shop/meta").then(setMeta).catch(() => setMeta(null));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (petTypeId) params.set("petTypeId", petTypeId);
    if (categoryId) params.set("categoryId", categoryId);
    if (q.trim()) params.set("q", q.trim());
    shopApi(`/api/shop/catalog?${params.toString()}`).then(setRows).catch(() => setRows([]));
  }, [petTypeId, categoryId, q]);
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px" }}>
      <h1>{t("shop.title")}</h1>
      <p style={{ color: "var(--muted)" }}>
        {meta?.location
          ? t("shop.sellingFrom", { name: locale === "en" ? meta.location.nameEn || meta.location.name : meta.location.name })
          : t("shop.noLocation")}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <select value={petTypeId} onChange={(e) => setPetTypeId(e.target.value)}>
          <option value="">{t("shop.allPets")}</option>
          {(meta?.petTypes || []).map((row) => (
            <option key={row.id} value={row.id}>{locale === "en" ? row.nameEn || row.name : row.name}</option>
          ))}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t("shop.allCategories")}</option>
          {(meta?.categories || []).map((row) => (
            <option key={row.id} value={row.id}>{locale === "en" ? row.nameEn || row.name : row.name}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.search")} />
        <Link to="/shop/account">{t("shop.account")}</Link>
        <Link to="/shop/checkout">{t("shop.cart")}</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {rows.map((product) => {
          const price = product.variants?.length
            ? Math.min(...product.variants.map((v) => Number(v.price)))
            : Number(product.price);
          const available = product.variants?.length
            ? product.variants.some((v) => v.available > 0)
            : product.available > 0;
          return (
            <Link key={product.id} to={`/shop/product/${product.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              {product.images?.[0] ? <img src={product.images[0]} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12 }} /> : null}
              <strong>{locale === "en" ? product.nameEn || product.name : product.name}</strong>
              <div>{money(price)} QAR</div>
              <div style={{ color: available ? "var(--muted)" : "#9a3412" }}>{available ? t("shop.available") : t("shop.unavailable")}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ShopProduct() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    shopApi(`/api/shop/products/${id}`).then((row) => {
      setProduct(row);
      setVariantId(row.variants?.[0]?.id || "");
    }).catch((e) => setMsg(e.message));
  }, [id]);
  if (!product) return <div className="nc-shell" style={{ padding: 28 }}>{msg || t("common.loading")}</div>;
  const variant = (product.variants || []).find((v) => v.id === variantId);
  const price = variant ? variant.price : product.price;
  const available = variant ? variant.available : product.available;
  const add = () => {
    const amount = product.sellBy === "WEIGHT" ? Math.round(Number(qty) * 1000) : Math.floor(Number(qty) || 1);
    if (!Number.isFinite(amount) || amount < 1 || amount > available) {
      setMsg(t("shop.unavailable"));
      return;
    }
    const cart = readCart().filter((line) => !(line.productId === product.id && line.variantId === (variant?.id || null)));
    cart.push({
      productId: product.id,
      variantId: variant?.id || null,
      name: product.name,
      nameEn: product.nameEn,
      variantLabel: variant?.label || "",
      sellBy: product.sellBy,
      houseDeliveryFee: product.isPetHouse ? Number(product.houseDeliveryFee || 0) : 0,
      price,
      quantity: amount,
    });
    writeCart(cart);
    setMsg(t("shop.added"));
  };
  return (
    <div className="site-flow">
      <Link className="ref-inline-link" to={product.isPetHouse ? "/pet-houses" : "/shop"}>{t("shop.back")}</Link>
      <div className="site-flow__grid">
        <div className="site-flow__photos">
          {(product.images || []).map((url) => <img key={url} src={url} alt="" />)}
        </div>
        <div className="site-flow__card">
          <h1>{locale === "en" ? product.nameEn || product.name : product.name}</h1>
          <p className="site-flow__lead">{locale === "en" ? product.descriptionEn || product.description : product.description}</p>
          <div className="site-flow__total"><span>{money(price)} QAR {product.sellBy === "WEIGHT" ? t("pos.perKg") : ""}</span><span>{product.takesStock === false || available > 0 ? t("shop.available") : t("shop.unavailable")}</span></div>
          {product.isPetHouse ? <p>{t("shop.leadTime")}: {product.leadTimeDays || 0} · {t("shop.houseFee")} {money(product.houseDeliveryFee)}</p> : null}
          {product.variants?.length ? (
            <label className="site-flow__field">
              <span>{locale === "en" ? "Option" : "الخيار"}</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {locale === "en" ? v.labelEn || v.label : v.label} · {money(v.price)} · {v.available}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="site-flow__field"><span>{locale === "en" ? "Quantity" : "الكمية"}</span><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" /></label>
          <button type="button" className="button button--primary" onClick={add} disabled={available < 1}>{t("shop.add")}</button>
          {msg ? <div className={msg === t("shop.added") ? "site-flow__alert site-flow__alert--ok" : "site-flow__alert"}>{msg}</div> : null}
          <Link className="button button--secondary" to="/shop/checkout">{t("shop.cart")}</Link>
        </div>
      </div>
    </div>
  );
}

export function ShopCheckout() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [cart, setCart] = useState(readCart);
  const [meta, setMeta] = useState(null);
  const [fulfillment, setFulfillment] = useState("DELIVERY");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", areaId: "", windowId: "", deliveryDate: "", lat: "", lng: "", code: "" });
  const [windows, setWindows] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    shopApi("/api/shop/meta").then(setMeta).catch(() => {});
  }, []);
  useEffect(() => {
    if (fulfillment !== "DELIVERY" || !form.deliveryDate) {
      setWindows([]);
      return;
    }
    shopApi(`/api/shop/windows?date=${form.deliveryDate}`).then(setWindows).catch(() => setWindows([]));
  }, [fulfillment, form.deliveryDate]);
  const goods = useMemo(() => cart.reduce((sum, line) => sum + lineTotal(line), 0), [cart]);
  const areaFee = meta?.areas?.find((a) => a.id === form.areaId)?.fee || 0;
  const houseFee = fulfillment === "DELIVERY"
    ? cart.reduce((sum, line) => sum + Number(line.houseDeliveryFee || 0) * (line.sellBy === "WEIGHT" ? 1 : Number(line.quantity) || 1), 0)
    : 0;
  const fee = areaFee + houseFee;
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const result = await shopApi("/api/shop/checkout", {
        method: "POST",
        body: {
          ...form,
          fulfillment,
          locale: locale === "en" ? "en" : "ar",
          code: form.code,
          items: cart.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
          })),
        },
      });
      writeCart([]);
      if (result.payUrl) window.location.href = result.payUrl;
      else navigate(`/shop/orders/${result.orderId}`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form className="site-flow" onSubmit={pay}>
      <p className="eyebrow">{t("shop.checkout")}</p>
      <h1>{t("shop.checkout")}</h1>
      <div className="site-flow__grid">
        <div className="site-flow__card">
          <div className="site-flow__choice" role="group" aria-label={t("shop.checkout")}>
            <button type="button" className={fulfillment === "DELIVERY" ? "is-active" : ""} onClick={() => setFulfillment("DELIVERY")}>{t("shop.delivery")}</button>
            <button type="button" className={fulfillment === "PICKUP" ? "is-active" : ""} onClick={() => setFulfillment("PICKUP")}>{t("shop.pickup")}</button>
          </div>
          <div className="site-flow__pair">
            <label className="site-flow__field"><span>{t("customers.name")}</span><input required value={form.name} onChange={set("name")} /></label>
            <label className="site-flow__field"><span>{t("customers.phone")}</span><input required value={form.phone} onChange={set("phone")} /></label>
          </div>
          <label className="site-flow__field"><span>{t("customers.email")}</span><input required type="email" value={form.email} onChange={set("email")} /></label>
          <label className="site-flow__field"><span>{t("shop.code")}</span><input value={form.code} onChange={set("code")} /></label>
          {fulfillment === "DELIVERY" ? (
            <>
              <label className="site-flow__field"><span>{t("shop.address")}</span><textarea required value={form.address} onChange={set("address")} /></label>
              <div className="site-flow__pair">
                <label className="site-flow__field"><span>{t("shop.area")}</span>
                  <select value={form.areaId} onChange={set("areaId")}>
                    <option value="">{t("shop.area")}</option>
                    {(meta?.areas || []).map((area) => <option key={area.id} value={area.id}>{[area.city, locale === "en" ? area.nameEn || area.name : area.name].filter(Boolean).join(" · ")} · {money(area.fee)}</option>)}
                  </select>
                </label>
                <label className="site-flow__field"><span>{t("shop.window")}</span><input type="date" required value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value, windowId: "" })} /></label>
              </div>
              <label className="site-flow__field"><span>{t("shop.window")}</span>
                <select required value={form.windowId} onChange={set("windowId")}>
                  <option value="">{t("shop.window")}</option>
                  {windows.filter((row) => row.seatsLeft > 0).map((row) => (
                    <option key={row.id} value={row.id}>{locale === "en" ? row.labelEn || row.label : row.label} · {row.startTime}-{row.endTime} · {row.seatsLeft}</option>
                  ))}
                </select>
              </label>
              <div className="site-flow__pair">
                <label className="site-flow__field"><span>{t("shop.pinLat")}</span><input value={form.lat} onChange={set("lat")} /></label>
                <label className="site-flow__field"><span>{t("shop.pinLng")}</span><input value={form.lng} onChange={set("lng")} /></label>
              </div>
            </>
          ) : null}
        </div>
        <aside className="site-flow__card">
          {cart.length === 0 ? <p className="site-flow__lead">{t("shop.emptyCart")}</p> : (
            <CartLines cart={cart} onChange={(rows) => { writeCart(rows); setCart(rows); }} />
          )}
          <div className="site-flow__line"><span>{t("shop.goods")}</span><span>{money(goods)} QAR</span></div>
          <div className="site-flow__total"><span>{t("shop.fee")}</span><span>{money(fulfillment === "DELIVERY" ? fee : 0)} QAR</span></div>
          <button className="button button--primary" type="submit" disabled={busy || !cart.length}>{busy ? t("common.loading") : t("shop.pay")}</button>
          {msg ? <div className="site-flow__alert">{msg}</div> : null}
        </aside>
      </div>
    </form>
  );
}

export function ShopAccount() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [pet, setPet] = useState({ name: "", breed: "", ageText: "" });
  const [address, setAddress] = useState({ line1: "", area: "", city: "Doha" });
  const loadMe = () => shopApi("/api/shop/me").then(setMe).catch(() => setMe(null));
  useEffect(() => { loadMe(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      if (mode === "register") {
        const result = await api("/api/shop/register", { method: "POST", body: { ...form, locale: locale === "en" ? "en" : "ar" } });
        setMsgOk(true);
        setMsg(result.verifyLink ? result.verifyLink : t("shop.checkEmail"));
        return;
      }
      if (mode === "forgot") {
        const result = await api("/api/shop/forgot", { method: "POST", body: { email: form.email, locale: locale === "en" ? "en" : "ar" } });
        setMsgOk(true);
        setMsg(result.resetLink || t("shop.resetSent"));
        return;
      }
      const result = await api("/api/shop/login", { method: "POST", body: { email: form.email, password: form.password } });
      localStorage.setItem(TOKEN_KEY, result.token);
      await loadMe();
    } catch (err) {
      setMsgOk(false);
      setMsg(err.message);
    }
  };
  return (
    <div className="site-flow site-flow--narrow">
      <p className="eyebrow">{t("shop.account")}</p>
      <h1>{t("shop.account")}</h1>
      {me ? (
        <>
          <div className="site-flow__card">
            <strong>{me.name}</strong>
            <span>{me.email}</span>
            <div className="site-flow__links">
              <Link to="/shop/orders">{t("shop.orders")}</Link>
              <Link to="/grooming">{t("shop.grooming")}</Link>
              <Link to="/pet-houses">{t("shop.houses")}</Link>
              <Link to="/shop/relocation">{t("shop.relocation")}</Link>
            </div>
            <button className="button button--secondary" type="button" onClick={() => { localStorage.removeItem(TOKEN_KEY); setMe(null); }}>{t("shop.signOut")}</button>
          </div>
          <section className="site-flow__card">
            <h2>{t("shop.pets")}</h2>
            <div className="site-flow__list">
              {(me.pets || []).map((row) => <div className="site-flow__item" key={row.id}><span>{row.name}</span><span>{[row.breed, row.ageText].filter(Boolean).join(" · ")}</span></div>)}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); await shopApi("/api/shop/me/pets", { method: "POST", body: pet }); setPet({ name: "", breed: "", ageText: "" }); await loadMe(); }}>
              <label className="site-flow__field"><span>{t("shop.petName")}</span><input required value={pet.name} onChange={(e) => setPet({ ...pet, name: e.target.value })} /></label>
              <div className="site-flow__pair">
                <label className="site-flow__field"><span>{t("shop.breed")}</span><input value={pet.breed} onChange={(e) => setPet({ ...pet, breed: e.target.value })} /></label>
                <label className="site-flow__field"><span>{t("shop.age")}</span><input value={pet.ageText} onChange={(e) => setPet({ ...pet, ageText: e.target.value })} /></label>
              </div>
              <button className="button button--primary" type="submit">{t("common.add")}</button>
            </form>
          </section>
          <section className="site-flow__card">
            <h2>{t("shop.addresses")}</h2>
            <div className="site-flow__list">
              {(me.addresses || []).map((row) => <div className="site-flow__item" key={row.id}><span>{row.line1}</span><span>{row.area}</span></div>)}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); await shopApi("/api/shop/me/addresses", { method: "POST", body: address }); setAddress({ line1: "", area: "", city: "Doha" }); await loadMe(); }}>
              <label className="site-flow__field"><span>{t("shop.address")}</span><input required value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} /></label>
              <label className="site-flow__field"><span>{t("shop.area")}</span><input value={address.area} onChange={(e) => setAddress({ ...address, area: e.target.value })} /></label>
              <button className="button button--primary" type="submit">{t("common.add")}</button>
            </form>
          </section>
        </>
      ) : (
        <form className="site-flow__card" onSubmit={submit}>
          <div className="site-flow__choice" role="group">
            <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>{t("shop.signIn")}</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => setMode("register")}>{t("shop.register")}</button>
          </div>
          {mode === "register" ? <label className="site-flow__field"><span>{t("customers.name")}</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label> : null}
          <label className="site-flow__field"><span>{t("customers.email")}</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          {mode === "forgot" ? null : <label className="site-flow__field"><span>{t("shop.password")}</span><input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}
          {mode === "register" ? <label className="site-flow__field"><span>{t("customers.phone")}</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label> : null}
          <button className="button button--primary" type="submit">{mode === "register" ? t("shop.register") : mode === "forgot" ? t("shop.reset") : t("shop.signIn")}</button>
          <div className="site-flow__links">
            {mode === "forgot" ? <button type="button" onClick={() => setMode("login")}>{t("shop.signIn")}</button> : <button type="button" onClick={() => setMode("forgot")}>{t("shop.forgot")}</button>}
          </div>
        </form>
      )}
      {msg ? <div className={msgOk ? "site-flow__alert site-flow__alert--ok" : "site-flow__alert"}>{msg}</div> : null}
    </div>
  );
}

export function ShopVerify() {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const [msg, setMsg] = useState(t("common.loading"));
  useEffect(() => {
    const token = params.get("token");
    api("/api/shop/verify", { method: "POST", body: { token } })
      .then((result) => {
        localStorage.setItem(TOKEN_KEY, result.token);
        setMsg(t("shop.verified"));
      })
      .catch((e) => setMsg(e.message));
  }, [params, t]);
  return (
    <div className="site-flow site-flow--narrow">
      <div className="site-flow__card">
        <h1>{t("shop.account")}</h1>
        <p className={msg === t("shop.verified") ? "site-flow__alert site-flow__alert--ok" : "site-flow__lead"}>{msg}</p>
        <Link className="button button--primary" to="/shop/account">{t("shop.account")}</Link>
      </div>
    </div>
  );
}

export function ShopReset() {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form className="site-flow site-flow--narrow" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await api("/api/shop/reset", { method: "POST", body: { token: params.get("token"), password } });
        setMsg(t("shop.resetDone"));
      } catch (err) {
        setMsg(err.message);
      }
    }}>
      <p className="eyebrow">{t("shop.account")}</p>
      <h1>{t("shop.reset")}</h1>
      <div className="site-flow__card">
        <label className="site-flow__field"><span>{t("shop.newPassword")}</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="button button--primary" type="submit">{t("common.save")}</button>
        {msg ? <div className={msg === t("shop.resetDone") ? "site-flow__alert site-flow__alert--ok" : "site-flow__alert"}>{msg}</div> : null}
        <Link to="/shop/account">{t("shop.signIn")}</Link>
      </div>
    </form>
  );
}

export function ShopOrders() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [one, setOne] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (id) shopApi(`/api/shop/orders/${id}`).then(setOne).catch((e) => setMsg(e.message));
    else shopApi("/api/shop/orders").then(setRows).catch((e) => setMsg(e.message));
  }, [id]);
  const cancel = async () => {
    await shopApi(`/api/shop/orders/${id}/cancel`, { method: "POST", body: {} });
    const next = await shopApi(`/api/shop/orders/${id}`);
    setOne(next);
  };
  if (id) {
    return (
      <div className="nc-shell" style={{ padding: 28 }}>
        {one ? (
          <>
            <h1>{statusLabel("order", one.status, locale)}</h1>
            {one.createdAt ? <div>{formatDateTime(one.createdAt, locale)}</div> : null}
            <div>{money(one.total)} QAR · {statusLabel("fulfillment", one.fulfillment, locale)}</div>
            {(one.items || []).map((item, index) => (
              <div key={index}>{locale === "en" ? item.nameEn || item.name : item.name} · {item.sellBy === "WEIGHT" ? `${item.quantity / 1000} kg` : item.quantity}</div>
            ))}
            {one.status === "CONFIRMED" ? <button type="button" onClick={cancel}>{t("shop.cancelOrder")}</button> : null}
          </>
        ) : <p>{msg || t("common.loading")}</p>}
        <Link to="/shop/orders">{t("shop.orders")}</Link>
      </div>
    );
  }
  return (
    <div className="nc-shell" style={{ padding: 28 }}>
      <h1>{t("shop.orders")}</h1>
      {rows.map((row) => <div key={row.id}><Link to={`/shop/orders/${row.id}`}>{statusLabel("order", row.status, locale)} · {money(row.total)} QAR{row.createdAt ? ` · ${formatDateTime(row.createdAt, locale)}` : ""}</Link></div>)}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
