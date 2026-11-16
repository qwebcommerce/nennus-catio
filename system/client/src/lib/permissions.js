/**
 * Client mirror of server role permissions (keep in sync with server/src/lib/permissions.js).
 */

export const PERMISSION_KEYS = [
  "pos",
  "refunds",
  "purchases",
  "stockCount",
  "transfer",
  "productsView",
  "productsEdit",
  "catalogEdit",
  "cashSession",
  "reports",
  "customers",
  "receivables",
  "expenses",
  "audit",
];

export const DEFAULT_MANAGER_PERMISSIONS = Object.freeze({
  pos: true,
  refunds: true,
  purchases: true,
  stockCount: true,
  transfer: true,
  productsView: true,
  productsEdit: true,
  catalogEdit: true,
  cashSession: true,
  reports: true,
  customers: true,
  receivables: true,
  expenses: true,
  audit: true,
});

export const DEFAULT_CASHIER_PERMISSIONS = Object.freeze({
  pos: true,
  refunds: false,
  purchases: false,
  stockCount: false,
  transfer: false,
  productsView: true,
  productsEdit: false,
  catalogEdit: false,
  cashSession: true,
  reports: false,
  customers: true,
  receivables: false,
  expenses: false,
  audit: false,
});

export function resolveClientPermissions(user) {
  if (!user) return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
  if (user.role === "ADMIN") {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
  }
  const fromApi = user.permissions;
  if (fromApi && typeof fromApi === "object") {
    const base =
      user.role === "MANAGER"
        ? { ...DEFAULT_MANAGER_PERMISSIONS }
        : { ...DEFAULT_CASHIER_PERMISSIONS };
    for (const key of PERMISSION_KEYS) {
      if (typeof fromApi[key] === "boolean") base[key] = fromApi[key];
    }
    return base;
  }
  return user.role === "MANAGER"
    ? { ...DEFAULT_MANAGER_PERMISSIONS }
    : { ...DEFAULT_CASHIER_PERMISSIONS };
}
