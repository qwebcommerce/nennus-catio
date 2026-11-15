// Grooming times and capacity (9b): the staff Grooming calendar page against the API: times by date,
// whole-date changes, the weekly schedule, home visit fees and settings. Risky changes ask first (D128).
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  type AdminBookingSummary,
  type AdminGroomingArea,
  type AdminGroomingCity,
  type AdminGroomingSlot,
  type GroomingScheduleRule,
  type GroomingSettings,
  normalisePermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { qatarToday } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { AdminGroomingCalendarPage } from "@/features/admin/grooming-calendar/pages/AdminGroomingCalendarPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { formatMoney } from "@/shared/lib/format";
import { listLines, listReferences, rowText, timeRows } from "./helpers/day-table";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
afterEach(cleanup);

const view = { view: true, edit: false, delete: false, export: false, refund: false };
const all = { view: true, edit: true, delete: true, export: false, refund: false };
const DAY = "2099-01-05";
const NEXT = "2099-01-06";

const slot = (overrides: Partial<AdminGroomingSlot>): AdminGroomingSlot => ({
  id: crypto.randomUUID(),
  location: "shop",
  date: DAY,
  start: "10:00",
  end: "10:30",
  startsAt: "2099-01-05T07:00:00.000Z",
  capacity: 3,
  booked: 0,
  closed: false,
  overridden: false,
  version: 1,
  ...overrides,
});

const slots: AdminGroomingSlot[] = [
  slot({ id: "s1", start: "10:00", end: "10:30", booked: 2, version: 4 }),
  slot({ id: "s2", start: "10:30", end: "11:00", startsAt: "2099-01-05T07:30:00.000Z" }),
  slot({ id: "s3", date: NEXT, start: "10:00", end: "10:30", startsAt: "2099-01-06T07:00:00.000Z", closed: true, overridden: true }),
];
const rules: GroomingScheduleRule[] = [
  { id: "r1", location: "shop", weekday: 1, start: "10:00", end: "20:00", capacity: 3, active: true, version: 2 },
  { id: "r2", location: "home", weekday: 1, start: "09:00", end: null, capacity: 4, active: true, version: 1 },
];
const settings: GroomingSettings = { holdMinutes: 15, leadTimeMinutes: 120, horizonDays: 14, stepMinutes: 30, cleaningGapMinutes: 0, cancelHours: 24, version: 7 };
const CITY = "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7b";
const cities: AdminGroomingCity[] = [{ id: CITY, name: { en: "Doha", ar: "الدوحة" }, fee: 5000, enabled: true, areaCount: 1, version: 3 }];
const areas: AdminGroomingArea[] = [
  { id: "a1", name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: CITY, city: { en: "Doha", ar: "الدوحة" }, ownFee: 3000, fee: 3000, enabled: true, offered: true, version: 6 },
];

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Grooming", permissions };
}

function stubApi(answer: (method: string, path: string, body: unknown) => unknown = () => ({})) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const responses: Record<string, unknown> = {
    "/admin/grooming/slots?location=shop": { from: DAY, to: NEXT, slots },
    "/admin/grooming/slots?location=home": { from: DAY, to: NEXT, slots: [] },
    "/admin/grooming/schedule": { rules },
    "/admin/grooming/settings": settings,
    "/admin/grooming/areas": { cities, areas },
  };
  const respond = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
    return answer(method, path, body);
  };
  const api: ApiClient = {
    get: async (path, schema) => schema.parse(responses[path]) as never,
    post: async (path, body, schema) => schema.parse(respond("POST", path, body)) as never,
    put: async (path, body, schema) => schema.parse(respond("PUT", path, body)) as never,
    delete: async (path, schema) => schema.parse(respond("DELETE", path, null)) as never,
  };
  return { api, calls };
}

/** The page opens on the Day overview (D255); most tests are about the Times tab. */
async function openTimes() {
  fireEvent.click(await screen.findByRole("button", { name: "Times" }));
}

