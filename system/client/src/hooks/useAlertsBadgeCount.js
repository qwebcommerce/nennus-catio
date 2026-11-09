import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { listSyncQueueRows } from "../offline/syncQueueList.js";
import { getLocalDismissedKeySet, getLocalReadKeySet } from "../alerts/localRead.js";
import { useOffline } from "../context/OfflineContext.jsx";

/**
 * غير مقروء: تنبيهات الخادم + عناصر طابور المزامنة غير المعلّمة محلياً.
 * يحترم المفاتيح الممسوحة محلياً (Clear all).
 */
export function useAlertsBadgeCount() {
  const { pendingCount } = useOffline();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const dismissed = getLocalDismissedKeySet();
    const read = getLocalReadKeySet();
    let server = 0;
    try {
      const r = await api("/api/notifications");
      const items = Array.isArray(r?.items) ? r.items : [];
      const readKeys = new Set(Array.isArray(r?.readKeys) ? r.readKeys : []);
      for (const it of items) {
        if (!it?.key || dismissed.has(it.key)) continue;
        if (readKeys.has(it.key) || read.has(it.key)) continue;
        server += 1;
      }
    } catch {
      try {
        const r = await api("/api/notifications/unread-count");
        server = typeof r?.count === "number" ? r.count : 0;
      } catch {
        server = 0;
      }
    }
    let local = 0;
    try {
      const rows = await listSyncQueueRows();
      for (const row of rows) {
        const k = `sync-local:${row.localId}`;
        if (dismissed.has(k) || read.has(k)) continue;
        local += 1;
      }
    } catch {
      local = 0;
    }
    setCount(server + local);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 45000);
    const onFocus = () => load();
    const onAlerts = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("alerts-changed", onAlerts);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("alerts-changed", onAlerts);
    };
  }, [load, pendingCount]);

  return { count, refresh: load };
}
