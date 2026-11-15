import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PublicLayout } from "@/layouts/public/PublicLayout";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { SettingsProviders, stubSettings } from "./helpers/settings";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/",
}));
vi.mock("@/shared/ui/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));

afterEach(cleanup);

const messages = {
  Common: {
    brand: "Nennus Catio",
    tagline: "A little care. A happier pet.",
    menu: "Open navigation",
    close: "Close navigation",
    navigation: "Main navigation",
  },
};

function shell(
  getPublicSettings: Parameters<typeof SettingsProviders>[0]["getPublicSettings"],
  source: "api" | "mock" = "api",
) {
  return render(
    <SettingsProviders getPublicSettings={getPublicSettings} source={source} messages={messages}>
      <MockDataProvider>
        <PublicLayout>
          <p>page</p>
        </PublicLayout>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

describe("public shell settings", () => {
  it("hides the social links while loading, then shows configured links and hours from the repository", async () => {
    shell(async () =>
      stubSettings({
        hours: { en: "Open daily 9–9", ar: "يومياً ٩–٩" },
        socialLinks: { whatsapp: "https://wa.me/97400000000", instagram: null },
      }),
    );
    expect(screen.getByText("Loading links")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();

    const whatsapp = await screen.findByRole("link", { name: "WhatsApp" });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/97400000000");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Instagram link not set")).toBeTruthy();
    expect(screen.getByText("Open daily 9–9")).toBeTruthy();
    expect(screen.queryByText("Loading links")).toBeNull();
    // The test-site notice stays true whichever payment company is on (8c SkipCash's sandbox, or the test
    // page) and no longer calls grooming bookings sample data (9e).
    expect(screen.getByText(/orders and grooming bookings are real but use test data\. Payments are test payments: no real money moves\./)).toBeTruthy();
    expect(screen.queryByText(/until SkipCash is connected|still sample data/)).toBeNull();
  });

  it("shows one retry state in the footer when settings cannot be loaded, and recovers", async () => {
    let attempts = 0;
    shell(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("boom");
      return stubSettings({ socialLinks: { facebook: "https://www.facebook.com/example" } });
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Links could not be loaded.");
    expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    const facebook = await screen.findByRole("link", { name: "Facebook" });
    expect(facebook).toHaveAttribute("href", "https://www.facebook.com/example");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });

  it("keeps the synthetic-data notice when the mock source is selected", async () => {
    shell(async () => stubSettings(), "mock");
    await screen.findByText("WhatsApp link not set");
    expect(screen.getByText(/synthetic data only/)).toBeTruthy();
    expect(screen.queryByText(/test payment page/)).toBeNull();
  });
});
