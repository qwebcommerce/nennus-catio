"use client";

import {
  type AdminGroomingGroup,
  type AdminGroomingPackage,
  adminGroomingGroupsResponseSchema,
  groomingPackagesResponseSchema,
  type SaveGroomingGroupRequest,
  type SaveGroomingPackageRequest,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Grooming pet groups and packages (9a, D160): the public list for `/grooming`, and the owner's
 * editing in the admin. API mode only; mock mode keeps the demo data. Every staff change answers with
 * the whole list, which replaces the admin's copy, and the public list is read again.
 */
export const groomingPackagesKey = ["grooming", "packages"] as const;
export const adminGroomingKey = ["admin", "grooming", "groups"] as const;

/** The groups customers see, each with its packages, in the owner's order. */
export function useGroomingGroups() {
  const { api, source } = useRepositories();
  return useQuery({
    queryKey: groomingPackagesKey,
    queryFn: async ({ signal }) => (await api.get("/grooming/packages", groomingPackagesResponseSchema, { signal })).groups,
    enabled: source === "api",
  });
}

export function useAdminGroomingGroups() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: adminGroomingKey,
    queryFn: async ({ signal }) => (await api.get("/admin/grooming/groups", adminGroomingGroupsResponseSchema, { signal })).groups,
  });
}

/** A staff change: the answer replaces the admin list; the public list is read again. */
function useGroomingChange<Input>(send: (input: Input) => Promise<AdminGroomingGroup[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (groups) => queryClient.setQueryData(adminGroomingKey, groups),
    onSettled: () => queryClient.invalidateQueries({ queryKey: groomingPackagesKey }),
  });
}

export function useSaveGroomingGroup() {
  const { api } = useRepositories();
  return useGroomingChange(async ({ group, request }: { group: AdminGroomingGroup | null; request: SaveGroomingGroupRequest }) => {
    const answer = group
      ? await api.put(`/admin/grooming/groups/${group.id}`, { ...request, version: group.version }, adminGroomingGroupsResponseSchema)
      : await api.post("/admin/grooming/groups", request, adminGroomingGroupsResponseSchema);
    return answer.groups;
  });
}

export function useDeleteGroomingGroup() {
  const { api } = useRepositories();
  return useGroomingChange(
    async (group: AdminGroomingGroup) => (await api.delete(`/admin/grooming/groups/${group.id}`, adminGroomingGroupsResponseSchema)).groups,
  );
}

export function useSaveGroomingPackage() {
  const { api } = useRepositories();
  return useGroomingChange(
    async ({ item, request }: { item: AdminGroomingPackage | null; request: SaveGroomingPackageRequest }) => {
      const answer = item
        ? await api.put(`/admin/grooming/packages/${item.id}`, { ...request, version: item.version }, adminGroomingGroupsResponseSchema)
        : await api.post("/admin/grooming/packages", request, adminGroomingGroupsResponseSchema);
      return answer.groups;
    },
  );
}

export function useDeleteGroomingPackage() {
  const { api } = useRepositories();
  return useGroomingChange(
    async (item: AdminGroomingPackage) => (await api.delete(`/admin/grooming/packages/${item.id}`, adminGroomingGroupsResponseSchema)).groups,
  );
}

/** One readable line for a failed change: a clear note for someone else's edit, else the server's message and fields. */
export function describeGroomingError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  if (error.code === "FORBIDDEN") return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
  if (error.code === "CONFLICT" && /Someone else changed/.test(error.message)) {
    return text(
      "Someone else changed this while you were editing. Close the form and open it again to see their changes.",
      "غيّر شخص آخر هذا أثناء تعديلك. أغلق النموذج وافتحه مرة أخرى لرؤية التغييرات.",
    );
  }
  return [error.message, ...Object.values(error.fields)].join(" · ");
}
