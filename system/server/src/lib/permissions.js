/**
 * Role permission keys for MANAGER and CASHIER (Employee).
 * ADMIN (super admin) always has every permission.
 * ASSOCIATE is locked to floorPos (+ productsView for lookup).
 */

export const PERMISSION_KEYS = [
  "pos",
  "floorPos",
  "wholesale",
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
  "loyalty",
];

export const DEFAULT_MANAGER_PERMISSIONS = Object.freeze({
  pos: true,
  floorPos: true,
  wholesale: true,
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
  loyalty: true,
});

export const DEFAULT_CASHIER_PERMISSIONS = Object.freeze({
  pos: true,
  floorPos: false,
  wholesale: false,
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
  loyalty: false,
});

/** Locked matrix — floor scan & checkout only */
export const DEFAULT_ASSOCIATE_PERMISSIONS = Object.freeze({
  pos: false,
  floorPos: true,
  wholesale: false,
  refunds: false,
  purchases: false,
  stockCount: false,
  transfer: false,
  productsView: true,
  productsEdit: false,
  catalogEdit: false,
  cashSession: false,
  reports: false,
  customers: false,
  receivables: false,
  expenses: false,
  audit: false,
  loyalty: false,
});

function parseStored(raw, fallback) {
  if (!raw || typeof raw !== "string") return { ...fallback };
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { ...fallback };
    const out = { ...fallback };
    for (const key of PERMISSION_KEYS) {
      if (typeof obj[key] === "boolean") out[key] = obj[key];
    }
    return out;
  } catch {
    return { ...fallback };
  }
}

export function normalizePermissionMap(input, fallback) {
  const base = { ...fallback };
  if (!input || typeof input !== "object") return base;
  for (const key of PERMISSION_KEYS) {
    if (typeof input[key] === "boolean") base[key] = input[key];
  }
  return base;
}

export function resolveRolePermissions(organization, role) {
  if (role === "ADMIN") {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
  }
  if (role === "MANAGER") {
    return parseStored(organization?.managerPermissions, DEFAULT_MANAGER_PERMISSIONS);
  }
  if (role === "CASHIER") {
    return parseStored(organization?.cashierPermissions, DEFAULT_CASHIER_PERMISSIONS);
  }
  if (role === "ASSOCIATE") {
    return { ...DEFAULT_ASSOCIATE_PERMISSIONS };
  }
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
}

export function orgPermissionMatrices(organization) {
  return {
    MANAGER: parseStored(organization?.managerPermissions, DEFAULT_MANAGER_PERMISSIONS),
    CASHIER: parseStored(organization?.cashierPermissions, DEFAULT_CASHIER_PERMISSIONS),
    ASSOCIATE: { ...DEFAULT_ASSOCIATE_PERMISSIONS },
  };
}

export function hasPermission(permissions, key) {
  if (!key) return true;
  return Boolean(permissions?.[key]);
}
