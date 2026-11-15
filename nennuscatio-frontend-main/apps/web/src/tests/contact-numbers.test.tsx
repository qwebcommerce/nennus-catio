import type { ComponentProps } from "react";
import type { PublicSiteSettings } from "@nennus-catio/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ContactPage } from "@/features/contact/pages/ContactPage";
import { PublicLayout } from "@/layouts/public/PublicLayout";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { SettingsProviders, stubSettings } from "./helpers/settings";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/contact",
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

const instagram = {
  instagram: "https://www.instagram.com/nennus_catio/",
  instagramGrooming: "https://www.instagram.com/nennus_grooming/",
  instagramProjects: "https://www.instagram.com/nennus_projects/",
};

function contact(settings: PublicSiteSettings, locale: "en" | "ar" = "en") {
  return render(
    <SettingsProviders locale={locale} getPublicSettings={async () => settings}>
      <ContactPage />
    </SettingsProviders>,
  );
}

function footer(settings: PublicSiteSettings) {
  return render(
    <SettingsProviders getPublicSettings={async () => settings} messages={messages}>
      <MockDataProvider>
        <PublicLayout>
          <p>page</p>
        </PublicLayout>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

describe("contact numbers and Instagram accounts from Settings (D232)", () => {
  it("shows the business phone, the WhatsApp number and the three Instagram accounts", async () => {
    contact(stubSettings({ phone: "+97444445555", socialLinks: { whatsapp: "https://wa.me/97455551234", ...instagram } }));
    const call = await screen.findByRole("link", { name: /Call us/ });
    expect(call).toHaveAttribute("href", "tel:+97444445555");
    expect(call).toHaveTextContent("+974 4444 5555");
    const whatsapp = screen.getByRole("link", { name: /Fastest way to reach us/ });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/97455551234");
    expect(whatsapp).toHaveTextContent("+974 5555 1234");
    expect(screen.getByText(/Call us, or reach out through WhatsApp, Instagram or the form/)).toBeTruthy();
    for (const [handle, href] of [
      ["@nennus_catio", instagram.instagram],
      ["@nennus_grooming", instagram.instagramGrooming],
      ["@nennus_projects", instagram.instagramProjects],
    ]) {
      expect(screen.getByRole("link", { name: handle })).toHaveAttribute("href", href);
    }
    expect(screen.queryByText("Link coming soon")).toBeNull();
  });

  it("hides the Call us row until a phone is set", async () => {
    contact(stubSettings({ socialLinks: { whatsapp: "https://wa.me/97455551234" } }));
    await screen.findByRole("link", { name: /Fastest way to reach us/ });
    expect(screen.queryByRole("link", { name: /Call us/ })).toBeNull();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.getByText(/Reach out to us through WhatsApp, Instagram or the form/)).toBeTruthy();
  });

  it("keeps the numbers left to right on the Arabic page", async () => {
    contact(stubSettings({ phone: "+97444445555", socialLinks: { whatsapp: "https://wa.me/97455551234" } }), "ar");
    const call = await screen.findByRole("link", { name: /اتصل بنا/ });
    expect(within(call).getByText("+974 4444 5555").closest("bdi")).toHaveAttribute("dir", "ltr");
    const whatsapp = screen.getByRole("link", { name: /أسرع طريقة للتواصل معنا/ });
    expect(within(whatsapp).getByText("+974 5555 1234").closest("bdi")).toHaveAttribute("dir", "ltr");
  });

  it("shows the phone in the footer once it is set, and no longer calls it pending", async () => {
    footer(stubSettings({ phone: "+97444445555" }));
    const phone = await screen.findByRole("link", { name: "+974 4444 5555" });
    expect(phone).toHaveAttribute("href", "tel:+97444445555");
    expect(screen.getByText("Address pending approval")).toBeTruthy();
    expect(screen.queryByText("Address and phone pending approval")).toBeNull();
    cleanup();

    footer(stubSettings());
    expect(await screen.findByText("Address and phone pending approval")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /\+974/ })).toBeNull();
  });
});
