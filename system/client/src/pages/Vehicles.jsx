import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, editErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Vehicles() {
  const { t, locale } = useI18n();
  const { canModule, isAdmin } = useAuth();
  const canCreate = canModule("delivery", "create");
  // fix-rb: delivery / grooming van type, editable here.
  const canEdit = canModule("delivery", "edit");
  const canDashboard = canModule("returns", "view");
  const [rows, setRows] = useState([]);
  const [vans, setVans] = useState([]);
  const [form, setForm] = useState({ name: "", plate: "", branchId: "", notes: "", type: "DELIVERY" });
  const [msg, setMsg] = useState("");
  const load = async () => {
    // Staff who do not manage vehicles see the ones they may open (a van driver: their own van).
    const [vehicles, branches] = await Promise.all([
      canCreate ? api("/api/vehicles") : api("/api/van-returns/vehicles"),
      api("/api/branches"),
    ]);
    setRows(vehicles);
    setVans((branches || []).filter((branch) => branch.kind === "VAN"));
  };
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1>{t("shop.vehicles")}</h1>
      {msg ? <div role="status" className="card" style={{ padding: "8px 12px" }}>{msg}</div> : null}
      {canCreate ? <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        try {
          await api("/api/vehicles", { method: "POST", body: { ...form, branchId: form.branchId || null } });
          setForm({ name: "", plate: "", branchId: "", notes: "", type: "DELIVERY" });
          setMsg(t("setup.added"));
          await load();
        } catch (err) {
          setMsg(err.message);
        }
      }}>
        <input required placeholder={t("shop.vehicleName")} aria-label={t("shop.vehicleName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required placeholder={t("shop.plate")} aria-label={t("shop.plate")} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
        <select aria-label={t("shop.noVan")} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
          <option value="">{t("shop.noVan")}</option>
          {vans.filter((van) => van.isActive !== false).map((van) => <option key={van.id} value={van.id}>{branchDisplayName(van, locale)}</option>)}
        </select>
        <select aria-label={t("dsp.vanType")} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="new-vehicle-type">
          <option value="DELIVERY">{t("dsp.vehicleType.DELIVERY")}</option>
          <option value="GROOMING">{t("dsp.vehicleType.GROOMING")}</option>
        </select>
        <button className="btn-touch" type="submit">{t("common.add")}</button>
      </form> : null}
      {rows.map((row) => (
        <div key={row.id} className="card vr-vehicle-row" data-testid="vehicle-row">
          <span>{row.name} · {row.plate} · {row.branch ? branchDisplayName(row.branch, locale) : "—"}{row.type && !canEdit ? ` · ${t(`dsp.vehicleType.${row.type}`)}` : ""}</span>
          {canEdit && row.type ? (
            <select
              aria-label={`${t("dsp.vanType")} ${row.plate}`}
              value={row.type}
              data-testid="vehicle-type"
              onChange={async (e) => {
                setMsg("");
                try {
                  await api(`/api/vehicles/${row.id}`, { method: "PATCH", body: { type: e.target.value, version: row.version } });
                  setMsg(t("dsp.typeSaved"));
                } catch (err) {
                  setMsg(editErrorMessage(err, t));
                }
                await load();
              }}
            >
              <option value="DELIVERY">{t("dsp.vehicleType.DELIVERY")}</option>
              <option value="GROOMING">{t("dsp.vehicleType.GROOMING")}</option>
            </select>
          ) : null}
          {canDashboard ? <Link to={`/vehicles/${row.id}`} className="btn-touch vr-btn" data-testid="open-dashboard">{t("vr.openDashboard")}</Link> : null}
          {isAdmin && row.branch ? <Link to={`/driver?vehicleId=${row.id}`} className="btn-touch vr-btn vr-btn--ghost" data-testid="open-driver-view">{t("drv.driverView")}</Link> : null}
        </div>
      ))}
    </div>
  );
}
