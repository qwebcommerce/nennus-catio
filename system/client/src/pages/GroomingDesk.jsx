import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const inp = { width: "100%", boxSizing: "border-box", minWidth: 0 };
const fld = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" };
const rowStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };

export default function GroomingDesk() {
  const { t, locale } = useI18n();
  const DAYS = locale === "en" ? DAYS_EN : DAYS_AR;
  const branchId = useActiveBranchId();
  const [packages, setPackages] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [petTypes, setPetTypes] = useState([]);
  const emptyForm = { name: "", nameEn: "", price: "", durationMin: "60", included: "", includedEn: "" };
  const emptySlot = { weekday: "0", startTime: "09:00", endTime: "17:00", capacity: "1" };
  const [form, setForm] = useState(emptyForm);
  const [slot, setSlot] = useState(emptySlot);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const q = new URLSearchParams({ all: "1", ...(branchId ? { branchId } : {}) });
    const [services, rows, pets] = await Promise.all([
      api(`/api/appointments/services?${q}`),
      api("/api/appointments/schedule"),
      api("/api/pet-types"),
    ]);
    setPackages(services);
    setSchedule(rows);
    setPetTypes(pets);
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [branchId]);
  /** Every action reports success or the server's reason at the top; a stale copy reloads. */
  const run = (promise, done = t("shop.saved")) =>
    promise
      .then(() => { setMsg(done); return load(); })
      .catch((e) => { setMsg(editErrorMessage(e, t) || e.message); if (isStaleEdit(e)) load().catch(() => {}); });
  const editPrice = (row) => {
    const price = window.prompt(`${t("groom.pricePrompt")} — ${locale === "en" ? row.nameEn || row.name : row.name}`, Number(row.price).toFixed(2));
    if (price == null || price === "") return;
    run(api(`/api/appointments/services/${row.id}`, { method: "PATCH", body: { price: Number(price), version: row.version } }));
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("shop.grooming")}</h1>
      {msg ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{msg}</div> : null}
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => {
        e.preventDefault();
        setMsg("");
        run(
          api("/api/appointments/services", {
            method: "POST",
            body: { ...form, branchId, price: Number(form.price), durationMin: Number(form.durationMin), petTypeIds: petTypes.filter((row) => row.isActive !== false).map((row) => row.id) },
          }).then(() => setForm(emptyForm)),
          t("setup.added"),
        );
      }}>
        <strong>{t("shop.package")}</strong>
        <div style={grid}>
          <label style={fld}><span>{t("products.nameArField")}</span><input style={inp} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label style={fld}><span>{t("products.nameEnField")}</span><input style={inp} required value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></label>
          <label style={fld}><span>{t("products.price")}</span><input style={inp} required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label style={fld}><span>{t("groom.duration")}</span><input style={inp} required type="number" min="10" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} /></label>
        </div>
        <label style={fld}><span>{t("shop.included")}</span><textarea style={inp} value={form.included} onChange={(e) => setForm({ ...form, included: e.target.value })} /></label>
        <label style={fld}><span>{t("shop.includedEn")}</span><textarea style={inp} value={form.includedEn} onChange={(e) => setForm({ ...form, includedEn: e.target.value })} /></label>
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {packages.map((row) => (
          <div key={row.id} style={{ ...rowStyle, opacity: row.active === false ? 0.55 : 1 }}>
            <span>{row.name} · {row.nameEn || ""} · {Number(row.price).toFixed(2)} · {row.durationMin}′{row.active === false ? ` · ${t("setup.inactive")}` : ""}</span>
            <button type="button" onClick={() => editPrice(row)}>{t("groom.editPrice")}</button>
            <button type="button" onClick={() => run(api(`/api/appointments/services/${row.id}`, { method: "PATCH", body: { active: row.active === false, version: row.version } }))}>
              {row.active === false ? t("shop.activate") : t("shop.deactivate")}
            </button>
          </div>
        ))}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => {
        e.preventDefault();
        setMsg("");
        run(
          api("/api/appointments/schedule", { method: "POST", body: { ...slot, weekday: Number(slot.weekday), capacity: Number(slot.capacity) } }).then(() => setSlot(emptySlot)),
          t("setup.added"),
        );
      }}>
        <strong>{t("shop.groomingHours")}</strong>
        <div style={grid}>
          <label style={fld}>
            <span>{t("setup.weekday")}</span>
            <select style={inp} value={slot.weekday} onChange={(e) => setSlot({ ...slot, weekday: e.target.value })}>
              {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label style={fld}><span>{t("setup.startTime")}</span><input style={inp} type="time" required value={slot.startTime} onChange={(e) => setSlot({ ...slot, startTime: e.target.value })} /></label>
          <label style={fld}><span>{t("setup.endTime")}</span><input style={inp} type="time" required value={slot.endTime} onChange={(e) => setSlot({ ...slot, endTime: e.target.value })} /></label>
          <label style={fld}><span>{t("groom.capacity")}</span><input style={inp} type="number" min="1" value={slot.capacity} onChange={(e) => setSlot({ ...slot, capacity: e.target.value })} /></label>
        </div>
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {schedule.map((row) => (
          <div key={row.id} style={{ ...rowStyle, opacity: row.isActive === false ? 0.55 : 1 }}>
            <span>{DAYS[row.weekday]} · {row.startTime}-{row.endTime} · {row.capacity}{row.isActive === false ? ` · ${t("setup.inactive")}` : ""}</span>
            <button type="button" onClick={() => run(api(`/api/appointments/schedule/${row.id}`, { method: "PATCH", body: { isActive: row.isActive === false, version: row.version } }))}>
              {row.isActive === false ? t("groom.reopen") : t("groom.close")}
            </button>
          </div>
        ))}
      </form>
    </div>
  );
}
