// The logo (D233): the cat and the NENNUS CATIO name cut from the supplied logo, navy on light
// backgrounds and cream on the navy footer and admin sidebar.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PublicLayout } from "@/layouts/public/PublicLayout";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { Brand } from "@/shared/ui/Brand";
import { logoFile } from "./helpers/logo";
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

const navy = ["/images/brand/nennus-catio-mark.png", "/images/brand/nennus-catio-wordmark.png"];
const cream = ["/images/brand/nennus-catio-mark-light.png", "/images/brand/nennus-catio-wordmark-light.png"];

describe("the Nennus Catio logo (D233)", () => {
  it("is one link named Nennus Catio, with the cat and the name as decorative images", () => {
    render(
      <SettingsProviders messages={messages}>
        <Brand />
      </SettingsProviders>,
    );
    const link = screen.getByRole("link", { name: "Nennus Catio" });
    expect(link).toHaveAttribute("href", "/");
    const images = [...link.querySelectorAll("img")];
    expect(images.map(logoFile)).toEqual(navy);
    expect(images.every((image) => image.getAttribute("alt") === "")).toBe(true);
    // The old paw icon and the tagline under the name are gone: the new logo carries its own name.
    expect(link.querySelector("svg")).toBeNull();
    expect(link).not.toHaveTextContent("A little care. A happier pet.");
  });

  it("is navy in the header and cream on the navy footer", async () => {
    render(
      <SettingsProviders getPublicSettings={async () => stubSettings()} messages={messages}>
        <MockDataProvider>
          <PublicLayout>
            <p>page</p>
          </PublicLayout>
        </MockDataProvider>
      </SettingsProviders>,
    );
    await screen.findByText("page");
    const header = document.querySelector(".public-header") as HTMLElement;
    const footer = document.querySelector("footer") as HTMLElement;
    expect([...header.querySelectorAll(".brand img")].map(logoFile)).toEqual(navy);
    expect([...footer.querySelectorAll(".brand img")].map(logoFile)).toEqual(cream);
  });

  // The tests run from apps/web.
  it("has every file, in the proportions the pages size it by", () => {
    // Width and height as given to the images in the code; the files must keep these proportions,
    // because each image is sized by its height alone.
    const shapes: [string, number, number][] = [
      ["nennus-catio-mark.png", 53, 60],
      ["nennus-catio-mark-light.png", 53, 60],
      ["nennus-catio-wordmark.png", 152, 50],
      ["nennus-catio-wordmark-light.png", 152, 50],
      ["nennus-catio-logo.png", 110, 130],
      ["nennus-catio-logo-light.png", 110, 130],
    ];
    for (const [name, width, height] of shapes) {
      const png = readFileSync(resolve("public/images/brand", name));
      expect(png.subarray(1, 4).toString("latin1"), name).toBe("PNG");
      const ratio = png.readUInt32BE(16) / png.readUInt32BE(20);
      expect(Math.abs(ratio / (width / height) - 1), name).toBeLessThan(0.02);
    }
    const icon = readFileSync(resolve("src/app/icon.png"));
    expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([256, 256]);
  });
});
