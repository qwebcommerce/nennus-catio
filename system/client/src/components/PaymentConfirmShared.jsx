import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { SidebarIcon } from "./SidebarIcon.jsx";

/**
 * fix-rd: payment confirmation pieces shared by several screens — the status badge, the sidebar
 * links (confirmation queue with its count, sales' van returns desk) and the Dashboard card.
 */

/** "Awaiting confirmation" / "Confirmed" / "Rejected" next to a recorded payment. */
export function ConfirmBadge({ status, reason }) {
  const { t } = useI18n();
  if (!status) return null;
  const tone = status === "CONFIRMED" ? "ok" : status === "REJECTED" ? "bad" : "warn";
  return (
    <span className={`vr-badge vr-badge--${tone}`} data-testid="confirm-status" data-status={status} title={reason || undefined}>
      {t(`pc.status.${status}`)}{status === "REJECTED" && reason ? `: ${reason}` : ""}
    </span>
  );
}

const linkClass = ({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`;

/** Pending count for the badge / card (polls every minute). */
export function usePendingConfirmations(enabled) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const run = () => api("/api/payment-confirmations/count").then((r) => alive && setData(r)).catch(() => {});
    run();
    const id = setInterval(run, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled]);
  return data;
}

/** Sidebar: "Payment confirmations" (with the waiting count) and the sales staff's "Van returns". */
export function PaymentConfirmNavLinks() {
  const { t } = useI18n();
  const { user, canModule } = useAuth();
  const canQueue = canModule("paymentConfirm", "view");
  const data = usePendingConfirmations(canQueue);
  const n = data?.pending || 0;
  const vanDesk = canModule("returns", "create") && user?.role !== "DRIVER";
  return (
    <>
      {canQueue ? (
        <NavLink to="/payment-confirmations" className={linkClass} data-testid="nav-confirmations">
          <SidebarIcon name="audit" />
          <span className="app-sidebar-link-row">
            <span>{t("pc.nav")}</span>
            {n ? <span className="app-sidebar-badge" data-testid="nav-confirmations-badge">{n > 99 ? "99+" : n}</span> : null}
          </span>
        </NavLink>
      ) : null}
      {vanDesk ? (
        <NavLink to="/van-returns" className={linkClass} data-testid="nav-van-returns">
          <SidebarIcon name="transfer" />
          <span>{t("vrs.nav")}</span>
        </NavLink>
      ) : null}
    </>
  );
}

/** Dashboard card: money waiting for the accountant. */
export function PaymentConfirmDashboardCard() {
  const { t } = useI18n();
  const { canModule } = useAuth();
  const can = canModule("paymentConfirm", "view");
  const data = usePendingConfirmations(can);
  if (!can || !data) return null;
  return (
    <div className="rb-dash" data-testid="confirm-card">
      <Link to="/payment-confirmations" className="card rb-dash__card">
        <span className="vr-muted">{t("pc.cardTitle")}</span>
        <b className="rb-dash__n" data-testid="confirm-card-count">{data.pending}</b>
        <span data-testid="confirm-card-amount">{t("pc.cardBody", { n: data.pending, amount: `${data.amount} ${t("common.currency")}` })}</span>
      </Link>
    </div>
  );
}
