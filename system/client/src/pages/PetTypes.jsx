import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function PetTypes() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", nameEn: "" });
  const [areas, setAreas] = useState([]);
  const [windows, setWindows] = useState([]);
  const [area, setArea] = useState({ name: "", nameEn: "", city: "", fee: "0" });
  const [windowForm, setWindowForm] = useState({ label: "", labelEn: "", startTime: "10:00", endTime: "13:00", seats: "4", weekday: "" });
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const load = async () => {
    const [petRows, areaRows, windowRows] = await Promise.all([
      api("/api/pet-types"),
      api("/api/delivery-setup/areas"),
      api("/api/delivery-setup/windows"),
    ]);
    setRows(petRows);
    setAreas(areaRows);
    setWindows(windowRows);
  };
  useEffect(() => { load().catch(() => {}); }, []);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("shop.catalogueSetup")}</h1>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); api("/api/pet-types", { method: "POST", body: form }).then(() => { setForm({ name: "", nameEn: "" }); return load(); }); }}>
        <strong>{t("products.petTypes")}</strong>
        <input required placeholder={t("products.nameArField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required placeholder={t("products.nameEnField")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {rows.map((row) => <div key={row.id}>{row.name} · {row.nameEn}</div>)}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); api("/api/delivery-setup/areas", { method: "POST", body: { ...area, fee: Number(area.fee) } }).then(() => load()); }}>
        <strong>{t("shop.area")}</strong>
        <input required placeholder={t("products.nameArField")} value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} />
        <input placeholder={t("products.nameEnField")} value={area.nameEn} onChange={(e) => setArea({ ...area, nameEn: e.target.value })} />
        <input placeholder={t("shop.city")} value={area.city} onChange={(e) => setArea({ ...area, city: e.target.value })} />
        <input type="number" min="0" step="0.01" value={area.fee} onChange={(e) => setArea({ ...area, fee: e.target.value })} />
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {areas.map((row) => <div key={row.id}>{row.city ? `${row.city} · ` : ""}{row.name} · {Number(row.fee).toFixed(2)}</div>)}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); api("/api/delivery-setup/windows", { method: "POST", body: { ...windowForm, seats: Number(windowForm.seats), weekday: windowForm.weekday === "" ? null : Number(windowForm.weekday) } }).then(() => load()); }}>
        <strong>{t("shop.window")}</strong>
        <input required value={windowForm.label} onChange={(e) => setWindowForm({ ...windowForm, label: e.target.value })} placeholder={t("products.nameArField")} />
        <input value={windowForm.labelEn} onChange={(e) => setWindowForm({ ...windowForm, labelEn: e.target.value })} placeholder={t("products.nameEnField")} />
        <input value={windowForm.startTime} onChange={(e) => setWindowForm({ ...windowForm, startTime: e.target.value })} />
        <input value={windowForm.endTime} onChange={(e) => setWindowForm({ ...windowForm, endTime: e.target.value })} />
        <input type="number" min="1" value={windowForm.seats} onChange={(e) => setWindowForm({ ...windowForm, seats: e.target.value })} />
        <select value={windowForm.weekday} onChange={(e) => setWindowForm({ ...windowForm, weekday: e.target.value })}>
          <option value="">{t("shop.anyDay")}</option>
          {days.map((day, index) => <option key={day} value={index}>{day}</option>)}
        </select>
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {windows.map((row) => <div key={row.id}>{row.label} · {row.weekday == null ? t("shop.anyDay") : days[row.weekday]} · {row.startTime}-{row.endTime} · {row.seats}</div>)}
      </form>
    </div>
  );
}
