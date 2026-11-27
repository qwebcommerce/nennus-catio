import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { ForwardArrow } from "./ForwardArrow.jsx";

/**
 * Dashboard: today at a glance (fix-rc) — today's grooming (done / pending / cancelled), today's
 * product orders (pending / cancelled), new website users this week and the peak order hour of the
 * last 30 days. One request (/api/analytics/today, one query). Shown with Finance → view.
 */
export function AnalyticsTodayCard() {
  const { t } = useI18n();
  const [s, setS] = useState(null);
  useEffect(() => {
    api("/api/analytics/today").then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  const hour = s.peakHour ? `${String(s.peakHour.hour).padStart(2, "0")}:00` : "—";
  return (
    <section className="dash-shell-card an-today" data-testid="analytics-today">
      <div className="an-today-head">
        <h3>{t("an.today.title")}</h3>
        <Link to="/analytics" className="dash-link-all">{t("an.today.open")} <ForwardArrow /></Link>
      </div>
      <div className="an-today-grid">
        <div className="an-today-block">
          <span className="an-today-label">{t("an.today.grooming")}</span>
          <div className="an-today-nums">
            <span><strong>{s.grooming.done}</strong> {t("an.g.done")}</span>
            <span><strong>{s.grooming.pending}</strong> {t("an.g.pending")}</span>
            <span><strong>{s.grooming.cancelled}</strong> {t("an.g.cancelled")}</span>
            {s.grooming.noShow ? <span><strong>{s.grooming.noShow}</strong> {t("an.g.noShow")}</span> : null}
          </div>
        </div>
        <div className="an-today-block">
          <span className="an-today-label">{t("an.today.orders")}</span>
          <div className="an-today-nums">
            <span><strong>{s.orders.placed}</strong> {t("an.today.placed")}</span>
            <span><strong>{s.orders.pending}</strong> {t("an.g.pending")}</span>
            <span><strong>{s.orders.cancelled}</strong> {t("an.g.cancelled")}</span>
          </div>
        </div>
        <div className="an-today-block">
          <span className="an-today-label">{t("an.today.newUsers")}</span>
          <div className="an-today-nums">
            <span><strong>{s.newUsers.week}</strong></span>
            <span className="fd-muted">{t("an.today.todayCount", { n: String(s.newUsers.today) })}</span>
          </div>
        </div>
        <div className="an-today-block">
          <span className="an-today-label">{t("an.today.peak")}</span>
          <div className="an-today-nums">
            <span><strong dir="ltr">{hour}</strong></span>
          </div>
        </div>
      </div>
    </section>
  );
}
