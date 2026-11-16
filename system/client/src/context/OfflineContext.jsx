import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const OfflineContext = createContext(null);

/** Tracks the browser connection only. Sales and refunds need the server, so the till blocks while offline. */
export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine !== false
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const value = useMemo(() => ({ online }), [online]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    return { online: typeof navigator !== "undefined" && navigator.onLine !== false };
  }
  return ctx;
}
