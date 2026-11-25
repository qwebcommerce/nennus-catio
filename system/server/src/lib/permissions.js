/**
 * Role permission keys for MANAGER and CASHIER (Employee).
 * ADMIN (super admin) always has every permission.
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
  refunds: true,
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

/**
 * Legacy permission keys are resolved through the module matrix (single source of
 * truth for FR-08/FR-10). key → [module, action].
 */
export const LEGACY_TO_MODULE = Object.freeze({
  pos: ["pos", "create"],
  refunds: ["pos", "refund"],
  purchases: ["purchasing", "view"],
  stockCount: ["warehouses", "edit"],
  transfer: ["warehouses", "edit"],
  productsView: ["products", "view"],
  productsEdit: ["products", "edit"],
  catalogEdit: ["products", "edit"],
  cashSession: ["pos", "create"],
  reports: ["finance", "view"],
  customers: ["customers", "view"],
  receivables: ["finance", "view"],
  expenses: ["finance", "create"],
  audit: ["settings", "view"],
});

export function legacyFromModules(modules) {
  return Object.fromEntries(
    PERMISSION_KEYS.map((k) => {
      const [mod, action] = LEGACY_TO_MODULE[k];
      return [k, Boolean(modules?.[mod]?.[action])];
    })
  );
}

/** Legacy key map for the session user / UI, derived from the module matrix. */
export function resolveRolePermissions(organization, role) {
  if (role === "ADMIN") {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
  }
  return legacyFromModules(resolveModulePermissions(organization, role));
}

export function orgPermissionMatrices(organization) {
  return {
    MANAGER: resolveRolePermissions(organization, "MANAGER"),
    CASHIER: resolveRolePermissions(organization, "CASHIER"),
  };
}

export function hasPermission(permissions, key) {
  if (!key) return true;
  return Boolean(permissions?.[key]);
}

/**
 * `returns`: van returns (goods a van driver collects back from a customer) and the vehicle
 * dashboard. view = see returns and dashboards, create = record a return / mark it paid,
 * edit = receive it at the warehouse (and mark paid). Writing off or selling damaged stock is
 * for the business owner only (requireOwner). Staff whose location is a van only see that van.
 */
export const MODULES = ["products", "warehouses", "purchasing", "pos", "orders", "grooming", "relocation", "customers", "promotions", "delivery", "finance", "settings", "team", "returns"];
export const MODULE_ACTIONS = ["view", "create", "edit", "delete", "export", "refund"];

function blankModuleMap(on) {
  return Object.fromEntries(
    MODULES.map((mod) => [mod, Object.fromEntries(MODULE_ACTIONS.map((action) => [action, on]))])
  );
}

export function defaultModuleMap(role) {
  if (role === "ADMIN" || role === "MANAGER") return blankModuleMap(true);
  const map = blankModuleMap(false);
  if (role === "CASHIER") {
    map.products.view = true;
    map.warehouses.view = true;
    map.pos.view = true;
    map.pos.create = true;
    map.pos.refund = true;
    map.orders.view = true;
    map.orders.create = true;
    map.customers.view = true;
    map.customers.create = true;
    map.delivery.view = true;
    map.grooming.view = true;
    // Van drivers are employees: they record returns into their van and pay customers back.
    map.returns.view = true;
    map.returns.create = true;
  }
  return map;
}

export function resolveModulePermissions(organization, role) {
  const base = defaultModuleMap(role);
  if (role === "ADMIN") return base;
  const raw = role === "MANAGER" ? organization?.managerModules : organization?.cashierModules;
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    for (const mod of MODULES) {
      for (const action of MODULE_ACTIONS) {
        if (typeof parsed?.[mod]?.[action] === "boolean") base[mod][action] = parsed[mod][action];
      }
    }
  } catch {
    /* keep defaults */
  }
  return base;
}
