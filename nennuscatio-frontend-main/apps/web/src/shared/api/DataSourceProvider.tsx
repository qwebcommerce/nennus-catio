"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mockBusinessRepository } from "@/mocks/adapters/business-repository";
import { createMockSiteSettingsRepository } from "@/mocks/adapters/site-settings-repository";
import { type CatalogRepository, catalogProductsKey, createHttpCatalogRepository } from "./catalog";
import { type ApiClient, createApiClient } from "./client";
import { type DataSource, resolveDataSource } from "./data-source";
import { createHttpSiteSettingsRepository, siteSettingsQueryKey } from "./site-settings";
import type { SiteSettingsRepository } from "./site-settings";

export interface Repositories {
  readonly source: DataSource;
  readonly siteSettings: SiteSettingsRepository;
  /** Public catalogue (#6). */
  readonly catalog: CatalogRepository;
  /**
   * Accounts and staff management always talk to the API (there is no mock login). In mock mode
   * the admin keeps its demo role switcher instead of requiring a staff login.
   */
  readonly api: ApiClient;
}

const RepositoriesContext = createContext<Repositories | null>(null);

function createRepositories(source: DataSource): Repositories {
  const api = createApiClient();
  if (source === "mock") {
    return {
      source,
      api,
      siteSettings: createMockSiteSettingsRepository(),
      catalog: {
        listProducts: async (signal) => {
          signal?.throwIfAborted();
          return structuredClone(mockBusinessRepository.getSnapshot().products);
        },
      },
    };
  }
  return {
    source,
    api,
    siteSettings: createHttpSiteSettingsRepository(api),
    catalog: createHttpCatalogRepository(api),
  };
}

/**
 * Chooses the data source once per app from the build-time environment. `repositories` is for
 * tests only: it bypasses the environment so a test can hand in a stub.
 */
export function DataSourceProvider({
  children,
  repositories,
}: {
  children: ReactNode;
  repositories?: Repositories;
}) {
  const value = useMemo(
    () =>
      repositories ??
      createRepositories(
        // Both names must appear literally so Next.js can inline them in the client bundle.
        resolveDataSource(process.env.NEXT_PUBLIC_DATA_SOURCE, process.env.NODE_ENV),
      ),
    [repositories],
  );
  const queryClient = useQueryClient();
  useEffect(() => {
    if (value.source !== "mock") return;
    // Mock mode only: an admin Settings edit in the demo must still reach the public shell.
    return mockBusinessRepository.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: siteSettingsQueryKey });
      void queryClient.invalidateQueries({ queryKey: catalogProductsKey });
    });
  }, [value.source, queryClient]);
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}

/** The data source when a provider is present, otherwise null (shared UI that may render outside one). */
export function useDataSourceOrNull(): DataSource | null {
  return useContext(RepositoriesContext)?.source ?? null;
}

export function useRepositories(): Repositories {
  const value = useContext(RepositoriesContext);
  if (!value) throw new Error("useRepositories requires DataSourceProvider");
  return value;
}
