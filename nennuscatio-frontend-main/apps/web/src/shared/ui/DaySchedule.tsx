"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode, useState } from "react";
import { useCopy } from "@/shared/lib/copy";

/** A column of the bookings or orders listed under a time. */
export interface DayScheduleColumn {
  key: string;
  header: string;
}

/** One booking or order under a time: its cells by column key. */
export interface DayScheduleDetail {
  key: string;
  cells: Record<string, ReactNode>;
}

/** One time or delivery window of the day. */
export interface DayScheduleRow {
  key: string;
  /** "10:00–10:45", in staff's 24-hour times. */
  time: string;
  /** "1 of 2", or a plain count where there is no capacity to show. */
  count: string;
  status?: { label: string; tone: "open" | "full" | "closed" } | null;
  /** The bookings or orders in this time, listed under it while it is open. */
  details: DayScheduleDetail[];
  /** The time a link points at. */
  marked?: boolean;
  action?: ReactNode;
}

/** How a time's bookings or orders are listed; null for roles that may not see them. */
export interface DayScheduleDetails {
  columns: DayScheduleColumn[];
  /** "Orders at 15:00–18:00": the name of a time's button and of its list. */
  label: (time: string) => string;
  /** Every time starts open (Orders' "Deliveries by day"); otherwise a time opens when it is clicked. */
  startOpen?: boolean;
}

/**
 * The staff day table (D255, D257): one row per time or delivery window with its count, status and an
 * action. A time with bookings or orders opens on a click (its button, or anywhere on its row) and lists
 * them underneath, one line each; the next click closes it. "Show all" and "Hide all" do every time, and
 * stay as chosen from day to day, while a time opened or closed by itself goes back when `dayKey` (the
 * day, and the place) changes.
 */
export function DaySchedule({
  label,
  timeHeader,
  countHeader,
  details,
  rows,
  dayKey,
  empty,
  withStatus = false,
  withActions = false,
}: {
  label: string;
  timeHeader: string;
  countHeader: string;
  details: DayScheduleDetails | null;
  rows: readonly DayScheduleRow[];
  dayKey: string;
  /** Shown instead of the table when the day has no times. */
  empty?: ReactNode;
  withStatus?: boolean;
  withActions?: boolean;
}) {
  const c = useCopy();
  const [showAll, setShowAll] = useState(details?.startOpen ?? false);
  const [flipped, setFlipped] = useState<{ dayKey: string; keys: ReadonlySet<string> }>({ dayKey, keys: new Set() });
  // Another day or place: the times opened or closed one by one go back to what Show all or Hide all says.
  if (flipped.dayKey !== dayKey) setFlipped({ dayKey, keys: new Set() });
  const own = flipped.dayKey === dayKey ? flipped.keys : new Set<string>();
  const openable = (row: DayScheduleRow) => details !== null && row.details.length > 0;
  const isOpen = (row: DayScheduleRow) => openable(row) && showAll !== own.has(row.key);
  const listed = rows.filter(openable);
  const columns = 2 + (withStatus ? 1 : 0) + (withActions ? 1 : 0);

  function toggle(key: string) {
    const keys = new Set(own);
    if (!keys.delete(key)) keys.add(key);
    setFlipped({ dayKey, keys });
  }
  function every(open: boolean) {
    setShowAll(open);
    setFlipped({ dayKey, keys: new Set() });
  }
  /** A click anywhere on a row that has a list opens or closes it, except on the row's own buttons and links. */
  function rowClick(event: MouseEvent<HTMLTableRowElement>, key: string) {
    if (event.target instanceof Element && event.target.closest("a, button, input, label, select, textarea")) return;
    toggle(key);
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="day-schedule-box">
      {listed.length > 0 && (
        <div className="day-schedule__all">
          <button type="button" className="text-button" disabled={listed.every(isOpen)} onClick={() => every(true)}>
            {c.text("Show all", "إظهار الكل")}
          </button>
          <button type="button" className="text-button" disabled={!listed.some(isOpen)} onClick={() => every(false)}>
            {c.text("Hide all", "إخفاء الكل")}
          </button>
        </div>
      )}
      <div className="orders-table-scroll">
        <table className="day-schedule" aria-label={label}>
          <thead>
            <tr>
              <th scope="col">{timeHeader}</th>
              <th scope="col">{countHeader}</th>
              {withStatus && <th scope="col">{c.text("Status", "الحالة")}</th>}
              {withActions && (
                <th scope="col">
                  <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = isOpen(row);
              const classes = [openable(row) && "is-openable", open && "is-open", row.marked && "is-selected"].filter(Boolean).join(" ");
              return (
                <Fragment key={row.key}>
                  {/* The time's button is the keyboard way to open the row; a click on the rest of the row does the same. */}
                  <tr
                    className={classes || undefined}
                    aria-current={row.marked ? "true" : undefined}
                    onClick={openable(row) ? (event) => rowClick(event, row.key) : undefined}
                  >
                    <th scope="row">
                      {details && openable(row) ? (
                        <button type="button" className="day-schedule__toggle" aria-expanded={open} aria-label={details.label(row.time)} onClick={() => toggle(row.key)}>
                          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} className="directional" />}
                          <bdi dir="ltr">{row.time}</bdi>
                        </button>
                      ) : (
                        <bdi dir="ltr">{row.time}</bdi>
                      )}
                    </th>
                    <td>{row.count}</td>
                    {withStatus && (
                      <td>{row.status && <span className={`day-schedule__status day-schedule__status--${row.status.tone}`}>{row.status.label}</span>}</td>
                    )}
                    {withActions && <td>{row.action}</td>}
                  </tr>
                  {details && open && (
                    <tr className="day-schedule__details">
                      <td colSpan={columns}>
                        <div className="day-schedule__scroll">
                          <table className="day-schedule__list" aria-label={details.label(row.time)}>
                            <thead>
                              <tr>
                                {details.columns.map((column) => (
                                  <th key={column.key} scope="col">
                                    {column.header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {row.details.map((detail) => (
                                <tr key={detail.key}>
                                  {details.columns.map((column) => (
                                    <td key={column.key}>{detail.cells[column.key]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
