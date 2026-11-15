"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useCopy } from "@/shared/lib/copy";

const Context = createContext<{
  view: "list" | "calendar";
  setView: (view: "list" | "calendar") => void;
  newOpen: boolean;
  setNewOpen: (value: boolean) => void;
} | null>(null);
export function BookingsWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [newOpen, setNewOpen] = useState(false);
  return (
    <Context.Provider value={{ view, setView, newOpen, setNewOpen }}>
      {children}
    </Context.Provider>
  );
}
export function useBookingsWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Bookings workspace provider missing");
  return value;
}
export function BookingsHeaderControls() {
  const c = useCopy(),
    { view, setView, setNewOpen } = useBookingsWorkspace();
  return (
    <>
      <fieldset
        className="bookings-view-toggle"
        aria-label={c.text("Booking view", "عرض الحجوزات")}
      >
        {(["list", "calendar"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "list"
              ? c.text("List", "قائمة")
              : c.text("Calendar", "تقويم")}
          </button>
        ))}
      </fieldset>
      <button
        type="button"
        className="button button--primary bookings-new"
        onClick={() => setNewOpen(true)}
      >
        <Plus size={17} />
        {c.text("New Booking", "حجز جديد")}
      </button>
    </>
  );
}
