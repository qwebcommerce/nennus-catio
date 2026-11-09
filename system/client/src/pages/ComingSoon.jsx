import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/** Placeholder for features that are temporarily disabled. */
export default function ComingSoon({ titleKey, blurbKey }) {
  const { t } = useI18n();
  return (
    <div className="page" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <h1 style={{ margin: 0 }}>{t(titleKey)}</h1>
      <div className="card" style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("common.comingSoon")}</p>
        <p style={{ margin: "8px 0 0", color: "var(--muted)", lineHeight: 1.5 }}>
          {t(blurbKey || "common.comingSoonBlurb")}
        </p>
      </div>
    </div>
  );
}
