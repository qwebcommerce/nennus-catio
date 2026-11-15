"use client";

import type {
  ModuleId,
  PermissionAction,
  PermissionModule,
  StaffProfile,
} from "@nennus-catio/contracts";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useDemoIdentity } from "@/layouts/global/GlobalProviders";
import { canPreviewModule } from "@/shared/lib/access";

/**
 * What the current admin user may see and do. API mode: from the staff member's role (D100);
 * the server enforces the same rules. Mock mode: the demo role switcher, as before.
 */
export interface AdminAccess {
  canView(module: ModuleId): boolean;
  can(module: PermissionModule, action: PermissionAction): boolean;
  readonly isOwner: boolean;
}

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function accessFromStaff(staff: StaffProfile): AdminAccess {
  return {
    isOwner: staff.isOwner,
    // Team & Access and Integrations (#16 part 2c) are owner-only and not permission modules (D95).
    canView: (module) => (module === "team" || module === "integrations" ? staff.isOwner : staff.permissions[module].view),
    can: (module, action) => staff.permissions[module][action],
  };
}

export function AdminAccessProvider({ staff, children }: { staff: StaffProfile; children: ReactNode }) {
  const value = useMemo(() => accessFromStaff(staff), [staff]);
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

/** Real permissions inside AdminAccessProvider; otherwise the mock-mode demo role. */
export function useAdminAccess(): AdminAccess {
  const real = useContext(AdminAccessContext);
  const { role } = useDemoIdentity();
  return (
    real ?? {
      isOwner: role === "owner",
      canView: (module) => canPreviewModule(role, module),
      can: (module, action) =>
        canPreviewModule(role, module) && (role !== "finance" || action === "view" || action === "export"),
    }
  );
}
