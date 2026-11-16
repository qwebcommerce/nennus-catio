import React from "react";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

export function OfflineBanner() {
  const { online } = useOffline();
  const { t } = useI18n();

  if (online) return null;

  return (
    <div
      role="status"
      style={{
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        background: "var(--danger-bg, #fef2f2)",
        color: "var(--danger, #b91c1c)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {t("offline.banner")}
    </div>
  );
}
