import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";

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

/**
 * fix-rb badges for the sidebar (fix-rf: the links themselves are in lib/menuDefinition.js):
 * new assignments for "My van" and drivers' edits waiting for "Driver edit approvals".
 */
export function useDispatchNavBadges({ driverUnseen, approvals }) {
  const unseen = usePoll("/api/driver/notifications", Boolean(driverUnseen), (r) => r.unseen || 0, 30000);
  const pending = usePoll("/api/driver-approvals/count", Boolean(approvals), (r) => r.pending || 0);
  return { driverUnseen: unseen, approvals: pending };
}
