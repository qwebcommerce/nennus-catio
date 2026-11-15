// D249: the shared date and time picker (the owner's picture) and customers' 12-hour times.
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { formatClock, formatClockRange, formatQatarDay, qatarClock } from "@/shared/lib/format";
import { type PickedSlot, type PickerDay, SlotPicker, type SlotPickerProps, windowsByDay } from "@/shared/ui/SlotPicker";
import { SettingsProviders } from "./helpers/settings";

afterEach(cleanup);

describe("customers' 12-hour times (D249)", () => {
  it("reads a Qatar clock time as 12-hour, in English and Arabic", () => {
    expect(["10:30", "13:05", "12:00", "00:15", "24:00", "09:00"].map((time) => formatClock(time, "en"))).toEqual([
      "10:30 AM",
      "01:05 PM",
      "12:00 PM",
      "12:15 AM",
      "12:00 AM",
      "09:00 AM",
    ]);
    expect(formatClock("10:30", "ar")).toBe("١٠:٣٠ ص");
    expect(formatClock("18:00", "ar")).toBe("٠٦:٠٠ م");
    expect(formatClockRange("09:00", "12:00", "en")).toBe("09:00 AM – 12:00 PM");
    expect(formatClockRange("10:30", null, "en")).toBe("10:30 AM");
  });

  it("reads an instant's Qatar clock and a Qatar date's day", () => {
    // 21:30 UTC is half past midnight the next day in Doha.
    expect(qatarClock("2026-10-12T21:30:00.000Z")).toBe("00:30");
    expect(formatQatarDay("2026-10-17", "en")).toBe("Saturday 17 October");
  });

  it("groups delivery windows by day, in time order, with the range to page through", () => {
    const windows = [
      { id: "b", date: "2026-10-13", start: "18:00", end: "21:00" },
      { id: "a", date: "2026-10-12", start: "09:00", end: "12:00" },
      { id: "c", date: "2026-10-13", start: "09:00", end: "12:00" },
    ];
    expect(windowsByDay(windows, (window) => `${window.id}!`)).toEqual({
      from: "2026-10-12",
      to: "2026-10-13",
      days: [
        { date: "2026-10-12", slots: [{ id: "a", start: "09:00", end: "12:00", note: "a!" }] },
        {
          date: "2026-10-13",
          slots: [
            { id: "c", start: "09:00", end: "12:00", note: "c!" },
            { id: "b", start: "18:00", end: "21:00", note: "b!" },
          ],
        },
      ],
    });
    expect(windowsByDay([])).toBeNull();
  });
});

const days: PickerDay[] = [
  { date: "2026-12-30", slots: [{ id: "10:00", start: "10:00", end: "10:45" }] },
  { date: "2027-01-05", slots: [{ id: "14:00", start: "14:00", end: "14:45" }, { id: "14:30", start: "14:30", end: "15:15" }] },
];

/** The picker as a page holds it: the chosen time in its own state. */
function Holder({ locale = "en", spy, ...props }: Partial<SlotPickerProps> & { locale?: "en" | "ar"; spy?: (picked: PickedSlot | null) => void }) {
  const [value, setValue] = useState<SlotPickerProps["value"]>(props.value ?? null);
  return (
    <SettingsProviders locale={locale}>
      <SlotPicker
        days={props.days ?? days}
        from={props.from ?? "2026-12-28"}
        to={props.to ?? "2027-01-10"}
        value={value}
        onChange={(picked) => {
          spy?.(picked);
          setValue(picked ? { date: picked.date, slotId: picked.slot.id } : null);
        }}
        clock={props.clock ?? "12h"}
        show={props.show ?? "start"}
        summaryLabel={props.summaryLabel ?? (locale === "ar" ? "الموعد المختار" : "Selected appointment")}
        arrivalNote={props.arrivalNote}
      />
    </SettingsProviders>
  );
}

describe("the date and time picker (D249)", () => {
  it("pages a week at a time across the year's end, and opens a week on its first free day", () => {
    render(<Holder />);
    expect(screen.getByText("28 Dec – 3 Jan 2027")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wednesday, 30 December 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Monday, 28 December 2026, no free times" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10:00 AM" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("4 Jan – 10 Jan 2027")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tuesday, 5 January 2027" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "02:30 PM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("opens on the chosen day's week, and lets the time go when another day is opened", () => {
    const spy = vi.fn();
    render(<Holder value={{ date: "2027-01-05", slotId: "14:30" }} spy={spy} />);
    expect(screen.getByText("4 Jan – 10 Jan 2027")).toBeTruthy();
    expect(screen.getByRole("button", { name: "02:30 PM" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status", { name: "Selected appointment" })).toHaveTextContent("Tue, 5 January 2027 • 02:30 PM – 03:15 PM");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status", { name: "Selected appointment" })).toHaveTextContent("Choose a date and a time.");
    fireEvent.click(screen.getByRole("button", { name: "10:00 AM" }));
    expect(spy).toHaveBeenLastCalledWith({ date: "2026-12-30", slot: { id: "10:00", start: "10:00", end: "10:45" } });
  });

  it("a chosen time that is no longer free is not shown as chosen", () => {
    render(<Holder value={{ date: "2026-12-30", slotId: "11:00" }} />);
    expect(screen.getByRole("status", { name: "Selected appointment" })).toHaveTextContent("Choose a date and a time.");
  });

  it("a home visit's time is its arrival; staff read 24-hour times with the end", () => {
    render(<Holder days={[{ date: "2026-12-30", slots: [{ id: "09:30", start: "09:30", end: null }] }]} arrivalNote="(arrival)" />);
    fireEvent.click(screen.getByRole("button", { name: "09:30 AM" }));
    expect(screen.getByRole("status", { name: "Selected appointment" })).toHaveTextContent("Wed, 30 December 2026 • 09:30 AM (arrival)");
    cleanup();
    render(<Holder clock="24h" show="range" summaryLabel="New time" />);
    fireEvent.click(screen.getByRole("button", { name: "10:00–10:45" }));
    expect(screen.getByRole("status", { name: "New time" })).toHaveTextContent("Wed, 30 December 2026 • 10:00–10:45");
  });

  it("in Arabic: the labels, the days and the 12-hour times", () => {
    render(<Holder locale="ar" />);
    expect(screen.getByRole("button", { name: "الأسبوع التالي" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الأربعاء، ٣٠ ديسمبر ٢٠٢٦" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "١٠:٠٠ ص" }));
    expect(screen.getByRole("status", { name: "الموعد المختار" })).toHaveTextContent("١٠:٠٠ ص");
  });
});
