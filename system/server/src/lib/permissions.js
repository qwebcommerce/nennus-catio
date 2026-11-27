/**
 * Role permissions. ADMIN (top admin) always has every permission; every other role has an
 * editable module map (Organization.roleModules, see resolveModulePermissions below).
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
  return Object.fromEntries(EDITABLE_ROLES.map((role) => [role, resolveRolePermissions(organization, role)]));
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
 *
 * `b2b`: the B2B / Wholesale tab (delivery note → invoice → cash receipt, built on sales orders).
 * view = see it, create = delivery notes and invoices, edit = record cash receipts,
 * delete = cancel a delivery note not yet delivered / an invoice with no receipt, export.
 */
export const MODULES = ["products", "warehouses", "purchasing", "pos", "orders", "grooming", "relocation", "customers", "promotions", "delivery", "finance", "settings", "team", "returns", "salesOrders", "complimentary", "b2b"];
export const MODULE_ACTIONS = ["view", "create", "edit", "delete", "export", "refund"];

/**
 * Modules that use only some actions (the Permissions screen shows just these):
 * - salesOrders: view, create (orders, payments, deliveries), edit (change a line price), delete (cancel), export.
 * - complimentary: create = give goods free (till lines / whole invoice, sales-order lines). Managers by default.
 * - b2b: see above (edit = cash receipts).
 */
export const MODULE_ACTIONS_FOR = Object.freeze({
  salesOrders: ["view", "create", "edit", "delete", "export"],
  complimentary: ["create"],
  b2b: ["view", "create", "edit", "delete", "export"],
});

/**
 * Staff roles. ADMIN is the top admin (full access, never stored in the map).
 * MANAGER and CASHIER are legacy: existing users were moved to SUPERVISOR / SALES / DRIVER by the
 * migration 20261128100100_roles_data; the values stay valid for old rows and old clients.
 */
export const ROLES = ["ADMIN", "SUPERVISOR", "SALES", "ACCOUNTANT", "B2B", "DRIVER", "MANAGER", "CASHIER"];
/** Roles with their own editable module map (every role but ADMIN). */
export const EDITABLE_ROLES = ["SUPERVISOR", "SALES", "ACCOUNTANT", "B2B", "DRIVER", "MANAGER", "CASHIER"];
/** Roles that may work without an assigned location (business-wide); the others need one. */
export const ROLES_WITHOUT_BRANCH = ["ADMIN", "SUPERVISOR", "ACCOUNTANT", "B2B"];
export const LEGACY_ROLES = ["MANAGER", "CASHIER"];

export function isStaffRole(role) {
  return ROLES.includes(String(role || ""));
}

function blankModuleMap(on) {
  return Object.fromEntries(
    MODULES.map((mod) => [mod, Object.fromEntries(MODULE_ACTIONS.map((action) => [action, on]))])
  );
}

function allow(map, mod, ...actions) {
  for (const a of actions) map[mod][a] = true;
}

/**
 * Default module map per role. Each role is its own block so later features can add their
 * module lines without touching the other roles. Detailed rights will be set after the client's
 * second test round; the admin edits them on the Permissions screen.
 */
export function defaultModuleMap(role) {
  if (role === "ADMIN") return blankModuleMap(true);

  // ---- SUPERVISOR (and legacy MANAGER): everything; owner-only actions stay behind requireOwner.
  if (role === "SUPERVISOR" || role === "MANAGER") {
    const map = blankModuleMap(true);
    // -- fix-rb: SUPERVISOR module lines go here.
    return map;
  }

  const map = blankModuleMap(false);
  // Every staff role reads the location list (/api/branches needs Warehouses → view).
  allow(map, "warehouses", "view");

  if (role === "SALES") {
    // ---- SALES
    allow(map, "pos", "view", "create", "refund");
    allow(map, "orders", "view", "create");
    allow(map, "customers", "view", "create");
    allow(map, "products", "view");
    allow(map, "salesOrders", "view", "create");
    allow(map, "grooming", "view");
    allow(map, "delivery", "view");
    // -- fix-rb: assigning orders to drivers (driver-assignment module) goes here.
    return map;
  }

  if (role === "ACCOUNTANT") {
    // ---- ACCOUNTANT: finance, purchasing, pending payments, supplier balances, sales-order
    // payments, exports and reports; stock view only.
    allow(map, "finance", "view", "create", "edit", "export");
    allow(map, "purchasing", "view", "create", "edit", "export");
    allow(map, "salesOrders", "view", "create", "export");
    allow(map, "b2b", "view", "edit", "export");
    allow(map, "products", "view");
    allow(map, "customers", "view");
    allow(map, "pos", "view");
    // -- fix-rb: ACCOUNTANT module lines go here.
    return map;
  }

  if (role === "B2B") {
    // ---- B2B staff: the B2B / Wholesale tab, customers, products view, sales orders.
    allow(map, "b2b", "view", "create", "edit", "delete", "export");
    allow(map, "customers", "view", "create", "edit");
    allow(map, "products", "view");
    allow(map, "salesOrders", "view", "create", "edit");
    // -- fix-rb: B2B module lines go here.
    return map;
  }

  if (role === "DRIVER") {
    // ---- DRIVER: minimal. Till for their van, van returns.
    allow(map, "pos", "view", "create");
    allow(map, "returns", "view", "create");
    // -- fix-rb: the driver module (van dashboard) goes here.
    return map;
  }

  if (role === "CASHIER") {
    // ---- legacy CASHIER (kept for old rows)
    allow(map, "products", "view");
    allow(map, "pos", "view", "create", "refund");
    allow(map, "orders", "view", "create");
    allow(map, "customers", "view", "create");
    allow(map, "delivery", "view");
    allow(map, "grooming", "view");
    // Van drivers are employees: they record returns into their van and pay customers back.
    allow(map, "returns", "view", "create");
    return map;
  }

  // ASSOCIATE or anything unknown: nothing beyond the location list.
  return map;
}

function parseJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** The stored map for one role: roleModules[role], else the legacy column (MANAGER / CASHIER). */
export function storedRoleMap(organization, role) {
  const all = parseJsonObject(organization?.roleModules);
  if (all && all[role] && typeof all[role] === "object") return all[role];
  if (role === "MANAGER") return parseJsonObject(organization?.managerModules);
  if (role === "CASHIER") return parseJsonObject(organization?.cashierModules);
  return null;
}

/** Stored rights on top of the role defaults; modules added later keep their defaults. */
export function resolveModulePermissions(organization, role) {
  const base = defaultModuleMap(role);
  if (role === "ADMIN") return base;
  const parsed = storedRoleMap(organization, role);
  if (!parsed) return base;
  for (const mod of MODULES) {
    for (const action of MODULE_ACTIONS) {
      if (typeof parsed?.[mod]?.[action] === "boolean") base[mod][action] = parsed[mod][action];
    }
  }
  return base;
}

/** Organisation columns the permission resolver reads. */
export const ORG_PERMISSION_SELECT = Object.freeze({ managerModules: true, cashierModules: true, roleModules: true });
