import { describe, expect, it } from "vitest";
import en from "@/messages/en/common.json";
import ar from "@/messages/ar/common.json";
import {
  adminNavigation,
  visibleAdminNavigation,
} from "@/layouts/admin/navigation";

describe("grouped admin navigation", () => {
  it("provides every group and menu label in both language files", () => {
    const keys = visibleAdminNavigation("owner").flatMap((group) => [
      ...(group.labelKey ? [group.labelKey] : []),
      ...group.items.map((item) => item.labelKey ?? item.id),
    ]);
    for (const messages of [en, ar]) {
      for (const key of keys) expect(messages.Admin).toHaveProperty(key);
    }
  });

  it("keeps every existing link exactly once in the approved owner menu order", () => {
    const groups = visibleAdminNavigation("owner");
    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(groups.map((group) => group.id)).toEqual([
      "overview",
      "business",
      "scheduling",
      "customers",
      "finance",
      "system",
    ]);
    expect(ids).toEqual([
      "dashboard",
      "orders",
      "bookings",
      // Relocation after Bookings (#15 15d, plan section 4.7).
      "relocation",
      "products",
      "groomingPackages",
      "promotions",
      "deliverySlots",
      "groomingCalendar",
      "dispatch",
      "customers",
      "finance",
      "settings",
      // The owner's POS connection (#16 part 2c), next to Settings.
      "integrations",
      "team",
    ]);
    expect(new Set(ids).size).toBe(adminNavigation.length);
    expect(
      groups.find((group) => group.id === "customers")?.labelKey,
    ).toBeUndefined();
  });

  it("keeps operational links for Core Admin but hides owner-only Team & Access and Integrations", () => {
    const items = visibleAdminNavigation("core").flatMap(
      (group) => group.items,
    );
    expect(items).toHaveLength(adminNavigation.length - 2);
    expect(items.some((item) => item.id === "team")).toBe(false);
    expect(items.some((item) => item.id === "integrations")).toBe(false);
    expect(items.some((item) => item.id === "groomingPackages")).toBe(true);
  });

  it("shows only Finance Dashboard and removes all empty groups for Finance", () => {
    const groups = visibleAdminNavigation("finance");
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("finance");
    expect(groups[0].items.map((item) => item.id)).toEqual(["finance"]);
    expect(groups[0].items[0].labelKey).toBe("financeDashboard");
  });
});
