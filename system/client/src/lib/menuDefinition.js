/**
 * fix-rf: the staff menu as ONE data definition (docs/testing/menu-roles.md).
 *
 * The sidebar (AppLayout), each role's landing page, the admin's "Preview menu as role" and the
 * "Who sees what" guide (/permissions/guide) are all computed from this file, so they cannot
 * drift apart. Routes themselves live in App.jsx and keep their own guards; an item's `show`
 * rule is the menu check, `route` (default: same as `show`) mirrors the route guard.
 *
 * Rules are data:
 *   undefined / true          always
 *   { perm: "pos" }           legacy key (can("pos"); derived from the module map, see LEGACY_TO_MODULE)
 *   { mod: "finance.view" }   module right (canModule("finance", "view"))
 *   { any: [r, ...] }         one of
 *   { all: [r, ...] }         every one of
 *   { not: r }                negation
 *   { roles: ["ADMIN"] }      the user's role is one of these
 *   { owner: true }           the business owner (first top admin)
 *   { van: true }             a driver, or a user whose own location is a van
 * `route: "menu"` means the screen is only for roles that have it in their menu.
 */
import { resolveClientPermissions } from "./permissions.js";

export const MENU_SECTIONS = [
  {
    id: "overview",
    icon: "dashboard",
    items: [
      // A role whose menu leaves the Dashboard out is sent to its home page from /dashboard (App.jsx).
      { id: "dashboard", to: "/dashboard", icon: "dashboard", label: "menu.item.dashboard", route: "menu" },
      { id: "analytics", to: "/analytics", icon: "analytics", label: "menu.item.analytics", show: { mod: "finance.view" } },
      { id: "reports", to: "/reports", icon: "reports", label: "menu.item.reports", show: { perm: "reports" } },
      { id: "sales", to: "/sales", icon: "sales", label: "menu.item.sales", show: { any: [{ perm: "pos" }, { perm: "reports" }] } },
      { id: "alerts", to: "/alerts", icon: "bell", label: "menu.item.alerts", badge: "alerts" },
    ],
  },
  {
    id: "selling",
    icon: "pos",
    items: [
      { id: "pos", to: "/pos", end: true, icon: "pos", label: "menu.item.pos", show: { perm: "pos" } },
      { id: "b2b", to: "/pos/b2b", icon: "purchases", label: "menu.item.b2b", show: { mod: "b2b.view" } },
      { id: "salesOrders", to: "/sales-orders", icon: "purchases", label: "menu.item.salesOrders", show: { mod: "salesOrders.view" } },
      // fix-rf: was can("productsView"), but the route (and /api/online-orders) need Website orders → view.
      { id: "onlineOrders", to: "/online-orders", icon: "products", label: "menu.item.onlineOrders", show: { mod: "orders.view" } },
      { id: "refunds", to: "/returns", icon: "returns", label: "menu.item.refunds", show: { perm: "refunds" } },
      { id: "cash", to: "/cash", icon: "funds", label: "menu.item.cash", show: { perm: "cashSession" } },
      { id: "promotions", to: "/promotions", icon: "coupons", label: "menu.item.promotions", show: { mod: "promotions.view" } },
    ],
  },
  {
    id: "deliveries",
    icon: "transfer",
    items: [
      {
        id: "driver",
        to: "/driver",
        icon: "transfer",
        label: "menu.item.driver",
        testId: "nav-driver",
        badge: "driverUnseen",
        show: { all: [{ mod: "driver.view" }, { van: true }] },
        route: { mod: "driver.view" },
      },
      { id: "dispatch", to: "/dispatch", icon: "transfer", label: "menu.item.dispatch", testId: "nav-dispatch", show: { mod: "dispatch.view" } },
      { id: "approvals", to: "/driver-approvals", icon: "audit", label: "menu.item.approvals", testId: "nav-approvals", badge: "approvals", show: { mod: "driverApprovals.view" } },
      {
        id: "vanReturns",
        to: "/van-returns",
        icon: "transfer",
        label: "menu.item.vanReturns",
        testId: "nav-van-returns",
        // fix-rf: also for whoever pays customers back (accountant: returns → refund, no create).
        show: { all: [{ mod: "returns.view" }, { any: [{ mod: "returns.create" }, { mod: "returns.refund" }] }] },
        route: { mod: "returns.view" },
      },
      { id: "vehicles", to: "/vehicles", icon: "inventory", label: "menu.item.vehicles", show: { any: [{ mod: "delivery.create" }, { mod: "returns.view" }] } },
    ],
  },
  {
    id: "stock",
    icon: "inventory",
    items: [
      { id: "products", to: "/products", icon: "products", label: "menu.item.products", show: { perm: "productsView" } },
      { id: "categories", to: "/categories", icon: "categories", label: "menu.item.categories", show: { perm: "catalogEdit" } },
      // The Transfer screen has its own "Transfer history" tab.
      { id: "transfer", to: "/transfer", icon: "transfer", label: "menu.item.transfer", show: { perm: "transfer" } },
      {
        id: "transferHistory",
        to: "/transfer/history",
        icon: "transfer",
        label: "menu.item.transferHistory",
        // Read-only history for staff who follow stock (van returns) but cannot transfer. Every role has
        // Locations → view only to read the location list, so that right alone does not show it.
        show: { all: [{ mod: "warehouses.view" }, { not: { perm: "transfer" } }, { mod: "returns.view" }] },
        route: { mod: "warehouses.view" },
      },
      { id: "count", to: "/count", icon: "count", label: "menu.item.count", show: { perm: "stockCount" } },
      { id: "damaged", to: "/damaged-stock", icon: "returns", label: "menu.item.damaged", show: { mod: "returns.view" } },
    ],
  },
  {
    id: "purchasing",
    icon: "purchases",
    items: [
      { id: "purchases", to: "/purchases", icon: "purchases", label: "menu.item.purchases", show: { perm: "purchases" } },
      { id: "purchaseOrders", to: "/purchase-orders", icon: "purchases", label: "menu.item.purchaseOrders", show: { perm: "purchases" } },
    ],
  },
  {
    id: "money",
    icon: "funds",
    items: [
      { id: "finance", to: "/finance", icon: "purchases", label: "menu.item.finance", show: { mod: "finance.view" } },
      { id: "confirmations", to: "/payment-confirmations", icon: "audit", label: "menu.item.confirmations", testId: "nav-confirmations", badge: "confirmations", show: { mod: "paymentConfirm.view" } },
      { id: "accounts", to: "/customer-accounts", icon: "accounts", label: "menu.item.accounts", show: { perm: "receivables" } },
    ],
  },
  {
    id: "customers",
    icon: "customers",
    items: [
      { id: "customers", to: "/customers", icon: "customers", label: "menu.item.customers", show: { perm: "customers" } },
      { id: "appointments", to: "/appointments", icon: "appointments", label: "menu.item.appointments", show: { mod: "grooming.view" } },
      { id: "groomingSetup", to: "/admin/grooming", icon: "categories", label: "menu.item.groomingSetup", show: { mod: "grooming.view" } },
      { id: "relocation", to: "/admin/relocation", icon: "categories", label: "menu.item.relocation", show: { mod: "relocation.view" } },
    ],
  },
  {
    id: "admin",
    icon: "admin",
    items: [
      { id: "users", to: "/users", icon: "users", label: "menu.item.users", show: { roles: ["ADMIN"] } },
      // The Permissions API is owner-only (requireOwner).
      { id: "permissions", to: "/permissions", end: true, icon: "audit", label: "menu.item.permissions", show: { owner: true } },
      { id: "guide", to: "/permissions/guide", icon: "audit", label: "menu.item.guide", show: { roles: ["ADMIN"] } },
      { id: "branches", to: "/branches", icon: "branches", label: "menu.item.branches", show: { roles: ["ADMIN"] } },
      { id: "petTypes", to: "/pet-types", icon: "categories", label: "menu.item.petTypes", show: { perm: "catalogEdit" } },
      { id: "audit", to: "/audit", icon: "audit", label: "menu.item.audit", show: { perm: "audit" } },
      { id: "settings", to: "/settings", icon: "settings", label: "menu.item.settings" },
    ],
  },
];

