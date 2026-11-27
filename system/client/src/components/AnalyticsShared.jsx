import React, { useState } from "react";
import { downloadExport } from "./BizShared.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { qatarYmd } from "../utils/qatarDate.js";

/** Shared bits for the analytics page and the histories (fix-rc). */

export function money2(n) {
  return Number(n || 0).toFixed(2);
}

/** "YYYY-MM-DD" of the Qatar day `days` before today. */
export function qatarDaysAgo(days) {
  return qatarYmd(new Date(Date.now() - days * 86400000));
}

/** From / to (inclusive Qatar days) with quick presets. */
export function RangeFields({ from, to, onChange, children }) {
  const { t } = useI18n();
  const today = qatarYmd();
  return (
    <div className="fd-filters an-filters">
      <label><span>{t("an.from")}</span><input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} /></label>
      <label><span>{t("an.to")}</span><input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} /></label>
      {children}
      <span className="an-presets">
        <button type="button" className="btn-touch" onClick={() => onChange({ from: qatarDaysAgo(6), to: today })}>{t("an.last7")}</button>
        <button type="button" className="btn-touch" onClick={() => onChange({ from: qatarDaysAgo(29), to: today })}>{t("an.last30")}</button>
        <button type="button" className="btn-touch" onClick={() => onChange({ from: `${today.slice(0, 8)}01`, to: today })}>{t("an.thisMonth")}</button>
      </span>
    </div>
  );
}

/** CSV download through the existing export helper (Finance → export). Hidden without the right. */
export function CsvButton({ list, query, onError }) {
  const { t, locale } = useI18n();
  const { canModule } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!canModule("finance", "export")) return null;
  return (
    <button
      type="button"
      className="btn-touch an-csv"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await downloadExport(list, "csv", locale, query);
        setBusy(false);
        if (err && onError) onError(err);
      }}
    >
      {t("an.csv")}
    </button>
  );
}

/** A row of small figure tiles. */
export function Tiles({ items }) {
  return (
    <div className="an-tiles">
      {items.map((it) => (
        <div key={it.label} className={`an-tile${it.tone ? ` an-tile--${it.tone}` : ""}`}>
          <strong>{it.value}</strong>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
