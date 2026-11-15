"use client";

import {
  type AdminPosItem,
  type AdminPosItemView,
  adminPosAttentionSchema,
  adminPosIntegrationSchema,
  adminPosItemListResponseSchema,
  adminPosItemSchema,
  adminPosKeySchema,
  adminPosSettingsSchema,
  adminPosShortSchema,
  adminProductSchema,
  createPosKeyResponseSchema,
  type CreatePosKeyRequest,
  type CreatePosKeyResponse,
  type PosScope,
  type SavePosSettingsRequest,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "./DataSourceProvider";

/**
 * The POS link for staff (#16 part 2c; the part 2 plan's sections 3, 4 and 7): the POS
 * items list in the Catalogue (`/api/admin/pos/items`, Catalogue permissions), the owner's Integrations
 * page (`/api/admin/pos/integration`) and the bell's lines. API mode only. Every change reads the admin
 * data again afterwards (the list, the catalogue, the bell), as a link or a price changes them all.
 */
export const adminPosKey = ["admin", "pos"] as const;
const itemsKey = [...adminPosKey, "items"] as const;
const integrationKey = [...adminPosKey, "integration"] as const;

/** The list's filters. */
export interface AdminPosItemFilters {
  q: string;
  view: AdminPosItemView;
  page: number;
  pageSize: number;
}

export function emptyAdminPosItemFilters(): AdminPosItemFilters {
  return { q: "", view: "all", page: 1, pageSize: 25 };
}

export function adminPosItemSearch(filters: AdminPosItemFilters): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  params.set("view", filters.view);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  return params.toString();
}

export function useAdminPosItems(search: string, options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...itemsKey, search],
    queryFn: ({ signal }) => api.get(`/admin/pos/items?${search}`, adminPosItemListResponseSchema, { signal }),
    // Keep the old page on screen while the next one loads, so the table does not jump.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** A change, then everything it can touch read again: the list, the catalogue (and its editor's data), the bell. */
function usePosChange<Input, Output>(send: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["admin"] }), queryClient.invalidateQueries({ queryKey: ["catalog"] })]),
  });
}

/** "Link to a pack": the pack takes the code as its SKU and follows the POS from now on. */
export function useLinkPosItem() {
  const { api } = useRepositories();
  return usePosChange(({ item, variantId }: { item: AdminPosItem; variantId: string }) =>
    api.post(`/admin/pos/items/${encodeURIComponent(item.id)}/link`, { variantId }, adminPosItemSchema),
  );
}

/** "Not sold online" (true), or back on the list (false). */
export function useSetPosItemSoldOnline() {
  const { api } = useRepositories();
  return usePosChange(({ item, notSoldOnline }: { item: AdminPosItem; notSoldOnline: boolean }) =>
    api.post(`/admin/pos/items/${encodeURIComponent(item.id)}/sold-online`, { notSoldOnline }, adminPosItemSchema),
  );
}

/** A waiting price, accepted (the pack takes it) or refused (the pack keeps its own). */
export function useSettlePosPrice() {
  const { api } = useRepositories();
  return usePosChange(({ item, decision }: { item: AdminPosItem; decision: "accept" | "refuse" }) =>
    api.post(`/admin/pos/items/${encodeURIComponent(item.id)}/${decision}-price`, {}, adminProductSchema),
  );
}

/** The bell for the owner and Catalogue View: open alerts and waiting prices. */
export function usePosAttention(options: { enabled: boolean }) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminPosKey, "attention"],
    queryFn: ({ signal }) => api.get("/admin/pos/attention", adminPosAttentionSchema, { signal }),
    enabled: options.enabled,
    refetchInterval: 60_000,
  });
}

/** The bell for Orders View: packs the store sold that online customers are paying for. */
export function usePosShort(options: { enabled: boolean }) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminPosKey, "short"],
    queryFn: ({ signal }) => api.get("/admin/pos/short", adminPosShortSchema, { signal }),
    enabled: options.enabled,
    refetchInterval: 60_000,
  });
}

// --- The owner's Integrations page ---------------------------------------------------------------

export function usePosIntegration() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: integrationKey,
    queryFn: ({ signal }) => api.get("/admin/pos/integration", adminPosIntegrationSchema, { signal }),
    // The health figures move on their own (collections, messages, alerts).
    refetchInterval: 60_000,
  });
}

/**
 * The Integrations page's changes, then the page read again. Making a key and changing its rights run
 * through `run`: when the API asks for the password again, the action waits and runs once it is given,
 * so a new key reaches the page through `onCreated` (shown once), never through the return value.
 */
export function usePosIntegrationChanges(
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>,
  onCreated: (created: CreatePosKeyResponse) => void,
) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminPosKey });
  return {
    createKey: (body: CreatePosKeyRequest) =>
      run(async () => {
        const created = await api.post("/admin/pos/integration/keys", body, createPosKeyResponseSchema);
        onCreated(created);
        await refresh();
      }),
    setScopes: (id: string, scopes: PosScope[]) =>
      run(async () => {
        const key = await api.post(`/admin/pos/integration/keys/${encodeURIComponent(id)}/scopes`, { scopes }, adminPosKeySchema);
        await refresh();
        return key;
      }),
    revoke: async (id: string) => {
      const key = await api.post(`/admin/pos/integration/keys/${encodeURIComponent(id)}/revoke`, {}, adminPosKeySchema);
      await refresh();
      return key;
    },
    saveSettings: async (body: SavePosSettingsRequest) => {
      const settings = await api.put("/admin/pos/integration/settings", body, adminPosSettingsSchema);
      await refresh();
      return settings;
    },
  };
}