/**
 * Roles with their own short, flat menu (item ids in order); everything else is left out of the
 * menu even when the role has the right (those screens open from inside "My van").
 */
export const ROLE_MENUS = Object.freeze({
  DRIVER: ["driver", "pos", "cash"],
});

/** Landing page per role: the first of these items the user can see; else the first visible item. */
export const ROLE_HOMES = Object.freeze({
  DRIVER: ["driver"],
  SALES: ["pos", "dashboard"],
  CASHIER: ["pos", "dashboard"],
  ACCOUNTANT: ["confirmations", "finance", "dashboard"],
  B2B: ["b2b", "salesOrders", "dashboard"],
  SUPERVISOR: ["dashboard"],
  MANAGER: ["dashboard"],
  ADMIN: ["dashboard"],
});

/** Order of roles on the guide and in the preview picker. */
export const MENU_ROLES = ["ADMIN", "SUPERVISOR", "SALES", "ACCOUNTANT", "B2B", "DRIVER", "MANAGER", "CASHIER"];
export const MENU_LEGACY_ROLES = ["MANAGER", "CASHIER"];

/** Mirror of server LEGACY_TO_MODULE (lib/permissions.js): legacy key → [module, action]. */
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

export const ALL_MENU_ITEMS = MENU_SECTIONS.flatMap((s) => s.items.map((it) => ({ ...it, section: s.id })));
const ITEM_BY_ID = Object.fromEntries(ALL_MENU_ITEMS.map((it) => [it.id, it]));
export function menuItem(id) {
  return ITEM_BY_ID[id] || null;
}

