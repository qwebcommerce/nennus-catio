import {
  httpsUrlSchema,
  type PublicSiteSettings,
  publicSiteSettingsSchema,
  toInternationalPhone,
} from "@nennus-catio/contracts";
import type { SiteSettingsRepository } from "@/shared/api/site-settings";
import type { Settings } from "../data/business";
import { mockBusinessRepository } from "./business-repository";

/** Mirrors the API's shaping: empty or non-https links are hidden, never shown as-is. */
function link(value: string | undefined): string | null {
  if (!value) return null;
  const result = httpsUrlSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function toPublicSiteSettings(settings: Settings): PublicSiteSettings {
  return publicSiteSettingsSchema.parse({
    brand: { en: "Nennus Catio", ar: "Nennus Catio" },
    description: settings.description,
    headline: settings.headline,
    hours: settings.hours,
    currency: "QAR",
    timeZone: "Asia/Qatar",
    phone: settings.phone ? toInternationalPhone(settings.phone) : null,
    socialLinks: {
      instagram: link(settings.instagram),
      instagramGrooming: link(settings.instagramGrooming),
      instagramProjects: link(settings.instagramProjects),
      facebook: link(settings.facebook),
      whatsapp: link(settings.whatsapp),
    },
  });
}

/** Development-only. Reads the same in-memory snapshot the admin Settings demo edits. */
export function createMockSiteSettingsRepository(): SiteSettingsRepository {
  return {
    async getPublicSettings(signal) {
      signal?.throwIfAborted();
      return toPublicSiteSettings(mockBusinessRepository.getSnapshot().settings);
    },
  };
}
