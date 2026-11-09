import React from "react";

/**
 * Simple empty / error panel for list pages.
 */
export function EmptyState({ title, hint, action = null }) {
  return (
    <div
      className="card"
      style={{
        padding: "28px 20px",
        textAlign: "center",
        color: "var(--muted)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: hint ? 8 : 0 }}>
        {title}
      </div>
      {hint ? <p style={{ margin: "0 auto", maxWidth: 420, fontSize: 14, lineHeight: 1.45 }}>{hint}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
