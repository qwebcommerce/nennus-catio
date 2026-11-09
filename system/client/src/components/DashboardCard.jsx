import React from "react";
import { DashIcon } from "./DashIcon.jsx";

/**
 * Large overview KPI card (reference-style).
 */
export function DashboardCard({
  title,
  value,
  hint,
  icon = "cart",
  tone = "blue",
  trend,
  trendLabel,
  trendPositive = true,
}) {
  return (
    <article className={`dash-kpi-card dash-kpi-card--${tone}`}>
      <div className="dash-kpi-card-top">
        <div className="dash-kpi-icon" aria-hidden>
          <DashIcon name={icon} size={22} />
        </div>
        {trend != null ? (
          <span className={`dash-trend${trendPositive ? " is-up" : " is-down"}`}>
            <DashIcon name={trendPositive ? "trend-up" : "trend-down"} size={14} />
            {trend}
          </span>
        ) : null}
      </div>
      <div className="dash-kpi-card-body">
        <div className="dash-kpi-card-title">{title}</div>
        <div className="dash-kpi-card-value">{value}</div>
        {hint || trendLabel ? (
          <div className="dash-kpi-card-hint">{hint || trendLabel}</div>
        ) : null}
      </div>
    </article>
  );
}
