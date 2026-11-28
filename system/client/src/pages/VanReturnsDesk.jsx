import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { ReturnCard, VanReturnForm } from "./VehicleDashboard.jsx";
import { personName } from "./Transfer.jsx";

/**
 * fix-rd: the sales staff's van returns desk. Sales record a return into any van (the van's
 * driver is the default "collected by"); the driver sees it on the driver dashboard and moves it
 * to the warehouse. Needs returns → view; recording needs returns → create (no vehicle admin rights).
 */
export default function VanReturnsDesk() {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [options, setOptions] = useState({ staff: [], locations: [], vans: [], vehicles: [] });
  const [vanId, setVanId] = useState("");
  const [status, setStatus] = useState("IN_VAN");
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api("/api/van-returns/options").then(setOptions).catch((e) => setError(e.message));
  }, []);
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ ...(vanId ? { vanBranchId: vanId } : {}), ...(status ? { status } : {}) }).toString();
    try {
      setRows(await api(`/api/van-returns${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e.message);
    }
  }, [vanId, status]);
  useEffect(() => { load(); }, [load]);

  const van = (options.vans || []).find((v) => v.id === vanId) || null;
  const vehicle = van ? (options.vehicles || []).find((v) => v.branchId === van.id && v.isActive !== false) || null : null;
  const driver = van?.driverId ? (options.staff || []).find((s) => s.id === van.driverId) : null;

  return (
    <div className="vr-page" data-testid="van-returns-desk">
      <h1>{t("vrs.title")}</h1>
      <p className="vr-muted">{t("vrs.hint")}</p>
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {notice ? <div role="status" className="vr-ok" data-testid="notice">{notice}</div> : null}
      <section className="card vr-card">
        <div className="vr-grid">
          <label className="vr-field">
            <span>{t("vrs.van")}</span>
            <select value={vanId} onChange={(e) => { setVanId(e.target.value); setShowForm(false); }} data-testid="desk-van">
              <option value="">{t("vrs.allVans")}</option>
              {(options.vans || []).map((v) => <option key={v.id} value={v.id}>{branchDisplayName(v, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("vr.show")}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="desk-status">
              <option value="IN_VAN">{t("vr.tab.IN_VAN")}</option>
              <option value="RECEIVED">{t("vr.tab.RECEIVED")}</option>
              <option value="">{t("vr.tab.ALL")}</option>
            </select>
          </label>
        </div>
        {van ? <p className="vr-muted" data-testid="desk-driver">{driver ? t("vrs.driver", { name: personName(driver, locale) }) : t("vrs.noDriver")}{vehicle ? ` · ${vehicle.name} · ${vehicle.plate}` : ""}</p> : null}
        {canModule("returns", "create") ? (
          <div className="vr-actions">
            <button type="button" className="btn-touch vr-btn vr-btn--primary" disabled={!van} title={van ? undefined : t("vrs.chooseVan")} onClick={() => { setShowForm(true); setNotice(""); }} data-testid="new-return">{t("vr.newReturn")}</button>
            {!van ? <span className="vr-muted">{t("vrs.chooseVan")}</span> : null}
          </div>
        ) : null}
      </section>
      {showForm && van ? (
        <VanReturnForm
          key={van.id}
          van={van}
          vehicle={vehicle}
          options={options}
          onCancel={() => setShowForm(false)}
          onSaved={async (row) => {
            setShowForm(false);
            setNotice(t("vr.saved", { reference: row.reference }));
            setStatus("IN_VAN");
            await load();
          }}
        />
      ) : null}
      <section className="card vr-card">
        <h2>{t("vr.returns")}</h2>
        {rows.length ? (
          <ul className="vr-list">
            {rows.map((row) => <ReturnCard key={`${row.id}:${row.version}`} row={row} options={options} onChanged={load} setError={setError} />)}
          </ul>
        ) : <p className="vr-muted">{t("vr.noReturns")}</p>}
      </section>
    </div>
  );
}
