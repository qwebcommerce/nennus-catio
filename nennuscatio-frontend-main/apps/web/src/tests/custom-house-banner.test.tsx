import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CustomHouseBanner } from "@/features/pet-houses/components/CustomHouseBanner";
import { houseModelCount } from "@/features/pet-houses/lib/labels";
import { SettingsProviders, stubSettings } from "./helpers/settings";

afterEach(cleanup);

function banner(locale: "en" | "ar" = "en", whatsapp: string | null = null) {
  return render(
    <SettingsProviders
      locale={locale}
      getPublicSettings={async () => stubSettings({ socialLinks: { whatsapp } })}
    >
      <CustomHouseBanner />
    </SettingsProviders>,
  );
}
describe("custom pet house banner", () => {
  it("uses Arabic model-count grammar for zero, one, two, few and many", () => {
    expect(houseModelCount(0, "ar")).toBe("لا توجد تصاميم");
    expect(houseModelCount(1, "ar")).toBe("تصميم واحد");
    expect(houseModelCount(2, "ar")).toBe("تصميمان");
    expect(houseModelCount(5, "ar")).toBe("٥ تصاميم");
    expect(houseModelCount(16, "ar")).toBe("١٦ تصميماً");
    expect(houseModelCount(1, "en")).toBe("1 model");
    expect(houseModelCount(60, "en")).toBe("60 models");
  });
  it("uses the reference copy and photo, with an honest missing-contact state", async () => {
    banner();
    expect(screen.getByRole("heading", { name: "Their own space, your own idea." })).toBeTruthy();
    expect(screen.getByText("CUSTOM PET HOUSES")).toBeTruthy();
    expect(screen.getByText("From ready-made houses to custom designs, create a space that feels like home.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "A cat relaxing in a woven pet house" })).toBeTruthy();
    // While the settings load the button is disabled and says so, never "pending".
    expect(screen.getByText("Loading contact…")).toBeTruthy();
    await screen.findByText("WhatsApp contact pending");
    const button = screen.getByRole("button", { name: "Design a Custom House" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("house-custom-contact-note");
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("localises all banner text, image alt and missing-contact explanation in Arabic", async () => {
    banner("ar");
    expect(screen.getByRole("heading", { name: "مساحة تخصّهم، وفكرة من إبداعك." })).toBeTruthy();
    expect(screen.getByText("بيوت مخصصة للحيوانات الأليفة")).toBeTruthy();
    expect(screen.getByRole("img", { name: "قطة تستريح داخل بيت من الخوص" })).toBeTruthy();
    await screen.findByText("بانتظار إضافة جهة اتصال واتساب");
    expect((screen.getByRole("button", { name: "صمّم بيتاً مخصصاً" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["en", "ar"] as const)("uses only the configured WhatsApp contact with a %s inquiry draft", async (locale) => {
    banner(locale, "https://wa.me/97400000000");
    const link = (await screen.findByRole("link")) as HTMLAnchorElement;
    const url = new URL(link.href);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/97400000000");
    expect(url.searchParams.get("text")).toBe(locale === "en"
      ? "Hi Nennus Catio, I'd like to discuss a custom pet house."
      : "مرحباً Nennus Catio، أود مناقشة تصميم بيت مخصص لحيواني الأليف.");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
