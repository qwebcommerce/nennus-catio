import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function GroomingDesk() {
  const { t } = useI18n();
  const branchId = useActiveBranchId();
  const [packages, setPackages] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [petTypes, setPetTypes] = useState([]);
  const [form, setForm] = useState({ name: "", nameEn: "", price: "", durationMin: "60", included: "", includedEn: "" });
  const [slot, setSlot] = useState({ weekday: "0", startTime: "09:00", endTime: "17:00", capacity: "1" });
  const [msg, setMsg] = useState("");
  const load = async () => {
    const q = branchId ? `?branchId=${branchId}` : "";
    const [services, rows, pets] = await Promise.all([
      api(`/api/appointments/services${q}`),
      api("/api/appointments/schedule"),
      api("/api/pet-types"),
    ]);
    setPackages(services);
    setSchedule(rows);
    setPetTypes(pets);
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [branchId]);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{t("shop.grooming")}</h1>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        await api("/api/appointments/services", {
          method: "POST",
          body: { ...form, branchId, price: Number(form.price), durationMin: Number(form.durationMin), petTypeIds: petTypes.map((row) => row.id) },
        });
        setForm({ name: "", nameEn: "", price: "", durationMin: "60", included: "", includedEn: "" });
        load();
      }}>
        <strong>{t("shop.package")}</strong>
        <input required placeholder={t("products.nameArField")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required placeholder={t("products.nameEnField")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        <input required type="number" min="0" step="0.01" placeholder={t("products.price")} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <input required type="number" min="10" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
        <textarea placeholder={t("shop.included")} value={form.included} onChange={(e) => setForm({ ...form, included: e.target.value })} />
        <textarea placeholder={t("shop.includedEn")} value={form.includedEn} onChange={(e) => setForm({ ...form, includedEn: e.target.value })} />
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {packages.map((row) => <div key={row.id}>{row.name} · {row.nameEn || ""} · {Number(row.price).toFixed(2)}</div>)}
      </form>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        await api("/api/appointments/schedule", { method: "POST", body: { ...slot, weekday: Number(slot.weekday), capacity: Number(slot.capacity) } });
        load();
      }}>
        <strong>{t("shop.groomingHours")}</strong>
        <select value={slot.weekday} onChange={(e) => setSlot({ ...slot, weekday: e.target.value })}>
          {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
        </select>
        <input value={slot.startTime} onChange={(e) => setSlot({ ...slot, startTime: e.target.value })} />
        <input value={slot.endTime} onChange={(e) => setSlot({ ...slot, endTime: e.target.value })} />
        <input type="number" min="1" value={slot.capacity} onChange={(e) => setSlot({ ...slot, capacity: e.target.value })} />
        <button className="btn-touch" type="submit">{t("common.add")}</button>
        {schedule.map((row) => <div key={row.id}>{DAYS[row.weekday]} · {row.startTime}-{row.endTime} · {row.capacity}</div>)}
      </form>
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
