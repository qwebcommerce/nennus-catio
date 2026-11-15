"use client";

import type { Locale } from "@nennus-catio/contracts";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { formatClockRange } from "@/shared/lib/format";

/** One time that can be chosen on a day: a grooming start time or a delivery window. */
export interface PickerSlot {
  /** Unique within its day: the start time, or the delivery window's id. */
  id: string;
  /** Qatar clock times, "HH:MM". */
  start: string;
  /** Null for a home visit, whose time is the arrival. */
  end: string | null;
  /** A short line under the time, for example "5 left". */
  note?: string;
}

export interface PickerDay {
  /** A Qatar date, "YYYY-MM-DD". */
  date: string;
  slots: readonly PickerSlot[];
}

export interface PickedSlot {
  date: string;
  slot: PickerSlot;
}

export interface SlotPickerProps {
  /** The days with something free; the strip shows the range's other days greyed out. */
  days: readonly PickerDay[];
  /** The Qatar dates the week strip pages through, from its first week. */
  from: string;
  to: string;
  /** The chosen day and time, or null. */
  value: { date: string; slotId: string } | null;
  /** The day to open first when nothing is chosen: the day chosen before, when its time was taken. */
  startDate?: string | null;
  /** A time chosen; null when another day is opened, which lets the chosen time go. */
  onChange: (picked: PickedSlot | null) => void;
  /** Customers read 12-hour times (D249); staff keep the 24-hour clock. */
  clock: "12h" | "24h";
  /** What a time button shows: the start (as in the owner's picture), or the start and end. */
  show: "start" | "range";
  /** The line under the times: "Selected appointment", "Selected delivery time"… */
  summaryLabel: string;
  /** Added in the summary after a time without an end: "(arrival)". */
  arrivalNote?: string;
  /** The id of the message shown when the form was sent without a time (checkout). */
  errorId?: string;
}

/**
 * Delivery windows as the picker's days, in time order, with the first and last date to page through;
 * null when there is none. `note` adds a line under a window, such as how many places are left.
 */
export function windowsByDay<W extends { id: string; date: string; start: string; end: string }>(
  windows: readonly W[],
  note?: (window: W) => string,
): { days: PickerDay[]; from: string; to: string } | null {
  const byDate = new Map<string, PickerSlot[]>();
  for (const window of [...windows].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))) {
    const slot: PickerSlot = { id: window.id, start: window.start, end: window.end, note: note?.(window) };
    byDate.set(window.date, [...(byDate.get(window.date) ?? []), slot]);
  }
  const dates = [...byDate.keys()];
  const from = dates[0];
  const to = dates[dates.length - 1];
  return from && to ? { days: dates.map((date) => ({ date, slots: byDate.get(date) ?? [] })), from, to } : null;
}

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const addDays = (date: string, days: number) => new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);

function dateText(date: string, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", ...options }).format(
    new Date(`${date}T12:00:00+03:00`),
  );
}

/**
 * Choosing a date and a time (D249, the owner's picture): a week strip with arrows, the chosen day's
 * times in rows of three that scroll, and the chosen appointment underneath. Used wherever a date and
 * time is picked: grooming bookings, the checkout's delivery time, and the staff dialogs that move a
 * booking or confirm an order with a new delivery time. Days without a free time cannot be chosen.
 * Opening another day lets the chosen time go, so the summary always shows what will be sent.
 */
