import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  type AdminDeliveryArea,
  type AdminDeliveryCity,
  type AdminDeliveryWindow,
  type AdminOrderSummary,
  type DeliveryScheduleRule,
  type DeliverySettings,
  normalisePermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { parseQar } from "@/features/admin/delivery-slots/components/AreasPanel";
import { qatarToday } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { AdminDeliverySlotsPage } from "@/features/admin/delivery-slots/pages/AdminDeliverySlotsPage";
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

const windows: AdminDeliveryWindow[] = [
  { id: "w1", date: "2026-10-08", start: "09:00", end: "12:00", startsAt: "2026-10-08T06:00:00.000Z", capacity: 10, booked: 3, closed: false, source: "schedule", overridden: false, version: 2 },
  { id: "w2", date: "2026-10-08", start: "12:00", end: "15:00", startsAt: "2026-10-08T09:00:00.000Z", capacity: 10, booked: 0, closed: true, source: "schedule", overridden: true, version: 4 },
  { id: "w3", date: "2026-10-09", start: "21:00", end: "22:00", startsAt: "2026-10-09T18:00:00.000Z", capacity: 2, booked: 0, closed: false, source: "manual", overridden: true, version: 1 },
];
const rules: DeliveryScheduleRule[] = [
  { id: "r1", weekday: 1, start: "09:00", end: "12:00", capacity: 10, active: true, version: 1 },
  { id: "r2", weekday: 7, start: "15:00", end: "18:00", capacity: 6, active: false, version: 3 },
];
const CITY_DOHA = "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7b";
const CITY_WAKRAH = "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7c";
const CITY_SHAMAL = "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7d";
const cities: AdminDeliveryCity[] = [
  { id: CITY_DOHA, name: { en: "Doha", ar: "الدوحة" }, fee: 1000, active: true, sortOrder: 10, areaCount: 1, version: 3 },
  { id: CITY_WAKRAH, name: { en: "Al Wakrah", ar: "الوكرة" }, fee: 0, active: true, sortOrder: 30, areaCount: 1, version: 1 },
  { id: CITY_SHAMAL, name: { en: "Al Shamal", ar: "الشمال" }, fee: 4000, active: true, sortOrder: 70, areaCount: 0, version: 1 },
];
const areas: AdminDeliveryArea[] = [
  { id: "a1", name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: CITY_DOHA, city: { en: "Doha", ar: "الدوحة" }, fee: 1000, ownFee: null, active: true, sortOrder: 10, isSample: true, version: 1 },
  { id: "a2", name: { en: "Al Wakrah", ar: "الوكرة" }, cityId: CITY_WAKRAH, city: { en: "Al Wakrah", ar: "الوكرة" }, fee: 3000, ownFee: 3000, active: false, sortOrder: 20, isSample: false, version: 2 },
];
const settings: DeliverySettings = {
  holdMinutes: 15,
  leadTimeMinutes: 120,
  horizonDays: 14,
  pickupEnabled: true,
  pickupInstructions: { en: "", ar: "" },
  version: 5,
};

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Delivery", permissions };
}

function stubApi(overrides: Partial<Record<"put" | "post", (path: string, body: unknown) => unknown>> = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const responses: Record<string, unknown> = {
    "/admin/delivery/windows": { from: "2026-10-08", to: "2026-10-21", windows },
    "/admin/delivery/schedule": { rules },
    "/admin/delivery/areas": { cities, areas },
    "/admin/delivery/settings": settings,
  };
  const api: ApiClient = {
    get: async (path, schema) => schema.parse(responses[path]) as never,
    post: async (path, body, schema) => {
      calls.push({ method: "POST", path, body });
      return schema.parse(overrides.post?.(path, body)) as never;
    },
    put: async (path, body, schema) => {
      calls.push({ method: "PUT", path, body });
      return schema.parse(overrides.put?.(path, body)) as never;
    },
    delete: async (path, schema) => {
      calls.push({ method: "DELETE", path, body: null });
      return schema.parse({ status: "ok" }) as never;
    },
  };
  return { api, calls };
}

/** The page opens on the Day overview (D255); these tests are about the Upcoming windows tab. */
async function openWindows() {
  fireEvent.click(await screen.findByRole("button", { name: "Upcoming windows" }));
}

