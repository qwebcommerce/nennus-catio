import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFailedQueueCount, getPendingQueueCount, processSyncQueue } from "../offline/syncQueue.js";
import { getOrCreateDeviceId } from "../offline/db.js";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine !== false
  );
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastMessage, setLastMessage] = useState("");

  const refreshPending = useCallback(async () => {
    try {
      const [n, f] = await Promise.all([getPendingQueueCount(), getFailedQueueCount()]);
      setPendingCount(n);
      setFailedCount(f);
    } catch {
      setPendingCount(0);
      setFailedCount(0);
    }
  }, []);

  const runSync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
    setSyncing(true);
    setLastMessage("");
    try {
      const n = await processSyncQueue();
      if (n > 0) setLastMessage(String(n));
      await refreshPending();
      return n;
    } catch (e) {
      console.error("[offline sync]", e);
      await refreshPending();
      return 0;
    } finally {
      setSyncing(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    getOrCreateDeviceId().catch(() => {});
  }, []);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void runSync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [runSync]);

  const value = useMemo(
    () => ({
      online,
      syncing,
      pendingCount,
      failedCount,
      lastMessage,
      refreshPending,
      runSync,
    }),
    [online, syncing, pendingCount, failedCount, lastMessage, refreshPending, runSync]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    return {
      online: typeof navigator !== "undefined" && navigator.onLine !== false,
      syncing: false,
      pendingCount: 0,
      failedCount: 0,
      lastMessage: "",
      refreshPending: async () => {},
      runSync: async () => 0,
    };
  }
  return ctx;
}
