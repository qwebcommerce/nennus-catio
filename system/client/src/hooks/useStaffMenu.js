import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";
import { homePath, userContext, visibleMenu } from "../lib/menuDefinition.js";

/** fix-rf: the menu the sidebar shows, computed from the signed-in user's own rights. */
export function useStaffMenu() {
  const { user } = useAuth();
  const { branches } = useBranchContext();
  const ownKind = branches.find((b) => b.id === user?.branchId)?.kind || null;

  return useMemo(() => {
    const realCtx = userContext(user, ownKind);
    return { realCtx, ctx: realCtx, menu: visibleMenu(realCtx), realHome: homePath(realCtx) };
  }, [user, ownKind]);
}