function renderPage(api: ApiClient, permissions: PermissionMap) {
  return render(
    <SettingsProviders api={api}>
      <MockDataProvider>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staff(permissions)}>
            <AdminGroomingCalendarPage />
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

describe("admin grooming calendar (API mode)", () => {
  it("shows each date's booked and free seats and one date's times; view-only roles get no buttons", async () => {
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ groomingCalendar: view }));
    await openTimes();
    const dates = await screen.findByRole("list", { name: "Dates" });
    expect(within(dates).getByText(/2 booked · 4 free/)).toBeTruthy();
    expect(within(dates).getByText(/Closed · 0 booked/)).toBeTruthy();
    const times = screen.getByRole("list", { name: "Times on this date" });
    expect(within(times).getByText(/2 of 3 sections booked/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Change|^Close|^Reopen|^Sections/ })).toBeNull();
  });

  it("clicking a date marks it and brings its times into view; booked times link to their bookings", async () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ groomingCalendar: view, bookings: view }));
    await openTimes();
    const dates = await screen.findByRole("list", { name: "Dates" });
    expect(scrolled).not.toHaveBeenCalled();
    const next = within(dates).getByRole("button", { name: /6 Jan/ });
    fireEvent.click(next);
    expect(next).toHaveAttribute("aria-pressed", "true");
    expect(next.closest("li")).toHaveClass("is-selected");
    expect(within(next.closest("li") as HTMLElement).getByText(/Times shown below/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /6 Jan/ })).toBeTruthy();
    await waitFor(() => expect(scrolled).toHaveBeenCalled());

    fireEvent.click(within(dates).getByRole("button", { name: /5 Jan/ }));
    const times = screen.getByRole("list", { name: "Times on this date" });
    const link = within(times).getByRole("link", { name: /See the bookings at 10:00 on 2099-01-05/ });
    expect(link).toHaveAttribute("href", "/admin/bookings?date=2099-01-05&location=shop&time=10:00");
  });

  it("closing a date asks first; a date's sections never go below its bookings, and a closed date stays closed", async () => {
    const { api, calls } = stubApi((_method, path) => (path === "/admin/grooming/days" ? { slots } : {}));
    renderPage(api, normalisePermissions({ groomingCalendar: all }));
    await openTimes();
    fireEvent.click(await screen.findByRole("button", { name: `Close ${DAY}` }));
    const question = await screen.findByRole("dialog", { name: /^Close .* to new bookings\?$/ });
    expect(question.textContent).toContain("The 2 bookings already made stay");
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Close date" }));
    await waitFor(() => expect(calls[0]).toEqual({ method: "PUT", path: "/admin/grooming/days", body: { location: "shop", date: DAY, closed: true, capacity: null } }));

    fireEvent.click(screen.getByRole("button", { name: `Sections on ${NEXT}` }));
    const dialog = await screen.findByRole("dialog", { name: /^Every time on/ });
    fireEvent.change(within(dialog).getByLabelText("Grooming sections"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(calls[1]).toEqual({ method: "PUT", path: "/admin/grooming/days", body: { location: "shop", date: NEXT, closed: true, capacity: 2 } }));
  });

  it("changing one time keeps its bookings and sends the version it was opened at", async () => {
    const { api, calls } = stubApi(() => ({ ...slots[0], closed: true, version: 5 }));
    renderPage(api, normalisePermissions({ groomingCalendar: all }));
    await openTimes();
    fireEvent.click(await screen.findByRole("button", { name: `Change ${DAY} 10:00` }));
    const dialog = await screen.findByRole("dialog", { name: /^Change 10:00/ });
    // Fewer sections than the 2 already booked stops the form (D230: the shared number field checks its range).
    const sections = within(dialog).getByLabelText("Grooming sections") as HTMLInputElement;
    const sectionsBefore = sections.value;
    fireEvent.change(sections, { target: { value: "1" } });
    expect(sections.validity.valid).toBe(false);
    fireEvent.change(sections, { target: { value: sectionsBefore } });
    expect(sections.validity.valid).toBe(true);
    expect(dialog.textContent).toContain("2 already booked");
    fireEvent.click(within(dialog).getByLabelText("Closed for new bookings on this date"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    const question = await screen.findByRole("dialog", { name: /^Close 10:00/ });
    fireEvent.click(within(question).getByRole("button", { name: "Close time" }));
    await waitFor(() => expect(calls[0]).toEqual({ method: "PUT", path: "/admin/grooming/slots/s1", body: { capacity: 3, closed: true, version: 4 } }));
  });

  it("the weekly schedule adds shop hours and visit times; stopping a line asks first", async () => {
    const { api, calls } = stubApi((_method, _path, body) => ({ ...rules[0], ...(body as object), id: "r9", version: 1 }));
    renderPage(api, normalisePermissions({ groomingCalendar: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Weekly schedule" }));
    const shop = await screen.findByRole("region", { name: "Shop opening hours" });
    expect(within(shop).getByText(/3 sections/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Home visit times" })).getByText(/4 buses/)).toBeTruthy();

    fireEvent.click(within(shop).getByRole("button", { name: "Add opening hours" }));
    let dialog = await screen.findByRole("dialog", { name: "New opening hours" });
    fireEvent.change(within(dialog).getByLabelText("Day of the week"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls[0]).toEqual({
      method: "POST",
      path: "/admin/grooming/schedule",
      body: { location: "shop", weekday: 5, start: "10:00", end: "20:00", capacity: 3, active: true },
    }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Monday 09:00" }));
    dialog = await screen.findByRole("dialog", { name: "Edit visit time" });
    fireEvent.click(within(dialog).getByLabelText("In use"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const question = await screen.findByRole("dialog", { name: "Stop Monday 09:00?" });
    expect(calls).toHaveLength(1);
    fireEvent.click(within(question).getByRole("button", { name: "Stop it" }));
    await waitFor(() => expect(calls[1]).toMatchObject({ method: "PUT", path: "/admin/grooming/schedule/r2", body: { location: "home", end: null, active: false, version: 1 } }));
  });

  it("home visit fees: an area can follow its city's fee; stopping a city's home visits asks first", async () => {
    const { api, calls } = stubApi((_method, path) => (path.includes("/cities/") ? cities[0] : areas[0]));
    renderPage(api, normalisePermissions({ groomingCalendar: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Home visit fees" }));
    const doha = await screen.findByRole("region", { name: "Doha" });
    expect(within(doha).getByText(/City visit fee: QAR\s?50\.00/)).toBeTruthy();
    expect(within(doha).getByText(/QAR\s?30\.00 · own fee/)).toBeTruthy();

    fireEvent.click(within(doha).getByRole("button", { name: "Edit visit fee for West Bay" }));
    let dialog = await screen.findByRole("dialog", { name: "Home visits in West Bay" });
    fireEvent.click(within(dialog).getByLabelText("Use the Doha fee"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls[0]).toEqual({ method: "PUT", path: "/admin/grooming/areas/a1/fee", body: { fee: null, enabled: true, version: 6 } }));

    fireEvent.click(within(doha).getByRole("button", { name: "Edit visit fee for Doha" }));
    dialog = await screen.findByRole("dialog", { name: "Home visits in Doha" });
    fireEvent.change(within(dialog).getByLabelText("Visit fee (QAR, 0 = none)"), { target: { value: "75" } });
    fireEvent.click(within(dialog).getByLabelText("Offer home visits in this city"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const question = await screen.findByRole("dialog", { name: "Stop home visits in Doha?" });
    expect(question.textContent).toContain("Deliveries are not affected");
    expect(calls).toHaveLength(1);
    fireEvent.click(within(question).getByRole("button", { name: "Stop home visits" }));
    await waitFor(() => expect(calls[1]).toEqual({ method: "PUT", path: `/admin/grooming/cities/${CITY}/fee`, body: { fee: 7500, enabled: false, version: 3 } }));
  });

  it("settings save with their version; the server's reason is shown when the step cannot change", async () => {
    const { api, calls } = stubApi(() => {
      throw new ApiError("CONFLICT", "The start-time step can only change while no future shop time has bookings or changes made by hand.", 409);
    });
    renderPage(api, normalisePermissions({ groomingCalendar: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const form = await screen.findByRole("form", { name: "Grooming settings" });
    fireEvent.change(within(form).getByLabelText(/^Shop start times every/), { target: { value: "60" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save grooming settings" }));
    await waitFor(() => expect(calls[0]).toEqual({ method: "PUT", path: "/admin/grooming/settings", body: { ...settings, stepMinutes: 60 } }));
    expect(await within(form).findByText(/start-time step can only change/)).toBeTruthy();
    expect(within(form).queryByRole("button", { name: "Reload settings" })).toBeNull();
  });
});

// --- Day overview (D255) -----------------------------------------------------------------------------

const PREVIOUS = "2099-01-04";

const booking = (reference: string, start: string, end: string | null, overrides: Partial<AdminBookingSummary> = {}): AdminBookingSummary => ({
  reference,
  status: "confirmed",
  location: end === null ? "home" : "shop",
  placedAt: "2099-01-01T08:00:00.000Z",
  contactName: "Mariam Test",
  contactPhone: "+974 3333 7777",
  package: { group: { en: "Small pet", ar: "حيوان صغير" }, name: { en: "Basic", ar: "أساسي" } },
  pet: { group: { en: "Small pet", ar: "حيوان صغير" }, breed: "Persian" },
  appointment: { date: DAY, start, end, startsAt: `${DAY}T07:00:00.000Z` },
  area: null,
  total: 8000,
  refundNeeded: false,
  attention: null,
  ...overrides,
});

/**
 * The calendar's API for the Day overview: its slots and settings (`gap` minutes of cleaning time), and
 * the day's bookings answered as the real list does (that date, place and statuses only). `hold` keeps an
 * answer back until its promise settles.
 */
function overviewApi(
  shopSlots: AdminGroomingSlot[],
  bookings: AdminBookingSummary[],
  {
    answer = () => ({}),
    hold = () => undefined,
    gap = 0,
  }: { answer?: (path: string, body: unknown) => unknown; hold?: (path: string) => Promise<void> | undefined; gap?: number } = {},
) {
  const gets: string[] = [];
  const calls: { method: string; path: string; body: unknown }[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      await hold(path);
      if (path === "/admin/grooming/settings") return schema.parse({ ...settings, cleaningGapMinutes: gap }) as never;
      if (path.startsWith("/admin/bookings?")) {
        const query = new URL(path, "http://test").searchParams;
        const statuses = query.get("status")?.split(",");
        const rows = bookings.filter(
          (row) => row.appointment.date === query.get("from") && row.location === query.get("location") && (!statuses || statuses.includes(row.status)),
        );
        const counts = { awaiting_payment: 0, confirmed: rows.length, in_progress: 0, completed: 0, no_show: 0, cancelled: 0, expired: 0 };
        return schema.parse({ bookings: rows, total: rows.length, page: 1, pageSize: 50, counts }) as never;
      }
      if (path === "/admin/grooming/slots?location=shop") return schema.parse({ from: DAY, to: NEXT, slots: shopSlots }) as never;
      if (path === "/admin/grooming/slots?location=home") return schema.parse({ from: DAY, to: NEXT, slots: [] }) as never;
      throw new ApiError("NOT_FOUND", `No stub for ${path}`, 404);
    },
    post: async () => {
      throw new Error("not used");
    },
    put: async (path, body, schema) => {
      calls.push({ method: "PUT", path, body });
      return schema.parse(answer(path, body)) as never;
    },
    delete: async () => {
      throw new Error("not used");
    },
  };
  return { api, gets, calls };
}

const dayTimes = [
  slot({ id: "t1", start: "10:00", end: "10:30", booked: 2, capacity: 3, version: 4 }),
  slot({ id: "t2", start: "10:30", end: "11:00", startsAt: "2099-01-05T07:30:00.000Z", booked: 1, capacity: 1 }),
  slot({ id: "t3", start: "11:00", end: "11:30", startsAt: "2099-01-05T08:00:00.000Z", closed: true }),
];
const dayBookings = [
  booking("GB-990105-ABCDEF", "10:00", "10:30"),
  // A 45-minute package at 10:00 also holds 10:30 (9c).
  booking("GB-990105-GHJKMN", "10:00", "10:45", { status: "awaiting_payment", contactName: "Sara Test" }),
  booking("GB-990105-PQRSTV", "10:30", "11:00", { status: "cancelled" }),
  booking("GB-990104-WXYZ12", "16:00", "16:45", { appointment: { date: PREVIOUS, start: "16:00", end: "16:45", startsAt: `${PREVIOUS}T13:00:00.000Z` } }),
  booking("GB-990105-345678", "09:00", null, { contactName: "Noor Home", area: { en: "West Bay", ar: "الخليج الغربي" } }),
  // A second booking at 16:00 on the earlier date, ending at another time.
  booking("GB-990104-MNPQRS", "16:00", "16:30", { appointment: { date: PREVIOUS, start: "16:00", end: "16:30", startsAt: `${PREVIOUS}T13:00:00.000Z` } }),
];

const goTo = (date: string) => fireEvent.change(screen.getByLabelText("Day", { selector: "input" }), { target: { value: date } });
const dayTable = () => screen.getByRole("table", { name: "Grooming times on this day" });
/** A held answer and the function that lets it through. */
function held() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("Day overview (D255, D257)", () => {
  it("opens on today; each time's places and status, and a click lists the bookings holding it, one line each", async () => {
    const { api, gets } = overviewApi(dayTimes, dayBookings);
    renderPage(api, normalisePermissions({ groomingCalendar: view, bookings: view }));
    expect(await screen.findByRole("button", { name: "Day overview", pressed: true })).toBeTruthy();
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue(qatarToday());

    goTo(DAY);
    const opener = await screen.findByRole("button", { name: "Bookings at 10:00–10:30", expanded: false });
    expect(timeRows(dayTable()).map(rowText)).toEqual([
      ["10:00–10:30", "2 of 3", "Open"],
      ["10:30–11:00", "1 of 1", "Full"],
      ["11:00–11:30", "0 of 3", "Closed"],
    ]);
    // Closed to start; a time with nothing booked has nothing to open.
    expect(listLines("Bookings at 10:00–10:30")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bookings at 11:00–11:30" })).toBeNull();

    fireEvent.click(opener);
    const money = formatMoney(8000, "en");
    expect(listLines("Bookings at 10:00–10:30")).toEqual([
      ["GB-990105-ABCDEF", "Mariam Test", "+974 3333 7777", "10:00–10:30", "Small pet · Persian", "Basic", money, "Confirmed"],
      ["GB-990105-GHJKMN", "Sara Test", "+974 3333 7777", "10:00–10:45", "Small pet · Persian", "Basic", money, "Awaiting payment"],
    ]);
    // The 45-minute booking also holds 10:30 (9c); the 30-minute one ends as 10:30 starts.
    fireEvent.click(screen.getByRole("button", { name: "Bookings at 10:30–11:00" }));
    expect(listReferences("Bookings at 10:30–11:00")).toEqual(["GB-990105-GHJKMN"]);
    // Cancelled bookings do not hold a time.
    expect(screen.queryByText("GB-990105-PQRSTV")).toBeNull();
    expect(screen.getByRole("link", { name: "GB-990105-ABCDEF" })).toHaveAttribute("href", "/admin/bookings?search=GB-990105-ABCDEF");
    expect(screen.getByRole("link", { name: "Open this day in Bookings" })).toHaveAttribute("href", `/admin/bookings?date=${DAY}&location=shop`);
    expect(screen.getByText(/A booking is listed in every time its package takes up\./)).toBeTruthy();
    // The day asks only for the bookings it shows; view-only roles get no Change.
    const asked = new URL(gets.find((path) => path.includes(`from=${DAY}`)) ?? "", "http://test").searchParams;
    expect([asked.get("status"), asked.get("location"), asked.get("to"), asked.get("sort")]).toEqual([
      "awaiting_payment,confirmed,in_progress,completed,no_show",
      "shop",
      DAY,
      "appointment",
    ]);
    expect(screen.queryByRole("button", { name: /^Change/ })).toBeNull();

    // Another day and back: the times opened one by one are closed again.
    goTo(PREVIOUS);
    await screen.findByRole("button", { name: "Bookings at 16:00", expanded: false });
    goTo(DAY);
    expect(await screen.findByRole("button", { name: "Bookings at 10:00–10:30", expanded: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bookings at 10:30–11:00", expanded: false })).toBeTruthy();
  });

  it("without Bookings access: the places and status only, nothing to open, and no bookings are asked for", async () => {
    const { api, gets } = overviewApi(dayTimes, dayBookings);
    renderPage(api, normalisePermissions({ groomingCalendar: view }));
    await screen.findByRole("button", { name: "Day overview", pressed: true });
    goTo(DAY);
    const table = await screen.findByRole("table", { name: "Grooming times on this day" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Time", "Sections booked", "Status"]);
    expect(timeRows(table).map(rowText)).toEqual([
      ["10:00–10:30", "2 of 3", "Open"],
      ["10:30–11:00", "1 of 1", "Full"],
      ["11:00–11:30", "0 of 3", "Closed"],
    ]);
    expect(screen.queryByRole("button", { name: /^Bookings at/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    expect(gets.some((path) => path.startsWith("/admin/bookings?"))).toBe(false);
    expect(screen.queryByRole("link", { name: "Open this day in Bookings" })).toBeNull();
  });

  it("a time's Change opens its dialog without opening the row and saves with the version it was opened at; a time that has started has none", async () => {
    const today = qatarToday();
    const fromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    const todayTimes = [
      slot({ id: "p1", date: today, start: "00:30", end: "01:00", startsAt: fromNow(-60) }),
      slot({ id: "p2", date: today, start: "23:00", end: "23:30", startsAt: fromNow(60) }),
    ];
    const { api, calls } = overviewApi([...dayTimes, ...todayTimes], dayBookings, { answer: () => ({ ...dayTimes[0], capacity: 4, version: 5 }) });
    renderPage(api, normalisePermissions({ groomingCalendar: all, bookings: view }));
    // As on the Times tab, a time can be changed only until it starts.
    expect(await screen.findByRole("button", { name: `Change ${today} 23:00` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Change ${today} 00:30` })).toBeNull();

    goTo(DAY);
    const opener = await screen.findByRole("button", { name: "Bookings at 10:00–10:30" });
    fireEvent.click(screen.getByRole("button", { name: `Change ${DAY} 10:00` }));
    expect(opener).toHaveAttribute("aria-expanded", "false");
    const dialog = await screen.findByRole("dialog", { name: /^Change 10:00/ });
    fireEvent.change(within(dialog).getByLabelText("Grooming sections"), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(calls).toEqual([{ method: "PUT", path: "/admin/grooming/slots/t1", body: { capacity: 4, closed: false, version: 4 } }]));
  });

  it("home visits list their area; a date no longer in the calendar lists its bookings by start time", async () => {
    const { api, gets } = overviewApi(dayTimes, dayBookings);
    renderPage(api, normalisePermissions({ groomingCalendar: all, bookings: view }));
    await screen.findByRole("button", { name: "Day overview", pressed: true });
    goTo(PREVIOUS);
    fireEvent.click(await screen.findByRole("button", { name: "Bookings at 16:00" }));
    // Both bookings at 16:00, each with its own end; the row has no places, status or Change.
    expect(timeRows(dayTable()).map(rowText)).toEqual([["16:00", "2", "", ""]]);
    expect(listLines("Bookings at 16:00")?.map((line) => [line[0], line[3]])).toEqual([
      ["GB-990104-WXYZ12", "16:00–16:45"],
      ["GB-990104-MNPQRS", "16:00–16:30"],
    ]);
    expect(within(dayTable()).queryByRole("button", { name: /^Change/ })).toBeNull();

    goTo(DAY);
    fireEvent.click(screen.getByRole("button", { name: "Home visits" }));
    await waitFor(() => expect(gets.some((path) => path.includes("location=home") && path.includes(`from=${DAY}`))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Bookings at 09:00" }));
    const list = screen.getByRole("table", { name: "Bookings at 09:00" });
    expect(within(list).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Booking", "Customer", "Phone", "Area", "Pet", "Package", "Total", "Status"]);
    expect(listLines("Bookings at 09:00")?.[0]?.slice(0, 4)).toEqual(["GB-990105-345678", "Noor Home", "+974 3333 7777", "West Bay"]);
    expect(within(dayTable()).getAllByRole("columnheader")[1]?.textContent).toBe("Buses booked");
  });

  it("while the times or a day's bookings load, the date stays in reach and an earlier day's bookings never show", async () => {
    const times = held();
    const previous = held();
    const { api } = overviewApi(dayTimes, dayBookings, {
      hold: (path) => (path.startsWith("/admin/grooming/slots") ? times.promise : path.includes(`from=${PREVIOUS}`) ? previous.promise : undefined),
    });
    renderPage(api, normalisePermissions({ groomingCalendar: view, bookings: view }));
    await screen.findByRole("button", { name: "Day overview", pressed: true });
    goTo(DAY);
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue(DAY);
    times.release();
    await screen.findByRole("button", { name: "Bookings at 10:00–10:30" });
    // Every time open, so the day's bookings are on screen when the next day starts loading.
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("GB-990105-ABCDEF")).toBeTruthy();

    goTo(PREVIOUS);
    expect(await screen.findByText("Loading the day's bookings…")).toBeTruthy();
    expect(screen.queryByText("GB-990105-ABCDEF")).toBeNull();
    previous.release();
    // Show all carries on to the next day.
    expect(await screen.findByText("GB-990104-WXYZ12")).toBeTruthy();
    expect(screen.queryByText("Loading the day's bookings…")).toBeNull();
  });

  it("with cleaning time after each shop booking, a booking is listed in every time it takes up, as the server holds them", async () => {
    const times = [
      slot({ id: "t1", start: "10:00", end: "10:30", booked: 3, capacity: 3 }),
      slot({ id: "t2", start: "10:30", end: "11:00", startsAt: "2099-01-05T07:30:00.000Z", booked: 3, capacity: 3 }),
      slot({ id: "t3", start: "11:00", end: "11:30", startsAt: "2099-01-05T08:00:00.000Z", booked: 1, capacity: 3 }),
      slot({ id: "t4", start: "11:30", end: "12:00", startsAt: "2099-01-05T08:30:00.000Z", booked: 0, capacity: 3 }),
    ];
    const hour = booking("GB-990105-RSTVWX", "10:00", "11:00", { contactName: "Long Test" });
    const { api } = overviewApi(times, [...dayBookings, hour], { gap: 15 });
    renderPage(api, normalisePermissions({ groomingCalendar: view, bookings: view }));
    await screen.findByRole("button", { name: "Day overview", pressed: true });
    goTo(DAY);
    await screen.findByRole("button", { name: "Bookings at 10:00–10:30" });
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    // 30 + 15 minutes and 45 + 15 take two 30-minute times; 60 + 15 takes three.
    expect(listReferences("Bookings at 10:00–10:30")).toEqual(["GB-990105-ABCDEF", "GB-990105-GHJKMN", "GB-990105-RSTVWX"]);
    expect(listReferences("Bookings at 10:30–11:00")).toEqual(["GB-990105-ABCDEF", "GB-990105-GHJKMN", "GB-990105-RSTVWX"]);
    expect(listReferences("Bookings at 11:00–11:30")).toEqual(["GB-990105-RSTVWX"]);
    expect(screen.queryByRole("button", { name: "Bookings at 11:30–12:00" })).toBeNull();
    expect(screen.getByText(/including the cleaning time after it/)).toBeTruthy();
  });
});
