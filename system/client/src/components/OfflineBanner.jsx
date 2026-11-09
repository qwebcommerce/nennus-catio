import React from "react";
import { Link } from "react-router-dom";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

export function OfflineBanner() {
  const { online, syncing, pendingCount, failedCount } = useOffline();
  const { t } = useI18n();

  if (online && !syncing && pendingCount === 0 && failedCount === 0) return null;

  let text = "";
  if (!online) text = t("offline.banner");
  else if (syncing) text = t("offline.syncing");
  else if (pendingCount > 0) text = t("offline.pending").replace("{{n}}", String(pendingCount));
  else if (failedCount > 0) text = t("offline.failed").replace("{{n}}", String(failedCount));

  if (!text) return null;

  return (
    <div
      role="status"
      style={{
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        background: !online || failedCount > 0 ? "var(--danger-bg, #fef2f2)" : "var(--surface2)",
        color: !online || failedCount > 0 ? "var(--danger, #b91c1c)" : "var(--text)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>{text}</span>
      {(pendingCount > 0 || failedCount > 0) && online ? (
        <Link to="/sync-queue" style={{ color: "inherit", textDecoration: "underline" }}>
          {t("nav.offlineSync")}
        </Link>
      ) : null}
    </div>
  );
}
