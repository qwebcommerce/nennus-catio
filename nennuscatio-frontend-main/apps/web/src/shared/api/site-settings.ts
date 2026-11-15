import {
  type LocalisedText,
  type PublicSiteSettings,
  publicSiteSettingsSchema,
} from "@nennus-catio/contracts";
import type { ApiClient } from "./client";

/** One interface, two implementations: HTTP (default) and the development-only mock. */
export interface SiteSettingsRepository {
  getPublicSettings(signal?: AbortSignal): Promise<PublicSiteSettings>;
}

export const siteSettingsQueryKey = ["site-settings"] as const;

/** Rendered while settings are loading so bilingual text slots stay in place. */
export const EMPTY_TEXT: LocalisedText = { en: "", ar: "" };

export function createHttpSiteSettingsRepository(client: ApiClient): SiteSettingsRepository {
  return {
    getPublicSettings: (signal) =>
      client.get("/site-settings", publicSiteSettingsSchema, { signal }),
  };
}
