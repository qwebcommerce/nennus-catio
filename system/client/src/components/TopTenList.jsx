import React from "react";

/**
 * Popular-products style ranked list for the dashboard aside.
 */
export function TopTenList({
  title,
  rows,
  emptyLabel,
  metricLabel,
  actionLabel,
  onAction,
  variant = "default",
}) {
  return (
    <div className={`dash-aside-card${variant === "compact" ? " is-compact" : ""}`}>
      <div className="dash-aside-head">
        <h3>{title}</h3>
      </div>
      {!rows?.length ? (
        <div className="dash-empty">{emptyLabel}</div>
      ) : (
        <ul className="dash-popular-list">
          {rows.map((row, i) => {
            const initials = String(row.name || "?")
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase();
            const status = row.status || (i % 3 === 2 ? "offline" : "active");
            return (
              <li key={`${row.name}-${i}`} className="dash-popular-row">
                <div className={`dash-popular-thumb tone-${(i % 4) + 1}`} aria-hidden>
                  {row.avatar ? <img src={row.avatar} alt="" /> : <span>{initials}</span>}
                </div>
                <div className="dash-popular-meta">
                  <div className="dash-popular-name" title={row.name}>
                    {row.name}
                  </div>
                  <div className="dash-popular-sub">
                    {row.value}
                    {row.sub ? ` · ${row.sub}` : metricLabel ? ` · ${metricLabel}` : ""}
                  </div>
                </div>
                <span className={`dash-status-pill is-${status}`}>
                  {row.statusLabel || (status === "active" ? "Active" : "Offline")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {actionLabel ? (
        <button type="button" className="dash-aside-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
