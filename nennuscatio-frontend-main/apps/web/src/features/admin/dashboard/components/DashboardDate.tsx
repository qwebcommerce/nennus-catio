"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useCopy } from "@/shared/lib/copy";
import { qatarDay } from "../lib/dashboard";

const DashboardDateContext = createContext<{
  date: string;
  setDate: (date: string) => void;
} | null>(null);
export function DashboardDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => qatarDay(new Date().toISOString()));
  return (
    <DashboardDateContext.Provider value={{ date, setDate }}>
      {children}
    </DashboardDateContext.Provider>
  );
}
export function useDashboardDate() {
  const value = useContext(DashboardDateContext);
  if (!value) throw new Error("Dashboard date provider missing");
  return value;
}
export function DashboardDateControl({ label }: { label?: string } = {}) {
  const c = useCopy();
  const { date, setDate } = useDashboardDate();
  return (
    <label className="dash-date-control">
      <CalendarDays size={15} aria-hidden="true" />
      <span>
        {new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", {
          timeZone: "Asia/Qatar",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(`${date}T12:00:00Z`))}
      </span>
      <ChevronDown size={12} aria-hidden="true" />
      <input
        type="date"
        value={date}
        aria-label={
          label ?? c.text("Dashboard date (Qatar)", "تاريخ لوحة التحكم (قطر)")
        }
        onInput={(event) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(event.currentTarget.value))
            setDate(event.currentTarget.value);
        }}
        onChange={(event) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))
            setDate(event.target.value);
        }}
      />
    </label>
  );
}
