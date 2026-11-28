/** fix-rf: data for the "Who sees what" guide. */
import { useEffect, useState } from "react";
import { api } from "../api/client.js";

/** GET /api/role-menus (top admin only): every role's resolved module map and user counts. */
export function useRoleMenuData(enabled, refreshKey = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api("/api/role-menus")
      .then((r) => alive && (setData(r), setError("")))
      .catch((e) => alive && setError(e.message || "error"));
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);
  return { data, error };
}
