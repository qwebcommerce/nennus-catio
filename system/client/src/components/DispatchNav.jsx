import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";
import { SidebarIcon } from "./SidebarIcon.jsx";

const sidebarLinkClass = ({ isActive }) => `app-sidebar-link${isActive ? " is-active" : ""}`;

function usePoll(url, enabled, pick, ms = 60000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const run = () => api(url).then((r) => alive && setN(pick(r))).catch(() => {});
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url, enabled]);
  return n;
}

function Badge({ n, testId }) {
  if (!n) return null;
  return <span className="app-sidebar-badge" data-testid={testId}>{n > 99 ? "99+" : n}</span>;
}

/** fix-rb: "My van" (driver dashboard, with new-assignment badge), "Dispatch", "Driver edits" (with the waiting count). */
export function DispatchNavLinks() {
  const { t } = useI18n();
  const { user, canModule } = useAuth();
  const { branches } = useBranchContext();
  const own = branches.find((b) => b.id === user?.branchId);
  const showDriver = canModule("driver", "view") && (user?.role === "DRIVER" || own?.kind === "VAN");
  const unseen = usePoll("/api/driver/notifications", showDriver && user?.role !== "ADMIN", (r) => r.unseen || 0, 30000);
  const pending = usePoll("/api/driver-approvals/count", canModule("driverApprovals", "view"), (r) => r.pending || 0);
  return (
    <>
      {showDriver ? (
        <NavLink to="/driver" className={sidebarLinkClass} data-testid="nav-driver">
          <SidebarIcon name="transfer" />
          <span className="app-sidebar-link-row"><span>{t("drv.nav")}</span><Badge n={unseen} testId="nav-driver-badge" /></span>
        </NavLink>
      ) : null}
      {canModule("dispatch", "view") ? (
        <NavLink to="/dispatch" className={sidebarLinkClass} data-testid="nav-dispatch">
          <SidebarIcon name="transfer" />
          <span>{t("dsp.title")}</span>
        </NavLink>
      ) : null}
      {canModule("driverApprovals", "view") ? (
        <NavLink to="/driver-approvals" className={sidebarLinkClass} data-testid="nav-approvals">
          <SidebarIcon name="audit" />
          <span className="app-sidebar-link-row"><span>{t("apr.nav")}</span><Badge n={pending} testId="nav-approvals-badge" /></span>
        </NavLink>
      ) : null}
    </>
  );
}
