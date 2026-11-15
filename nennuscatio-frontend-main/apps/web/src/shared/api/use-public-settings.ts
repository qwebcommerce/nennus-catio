"use client";

import type { PublicSiteSettings } from "@nennus-catio/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "./DataSourceProvider";
import { siteSettingsQueryKey } from "./site-settings";

export type PublicSettingsStatus = "loading" | "error" | "ready";

export interface PublicSettingsView {
  readonly status: PublicSettingsStatus;
  /** Present only when `status` is `ready`. */
  readonly settings: PublicSiteSettings | null;
  readonly retry: () => void;
}

/** Public site settings for the shell. Loading hides values; errors are shown once, in the footer. */
export function usePublicSettings(): PublicSettingsView {
  const { siteSettings } = useRepositories();
  const query = useQuery({
    queryKey: siteSettingsQueryKey,
    queryFn: ({ signal }) => siteSettings.getPublicSettings(signal),
  });
  const status: PublicSettingsStatus = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : "ready";
  return {
    status,
    settings: query.data ?? null,
    retry: () => void query.refetch(),
  };
}
