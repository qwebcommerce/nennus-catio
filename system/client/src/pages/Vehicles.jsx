import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Vehicles() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [vans, setVans] = useState([]);
  const [form, setForm] = useState({ name: "", plate: "", branchId: "", notes: "" });
  const [msg, setMsg] = useState("");
  const load = async () => {
    const [vehicles, branches] = await Promise.all([api("/api/vehicles"), api("/api/branches")]);
    setRows(vehicles);
    setVans((branches || []).filter((branch) => branch.kind === "VAN"));
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.vehicles")}</h1>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        await api("/api/vehicles", { method: "POST", body: { ...form, branchId: form.branchId || null } });
        setForm({ name: "", plate: "", branchId: "", notes: "" });
        load();
      }}>
        <input required placeholder={t("shop.vehicleName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required placeholder={t("shop.plate")} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
        <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
          <option value="">{t("shop.noVan")}</option>
          {vans.map((van) => <option key={van.id} value={van.id}>{van.name}</option>)}
        </select>
        <button className="btn-touch" type="submit">{t("common.add")}</button>
      </form>
      {rows.map((row) => <div key={row.id} className="card">{row.name} · {row.plate} · {row.branch?.name || "—"}</div>)}
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
