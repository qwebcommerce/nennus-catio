"use client";

import {
  type AdminDeliveryArea,
  adminDeliveryAreaListResponseSchema,
  adminDeliveryAreaSchema,
  type AdminDeliveryCity,
  adminDeliveryCitySchema,
  type AdminDeliveryWindow,
  adminDeliveryWindowListResponseSchema,
  adminDeliveryWindowSchema,
  type CreateDeliveryWindowRequest,
  type DeliveryScheduleRule,
  deliveryScheduleResponseSchema,
  deliveryScheduleRuleSchema,
  type DeliverySettings,
  deliverySettingsSchema,
  type SaveDeliveryAreaRequest,
  type SaveDeliveryCityRequest,
  type SaveScheduleRuleRequest,
  type UpdateDeliveryWindowRequest,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Admin delivery setup (#7a): cities, areas and fees (D135), weekly schedule, dated windows and settings. API mode
 * only; mock mode keeps the original demo slot editor. Every save refreshes the affected lists.
 */
export const adminDeliveryKey = ["admin", "delivery"] as const;
const areasKey = [...adminDeliveryKey, "areas"] as const;
const scheduleKey = [...adminDeliveryKey, "schedule"] as const;
const windowsKey = [...adminDeliveryKey, "windows"] as const;
const settingsKey = [...adminDeliveryKey, "settings"] as const;

const okSchema = z.object({ status: z.literal("ok") });

export function useDeliveryAreas() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: areasKey,
    // Cities (with their area counts) and areas come together, so a change to either refreshes both.
    queryFn: ({ signal }) => api.get("/admin/delivery/areas", adminDeliveryAreaListResponseSchema, { signal }),
  });
}

export function useDeliverySchedule() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: scheduleKey,
    queryFn: async ({ signal }) => (await api.get("/admin/delivery/schedule", deliveryScheduleResponseSchema, { signal })).rules,
  });
}

export function useDeliveryWindows() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: windowsKey,
    queryFn: ({ signal }) => api.get("/admin/delivery/windows", adminDeliveryWindowListResponseSchema, { signal }),
  });
}

export function useDeliverySettings() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => api.get("/admin/delivery/settings", deliverySettingsSchema, { signal }),
  });
}

/** Schedule and settings changes open, close or remove dated windows, so windows refresh too. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: readonly (readonly string[])[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSaveArea() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ area, request }: { area: AdminDeliveryArea | null; request: SaveDeliveryAreaRequest }) =>
      area
        ? api.put(`/admin/delivery/areas/${area.id}`, { ...request, version: area.version }, adminDeliveryAreaSchema)
        : api.post("/admin/delivery/areas", request, adminDeliveryAreaSchema),
    onSettled: () => invalidate(areasKey),
  });
}

export function useDeleteArea() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (area: AdminDeliveryArea) => api.delete(`/admin/delivery/areas/${area.id}`, okSchema),
    onSettled: () => invalidate(areasKey),
  });
}

export function useSaveCity() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ city, request }: { city: AdminDeliveryCity | null; request: SaveDeliveryCityRequest }) =>
      city
        ? api.put(`/admin/delivery/cities/${city.id}`, { ...request, version: city.version }, adminDeliveryCitySchema)
        : api.post("/admin/delivery/cities", request, adminDeliveryCitySchema),
    onSettled: () => invalidate(areasKey),
  });
}

export function useDeleteCity() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (city: AdminDeliveryCity) => api.delete(`/admin/delivery/cities/${city.id}`, okSchema),
    onSettled: () => invalidate(areasKey),
  });
}

export function useSaveRule() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ rule, request }: { rule: DeliveryScheduleRule | null; request: SaveScheduleRuleRequest }) =>
      rule
        ? api.put(`/admin/delivery/schedule/${rule.id}`, { ...request, version: rule.version }, deliveryScheduleRuleSchema)
        : api.post("/admin/delivery/schedule", request, deliveryScheduleRuleSchema),
    onSettled: () => invalidate(scheduleKey, windowsKey),
  });
}

export function useDeleteRule() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (rule: DeliveryScheduleRule) => api.delete(`/admin/delivery/schedule/${rule.id}`, okSchema),
    onSettled: () => invalidate(scheduleKey, windowsKey),
  });
}

export function useUpdateWindow() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ window, request }: { window: AdminDeliveryWindow; request: Omit<UpdateDeliveryWindowRequest, "version"> }) =>
      api.put(`/admin/delivery/windows/${window.id}`, { ...request, version: window.version }, adminDeliveryWindowSchema),
    onSettled: () => invalidate(windowsKey),
  });
}

export function useCreateWindow() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (request: CreateDeliveryWindowRequest) => api.post("/admin/delivery/windows", request, adminDeliveryWindowSchema),
    onSettled: () => invalidate(windowsKey),
  });
}

export function useDeleteWindow() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (window: AdminDeliveryWindow) => api.delete(`/admin/delivery/windows/${window.id}`, okSchema),
    onSettled: () => invalidate(windowsKey),
  });
}

export function useSaveDeliverySettings() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeliverySettings) => api.put("/admin/delivery/settings", request, deliverySettingsSchema),
    onSuccess: (saved) => queryClient.setQueryData(settingsKey, saved),
    onSettled: () => queryClient.invalidateQueries({ queryKey: windowsKey }),
  });
}

/** One readable line for a failed save: the server's message plus any field messages. */
export function describeDeliveryError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  if (error.code === "FORBIDDEN") return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
  const details = Object.values(error.fields);
  return [error.message, ...details].join(" · ");
}
