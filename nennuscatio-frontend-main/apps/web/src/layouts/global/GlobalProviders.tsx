"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DemoRole } from "@nennus-catio/contracts";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { DataSourceProvider } from "@/shared/api/DataSourceProvider";

const DemoContext = createContext<{
  role: DemoRole;
  setRole: (role: DemoRole) => void;
} | null>(null);
export function GlobalProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
      }),
  );
  const [role, setRole] = useState<DemoRole>("core");
  return (
    <QueryClientProvider client={client}>
      <DemoContext.Provider value={{ role, setRole }}>
        <DataSourceProvider>
          <MockDataProvider>{children}</MockDataProvider>
        </DataSourceProvider>
      </DemoContext.Provider>
    </QueryClientProvider>
  );
}
/**
 * API mode: the role comes from the real staff session, not the demo switcher. Until module
 * permissions arrive (#5) only the owner reaches the admin shell, so this is always "owner" there.
 */
export function StaffIdentityProvider({ demoRole, children }: { demoRole: DemoRole; children: ReactNode }) {
  const [value] = useState(() => ({ role: demoRole, setRole: () => undefined }));
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemoIdentity() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Demo identity requires GlobalProviders");
  return context;
}