function renderPage(api: ApiClient, permissions: PermissionMap) {
  return render(
    <SettingsProviders api={api}>
      <MockDataProvider>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staff(permissions)}>
            <AdminDeliverySlotsPage />
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </MockDataProvider>
    </SettingsProviders>,
  );
}

describe("delivery fee input", () => {
  it("reads QAR amounts with up to two decimals as dirhams", () => {
    expect(parseQar("15")).toBe(1500);
    expect(parseQar("15.5")).toBe(1550);
    expect(parseQar(" 0 ")).toBe(0);
    for (const bad of ["", "abc", "-3", "1.234", "15,5"]) expect(parseQar(bad)).toBeNull();
  });
});

describe("admin delivery setup (API mode)", () => {
  it("lists each date's windows with bookings, closed and extra windows", async () => {
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    await openWindows();
    expect(await screen.findByText("3 of 10 booked", { exact: false })).toBeTruthy();
    expect(screen.getByText(/Closed/)).toBeTruthy();
    expect(screen.getByText(/Extra/)).toBeTruthy();
    // An extra window without bookings can be deleted; schedule windows cannot.
    expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(1);
  });

  it("a booked window leads to its orders in Deliveries by day, for roles that may see orders (D253)", async () => {
    renderPage(stubApi().api, normalisePermissions({ deliverySlots: view, orders: view }));
    await openWindows();
    const link = await screen.findByRole("link", { name: "See the orders for 09:00 on 2026-10-08" });
    expect(link).toHaveAttribute("href", "/admin/orders?date=2026-10-08&time=09:00");
    // Only a booked window has orders to see.
    expect(screen.getAllByRole("link", { name: /^See the orders/ })).toHaveLength(1);
    cleanup();
    renderPage(stubApi().api, normalisePermissions({ deliverySlots: all }));
    await openWindows();
    await screen.findByText("3 of 10 booked", { exact: false });
    expect(screen.queryByRole("link", { name: /^See the orders/ })).toBeNull();
  });

  it("view-only roles see the windows but no change, add or delete buttons", async () => {
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ deliverySlots: view }));
    await openWindows();
    await screen.findByText("3 of 10 booked", { exact: false });
    expect(screen.queryByRole("button", { name: /Change/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add extra window" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("closing one date sends the new state with the version the editor loaded", async () => {
    const { api, calls } = stubApi({ put: () => ({ ...windows[0], closed: true, overridden: true, version: 3 }) });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    await openWindows();
    fireEvent.click(await screen.findByRole("button", { name: "Change 2026-10-08 09:00" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/3 already booked/)).toBeTruthy();
    // Fewer seats than the 3 already booked stops the form (D230: the shared number field checks its range).
    const seats = within(dialog).getByLabelText("Deliveries in this window") as HTMLInputElement;
    const seatsBefore = seats.value;
    fireEvent.change(seats, { target: { value: "2" } });
    expect(seats.validity.valid).toBe(false);
    fireEvent.change(seats, { target: { value: seatsBefore } });
    expect(seats.validity.valid).toBe(true);
    fireEvent.click(within(dialog).getByLabelText("Closed for new orders on this date"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    // D128: closing asks first, and mentions the orders that stay.
    const question = await screen.findByRole("dialog", { name: /to new orders\?$/ });
    expect(within(question).getByText(/The 3 orders already booked stay/)).toBeTruthy();
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Close window" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: "PUT", path: "/admin/delivery/windows/w1", body: { capacity: 10, closed: true, version: 2 } });
  });

  it("a capacity change that keeps the window open saves without asking", async () => {
    const { api, calls } = stubApi({ put: () => ({ ...windows[0], capacity: 12, overridden: true, version: 3 }) });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    await openWindows();
    fireEvent.click(await screen.findByRole("button", { name: "Change 2026-10-08 09:00" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Deliveries in this window"), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ capacity: 12, closed: false, version: 2 });
  });

  it("deleting an area or an extra window asks first; Cancel sends nothing", async () => {
    const { api, calls } = stubApi();
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    await openWindows();
    fireEvent.click(await screen.findByRole("button", { name: "Delete 2026-10-09 21:00" }));
    let question = await screen.findByRole("dialog", { name: /^Delete the extra window/ });
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Areas & fees" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete West Bay" }));
    question = await screen.findByRole("dialog", { name: 'Delete the area "West Bay"?' });
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Delete area" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: "/admin/delivery/areas/a1", body: null }]));
  });

  it("shows the weekly schedule Sunday first, with paused windows", async () => {
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Weekly schedule" }));
    const headings = (await screen.findAllByRole("heading", { level: 3 })).map((heading) => heading.textContent);
    expect(headings.slice(0, 2)).toEqual(["Sunday", "Monday"]);
    expect(screen.getByText(/Paused/)).toBeTruthy();
  });

  it("adds a weekly window with the chosen day, times and capacity", async () => {
    const created = { id: "r9", weekday: 5, start: "16:00", end: "19:30", capacity: 4, active: true, version: 1 };
    const { api, calls } = stubApi({ post: () => created });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Weekly schedule" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add window" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Day"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "16:00" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "19:30" } });
    fireEvent.change(within(dialog).getByLabelText("Deliveries per window"), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save window" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/admin/delivery/schedule",
      body: { weekday: 5, start: "16:00", end: "19:30", capacity: 4, active: true },
    });
  });

  it("areas sit under their cities and say whether they use the city fee or their own (D135)", async () => {
    const { api } = stubApi();
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Areas & fees" }));
    const doha = await screen.findByRole("region", { name: "Doha" });
    expect(within(doha).getByText(/City fee: QAR/)).toBeTruthy();
    expect(within(doha).getByText("West Bay")).toBeTruthy();
    expect(within(doha).getByText(/Doha fee/)).toBeTruthy();
    expect(within(doha).getByText(/Sample/)).toBeTruthy();
    const wakrah = screen.getByRole("region", { name: "Al Wakrah" });
    expect(within(wakrah).getByText(/own fee/)).toBeTruthy();
    expect(within(wakrah).getByText(/Hidden/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Al Shamal" }).textContent).toContain("0 areas");
    // Only a city without areas can be deleted.
    expect(screen.getByRole("button", { name: "Delete city Al Shamal" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete city Doha" })).toBeNull();
  });

  it("a new area follows its city's fee unless it is given its own (fee null or dirhams)", async () => {
    const created = { ...areas[0], id: "a3", name: { en: "Lusail", ar: "لوسيل" }, isSample: false };
    const { api, calls } = stubApi({ post: () => created });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Areas & fees" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add area in Doha" }));
    let dialog = await screen.findByRole("dialog", { name: "New area" });
    fireEvent.change(within(dialog).getByLabelText("Name · English"), { target: { value: "Lusail" } });
    fireEvent.change(within(dialog).getByLabelText("Name · Arabic"), { target: { value: "لوسيل" } });
    expect((within(dialog).getByRole("checkbox", { name: /Use the Doha fee/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(dialog).queryByLabelText(/Own fee/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save area" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ name: { en: "Lusail", ar: "لوسيل" }, cityId: CITY_DOHA, fee: null, active: true });

    // Its own fee, in another city.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add area" }));
    dialog = await screen.findByRole("dialog", { name: "New area" });
    fireEvent.change(within(dialog).getByLabelText("Name · English"), { target: { value: "The Pearl" } });
    fireEvent.change(within(dialog).getByLabelText("Name · Arabic"), { target: { value: "اللؤلؤة" } });
    fireEvent.change(within(dialog).getByLabelText("City"), { target: { value: CITY_WAKRAH } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Use the Al Wakrah fee/ }));
    fireEvent.change(within(dialog).getByLabelText("Own fee for this area (QAR, 0 = free)"), { target: { value: "15.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save area" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).toMatchObject({ name: { en: "The Pearl", ar: "اللؤلؤة" }, cityId: CITY_WAKRAH, fee: 1550 });
  });

  it("stopping deliveries to a whole city asks first; a fee change does not", async () => {
    const { api, calls } = stubApi({ put: (_path, body) => ({ ...cities[0], ...(body as object), areaCount: 1 }) });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Areas & fees" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit city Doha" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit city" });
    expect(dialog.textContent).toContain("Areas using the city fee: 1 of 1");
    fireEvent.change(within(dialog).getByLabelText("City fee (QAR, 0 = free)"), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save city" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "PUT", path: `/admin/delivery/cities/${CITY_DOHA}`, body: { fee: 1200, active: true, version: 3 } });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit city Doha" }));
    dialog = await screen.findByRole("dialog", { name: "Edit city" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Deliver to this city" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save city" }));
    const question = await screen.findByRole("dialog", { name: "Stop deliveries to Doha?" });
    expect(question.textContent).toContain("choose its area at checkout");
    expect(calls).toHaveLength(1);
    fireEvent.click(within(question).getByRole("button", { name: "Stop deliveries" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).toMatchObject({ active: false, version: 3 });
  });

  it("explains a simultaneous settings edit and offers a reload", async () => {
    const { api } = stubApi({
      put: () => {
        throw new ApiError("CONFLICT", "x", 409);
      },
    });
    renderPage(api, normalisePermissions({ deliverySlots: all }));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save delivery settings" }));
    expect(await screen.findByText(/Someone else saved the delivery settings/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload settings" })).toBeTruthy();
  });
});

// --- Day overview (D255) -----------------------------------------------------------------------------

const deliveryOrder = (reference: string, start: string, end: string, overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary => ({
  reference,
  status: "confirmed",
  fulfilment: "delivery",
  placedAt: "2026-10-07T08:00:00.000Z",
  contactName: "Mariam Test",
  contactPhone: "+974 3333 7777",
  area: { en: "West Bay", ar: "الخليج الغربي" },
  window: { date: "2026-10-08", start, end },
  itemCount: 2,
  hasHouse: false,
  total: 9500,
  refundNeeded: false,
  attention: null,
  ...overrides,
});

const theDayOrders: AdminOrderSummary[] = [
  deliveryOrder("NC-261008-ABCDEF", "09:00", "12:00"),
  deliveryOrder("NC-261008-GHJKMN", "09:00", "12:00", { status: "awaiting_payment", contactName: "Sara Test" }),
  deliveryOrder("NC-261008-PQRSTV", "09:00", "12:00", { status: "preparing" }),
  deliveryOrder("NC-261008-WXYZ12", "09:00", "12:00", { status: "cancelled" }),
  deliveryOrder("NC-261008-345678", "09:00", "12:00", { fulfilment: "pickup", area: null, window: null }),
  deliveryOrder("NC-261007-9ABCDE", "18:00", "21:00", { window: { date: "2026-10-07", start: "18:00", end: "21:00" } }),
  deliveryOrder("NC-261009-FGHJKM", "15:00", "18:00", { window: { date: "2026-10-09", start: "15:00", end: "18:00" } }),
  deliveryOrder("NC-261009-NPQRST", "15:00", "18:00", { window: { date: "2026-10-09", start: "15:00", end: "18:00" } }),
];
/** A window with every place taken. */
const fullWindow: AdminDeliveryWindow = {
  id: "w4",
  date: "2026-10-09",
  start: "15:00",
  end: "18:00",
  startsAt: "2026-10-09T12:00:00.000Z",
  capacity: 2,
  booked: 2,
  closed: false,
  source: "schedule",
  overridden: false,
  version: 1,
};

/**
 * The Delivery page's API, answering the Day overview's orders as the real list does: that date, delivery
 * only, those statuses. `windowList` replaces the windows; `hold` keeps an answer back until its promise settles.
 */
function overviewApi(
  orders: AdminOrderSummary[],
  overrides: Parameters<typeof stubApi>[0] = {},
  more: { windowList?: AdminDeliveryWindow[]; hold?: (path: string) => Promise<void> | undefined } = {},
) {
  const base = stubApi(overrides);
  const gets: string[] = [];
  const api: ApiClient = {
    ...base.api,
    get: async (path, schema) => {
      gets.push(path);
      await more.hold?.(path);
      if (path === "/admin/delivery/windows" && more.windowList) {
        return schema.parse({ from: "2026-10-08", to: "2026-10-21", windows: more.windowList }) as never;
      }
      if (!path.startsWith("/admin/orders?")) return base.api.get(path, schema);
      const query = new URL(path, "http://test").searchParams;
      const statuses = query.get("status")?.split(",");
      const rows = orders.filter(
        (row) => row.fulfilment === query.get("fulfilment") && row.window?.date === query.get("from") && (!statuses || statuses.includes(row.status)),
      );
      const counts = { awaiting_payment: 0, confirmed: rows.length, preparing: 0, out_for_delivery: 0, ready_for_pickup: 0, delivered: 0, collected: 0, cancelled: 0, expired: 0 };
      return schema.parse({ orders: rows, total: rows.length, page: 1, pageSize: 50, counts }) as never;
    },
  };
  return { api, gets, calls: base.calls };
}

const goTo = (date: string) => fireEvent.change(screen.getByLabelText("Day", { selector: "input" }), { target: { value: date } });
const dayTable = () => screen.getByRole("table", { name: "Delivery windows on this day" });
/** A held answer and the function that lets it through. */
function held() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("Delivery day overview (D255, D257)", () => {
  it("opens on today; each window's places and status, and a click lists its orders, one line each", async () => {
    const { api, gets } = overviewApi(theDayOrders, {}, { windowList: [...windows, fullWindow] });
    renderPage(api, normalisePermissions({ deliverySlots: view, orders: view }));
    expect(await screen.findByRole("button", { name: "Day overview", pressed: true })).toBeTruthy();
    expect(await screen.findByLabelText("Day", { selector: "input" })).toHaveValue(qatarToday());

    goTo("2026-10-08");
    const opener = await screen.findByRole("button", { name: "Orders at 09:00–12:00", expanded: false });
    expect(timeRows(dayTable()).map(rowText)).toEqual([
      ["09:00–12:00", "3 of 10", "Open"],
      ["12:00–15:00", "0 of 10", "Closed"],
    ]);
    // Closed to start; a window with nothing booked has nothing to open.
    expect(listLines("Orders at 09:00–12:00")).toBeNull();
    expect(screen.queryByRole("button", { name: "Orders at 12:00–15:00" })).toBeNull();

    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    const money = formatMoney(9500, "en");
    expect(listLines("Orders at 09:00–12:00")).toEqual([
      ["NC-261008-ABCDEF", "Mariam Test", "+974 3333 7777", "West Bay", "2", money, "Confirmed"],
      ["NC-261008-GHJKMN", "Sara Test", "+974 3333 7777", "West Bay", "2", money, "Awaiting payment"],
      ["NC-261008-PQRSTV", "Mariam Test", "+974 3333 7777", "West Bay", "2", money, "Preparing"],
    ]);
    // Cancelled orders and pickups hold no window.
    expect(screen.queryByText("NC-261008-WXYZ12")).toBeNull();
    expect(screen.queryByText("NC-261008-345678")).toBeNull();
    expect(screen.getByRole("link", { name: "NC-261008-ABCDEF" })).toHaveAttribute("href", "/admin/orders?search=NC-261008-ABCDEF");
    // The next click closes it; a click anywhere else on the row opens it again.
    fireEvent.click(opener);
    expect(listLines("Orders at 09:00–12:00")).toBeNull();
    fireEvent.click(within(timeRows(dayTable())[0] as HTMLElement).getByText("3 of 10"));
    expect(listReferences("Orders at 09:00–12:00")).toHaveLength(3);

    expect(screen.getByRole("link", { name: "Open this day in Orders" })).toHaveAttribute("href", "/admin/orders?date=2026-10-08");
    const asked = new URL(gets.find((path) => path.includes("from=2026-10-08")) ?? "", "http://test").searchParams;
    expect([asked.get("status"), asked.get("fulfilment"), asked.get("dateField"), asked.get("sort")]).toEqual([
      "awaiting_payment,confirmed,preparing,out_for_delivery,delivered",
      "delivery",
      "window",
      "window",
    ]);
    expect(screen.queryByRole("button", { name: /^Change/ })).toBeNull();

    // Another day starts closed; a window with every place taken is Full, even while it stays open.
    goTo("2026-10-09");
    expect(await screen.findByRole("button", { name: "Orders at 15:00–18:00", expanded: false })).toBeTruthy();
    expect(timeRows(dayTable()).map(rowText)).toEqual([
      ["15:00–18:00", "2 of 2", "Full"],
      ["21:00–22:00", "0 of 2", "Open"],
    ]);
    // Back on the first day, the window opened by itself is closed again.
    goTo("2026-10-08");
    expect(await screen.findByRole("button", { name: "Orders at 09:00–12:00", expanded: false })).toBeTruthy();

    // A past date the windows list no longer has: its orders by window, without places or status.
    goTo("2026-10-07");
    fireEvent.click(await screen.findByRole("button", { name: "Orders at 18:00–21:00" }));
    expect(timeRows(dayTable()).map(rowText)).toEqual([["18:00–21:00", "1", ""]]);
    expect(listReferences("Orders at 18:00–21:00")).toEqual(["NC-261007-9ABCDE"]);
  });

  it("Show all opens every window with orders and stays from day to day; Hide all closes them", async () => {
    const { api } = overviewApi(theDayOrders, {}, { windowList: [...windows, fullWindow] });
    renderPage(api, normalisePermissions({ deliverySlots: view, orders: view }));
    await screen.findByLabelText("Day", { selector: "input" });
    goTo("2026-10-08");
    await screen.findByRole("button", { name: "Orders at 09:00–12:00" });
    expect(screen.getByRole("button", { name: "Hide all" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(listReferences("Orders at 09:00–12:00")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Show all" })).toBeDisabled();

    goTo("2026-10-09");
    expect(await screen.findByRole("table", { name: "Orders at 15:00–18:00" })).toBeTruthy();
    // One window can still be closed by itself.
    fireEvent.click(screen.getByRole("button", { name: "Orders at 15:00–18:00" }));
    expect(listLines("Orders at 15:00–18:00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(listReferences("Orders at 15:00–18:00")).toEqual(["NC-261009-FGHJKM", "NC-261009-NPQRST"]);
    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(listLines("Orders at 15:00–18:00")).toBeNull();
  });

  it("without Orders access: the booked places and status only, nothing to open, and no orders are asked for", async () => {
    const { api, gets } = overviewApi(theDayOrders);
    renderPage(api, normalisePermissions({ deliverySlots: view }));
    await screen.findByLabelText("Day", { selector: "input" });
    goTo("2026-10-08");
    const table = await screen.findByRole("table", { name: "Delivery windows on this day" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Window", "Booked", "Status"]);
    expect(timeRows(table).map(rowText)).toEqual([
      ["09:00–12:00", "3 of 10", "Open"],
      ["12:00–15:00", "0 of 10", "Closed"],
    ]);
    expect(screen.queryByRole("button", { name: /^Orders at/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    expect(gets.some((path) => path.startsWith("/admin/orders?"))).toBe(false);
    expect(screen.queryByRole("link", { name: "Open this day in Orders" })).toBeNull();
  });

  it("a window's Change opens its dialog without opening the row; closing asks first and sends the version it was opened at", async () => {
    const { api, calls } = overviewApi(theDayOrders, { put: () => ({ ...windows[0], closed: true, overridden: true, version: 3 }) });
    renderPage(api, normalisePermissions({ deliverySlots: all, orders: view }));
    await screen.findByLabelText("Day", { selector: "input" });
    goTo("2026-10-08");
    const opener = await screen.findByRole("button", { name: "Orders at 09:00–12:00" });
    fireEvent.click(screen.getByRole("button", { name: "Change 2026-10-08 09:00" }));
    expect(opener).toHaveAttribute("aria-expanded", "false");
    const dialog = await screen.findByRole("dialog", { name: /^Change 09:00–12:00/ });
    fireEvent.click(within(dialog).getByLabelText("Closed for new orders on this date"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    const question = await screen.findByRole("dialog", { name: /to new orders\?$/ });
    expect(calls).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Close window" }));
    await waitFor(() => expect(calls).toEqual([{ method: "PUT", path: "/admin/delivery/windows/w1", body: { capacity: 10, closed: true, version: 2 } }]));
  });

  it("while the windows or a day's orders load, the date stays in reach and an earlier day's orders never show", async () => {
    const windowsHeld = held();
    const previous = held();
    const { api } = overviewApi(
      theDayOrders,
      {},
      { hold: (path) => (path === "/admin/delivery/windows" ? windowsHeld.promise : path.includes("from=2026-10-07") ? previous.promise : undefined) },
    );
    renderPage(api, normalisePermissions({ deliverySlots: view, orders: view }));
    await screen.findByRole("button", { name: "Day overview", pressed: true });
    goTo("2026-10-08");
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue("2026-10-08");
    windowsHeld.release();
    await screen.findByRole("button", { name: "Orders at 09:00–12:00" });
    // Every window open, so the day's orders are on screen when the next day starts loading.
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("NC-261008-ABCDEF")).toBeTruthy();

    goTo("2026-10-07");
    expect(await screen.findByText("Loading the day's orders…")).toBeTruthy();
    expect(screen.queryByText("NC-261008-ABCDEF")).toBeNull();
    previous.release();
    expect(await screen.findByText("NC-261007-9ABCDE")).toBeTruthy();
    expect(screen.queryByText("Loading the day's orders…")).toBeNull();
  });
});
