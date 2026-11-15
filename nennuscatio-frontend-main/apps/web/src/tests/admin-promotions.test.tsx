import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { AdminPromotionsPage } from "@/features/admin/promotions/pages/AdminPromotionsPage";
import {
  PromotionsCreateButton,
  PromotionsWorkspaceProvider,
} from "@/features/admin/promotions/PromotionsWorkspace";
import {
  promotionPeriod,
  promotionStatus,
} from "@/features/admin/promotions/promotion-view";
import { mockPromotionsRepository as repo } from "@/mocks/adapters/promotions-repository";
import { seedDemo } from "@/mocks/data/business";
const state = seedDemo();
let role = "core";
vi.mock("@/mocks/MockDataProvider", () => ({ useBusiness: () => state }));
vi.mock("@/layouts/global/GlobalProviders", () => ({
  useDemoIdentity: () => ({ role }),
}));
vi.mock("@/shared/ui/FeatureFoundation", () => ({
  FeatureFoundation: () => <p>Restricted preview</p>,
}));
// The page module now also holds the API-mode page (11d), whose links come from the app's navigation.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T08:00:00Z"));
  repo.reset();
  role = "core";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function page(locale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Qatar">
      <DashboardDateProvider>
        <PromotionsWorkspaceProvider>
          <PromotionsCreateButton />
          <AdminPromotionsPage />
        </PromotionsWorkspaceProvider>
      </DashboardDateProvider>
    </NextIntlClientProvider>,
  );
}
describe("Promotions mock management", () => {
  it("uses inclusive Qatar dates, ongoing periods and inactive precedence", () => {
    const p = repo.getSnapshot()[1];
    expect(promotionStatus(p, p.from)).toBe("active");
    expect(promotionStatus(p, p.to)).toBe("active");
    expect(promotionStatus(p, "2026-09-01")).toBe("scheduled");
    expect(promotionStatus(p, "2026-11-01")).toBe("ended");
    expect(promotionStatus({ ...p, enabled: false }, p.from)).toBe("inactive");
    expect(promotionPeriod(repo.getSnapshot()[2], "en")).toBe("Ongoing");
    expect(promotionPeriod(p, "en")).not.toMatch(/[\u2009\u202f]/);
  });
  it("rejects duplicate codes, bad dates, amounts and insufficient bundle contents without writes", () => {
    const p = repo.getSnapshot()[1],
      snapshot = repo.getSnapshot();
    expect(repo.save({ ...p, code: "welcome20" }).error).toBe("code");
    expect(repo.save({ ...p, from: "2026-02-30" }, p.id).error).toBe("dates");
    expect(repo.save({ ...p, to: "2026-01-01" }, p.id).error).toBe("dates");
    expect(repo.save({ ...p, offer: "percent", value: 101 }, p.id).error).toBe(
      "offer",
    );
    expect(repo.save({ ...p, limit: 1 }, p.id).error).toBe("limits");
    expect(
      repo.save({ ...p, type: "bundle", productIds: [] }, p.id).error,
    ).toBe("products");
    expect(repo.getSnapshot()).toBe(snapshot);
  });
  it("normalizes a new code and preserves historical redemptions when editing", () => {
    const p = repo.getSnapshot()[1],
      added = repo.save({
        ...p,
        code: " test30 ",
        name: { en: "Demo offer", ar: "عرض تجريبي" },
      });
    expect(added.promotion?.code).toBe("TEST30");
    expect(added.promotion?.redemptions).toEqual([]);
    const edited = repo.save({ ...p, value: 3000 }, p.id);
    expect(edited.promotion?.redemptions).toEqual(p.redemptions);
    expect(repo.getSnapshot()).toHaveLength(13);
  });
  it("opens, closes and restores focus; visibility updates only the mock record", () => {
    page();
    expect(
      screen.queryByRole("complementary", { name: "Promotion details" }),
    ).not.toBeInTheDocument();
    const open = screen.getByRole("button", {
      name: "Open promotion WELCOME20",
    });
    fireEvent.click(open);
    const panel = screen.getByRole("complementary", {
      name: "Promotion details",
    });
    expect(panel).toHaveFocus();
    fireEvent.click(
      within(panel).getByRole("switch", { name: "Visible on Store" }),
    );
    expect(repo.getSnapshot()[1].visible).toBe(false);
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(open).toHaveFocus();
    expect(
      screen.queryByRole("complementary", { name: "Promotion details" }),
    ).not.toBeInTheDocument();
  });
  it("combines filters, resets pagination, displays empty state and supports keyboard tabs", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.getByText("Showing 11–12 of 12 promotions"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter status" }), {
      target: { value: "scheduled" },
    });
    expect(screen.getByText("Showing 1–2 of 2 promotions")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search promotions" }),
      { target: { value: "missing offer" } },
    );
    expect(screen.getByText("No matching promotions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.keyDown(
      screen.getByRole("tab", { name: "All Promotions (12)" }),
      { key: "End" },
    );
    expect(screen.getByRole("tab", { name: "Bundles (4)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Showing 1–4 of 4 promotions")).toBeInTheDocument();
  });
  it("requires confirmation before deactivation and can reactivate a record", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: "Open promotion WELCOME20" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(repo.getSnapshot()[1].enabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm deactivation" }),
    );
    expect(repo.getSnapshot()[1].enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(repo.getSnapshot()[1].enabled).toBe(true);
  });
  it("creates and edits bilingual promotions through the shared dialog", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Create Promotion" }));
    fireEvent.change(screen.getByLabelText("Name (English)"), {
      target: { value: "Demo offer" },
    });
    fireEvent.change(screen.getByLabelText("Name (Arabic)"), {
      target: { value: "عرض تجريبي" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));
    expect(repo.getSnapshot()).toHaveLength(13);
    expect(
      screen.getByRole("complementary", { name: "Promotion details" }),
    ).toHaveTextContent("Demo offer");
    fireEvent.click(
      screen.getByText("Edit Promotion", { selector: ".promo-edit" }),
    );
    fireEvent.change(screen.getByLabelText("Name (English)"), {
      target: { value: "Edited offer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));
    expect(repo.getSnapshot()[0].name.en).toBe("Edited offer");
    expect(repo.getSnapshot()).toHaveLength(13);
  });
  it("provides Arabic labels and prevents Finance from seeing operational controls", () => {
    page("ar");
    expect(
      screen.getByRole("heading", { name: "العروض الترويجية" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "افتح العرض WELCOME20" }),
    );
    expect(
      screen.getByRole("complementary", { name: "تفاصيل العرض" }),
    ).toBeInTheDocument();
    cleanup();
    role = "finance";
    page();
    expect(screen.getByText("Restricted preview")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
