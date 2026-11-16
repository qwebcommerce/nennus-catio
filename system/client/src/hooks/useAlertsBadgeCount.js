import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { getLocalDismissedKeySet, getLocalReadKeySet } from "../alerts/localRead.js";

/**
 * غير مقروء: تنبيهات الخادم غير المعلّمة محلياً.
 * يحترم المفاتيح الممسوحة محلياً (Clear all).
 */
export function useAlertsBadgeCount() {
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
    setCount(server);
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
  }, [load]);

  return { count, refresh: load };
}
