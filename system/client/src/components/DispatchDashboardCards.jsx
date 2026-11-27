import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

/** fix-rb: dashboard counts for dispatchers (unassigned orders) and approvers (driver edits waiting). */
export function DispatchDashboardCards() {
  const { t } = useI18n();
  const { canModule } = useAuth();
  const canDispatch = canModule("dispatch", "view");
  const canApprove = canModule("driverApprovals", "view");
  const [dispatch, setDispatch] = useState(null);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (canDispatch) api("/api/dispatch/summary").then(setDispatch).catch(() => {});
    if (canApprove) api("/api/driver-approvals/count").then((r) => setPending(r.pending)).catch(() => {});
  }, [canDispatch, canApprove]);
  if (!canDispatch && !canApprove) return null;
  return (
    <div className="rb-dash" data-testid="dispatch-cards">
      {canApprove && pending != null ? (
        <Link to="/driver-approvals" className="card rb-dash__card" data-testid="approvals-card">
          <span className="vr-muted">{t("apr.title")}</span>
          <b className="rb-dash__n" data-testid="approvals-count">{pending}</b>
          <span>{t("apr.waiting")}</span>
        </Link>
      ) : null}
      {canDispatch && dispatch ? (
        <Link to="/dispatch" className="card rb-dash__card" data-testid="dispatch-card">
          <span className="vr-muted">{t("dsp.title")}</span>
          <b className="rb-dash__n" data-testid="unassigned-count">{dispatch.unassigned}</b>
          <span>{t("dsp.dashLine", { assigned: dispatch.assigned, accepted: dispatch.accepted, done: dispatch.deliveredToday })}</span>
        </Link>
      ) : null}
    </div>
  );
}
