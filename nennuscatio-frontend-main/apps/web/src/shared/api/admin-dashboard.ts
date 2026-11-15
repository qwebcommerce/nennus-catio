"use client";

import { dashboardSchema } from "@nennus-catio/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRepositories } from "./DataSourceProvider";

/**
 * The admin Dashboard (#12 part 1, D222-D223) over `GET /api/admin/dashboard`. API mode only. Each
 * part is filled only for roles that may see its page (answer 3A). Refreshed every minute while open.
 */
export const adminDashboardKey = ["admin", "dashboard"] as const;

export function useAdminDashboard(date: string, days: 1 | 7 | 30) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminDashboardKey, date, days],
    queryFn: ({ signal }) => api.get(`/admin/dashboard?date=${date}&days=${days}`, dashboardSchema, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
