"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCopy } from "@/shared/lib/copy";

/** A Qatar date ("YYYY-MM-DD") moved by whole days. */
function shift(day: string, days: number): string {
  const moved = new Date(`${day}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** One day at a time for the staff day views (D255): the previous day, the date and the next day, in one row at every width. */
export function DayStepper({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const c = useCopy();
  return (
    <div className="day-stepper">
      <button type="button" className="icon-button" aria-label={c.text("Previous day", "اليوم السابق")} onClick={() => onChange(shift(day, -1))}>
        <ChevronLeft size={16} className="directional" />
      </button>
      <label className="orders-date">
        {c.text("Day", "اليوم")}
        <input type="date" value={day} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </label>
      <button type="button" className="icon-button" aria-label={c.text("Next day", "اليوم التالي")} onClick={() => onChange(shift(day, 1))}>
        <ChevronRight size={16} className="directional" />
      </button>
    </div>
  );
}
