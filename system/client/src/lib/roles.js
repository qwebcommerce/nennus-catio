/**
 * Staff roles (keep in sync with server/src/lib/permissions.js ROLES).
 * ADMIN is the top admin. MANAGER and CASHIER are legacy: existing users were moved to
 * SUPERVISOR / SALES / DRIVER; they are only offered when a user still has one.
 */
export const ROLE_OPTIONS = ["ADMIN", "SUPERVISOR", "SALES", "ACCOUNTANT", "B2B", "DRIVER"];
export const LEGACY_ROLES = ["MANAGER", "CASHIER"];
/** Roles that may work business-wide without an assigned location. */
export const ROLES_WITHOUT_BRANCH = ["ADMIN", "SUPERVISOR", "ACCOUNTANT", "B2B"];

export const roleNeedsBranch = (role) => !ROLES_WITHOUT_BRANCH.includes(String(role || ""));

/** Roles offered for one user: the current roles, plus the user's own legacy role. */
export function roleOptionsFor(current) {
  return LEGACY_ROLES.includes(current) ? [...ROLE_OPTIONS, current] : ROLE_OPTIONS;
}
