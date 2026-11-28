import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

/**
 * fix-rd: payment confirmation pieces shared by several screens — the status badge, the sidebar
 * pending count (fix-rf: the sidebar links are in lib/menuDefinition.js) and the Dashboard card.
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
