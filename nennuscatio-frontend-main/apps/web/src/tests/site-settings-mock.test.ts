import { describe, expect, it } from "vitest";
import { mockBusinessRepository } from "@/mocks/adapters/business-repository";
import {
  createMockSiteSettingsRepository,
  toPublicSiteSettings,
} from "@/mocks/adapters/site-settings-repository";

describe("mock site settings repository", () => {
  it("maps the prototype settings to the public contract and hides unusable links", () => {
    const settings = toPublicSiteSettings({
      headline: { en: "Headline", ar: "عنوان" },
      description: { en: "Description", ar: "وصف" },
      hours: { en: "Hours", ar: "ساعات" },
      instagram: "https://www.instagram.com/example",
      instagramGrooming: "",
      instagramProjects: "http://www.instagram.com/insecure",
      facebook: "not a url",
      whatsapp: "https://wa.me/97400000000",
    });
    expect(settings.brand).toEqual({ en: "Nennus Catio", ar: "Nennus Catio" });
    expect(settings.headline).toEqual({ en: "Headline", ar: "عنوان" });
    expect(settings.currency).toBe("QAR");
    expect(settings.socialLinks).toEqual({
      instagram: "https://www.instagram.com/example",
      instagramGrooming: null,
      instagramProjects: null,
      facebook: null,
      whatsapp: "https://wa.me/97400000000",
    });
  });

  it("reads the live in-memory snapshot and honours cancellation", async () => {
    const repository = createMockSiteSettingsRepository();
    const current = await repository.getPublicSettings();
    expect(current.headline).toEqual(mockBusinessRepository.getSnapshot().settings.headline);

    const controller = new AbortController();
    controller.abort();
    await expect(repository.getPublicSettings(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
