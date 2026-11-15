"use client";

import { featuredOffersResponseSchema } from "@nennus-catio/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "./DataSourceProvider";

export const featuredOffersKey = ["promotions", "featured"] as const;

/** The home page's featured offers (11e): up to 3, from the API. Mock mode has none, so the strip stays hidden. */
export function useFeaturedOffers() {
  const { api, source } = useRepositories();
  return useQuery({
    queryKey: featuredOffersKey,
    queryFn: async ({ signal }) => (await api.get("/promotions/featured", featuredOffersResponseSchema, { signal })).offers,
    enabled: source === "api",
    staleTime: 30_000,
  });
}
