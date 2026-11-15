"use client";

import { useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage } from "@/shared/ui/BusinessUI";
import { AreasPanel } from "../components/AreasPanel";
import { DeliveryDayOverview } from "../components/DeliveryDayOverview";
import { DeliverySettingsPanel } from "../components/DeliverySettingsPanel";
import { SchedulePanel } from "../components/SchedulePanel";
import { WindowsPanel } from "../components/WindowsPanel";

type Tab = "day" | "windows" | "schedule" | "areas" | "settings";

/**
 * Real delivery setup (#7a, permission "deliverySlots"): the day overview (D255, the owner's "daily";
 * it opens on today), upcoming windows, weekly schedule, areas, settings.
 */
export function AdminDeliveryApiPage() {
  const c = useCopy();
  const [tab, setTab] = useState<Tab>("day");
  const tabs: { id: Tab; label: string }[] = [
    { id: "day", label: c.text("Day overview", "نظرة على اليوم") },
    { id: "windows", label: c.text("Upcoming windows", "النوافذ القادمة") },
    { id: "schedule", label: c.text("Weekly schedule", "الجدول الأسبوعي") },
    { id: "areas", label: c.text("Areas & fees", "المناطق والرسوم") },
    { id: "settings", label: c.text("Settings", "الإعدادات") },
  ];
  return (
    <AdminPage
      module="deliverySlots"
      title={c.text("Delivery", "التوصيل")}
      subtitle={c.text(
        "Delivery windows, how many deliveries each can take, the areas you deliver to and their fees.",
        "نوافذ التوصيل وعدد التوصيلات لكل نافذة والمناطق التي توصل إليها ورسومها.",
      )}
    >
      <fieldset className="admin-tabs" aria-label={c.text("Delivery sections", "أقسام التوصيل")}>
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </fieldset>
      {tab === "day" && <DeliveryDayOverview />}
      {tab === "windows" && <WindowsPanel />}
      {tab === "schedule" && <SchedulePanel />}
      {tab === "areas" && <AreasPanel />}
      {tab === "settings" && <DeliverySettingsPanel />}
    </AdminPage>
  );
}
