import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { qatarYmd } from "../utils/qatarDate.js";

/** fix-rb: a till sale "for delivery" — customer (chosen above), address, area, date and window. */
export const emptyTillDelivery = () => ({ on: false, address: "", areaId: "", date: qatarYmd(), windowId: "" });

export function tillDeliveryBody(value) {
  if (!value?.on) return null;
  return {
    forDelivery: true,
    deliveryAddress: value.address.trim(),
    ...(value.areaId ? { deliveryAreaId: value.areaId } : {}),
    ...(value.date ? { deliveryDate: value.date } : {}),
    ...(value.windowId ? { deliveryWindowId: value.windowId } : {}),
  };
}

const box = { padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 16, width: "100%", boxSizing: "border-box" };

export function TillDeliveryFields({ value, onChange }) {
  const { t, locale } = useI18n();
  const [areas, setAreas] = useState([]);
  const [windows, setWindows] = useState([]);
  useEffect(() => {
    if (!value.on || areas.length) return;
    api("/api/delivery-setup/areas").then((rows) => setAreas((rows || []).filter((a) => a.isActive !== false))).catch(() => {});
    api("/api/delivery-setup/windows").then((rows) => setWindows((rows || []).filter((w) => w.isActive !== false))).catch(() => {});
  }, [value.on]);
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 12 }} data-testid="till-delivery">
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={value.on} onChange={(e) => set({ on: e.target.checked })} data-testid="for-delivery" />
        <span>{t("pos.forDelivery")}</span>
      </label>
      {value.on ? (
        <>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("pos.forDeliveryHint")}</span>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("pos.deliveryAddress")} *</span>
            <textarea rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} style={{ ...box, resize: "vertical" }} data-testid="delivery-address" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("dsp.area")}</span>
            <select value={value.areaId} onChange={(e) => set({ areaId: e.target.value })} style={box} data-testid="delivery-area">
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{locale === "en" ? a.nameEn || a.name : a.name}{a.zone || a.city ? ` · ${a.zone || a.city}` : ""}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("dsp.date")}</span>
              <input type="date" value={value.date} min={qatarYmd()} onChange={(e) => set({ date: e.target.value })} style={box} data-testid="delivery-date" />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("dsp.time")}</span>
              <select value={value.windowId} onChange={(e) => set({ windowId: e.target.value })} style={box} data-testid="delivery-window">
                <option value="">—</option>
                {windows.map((w) => <option key={w.id} value={w.id}>{locale === "en" ? w.labelEn || w.label : w.label} {w.startTime}–{w.endTime}</option>)}
              </select>
            </label>
          </div>
        </>
      ) : null}
    </div>
  );
}
