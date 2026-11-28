import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";
import { homePath, roleContext, userContext, visibleMenu } from "../lib/menuDefinition.js";
import { useMenuPreviewRole, useRoleMenuData } from "../lib/menuPreview.js";

/**
 * fix-rf: the menu the sidebar shows. Normally the signed-in user's own menu; while the top admin
 * previews a role, that role's menu computed from its permission map (GET /api/role-menus).
 * `realCtx` is always the user's own context (route guards and screens use the real rights).
 */
export function useStaffMenu() {
  const { user } = useAuth();
  const { branches } = useBranchContext();
  const ownKind = branches.find((b) => b.id === user?.branchId)?.kind || null;
  const previewRole = useMenuPreviewRole(user);
  const { data: roleData, error: previewError } = useRoleMenuData(Boolean(previewRole), previewRole);

  return useMemo(() => {
    const realCtx = userContext(user, ownKind);
    const previewCtx = previewRole && roleData?.modules ? roleContext(previewRole, roleData.modules[previewRole]) : null;
    const ctx = previewCtx || realCtx;
    return {
      realCtx,
      ctx,
      previewRole,
      previewReady: Boolean(previewCtx),
      previewError,
      roleData,
      menu: visibleMenu(ctx),
      realHome: homePath(realCtx),
    };
  }, [user, ownKind, previewRole, roleData, previewError]);
}
