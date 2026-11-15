"use client";

import {
  type AdminGroomingArea,
  adminGroomingAreaListResponseSchema,
  adminGroomingAreaSchema,
  type AdminGroomingCity,
  adminGroomingCitySchema,
  type AdminGroomingSlot,
  adminGroomingSlotListResponseSchema,
  adminGroomingSlotSchema,
  type GroomingLocation,
  type GroomingScheduleRule,
  groomingScheduleResponseSchema,
  groomingScheduleRuleSchema,
  type GroomingSettings,
  groomingSettingsSchema,
  type SaveGroomingRuleRequest,
  type UpdateGroomingDayRequest,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff grooming times and capacity (9b, permission "groomingCalendar"): settings, the weekly schedule,
 * the dated times, whole-date changes and home visit fees. API mode only; mock mode keeps the demo slot
 * editor. Every change reads the affected lists again.
 */
export const groomingCalendarKey = ["admin", "grooming", "calendar"] as const;
const settingsKey = [...groomingCalendarKey, "settings"] as const;
const scheduleKey = [...groomingCalendarKey, "schedule"] as const;
const slotsKey = [...groomingCalendarKey, "slots"] as const;
const areasKey = [...groomingCalendarKey, "areas"] as const;

const okSchema = z.object({ status: z.literal("ok") });
const daySchema = z.object({ slots: z.array(adminGroomingSlotSchema) });

function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: (readonly string[])[]) => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useGroomingSettings() {
  const { api } = useRepositories();
  return useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => api.get("/admin/grooming/settings", groomingSettingsSchema, { signal }) });
}

export function useSaveGroomingSettings() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: GroomingSettings) => api.put("/admin/grooming/settings", request, groomingSettingsSchema),
    onSuccess: (saved) => queryClient.setQueryData(settingsKey, saved),
    // A new step or range makes the times again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: slotsKey }),
  });
}

export function useGroomingSchedule() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: scheduleKey,
    queryFn: async ({ signal }) => (await api.get("/admin/grooming/schedule", groomingScheduleResponseSchema, { signal })).rules,
  });
}

export function useSaveGroomingRule() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ rule, request }: { rule: GroomingScheduleRule | null; request: SaveGroomingRuleRequest }) =>
      rule
        ? api.put(`/admin/grooming/schedule/${rule.id}`, { ...request, version: rule.version }, groomingScheduleRuleSchema)
        : api.post("/admin/grooming/schedule", request, groomingScheduleRuleSchema),
    onSettled: () => invalidate(scheduleKey, slotsKey),
  });
}

export function useDeleteGroomingRule() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (rule: GroomingScheduleRule) => api.delete(`/admin/grooming/schedule/${rule.id}`, okSchema),
    onSettled: () => invalidate(scheduleKey, slotsKey),
  });
}

export function useGroomingSlots(location: GroomingLocation) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...slotsKey, location],
    queryFn: ({ signal }) => api.get(`/admin/grooming/slots?location=${location}`, adminGroomingSlotListResponseSchema, { signal }),
  });
}

export function useUpdateGroomingSlot() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ slot, request }: { slot: AdminGroomingSlot; request: { capacity: number; closed: boolean } }) =>
      api.put(`/admin/grooming/slots/${slot.id}`, { ...request, version: slot.version }, adminGroomingSlotSchema),
    onSettled: () => invalidate(slotsKey),
  });
}

export function useUpdateGroomingDay() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (request: UpdateGroomingDayRequest) => (await api.put("/admin/grooming/days", request, daySchema)).slots,
    onSettled: () => invalidate(slotsKey),
  });
}

export function useGroomingAreas() {
  const { api } = useRepositories();
  return useQuery({ queryKey: areasKey, queryFn: ({ signal }) => api.get("/admin/grooming/areas", adminGroomingAreaListResponseSchema, { signal }) });
}

export function useSaveGroomingCityFee() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ city, fee, enabled }: { city: AdminGroomingCity; fee: number; enabled: boolean }) =>
      api.put(`/admin/grooming/cities/${city.id}/fee`, { fee, enabled, version: city.version }, adminGroomingCitySchema),
    // A city's fee and switch change what its areas show; deliveries share the rows' versions.
    onSettled: () => invalidate(areasKey, ["admin", "delivery"]),
  });
}

export function useSaveGroomingAreaFee() {
  const { api } = useRepositories();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ area, fee, enabled }: { area: AdminGroomingArea; fee: number | null; enabled: boolean }) =>
      api.put(`/admin/grooming/areas/${area.id}/fee`, { fee, enabled, version: area.version }, adminGroomingAreaSchema),
    onSettled: () => invalidate(areasKey, ["admin", "delivery"]),
  });
}