export function SlotPicker({ days, from, to, value, startDate = null, onChange, clock, show, summaryLabel, arrivalNote, errorId }: SlotPickerProps) {
  const c = useCopy();
  const free = new Map(days.filter((day) => day.slots.length > 0).map((day) => [day.date, day]));
  const firstFree = (start: string, end: string) => [...free.keys()].sort().find((date) => date >= start && date <= end) ?? null;
  const lastPage = Math.max(0, Math.floor(daysBetween(from, to) / 7));
  const pageOf = (date: string) => Math.min(lastPage, Math.max(0, Math.floor(daysBetween(from, date) / 7)));

  const [shown, setShown] = useState<string | null>(() => value?.date ?? (startDate && free.has(startDate) ? startDate : firstFree(from, to)));
  const [page, setPage] = useState(() => pageOf(shown ?? from));
  const list = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const week = Array.from({ length: 7 }, (_, index) => addDays(from, page * 7 + index));
  const day = shown ? (free.get(shown) ?? null) : null;
  const chosen = value ? (free.get(value.date)?.slots.find((slot) => slot.id === value.slotId) ?? null) : null;

  // "Scroll for more" while times are hidden below the visible rows.
  const measure = () => {
    const element = list.current;
    const next = Boolean(element && element.scrollHeight - element.scrollTop - element.clientHeight > 4);
    setMore((current) => (current === next ? current : next));
  };
  useEffect(measure);

  function openDay(date: string | null) {
    setShown(date);
    list.current?.scrollTo?.({ top: 0 });
    if (value && value.date !== date) onChange(null);
  }

  function turn(next: number) {
    setPage(next);
    const start = addDays(from, next * 7);
    openDay(shown && pageOf(shown) === next ? shown : firstFree(start, addDays(start, 6)));
  }

  const timeText = (slot: PickerSlot, range: boolean) => {
    const end = range ? slot.end : null;
    if (clock === "12h") return formatClockRange(slot.start, end, c.locale);
    return end ? `${slot.start}–${end}` : slot.start;
  };
  const longDate = (date: string) => dateText(date, c.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeDir = clock === "24h" ? "ltr" : undefined;

  return (
    <div className="slot-picker">
      <div className="slot-picker__head">
        <p className="slot-picker__title" aria-hidden="true">
          {c.text("Select date", "اختر التاريخ")}
        </p>
        <div className="slot-picker__week">
          <button
            type="button"
            className="slot-picker__arrow"
            aria-label={c.text("Previous week", "الأسبوع السابق")}
            disabled={page === 0}
            onClick={() => turn(page - 1)}
          >
            <ArrowLeft size={18} className="directional" aria-hidden="true" />
          </button>
          <p className="slot-picker__range" aria-live="polite">
            {dateText(week[0] ?? from, c.locale, { day: "numeric", month: "short" })} –{" "}
            {dateText(week[6] ?? to, c.locale, { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <button
            type="button"
            className="slot-picker__arrow"
            aria-label={c.text("Next week", "الأسبوع التالي")}
            disabled={page >= lastPage}
            onClick={() => turn(page + 1)}
          >
            <ArrowRight size={18} className="directional" aria-hidden="true" />
          </button>
        </div>
      </div>
      <fieldset className="slot-picker__days">
        <legend className="sr-only">{c.text("Select date", "اختر التاريخ")}</legend>
        {week.map((date) => {
          const available = free.has(date);
          const selected = date === shown;
          return (
            <button
              key={date}
              type="button"
              className={`slot-picker__day${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              aria-label={available ? longDate(date) : c.text(`${longDate(date)}, no free times`, `${longDate(date)}، لا توجد أوقات متاحة`)}
              disabled={!available}
              onClick={() => openDay(date)}
            >
              <span>{dateText(date, c.locale, { weekday: "short" })}</span>
              <strong>{dateText(date, c.locale, { day: "numeric" })}</strong>
              <span>{dateText(date, c.locale, { month: "short" })}</span>
            </button>
          );
        })}
      </fieldset>

      <div className="slot-picker__head">
        <p className="slot-picker__title" aria-hidden="true">
          {c.text("Select time", "اختر الوقت")}
        </p>
        {more && (
          <button
            type="button"
            className="slot-picker__more"
            onClick={() => list.current?.scrollBy?.({ top: Math.max(40, (list.current?.clientHeight ?? 0) - 48), behavior: "smooth" })}
          >
            {c.text("Scroll for more", "مرّر لرؤية المزيد")} <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <fieldset className="slot-picker__times-box" aria-describedby={errorId}>
        <legend className="sr-only">
          {day ? c.text(`Times on ${longDate(day.date)}`, `الأوقات في ${longDate(day.date)}`) : c.text("Select time", "اختر الوقت")}
        </legend>
        {day ? (
          <div className="slot-picker__times" ref={list} onScroll={measure}>
            {day.slots.map((slot) => {
              const selected = value?.date === day.date && value.slotId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`slot-picker__time${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onChange({ date: day.date, slot })}
                >
                  <bdi dir={timeDir}>{timeText(slot, show === "range")}</bdi>
                  {slot.note && (
                    <>
                      {" "}
                      <small>{slot.note}</small>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="slot-picker__empty">
            {shown
              ? c.text("No free times on this day any more. Choose another day.", "لم تعد هناك أوقات متاحة في هذا اليوم. اختر يوماً آخر.")
              : c.text("No free times this week. Try another week.", "لا توجد أوقات متاحة هذا الأسبوع. جرّب أسبوعاً آخر.")}
          </p>
        )}
      </fieldset>

      <div className="slot-picker__summary" role="status" aria-label={summaryLabel}>
        <CalendarDays size={26} aria-hidden="true" />
        <div>
          <span>{summaryLabel}</span>
          {value && chosen ? (
            <strong>
              {dateText(value.date, c.locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" })} •{" "}
              <bdi dir={timeDir}>{timeText(chosen, true)}</bdi>
              {!chosen.end && arrivalNote ? ` ${arrivalNote}` : ""}
            </strong>
          ) : (
            <strong className="slot-picker__none">{c.text("Choose a date and a time.", "اختر التاريخ والوقت.")}</strong>
          )}
        </div>
      </div>
    </div>
  );
}
