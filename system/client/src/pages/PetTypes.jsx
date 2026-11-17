import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = { width: "100%", boxSizing: "border-box", minWidth: 0 };
const fld = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const grid = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" };
const rowStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };

export default function PetTypes() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", nameEn: "" });
  const [areas, setAreas] = useState([]);
  const [windows, setWindows] = useState([]);
  const emptyArea = { name: "", nameEn: "", city: "", fee: "0" };
  const emptyWindow = { label: "", labelEn: "", startTime: "10:00", endTime: "13:00", seats: "4", weekday: "" };
  const [area, setArea] = useState(emptyArea);
  const [windowForm, setWindowForm] = useState(emptyWindow);
  const days = locale === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const [msg, setMsg] = useState("");
  // NFR-13: every edit sends the version it was loaded at; a stale copy is reloaded.
  const fail = (e) => {
    setMsg(editErrorMessage(e, t));
    if (isStaleEdit(e)) load().catch(() => {});
  };
  const done = (text = t("shop.saved")) => { setMsg(text); return load(); };
  const editPetType = (row) => {
    const name = window.prompt(t("setup.renamePrompt"), row.name);
    if (name == null) return;
    const nameEn = window.prompt(t("setup.renamePromptEn"), row.nameEn);
    if (nameEn == null) return;
    api(`/api/pet-types/${row.id}`, { method: "PATCH", body: { name, nameEn, version: row.version } }).then(() => done()).catch(fail);
  };
  const togglePetType = (row) =>
    api(`/api/pet-types/${row.id}`, { method: "PATCH", body: { isActive: !row.isActive, version: row.version } }).then(() => done()).catch(fail);
  const editArea = (row) => {
    const fee = window.prompt(`${t("shop.edit")}: ${row.name} (QAR)`, String(Number(row.fee).toFixed(2)));
    if (fee == null) return;
    api(`/api/delivery-setup/areas/${row.id}`, { method: "PATCH", body: { fee: Number(fee), version: row.version } }).then(() => done()).catch(fail);
  };
  const toggleArea = (row) =>
    api(`/api/delivery-setup/areas/${row.id}`, { method: "PATCH", body: { isActive: !row.isActive, version: row.version } }).then(() => done()).catch(fail);
  const editWindow = (row) => {
    const text = window.prompt(`${t("shop.edit")}: ${row.label} (HH:MM-HH:MM seats)`, `${row.startTime}-${row.endTime} ${row.seats}`);
    if (!text) return;
    const m = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(\d+)\s*$/.exec(text);
    if (!m) return setMsg(t("shop.windowFormat"));
    api(`/api/delivery-setup/windows/${row.id}`, { method: "PATCH", body: { startTime: m[1], endTime: m[2], seats: Number(m[3]), version: row.version } }).then(() => done()).catch(fail);
  };
  const toggleWindow = (row) =>
    api(`/api/delivery-setup/windows/${row.id}`, { method: "PATCH", body: { isActive: !row.isActive, version: row.version } }).then(() => done()).catch(fail);
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
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("shop.catalogueSetup")}</h1>
      {msg ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{msg}</div> : null}
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); setMsg(""); api("/api/pet-types", { method: "POST", body: form }).then(() => { setForm({ name: "", nameEn: "" }); return done(t("setup.added")); }).catch(fail); }}>
        <strong>{t("products.petTypes")}</strong>
        <div style={grid}>
          <input style={inp} required aria-label={t("products.nameArField")} placeholder={t("products.nameArField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={inp} required aria-label={t("products.nameEnField")} placeholder={t("products.nameEnField")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <button className="btn-touch" type="submit">{t("common.add")}</button>
        </div>
        {rows.map((row) => (
          <div key={row.id} style={{ ...rowStyle, opacity: row.isActive === false ? 0.55 : 1 }}>
            <span>{row.name} · {row.nameEn}{row.isActive === false ? ` · ${t("shop.inactive")}` : ""}</span>
            <button type="button" onClick={() => editPetType(row)}>{t("shop.edit")}</button>
            <button type="button" onClick={() => togglePetType(row)}>{row.isActive === false ? t("shop.activate") : t("shop.deactivate")}</button>
          </div>
        ))}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); setMsg(""); api("/api/delivery-setup/areas", { method: "POST", body: { ...area, fee: Number(area.fee) } }).then(() => { setArea(emptyArea); return done(t("setup.added")); }).catch(fail); }}>
        <strong>{t("shop.area")}</strong>
        <div style={grid}>
          <label style={fld}><span>{t("products.nameArField")}</span><input style={inp} required value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} /></label>
          <label style={fld}><span>{t("products.nameEnField")}</span><input style={inp} value={area.nameEn} onChange={(e) => setArea({ ...area, nameEn: e.target.value })} /></label>
          <label style={fld}><span>{t("shop.city")}</span><input style={inp} value={area.city} onChange={(e) => setArea({ ...area, city: e.target.value })} /></label>
          <label style={fld}><span>{t("shop.fee")} ({t("common.currency")})</span><input style={inp} type="number" min="0" step="0.01" value={area.fee} onChange={(e) => setArea({ ...area, fee: e.target.value })} /></label>
          <button className="btn-touch" type="submit">{t("common.add")}</button>
        </div>
        {areas.map((row) => (
          <div key={row.id} style={{ ...rowStyle, opacity: row.isActive ? 1 : 0.55 }}>
            <span>{row.city ? `${row.city} · ` : ""}{locale === "en" ? row.nameEn || row.name : row.name} · {Number(row.fee).toFixed(2)}{row.isActive ? "" : ` · ${t("shop.inactive")}`}</span>
            <button type="button" onClick={() => editArea(row)}>{t("shop.edit")}</button>
            <button type="button" onClick={() => toggleArea(row)}>{row.isActive ? t("shop.deactivate") : t("shop.activate")}</button>
          </div>
        ))}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); setMsg(""); api("/api/delivery-setup/windows", { method: "POST", body: { ...windowForm, seats: Number(windowForm.seats), weekday: windowForm.weekday === "" ? null : Number(windowForm.weekday) } }).then(() => { setWindowForm(emptyWindow); return done(t("setup.added")); }).catch(fail); }}>
        <strong>{t("shop.window")}</strong>
        <div style={grid}>
          <label style={fld}><span>{t("products.nameArField")}</span><input style={inp} required value={windowForm.label} onChange={(e) => setWindowForm({ ...windowForm, label: e.target.value })} /></label>
          <label style={fld}><span>{t("products.nameEnField")}</span><input style={inp} value={windowForm.labelEn} onChange={(e) => setWindowForm({ ...windowForm, labelEn: e.target.value })} /></label>
          <label style={fld}><span>{t("setup.startTime")}</span><input style={inp} type="time" required value={windowForm.startTime} onChange={(e) => setWindowForm({ ...windowForm, startTime: e.target.value })} /></label>
          <label style={fld}><span>{t("setup.endTime")}</span><input style={inp} type="time" required value={windowForm.endTime} onChange={(e) => setWindowForm({ ...windowForm, endTime: e.target.value })} /></label>
          <label style={fld}><span>{t("setup.seats")}</span><input style={inp} type="number" min="1" value={windowForm.seats} onChange={(e) => setWindowForm({ ...windowForm, seats: e.target.value })} /></label>
          <label style={fld}><span>{t("setup.weekday")}</span>
            <select style={inp} value={windowForm.weekday} onChange={(e) => setWindowForm({ ...windowForm, weekday: e.target.value })}>
              <option value="">{t("shop.anyDay")}</option>
              {days.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <button className="btn-touch" type="submit">{t("common.add")}</button>
        </div>
        {windows.map((row) => (
          <div key={row.id} style={{ ...rowStyle, opacity: row.isActive ? 1 : 0.55 }}>
            <span>{locale === "en" ? row.labelEn || row.label : row.label} · {row.weekday == null ? t("shop.anyDay") : days[row.weekday]} · {row.startTime}-{row.endTime} · {row.seats}{row.isActive ? "" : ` · ${t("shop.inactive")}`}</span>
            <button type="button" onClick={() => editWindow(row)}>{t("shop.edit")}</button>
            <button type="button" onClick={() => toggleWindow(row)}>{row.isActive ? t("shop.deactivate") : t("shop.activate")}</button>
          </div>
        ))}
      </form>
    </div>
  );
}
