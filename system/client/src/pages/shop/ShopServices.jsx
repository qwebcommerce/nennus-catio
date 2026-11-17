import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";
import { qatarDateTime, qatarTime, qatarToday } from "../../utils/qatarTime.js";
import { statusLabel } from "../../utils/statusLabels.js";
import { formatDateTime } from "../../utils/qatarDate.js";

/** The customer session is an httpOnly cookie (nc_customer); api() sends credentials. */
function shopApi(path, options = {}) {
  return api(path, options);
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
    petName: "", breed: "", ageText: "", areaId: "", address: "", note: "", code: "",
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
      // The server sets the end time from the package; only the start is sent.
      const body = { ...form, note: form.visitKind === "HOME" ? form.note : "", packageId };
      delete body.endAt;
      const result = await shopApi("/api/shop/grooming/book", { method: "POST", body });
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
          <label className="site-flow__field"><span>{t("shop.bookDate")}</span><input type="date" required min={qatarToday()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, startAt: "", endAt: "" })} /></label>
          <label className="site-flow__field"><span>{t("shop.bookTime")}</span>
            <select required value={form.startAt} onChange={(e) => {
              const slot = slots.find((row) => row.startAt === e.target.value);
              setForm({ ...form, startAt: slot?.startAt || "", endAt: slot?.endAt || "" });
            }}>
              <option value="">{slots.length || !form.date ? t("shop.bookTime") : t("shop.noTimes")}</option>
              {slots.map((slot) => <option key={slot.startAt} value={slot.startAt}>{qatarTime(slot.startAt, locale)} · {slot.seatsLeft}</option>)}
            </select>
          </label>
        </div>
        {form.visitKind === "HOME" ? (
          <>
            <label className="site-flow__field"><span>{t("shop.area")}</span>
              <select required value={form.areaId} onChange={set("areaId")}>
                <option value="">{t("shop.area")}</option>
                {(meta?.areas || []).map((area) => <option key={area.id} value={area.id}>{area.city ? `${area.city} · ` : ""}{locale === "en" ? area.nameEn || area.name : area.name || area.nameEn}</option>)}
              </select>
            </label>
            <label className="site-flow__field"><span>{t("shop.address")}</span><textarea required value={form.address} onChange={set("address")} /></label>
            <label className="site-flow__field"><span>{t("shop.visitNote")}</span><textarea maxLength={1000} value={form.note} onChange={set("note")} /></label>
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

/** Back from SkipCash: the return URL carries ?id=<payment id>. The server looks it up itself (FR-76). */
function returnQuery() {
  const paymentId = new URLSearchParams(window.location.search).get("id");
  return paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : "";
}

export function ShopBookings() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [one, setOne] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => {
    if (id) shopApi(`/api/shop/grooming/bookings/${id}${returnQuery()}`).then(setOne).catch((e) => setMsg(e.message));
    else shopApi("/api/shop/grooming/bookings").then(setRows).catch((e) => setMsg(e.message));
  };
  useEffect(() => { load(); }, [id]);
  const cancel = (bookingId) => {
    if (!window.confirm(t("shop.confirmCancelBooking"))) return;
    shopApi(`/api/shop/grooming/bookings/${bookingId}/cancel`, { method: "POST", body: {} }).then(load).catch((e) => setMsg(e.message));
  };
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 10 }}>
      <h1>{t("shop.myBookings")}</h1>
      {one ? (
        <article className="card">
          <strong>{locale === "en" ? one.package?.nameEn || one.package?.name : one.package?.name}</strong>
          <div>{t("shop.reference")}: {one.reference}</div>
          <div>{statusLabel("booking", one.status, locale)} · {qatarDateTime(one.startAt, locale)} ({t("shop.qatarTime")})</div>
          <div>{Number(one.amount).toFixed(2)} QAR</div>
          {one.note ? <div>{t("shop.visitNote")}: {one.note}</div> : null}
          {one.canCancel ? (
            <>
              <div>{t("shop.cancelUntil")} {qatarDateTime(one.cancelUntil, locale)}</div>
              <button type="button" className="button button--secondary" onClick={() => cancel(one.id)}>{t("shop.cancelOrder")}</button>
            </>
          ) : null}
          {one.status === "CANCELLED" && one.paid ? <div>{t("shop.refundDue")}</div> : null}
        </article>
      ) : rows.map((row) => (
        <Link key={row.id} to={`/shop/grooming/bookings/${row.id}`}>{row.reference} · {statusLabel("booking", row.status, locale)} · {qatarDateTime(row.startAt, locale)}</Link>
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
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [one, setOne] = useState(null);
  const [form, setForm] = useState({ destination: "", petSummary: "" });
  const [files, setFiles] = useState([]);
  const [msg, setMsg] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  // With Supabase Storage on, files go straight from the browser to the private bucket (up to 10 MB each).
  const [directUpload, setDirectUpload] = useState(false);
  useEffect(() => {
    shopApi("/api/shop/meta").then((m) => setDirectUpload(Boolean(m?.directDocumentUpload))).catch(() => setDirectUpload(false));
  }, []);
  const onErr = (e) => {
    if (e?.status === 401) setSignedIn(false);
    else setMsg(e.message);
  };
  const load = () => {
    if (id) shopApi(`/api/shop/relocation/${id}${returnQuery()}`).then(setOne).catch(onErr);
    else shopApi("/api/shop/relocation").then(setRows).catch(onErr);
  };
  /** Documents open through a 5-minute signed link, downloaded as an attachment. */
  const downloadDoc = async (docId) => {
    try {
      const link = await shopApi(`/api/shop/relocation/${one.id}/documents/${docId}/link`, { method: "POST" });
      const a = document.createElement("a");
      a.href = `${import.meta.env.VITE_API_URL || ""}${link.url}`;
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    if (signedIn) load();
  }, [id, signedIn]);
  const readFiles = async (list) => {
    const docs = [];
    for (const file of list) {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error(t("shop.docUploadFailed")));
        reader.readAsDataURL(file);
      });
      docs.push({ fileName: file.name, mime: file.type || "application/octet-stream", dataBase64 });
    }
    return docs;
  };
  /** Direct upload: signed upload URL from the API, PUT to storage, then the API checks the file. */
  const uploadFiles = async (list) => {
    const docs = [];
    for (const file of list) {
      const ticket = await shopApi("/api/shop/relocation/uploads", {
        method: "POST",
        body: { fileName: file.name, mime: file.type || "application/octet-stream", size: file.size },
      });
      const put = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "false" },
        body: file,
      });
      if (!put.ok) {
        // Let the API see the failed upload so it cleans it up, then report.
        await shopApi(`/api/shop/relocation/uploads/${ticket.uploadId}/confirm`, { method: "POST" }).catch(() => {});
        throw new Error(file.size > ticket.maxBytes ? t("shop.docTooLarge") : t("shop.docUploadFailed"));
      }
      const checked = await shopApi(`/api/shop/relocation/uploads/${ticket.uploadId}/confirm`, { method: "POST" });
      docs.push({ uploadId: checked.uploadId });
    }
    return docs;
  };
  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const documents = directUpload ? await uploadFiles(files) : await readFiles(files);
      await shopApi("/api/shop/relocation", { method: "POST", body: { ...form, documents } });
      setForm({ destination: "", petSummary: "" });
      setFiles([]);
      e.target.reset?.();
      load();
      setMsg(t("shop.requestSent"));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="site-flow site-flow--narrow">
      <p className="eyebrow">{t("shop.relocation")}</p>
      <h1>{t("shop.relocation")}</h1>
      {!signedIn ? (
        <div className="site-flow__card">
          <p className="site-flow__lead">{t("shop.signInToContinue")}</p>
          <Link className="button button--primary" to="/shop/account">{t("shop.signIn")}</Link>
        </div>
      ) : null}
      {one ? (
        <article className="site-flow__card">
          <h2>{one.destination}</h2>
          <p className="site-flow__lead">{t("shop.reference")}: {one.reference}</p>
          <div className="site-flow__total"><span>{statusLabel("relocation", one.status, locale)}</span>{one.quoteAmount != null ? <span>{Number(one.quoteAmount).toFixed(2)} QAR</span> : null}</div>
          {one.quoteNote ? <p className="site-flow__lead">{one.quoteNote}</p> : null}
          <div className="site-flow__list">
            {(one.history || []).map((entry, index) => <div className="site-flow__item" key={index}><span>{statusLabel("relocation", entry.status, locale)}{entry.at ? ` · ${formatDateTime(entry.at, locale)}` : ""}</span><span>{entry.note}</span></div>)}
          </div>
          <div className="site-flow__list">
            {(one.documents || []).map((doc) => <button type="button" className="site-flow__item" key={doc.id} onClick={() => downloadDoc(doc.id)}><span>{doc.fileName}</span></button>)}
          </div>
          {one.status === "QUOTE_SENT" ? <button className="button button--primary" type="button" onClick={() => shopApi(`/api/shop/relocation/${one.id}/pay`, { method: "POST", body: {} }).then((r) => { if (r.payUrl) window.location.href = r.payUrl; }).catch((e) => setMsg(e.message))}>{t("shop.pay")}</button> : null}
        </article>
      ) : signedIn ? (
        <>
          <form className="site-flow__card" onSubmit={submit}>
            <label className="site-flow__field"><span>{t("shop.destination")}</span><input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
            <label className="site-flow__field"><span>{t("shop.pets")}</span><textarea required value={form.petSummary} onChange={(e) => setForm({ ...form, petSummary: e.target.value })} /></label>
            <label className="site-flow__field"><span>{t("shop.documents")}</span><input required type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFiles([...e.target.files])} /><small>{t(directUpload ? "shop.docTypesLarge" : "shop.docTypes")}</small></label>
            <button className="button button--primary" type="submit" disabled={busy}>{t("common.add")}</button>
          </form>
          <div className="site-flow__list">
            {rows.map((row) => <Link key={row.id} to={`/shop/relocation/${row.id}`}><span>{row.reference} · {row.destination}</span><span>{statusLabel("relocation", row.status, locale)}</span></Link>)}
          </div>
        </>
      ) : null}
      {msg ? <div className="site-flow__alert">{msg}</div> : null}
    </div>
  );
}
