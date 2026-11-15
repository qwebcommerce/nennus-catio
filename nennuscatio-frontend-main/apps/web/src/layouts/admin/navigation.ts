import {
  LayoutDashboard,
  ShoppingBag,
  CalendarCheck,
  UsersRound,
  Package,
  Truck,
  Scissors,
  CalendarDays,
  WalletCards,
  Settings2,
  ShieldCheck,
  Tag,
  Route,
  Plane,
  PlugZap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DemoRole, ModuleId } from "@nennus-catio/contracts";
import { canPreviewModule } from "@/shared/lib/access";

export const adminNavigation: readonly {
  id: ModuleId;
  href: string;
  icon: LucideIcon;
  labelKey?: "customersNavigation" | "financeDashboard";
}[] = [
  { id: "dashboard", href: "/admin", icon: LayoutDashboard },
  { id: "orders", href: "/admin/orders", icon: ShoppingBag },
  { id: "bookings", href: "/admin/bookings", icon: CalendarCheck },
  { id: "relocation", href: "/admin/relocation", icon: Plane },
  {
    id: "customers",
    href: "/admin/customers",
    icon: UsersRound,
    labelKey: "customersNavigation",
  },
  { id: "products", href: "/admin/products", icon: Package },
  { id: "promotions", href: "/admin/promotions", icon: Tag },
  { id: "deliverySlots", href: "/admin/delivery-slots", icon: Truck },
  { id: "dispatch", href: "/admin/dispatch", icon: Route },
  { id: "groomingPackages", href: "/admin/grooming-packages", icon: Scissors },
  {
    id: "groomingCalendar",
    href: "/admin/grooming-calendar",
    icon: CalendarDays,
  },
  {
    id: "finance",
    href: "/admin/finance",
    icon: WalletCards,
    labelKey: "financeDashboard",
  },
  { id: "settings", href: "/admin/settings", icon: Settings2 },
  // The owner's POS connection (#16 part 2c), next to Settings.
  { id: "integrations", href: "/admin/integrations", icon: PlugZap },
  { id: "team", href: "/admin/team", icon: ShieldCheck },
];

/**
 * Admin pages that still show the prototype's sample data in API mode, with the branch that makes
 * each real (D141). The shell shows a banner on them so staff never mistake the figures for live ones.
 */
export const SAMPLE_DATA_PAGES: Partial<Record<ModuleId, { branch: number; what: { en: string; ar: string } }>> = {
  // Dashboard and Finance became real in #12 part 1 (D222-D223).
  dispatch: { branch: 17, what: { en: "FleetWiz dispatch", ar: "التوزيع عبر FleetWiz" } },
};

const navigationGroups: readonly {
  id: string;
  labelKey?:
    | "businessOperations"
    | "schedulingDispatch"
    | "financeSection"
    | "systemSection";
  items: readonly ModuleId[];
}[] = [
  { id: "overview", items: ["dashboard"] },
  {
    id: "business",
    labelKey: "businessOperations",
    // Relocation after Bookings (plan BRANCH_15 section 4.7).
    items: ["orders", "bookings", "relocation", "products", "groomingPackages", "promotions"],
  },
  {
    id: "scheduling",
    labelKey: "schedulingDispatch",
    items: ["deliverySlots", "groomingCalendar", "dispatch"],
  },
  { id: "customers", items: ["customers"] },
  { id: "finance", labelKey: "financeSection", items: ["finance"] },
  { id: "system", labelKey: "systemSection", items: ["settings", "integrations", "team"] },
];

// One menu configuration for desktop and drawer; retain the flat route registry.
// Only modules the user may view are listed; empty groups disappear (D105).
export function visibleNavigation(canView: (module: ModuleId) => boolean) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.flatMap((id) => {
        const item = adminNavigation.find((entry) => entry.id === id);
        return item && canView(id) ? [item] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** Mock-mode demo roles. */
export function visibleAdminNavigation(role: DemoRole) {
  return visibleNavigation((module) => canPreviewModule(role, module));
}

/** The first page this user may open, for redirecting away from hidden pages (D105). */
export function firstAllowedHref(canView: (module: ModuleId) => boolean): string | null {
  return visibleNavigation(canView)[0]?.items[0]?.href ?? null;
}
