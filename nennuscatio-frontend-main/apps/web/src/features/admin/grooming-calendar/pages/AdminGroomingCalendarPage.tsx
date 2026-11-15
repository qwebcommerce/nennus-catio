"use client";
import { SlotManager } from "@/features/admin/delivery-slots/pages/AdminDeliverySlotsPage";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { AdminGroomingCalendarApiPage } from "./AdminGroomingCalendarApiPage";

/** The real grooming times and capacity (9b) in API mode; the demo slot editor in the development mock mode. */
export function AdminGroomingCalendarPage() {
  const { source } = useRepositories();
  return source === "api" ? <AdminGroomingCalendarApiPage /> : <SlotManager kind="grooming" />;
}
