// Test-only providers: hand a stub settings repository to components that read public settings.
import { type ReactNode, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PublicSiteSettings } from "@nennus-catio/contracts";
import { type ApiClient, ApiError } from "@/shared/api/client";
import type { DataSource } from "@/shared/api/data-source";
import { DataSourceProvider, type Repositories } from "@/shared/api/DataSourceProvider";
import { seedDemo } from "@/mocks/data/business";

type SettingsOverrides = Partial<Omit<PublicSiteSettings, "socialLinks">> & {
  socialLinks?: Partial<PublicSiteSettings["socialLinks"]>;
};

export function stubSettings(overrides: SettingsOverrides = {}): PublicSiteSettings {
  const { socialLinks, ...rest } = overrides;
  return {
    brand: { en: "Nennus Catio", ar: "Nennus Catio" },
    description: { en: "Shop quality pet products.", ar: "تسوق منتجات عالية الجودة." },
    headline: { en: "A little care for a happier life.", ar: "عناية صغيرة لحياة أسعد." },
    hours: { en: "Open daily 9–9", ar: "يومياً ٩–٩" },
    currency: "QAR",
    timeZone: "Asia/Qatar",
    phone: null,
    ...rest,
    socialLinks: {
      instagram: null,
      instagramGrooming: null,
      instagramProjects: null,
      facebook: null,
      whatsapp: null,
      ...socialLinks,
    },
  };
}

/** An API client whose every call fails as "not logged in", unless a test supplies its own. */
export const loggedOutApi: ApiClient = {
  get: async () => {
    throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
  },
  post: async () => {
    throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
  },
  put: async () => {
    throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
  },
  delete: async () => {
    throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
  },
};

export function SettingsProviders({
  children,
  getPublicSettings = async () => stubSettings(),
  api = loggedOutApi,
  locale = "en",
  source = "api",
  messages = {},
  listProducts = async () => seedDemo().products,
}: {
  children: ReactNode;
  getPublicSettings?: (signal?: AbortSignal) => Promise<PublicSiteSettings>;
  api?: ApiClient;
  locale?: "en" | "ar";
  source?: DataSource;
  messages?: Record<string, unknown>;
  /** The catalogue; the prototype's unless a test passes its own. */
  listProducts?: Repositories["catalog"]["listProducts"];
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
      }),
  );
  const [repositories] = useState<Repositories>(() => ({
    source,
    api,
    siteSettings: { getPublicSettings },
    catalog: { listProducts },
  }));
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Qatar">
        <DataSourceProvider repositories={repositories}>{children}</DataSourceProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
