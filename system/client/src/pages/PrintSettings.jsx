import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { PRINT_PAPER_KEYS } from "../utils/printPaper.js";

export default function PrintSettings() {
  const { t } = useI18n();
  const { sizes, setSizes } = usePrintSettings();

  const fields = [
    ["retail", "printSettings.retail", "printSettings.retailHint"],
    ["wholesale", "printSettings.wholesale", "printSettings.wholesaleHint"],
    ["reports", "printSettings.reports", "printSettings.reportsHint"],
    ["other", "printSettings.other", "printSettings.otherHint"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <h1 style={{ margin: 0 }}>{t("printSettings.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("printSettings.intro")}</p>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div className="page-form-grid">
          {fields.map(([key, labelKey, hintKey]) => (
            <label key={key} className="page-form-field">
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{t(labelKey)}</span>
              <span style={{ fontSize: 12 }}>{t(hintKey)}</span>
              <select
                value={sizes[key]}
                onChange={(e) => setSizes({ [key]: e.target.value })}
                aria-label={t(labelKey)}
              >
                {PRINT_PAPER_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`printPaper.size.${k}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("printSettings.saveNote")}</p>
    </div>
  );
}