/** Evaluate one rule against a context { role, can, canModule, isOrgOwner, isVanUser }. */
export function evalRule(rule, ctx) {
  if (rule === undefined || rule === null || rule === true) return true;
  if (rule === false) return false;
  if (rule.perm) return Boolean(ctx.can(rule.perm));
  if (rule.mod) {
    const [mod, action] = String(rule.mod).split(".");
    return Boolean(ctx.canModule(mod, action || "view"));
  }
  if (rule.any) return rule.any.some((r) => evalRule(r, ctx));
  if (rule.all) return rule.all.every((r) => evalRule(r, ctx));
  if (rule.not) return !evalRule(rule.not, ctx);
  if (rule.roles) return rule.roles.includes(ctx.role);
  if (rule.owner) return Boolean(ctx.isOrgOwner);
  if (rule.van) return Boolean(ctx.isVanUser);
  return false;
}

/** Context for a role computed from its module map (preview and guide). */
export function roleContext(role, modules) {
  const admin = role === "ADMIN";
  const canModule = (mod, action = "view") => admin || Boolean(modules?.[mod]?.[action]);
  return {
    role,
    canModule,
    can: (key) => {
      const pair = LEGACY_TO_MODULE[key];
      return pair ? canModule(pair[0], pair[1]) : false;
    },
    // The business owner is the first top admin; the preview shows the owner's menu for "Top admin".
    isOrgOwner: admin,
    // A role preview cannot know a user's location: drivers are van users, other roles are not.
    isVanUser: role === "DRIVER",
  };
}

/**
 * Context for the signed-in user: the same checks as AuthContext's can() / canModule().
 * `ownBranchKind` is the kind of the user's own location (VAN → "My van").
 */
export function userContext(user, ownBranchKind) {
  if (!user) return roleContext("", {});
  const admin = user.role === "ADMIN";
  const perms = resolveClientPermissions(user);
  return {
    role: user.role,
    canModule: (mod, action = "view") => admin || Boolean(user.modules?.[mod]?.[action]),
    can: (key) => Boolean(perms?.[key]),
    isOrgOwner: user.isOrgOwner === true,
    isVanUser: user.role === "DRIVER" || ownBranchKind === "VAN",
  };
}

/** Is the item in this context's menu? */
export function itemInMenu(item, ctx) {
  const flat = ROLE_MENUS[ctx.role];
  if (flat && !flat.includes(item.id)) return false;
  return evalRule(item.show, ctx);
}

/** May this context open the item's screen at all (mirror of the route guard)? */
export function itemRouteAllowed(item, ctx) {
  if (item.route === "menu") return itemInMenu(item, ctx);
  return evalRule(item.route !== undefined ? item.route : item.show, ctx);
}

/**
 * The visible menu: [{ id, icon, items: [...] }]. A role with a flat menu gets one section with
 * id null (rendered without a heading). Sections without visible items are left out.
 */
export function visibleMenu(ctx) {
  const flat = ROLE_MENUS[ctx.role];
  if (flat) {
    const items = flat.map((id) => ITEM_BY_ID[id]).filter((it) => it && evalRule(it.show, ctx));
    return [{ id: null, icon: null, items }];
  }
  return MENU_SECTIONS.map((s) => ({ ...s, items: s.items.filter((it) => evalRule(it.show, ctx)) })).filter(
    (s) => s.items.length > 0,
  );
}

/** Flat list of visible links (paths), in menu order. */
export function visibleMenuPaths(ctx) {
  return visibleMenu(ctx).flatMap((s) => s.items.map((it) => it.to));
}

/** The landing page for a context. */
export function homePath(ctx) {
  const wanted = ROLE_HOMES[ctx.role] || ["dashboard"];
  const shown = visibleMenu(ctx).flatMap((s) => s.items);
  for (const id of wanted) {
    const hit = shown.find((it) => it.id === id);
    if (hit) return hit.to;
  }
  return shown[0]?.to || "/dashboard";
}

function pathMatches(path, to) {
  return path === to || path.startsWith(`${to}/`);
}

/** The menu item that owns a path (longest matching link among the given items). */
export function itemForPath(pathname, items = ALL_MENU_ITEMS) {
  const p = pathname || "";
  let best = null;
  for (const it of items) {
    if (pathMatches(p, it.to) && (!best || it.to.length > best.to.length)) best = it;
  }
  return best;
}

/** The section to open for a path in a visible menu. */
export function sectionForPath(pathname, menu) {
  const hit = itemForPath(pathname, menu.flatMap((s) => s.items.map((it) => ({ ...it, section: s.id }))));
  return hit?.section || null;
}

/**
 * Who sees what: for each item and role, "menu" (in the menu), "link" (may open it, but it is
 * not in the menu: it opens from another screen) or "none".
 */
export function accessMatrix(roleModules, roles = MENU_ROLES) {
  const ctxs = Object.fromEntries(roles.map((r) => [r, roleContext(r, roleModules?.[r])]));
  return MENU_SECTIONS.map((s) => ({
    id: s.id,
    items: s.items.map((it) => ({
      item: it,
      cells: Object.fromEntries(
        roles.map((r) => {
          const ctx = ctxs[r];
          const state = itemInMenu(it, ctx) ? "menu" : itemRouteAllowed(it, ctx) ? "link" : "none";
          return [r, state];
        }),
      ),
    })),
  }));
}
