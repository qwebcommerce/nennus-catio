import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";
import { branchDisplayName, userBranchId } from "../utils/displayLabels.js";

const BranchContext = createContext(null);

function storageKey(orgId) {
  return `icodo:activeBranchId:${orgId}`;
}

/**
 * Super admin can switch which branch they are operating on.
 * Manager / Employee are locked to their assigned branch.
 */
export function BranchProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchIdState] = useState("");
  const [loading, setLoading] = useState(true);

  const orgId = user?.organizationId || "";
  const lockedBranchId = userBranchId(user);

  const loadBranches = useCallback(async () => {
    if (!user) {
      setBranches([]);
      setActiveBranchIdState("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api("/api/branches");
      const items = Array.isArray(list) ? list : [];
      setBranches(items);

      if (!isAdmin) {
        setActiveBranchIdState(lockedBranchId || items[0]?.id || "");
        return;
      }

      let preferred = "";
      try {
        preferred = localStorage.getItem(storageKey(orgId)) || "";
      } catch {
        preferred = "";
      }
      const validPreferred = preferred && items.some((b) => b.id === preferred);
      const next =
        (validPreferred && preferred) ||
        lockedBranchId ||
        items[0]?.id ||
        "";
      setActiveBranchIdState(next);
      if (next) {
        try {
          localStorage.setItem(storageKey(orgId), next);
        } catch {
          /* ignore */
        }
      }
    } catch {
      setBranches([]);
      setActiveBranchIdState(lockedBranchId || "");
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, lockedBranchId, orgId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const setActiveBranchId = useCallback(
    (id) => {
      // Staff bound to one location stay there; others may pick (e.g. the till location).
      if (!isAdmin && lockedBranchId) return;
      const next = String(id || "");
      setActiveBranchIdState(next);
      if (orgId && next) {
        try {
          localStorage.setItem(storageKey(orgId), next);
        } catch {
          /* ignore */
        }
      }
    },
    [isAdmin, orgId, lockedBranchId]
  );

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || null,
    [branches, activeBranchId]
  );

  const value = useMemo(
    () => ({
      branches,
      activeBranchId,
      activeBranch,
      setActiveBranchId,
      canSwitchBranch: Boolean(isAdmin),
      canChooseBranch: Boolean(isAdmin) || !lockedBranchId,
      loading,
      reloadBranches: loadBranches,
      branchCount: user?.branchCount ?? branches.length,
    }),
    [
      branches,
      activeBranchId,
      activeBranch,
      setActiveBranchId,
      isAdmin,
      lockedBranchId,
      loading,
      loadBranches,
      user?.branchCount,
    ]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranchContext() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext must be used inside BranchProvider");
  return ctx;
}

/** Active branch id for API calls (admin context or assigned branch). */
export function useActiveBranchId() {
  const { activeBranchId } = useBranchContext();
  return activeBranchId || "";
}

export function useActiveBranchLabel(locale) {
  const { activeBranch } = useBranchContext();
  return branchDisplayName(activeBranch, locale);
}
