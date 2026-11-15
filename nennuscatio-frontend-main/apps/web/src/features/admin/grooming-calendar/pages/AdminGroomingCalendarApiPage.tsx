"use client";

import { useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage } from "@/shared/ui/BusinessUI";
import { GroomingDayOverview } from "../components/GroomingDayOverview";
import { GroomingFeesPanel } from "../components/GroomingFeesPanel";
import { GroomingSchedulePanel } from "../components/GroomingSchedulePanel";
import { GroomingSettingsPanel } from "../components/GroomingSettingsPanel";
import { GroomingTimesPanel } from "../components/GroomingTimesPanel";

type Tab = "day" | "times" | "schedule" | "fees" | "settings";

/**
 * Real grooming times and capacity (9b, permission "groomingCalendar"): the day overview (D255, the
 * owner's request; it opens on today), times, weekly schedule, home visit fees, settings.
 */
export function AdminGroomingCalendarApiPage() {
  const c = useCopy();
  const [tab, setTab] = useState<Tab>("day");
  const tabs: { id: Tab; label: string }[] = [
    { id: "day", label: c.text("Day overview", "نظرة على اليوم") },
    { id: "times", label: c.text("Times", "المواعيد") },
    { id: "schedule", label: c.text("Weekly schedule", "الجدول الأسبوعي") },
    { id: "fees", label: c.text("Home visit fees", "رسوم الزيارات المنزلية") },
    { id: "settings", label: c.text("Settings", "الإعدادات") },
  ];
  return (
    <AdminPage
      module="groomingCalendar"
      title={c.text("Grooming calendar", "تقويم العناية")}
      subtitle={c.text(
        "Shop hours and sections, home visit times and buses, the visit fees by area, and how far ahead customers can book.",
        "ساعات المتجر وأقسامه، ومواعيد الزيارات المنزلية وحافلاتها، ورسوم الزيارة حسب المنطقة، ومدى الحجز المسبق.",
      )}
    >
      <fieldset className="admin-tabs" aria-label={c.text("Grooming calendar sections", "أقسام تقويم العناية")}>
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </fieldset>
      {tab === "day" && <GroomingDayOverview />}
      {tab === "times" && <GroomingTimesPanel />}
      {tab === "schedule" && <GroomingSchedulePanel />}
      {tab === "fees" && <GroomingFeesPanel />}
      {tab === "settings" && <GroomingSettingsPanel />}
    </AdminPage>
  );
}
