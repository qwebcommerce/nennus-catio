import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

const TOKEN_KEY = "nennus.shopToken";

function shopApi(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api(path, { ...options, headers });
}

export function ShopGrooming() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    shopApi("/api/shop/grooming/packages").then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 12 }}>
      <h1>{t("shop.grooming")}</h1>
      {rows.map((row) => (
        <Link key={row.id} to={`/shop/grooming/${row.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>{locale === "en" ? row.nameEn || row.name : row.name}</strong>
          <div>{Number(row.price).toFixed(2)} QAR · {row.durationMin} {t("shop.minutes")}</div>
          <p>{locale === "en" ? row.includedEn || row.included : row.included}</p>
        </Link>
      ))}
      <Link to="/shop/grooming/bookings">{t("shop.myBookings")}</Link>
    </div>
  );
}

export function ShopGroomingBook() {
  const { packageId } = useParams();
  const { t, locale } = useI18n();
  const [pack, setPack] = useState(null);
  const [meta, setMeta] = useState(null);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({
    date: "", startAt: "", endAt: "", visitKind: "SHOP", name: "", email: "", phone: "",
    petName: "", breed: "", ageText: "", areaId: "", address: "", code: "",
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    shopApi(`/api/shop/grooming/packages/${packageId}`).then(setPack).catch((e) => setMsg(e.message));
    shopApi("/api/shop/meta").then(setMeta).catch(() => {});
  }, [packageId]);
  useEffect(() => {
    if (!form.date) return;
    shopApi(`/api/shop/grooming/availability?packageId=${packageId}&date=${form.date}`).then(setSlots).catch(() => setSlots([]));
  }, [packageId, form.date]);
  const pay = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const result = await shopApi("/api/shop/grooming/book", { method: "POST", body: { ...form, packageId } });
      if (result.payUrl) window.location.href = result.payUrl;
    } catch (err) {
      setMsg(err.message);
    }
  };
  if (!pack) return <div className="site-flow site-flow--narrow"><p className="site-flow__lead">{msg || t("common.loading")}</p></div>;
  const homeFee = form.visitKind === "HOME" ? Number(pack.homeVisitFee || 0) : 0;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form className="site-flow site-flow--narrow" onSubmit={pay}>
      <Link className="ref-inline-link" to="/grooming">{t("shop.grooming")}</Link>
      <h1>{locale === "en" ? pack.nameEn || pack.name : pack.name}</h1>
      <p className="site-flow__lead">{locale === "en" ? pack.includedEn || pack.included : pack.included}</p>
      <div className="site-flow__card">
        <div className="site-flow__total"><span>{t("shop.pay")}</span><span>{(Number(pack.price) + homeFee).toFixed(2)} QAR</span></div>
        <div className="site-flow__choice" role="group">
          <button type="button" className={form.visitKind === "SHOP" ? "is-active" : ""} onClick={() => setForm({ ...form, visitKind: "SHOP" })}>{t("shop.atShop")}</button>
          <button type="button" className={form.visitKind === "HOME" ? "is-active" : ""} onClick={() => setForm({ ...form, visitKind: "HOME" })}>{t("shop.homeVisit")}</button>
        </div>
        <div className="site-flow__pair">
          <label className="site-flow__field"><span>{t("shop.window")}</span><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, startAt: "", endAt: "" })} /></label>
          <label className="site-flow__field"><span>{t("shop.window")}</span>
            <select required value={form.startAt} onChange={(e) => {
              const slot = slots.find((row) => row.startAt === e.target.value);
              setForm({ ...form, startAt: slot?.startAt || "", endAt: slot?.endAt || "" });
            }}>
              <option value="">{t("shop.window")}</option>
              {slots.map((slot) => <option key={slot.startAt} value={slot.startAt}>{new Date(slot.startAt).toLocaleTimeString()} · {slot.seatsLeft}</option>)}
            </select>
          </label>
        </div>
        {form.visitKind === "HOME" ? (
          <>
            <label className="site-flow__field"><span>{t("shop.area")}</span>
              <select required value={form.areaId} onChange={set("areaId")}>
                <option value="">{t("shop.area")}</option>
                {(meta?.areas || []).map((area) => <option key={area.id} value={area.id}>{area.city ? `${area.city} · ` : ""}{area.name}</option>)}
              </select>
            </label>
            <label className="site-flow__field"><span>{t("shop.address")}</span><textarea required value={form.address} onChange={set("address")} /></label>
          </>
        ) : null}
        <div className="site-flow__pair">
          <label className="site-flow__field"><span>{t("customers.name")}</span><input required value={form.name} onChange={set("name")} /></label>
          <label className="site-flow__field"><span>{t("customers.phone")}</span><input required value={form.phone} onChange={set("phone")} /></label>
        </div>
        <label className="site-flow__field"><span>{t("customers.email")}</span><input required type="email" value={form.email} onChange={set("email")} /></label>
        <div className="site-flow__pair">
          <label className="site-flow__field"><span>{t("shop.petName")}</span><input required value={form.petName} onChange={set("petName")} /></label>
          <label className="site-flow__field"><span>{t("shop.breed")}</span><input required value={form.breed} onChange={set("breed")} /></label>
        </div>
        <label className="site-flow__field"><span>{t("shop.age")}</span><input required value={form.ageText} onChange={set("ageText")} /></label>
        <label className="site-flow__field"><span>{t("shop.code")}</span><input value={form.code} onChange={set("code")} /></label>
        <button className="button button--primary" type="submit">{t("shop.pay")}</button>
        {msg ? <div className="site-flow__alert">{msg}</div> : null}
      </div>
    </form>
  );
}

export function ShopBookings() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [one, setOne] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => {
    if (id) shopApi(`/api/shop/grooming/bookings/${id}`).then(setOne).catch((e) => setMsg(e.message));
    else shopApi("/api/shop/grooming/bookings").then(setRows).catch((e) => setMsg(e.message));
  };
  useEffect(() => { load(); }, [id]);
  const cancel = (bookingId) => shopApi(`/api/shop/grooming/bookings/${bookingId}/cancel`, { method: "POST", body: {} }).then(load).catch((e) => setMsg(e.message));
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 10 }}>
      <h1>{t("shop.myBookings")}</h1>
      {one ? (
        <article className="card">
          <strong>{locale === "en" ? one.package?.nameEn || one.package?.name : one.package?.name}</strong>
          <div>{one.status} · {new Date(one.startAt).toLocaleString()}</div>
          <div>{Number(one.amount).toFixed(2)} QAR</div>
          {one.status === "CONFIRMED" ? <button type="button" onClick={() => cancel(one.id)}>{t("shop.cancelOrder")}</button> : null}
        </article>
      ) : rows.map((row) => (
        <Link key={row.id} to={`/shop/grooming/bookings/${row.id}`}>{row.status} · {new Date(row.startAt).toLocaleString()}</Link>
      ))}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}

export function ShopHouses() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    shopApi("/api/shop/catalog?houses=1").then(setRows).catch(() => setRows([]));
    shopApi("/api/shop/meta").then(setMeta).catch(() => {});
  }, []);
  const digits = String(meta?.whatsappNumber || "").replace(/[^\d]/g, "");
  const text = encodeURIComponent(locale === "en" ? "I would like a custom pet house." : "أود الاستفسار عن بيت حيوان حسب الطلب.");
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 12 }}>
      <h1>{t("shop.houses")}</h1>
      {digits ? (
        <a className="btn-touch" href={`https://wa.me/${digits}?text=${text}`} target="_blank" rel="noreferrer">{t("shop.customHouse")}</a>
      ) : <p>{t("shop.whatsappMissing")}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {rows.map((product) => (
          <Link key={product.id} to={`/shop/product/${product.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <strong>{locale === "en" ? product.nameEn || product.name : product.name}</strong>
            <div>{Number(product.price).toFixed(2)} QAR</div>
            <div>{t("shop.leadTime")}: {product.leadTimeDays || 0}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ShopRelocation() {
  const { id } = useParams();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [one, setOne] = useState(null);
  const [form, setForm] = useState({ destination: "", petSummary: "" });
  const [files, setFiles] = useState([]);
  const [msg, setMsg] = useState("");
  const load = () => {
    if (id) shopApi(`/api/shop/relocation/${id}`).then(setOne).catch((e) => setMsg(e.message));
    else shopApi("/api/shop/relocation").then(setRows).catch((e) => setMsg(e.message));
  };
  useEffect(() => { load(); }, [id]);
  const readFiles = async (list) => {
    const docs = [];
    for (const file of list) {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      docs.push({ fileName: file.name, mime: file.type || "application/octet-stream", dataBase64 });
    }
    return docs;
  };
  const submit = async (e) => {
    e.preventDefault();
    try {
      await shopApi("/api/shop/relocation", { method: "POST", body: { ...form, documents: await readFiles(files) } });
      setForm({ destination: "", petSummary: "" });
      setFiles([]);
      load();
    } catch (err) {
      setMsg(err.message);
    }
  };
  return (
    <div className="site-flow site-flow--narrow">
      <p className="eyebrow">{t("shop.relocation")}</p>
      <h1>{t("shop.relocation")}</h1>
      {!localStorage.getItem(TOKEN_KEY) ? (
        <div className="site-flow__card">
          <p className="site-flow__lead">{t("shop.signInToContinue")}</p>
          <Link className="button button--primary" to="/shop/account">{t("shop.signIn")}</Link>
        </div>
      ) : null}
      {one ? (
        <article className="site-flow__card">
          <h2>{one.destination}</h2>
          <div className="site-flow__total"><span>{one.status}</span>{one.quoteAmount != null ? <span>{Number(one.quoteAmount).toFixed(2)} QAR</span> : null}</div>
          {one.quoteNote ? <p className="site-flow__lead">{one.quoteNote}</p> : null}
          <div className="site-flow__list">
            {(one.history || []).map((entry, index) => <div className="site-flow__item" key={index}><span>{entry.status}</span><span>{entry.note}</span></div>)}
          </div>
          {one.status === "QUOTE_SENT" ? <button className="button button--primary" type="button" onClick={() => shopApi(`/api/shop/relocation/${one.id}/pay`, { method: "POST", body: {} }).then((r) => { if (r.payUrl) window.location.href = r.payUrl; }).catch((e) => setMsg(e.message))}>{t("shop.pay")}</button> : null}
        </article>
      ) : (
        <>
          <form className="site-flow__card" onSubmit={submit}>
            <label className="site-flow__field"><span>{t("shop.destination")}</span><input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
            <label className="site-flow__field"><span>{t("shop.pets")}</span><textarea required value={form.petSummary} onChange={(e) => setForm({ ...form, petSummary: e.target.value })} /></label>
            <label className="site-flow__field"><span>{t("shop.documents")}</span><input required type="file" multiple onChange={(e) => setFiles([...e.target.files])} /></label>
            <button className="button button--primary" type="submit">{t("common.add")}</button>
          </form>
          <div className="site-flow__list">
            {rows.map((row) => <Link key={row.id} to={`/shop/relocation/${row.id}`}><span>{row.destination}</span><span>{row.status}</span></Link>)}
          </div>
        </>
      )}
      {msg ? <div className="site-flow__alert">{msg}</div> : null}
    </div>
  );
}
