import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/** أيقونة placeholder عند عدم وجود صورة أو فشل التحميل */
export function ProductImagePlaceholder({ compact = false }) {
  const { t } = useI18n();
  const size = compact ? 40 : 56;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: compact ? 6 : 10,
        color: "var(--muted)",
        textAlign: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{ opacity: 0.65 }}
      >
        <path
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 8a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      </svg>
      {!compact ? (
        <span style={{ fontSize: 11, lineHeight: 1.2, maxWidth: "100%" }}>{t("productCard.noImage")}</span>
      ) : null}
    </div>
  );
}
