// 9f: the staff Bookings page in API mode: list, search, filters and counts; the detail with the steps,
// cancel and move dialogs (each asks first, D128); the payment section shared with orders; the day
// view the Grooming calendar links to (its linked time, loading another day, and its CSV); and no
// sample-data banner any more.
import {
  type AdminBooking,
  type AdminBookingMoveTimesResponse,
  type AdminBookingPayments,
  type BookingStatus,
  bookingCanBeNoShow,
  nextBookingStatus,
  normalisePermissions,
  type PermissionMap,
  previousBookingStatus,
  type StaffProfile,
  staffCanCancelBooking,
  staffCanMoveBooking,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBookingsPage } from "@/features/admin/bookings/pages/AdminBookingsPage";
import { qatarToday } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { SAMPLE_DATA_PAGES } from "@/layouts/admin/navigation";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { adminBookingSearch, emptyAdminBookingFilters } from "@/shared/api/admin-bookings";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

let linked = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => linked }));
vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
beforeEach(() => {
  linked = new URLSearchParams();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const operations = { view: true, edit: true, delete: false, export: false, refund: false };
const viewOnly = { view: true, edit: false, delete: false, export: false, refund: false };
const refunder = { view: true, edit: true, delete: false, export: false, refund: true };

const REF_A = "GB-261013-ABCDEF";
const REF_B = "GB-261013-GHJKMN";

function booking(reference: string, status: BookingStatus, overrides: Partial<AdminBooking> = {}): AdminBooking {
  const attention = overrides.attention ?? null;
  return {
    reference,
    status,
    location: "shop",
    placedAt: "2026-10-11T06:30:00.000Z",
    contactName: "Mariam Test",
    contactPhone: "+974 3333 7777",
    package: { group: { en: "Adult cat", ar: "قطة بالغة" }, name: { en: "Basic", ar: "أساسي" } },
    pet: { group: { en: "Adult cat", ar: "قطة بالغة" }, breed: "Persian" },
    appointment: { date: "2026-10-13", start: "10:00", end: "11:00", startsAt: "2026-10-13T07:00:00.000Z" },
    area: null,
    total: 12000,
    refundNeeded: false,
    attention,
    locale: "en",
    contact: { name: "Mariam Test", email: "mariam@example.invalid", phone: "+974 3333 7777" },
    hasAccount: false,
    petDetails: { ageMonths: 26, breed: "Persian", notes: "Nervous of dryers" },
    included: { en: ["Bath & blow dry", "Nail trim"], ar: ["استحمام", "قص الأظافر"] },
    durationMinutes: 60,
    address: null,
    price: 12000,
    visitFee: 0,
    discount: 0,
    promotions: [],
    holdExpiresAt: null,
    confirmedAt: "2026-10-11T06:31:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    expiredAt: null,
    history: [{ from: null, to: "awaiting_payment", actor: "guest", staffName: null, reason: null, at: "2026-10-11T06:30:00.000Z" }],
    version: 3,
    actions: {
      next: nextBookingStatus(status),
      back: previousBookingStatus(status),
      noShow: bookingCanBeNoShow(status),
      cancel: staffCanCancelBooking(status),
      move: staffCanMoveBooking(status, attention),
    },
    ...overrides,
  };
}

const summary = (row: AdminBooking) => {
  const {
    locale: _l, contact: _c, hasAccount: _h, petDetails: _p, included: _i, durationMinutes: _d, address: _a, price: _pr, visitFee: _v,
    discount: _di, promotions: _pm, holdExpiresAt: _he, confirmedAt: _ca, cancelledAt: _cc, cancelledBy: _cb, cancelReason: _cr, expiredAt: _e, history: _hi, version: _ve, actions: _ac,
    ...rest
  } = row;
  return rest;
};

const counts = (values: Partial<Record<BookingStatus, number>>) => ({
  awaiting_payment: 0, confirmed: 0, in_progress: 0, completed: 0, no_show: 0, cancelled: 0, expired: 0, ...values,
});

function panel(reference: string, overrides: Partial<AdminBookingPayments> = {}): AdminBookingPayments {
  return {
    bookingReference: reference,
    attention: null,
    refundNeeded: false,
    attempts: [
      {
        reference: `${reference}-P1`, provider: "fake", status: "succeeded", amount: 12000, refunded: 0,
        createdAt: "2026-10-11T06:30:30.000Z", succeededAt: "2026-10-11T06:31:00.000Z", reported: null, mismatchClosed: null,
      },
    ],
    refunds: [],
    actions: { refundable: [{ paymentReference: `${reference}-P1`, maxAmount: 12000 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
    ...overrides,
  };
}

const freeTimes: AdminBookingMoveTimesResponse = {
  from: "2026-10-12",
  to: "2026-10-25",
  days: [
    // A free day before the booking's own (13 Oct): the move dialog still opens on the booking's day (D249).
    { date: "2026-10-12", times: [{ start: "16:00", end: "17:00", startsAt: "2026-10-12T13:00:00.000Z" }] },
    { date: "2026-10-13", times: [{ start: "11:00", end: "12:00", startsAt: "2026-10-13T08:00:00.000Z" }] },
    { date: "2026-10-14", times: [{ start: "10:00", end: "11:00", startsAt: "2026-10-14T07:00:00.000Z" }, { start: "14:30", end: "15:30", startsAt: "2026-10-14T11:30:00.000Z" }] },
  ],
};

function stubApi(bookings: AdminBooking[], post?: (path: string, body: unknown) => unknown) {
  const gets: string[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.endsWith("/payments")) return schema.parse(panel(decodeURIComponent(path.split("/").at(-2) ?? ""))) as never;
      if (path.endsWith("/move-times")) return schema.parse(freeTimes) as never;
      if (path.startsWith("/admin/bookings?")) {
        return schema.parse({
          bookings: bookings.map(summary),
          total: bookings.length,
          page: 1,
          pageSize: 25,
          counts: counts({ confirmed: 4, awaiting_payment: 1, in_progress: 2, cancelled: 1 }),
        }) as never;
      }
      const reference = decodeURIComponent(path.split("/").pop() ?? "");
      const found = bookings.find((item) => item.reference === reference);
      if (!found) throw new ApiError("NOT_FOUND", "Booking not found.", 404);
      return schema.parse(found) as never;
    },
    post: async (path, body, schema) => {
      posts.push({ path, body });
      return schema.parse(post?.(path, body)) as never;
    },
    put: async () => {
      throw new Error("not used");
    },
    delete: async () => {
      throw new Error("not used");
    },
  };
  return { api, gets, posts };
}

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Groomers", permissions };
}

function page(api: ApiClient, bookings = operations, others: Partial<PermissionMap> = {}) {
  return (
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ bookings, ...others }))}>
          <AdminBookingsPage />
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>
  );
}

function renderPage(api: ApiClient, bookings = operations, others: Partial<PermissionMap> = {}) {
  return render(page(api, bookings, others));
}

async function openBooking(reference: string) {
  fireEvent.click(await screen.findByRole("button", { name: `View booking ${reference}` }));
  const panel = await screen.findByRole("complementary", { name: `Booking ${reference}` });
  // The detail arrives after the panel opens.
  await within(panel).findByRole("heading", { name: "Customer" });
  return panel;
}

/**
 * An API that answers the list as the real one does for the Day view: only bookings on the asked date,
 * place and statuses. `hold` keeps the answer for one date back until released.
 */
function dayApi(bookings: AdminBooking[], hold?: string) {
  const gets: string[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      const query = new URL(path, "http://test").searchParams;
      const from = query.get("from");
      if (hold && from === hold) await held;
      const statuses = query.get("status")?.split(",");
      const rows = bookings.filter(
        (row) =>
          (!from || row.appointment.date === from) &&
          (!query.get("location") || row.location === query.get("location")) &&
          (!statuses || statuses.includes(row.status)),
      );
      return schema.parse({ bookings: rows.map(summary), total: rows.length, page: 1, pageSize: 50, counts: counts({ confirmed: rows.length }) }) as never;
    },
    post: async () => {
      throw new Error("not used");
    },
    put: async () => {
      throw new Error("not used");
    },
    delete: async () => {
      throw new Error("not used");
    },
  };
  return { api, gets, release: () => release() };
}

const at = (reference: string, date: string, start: string, location: "shop" | "home" = "shop") =>
  booking(reference, "confirmed", {
    location,
    appointment: { date, start, end: null, startsAt: `${date}T07:00:00.000Z` },
    ...(location === "home" ? { area: { en: "West Bay", ar: "الخليج الغربي" } } : {}),
  });

const REF_C = "GB-261014-PQRSTV";
const REF_D = "GB-261013-WXYZ12";

/** The references of the appointments marked as the linked time. */
const marked = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("aria-current") === "true")
    .map((item) => within(item).getByRole("button").textContent);

describe("admin bookings (API mode)", () => {
  it("lists real bookings with the status counts, and the sample-data banner is gone", async () => {
    const { api, gets } = stubApi([booking(REF_A, "confirmed"), booking(REF_B, "awaiting_payment", { location: "home", area: { en: "West Bay", ar: "الخليج الغربي" }, appointment: { date: "2026-10-13", start: "09:00", end: null, startsAt: "2026-10-13T06:00:00.000Z" } })]);
    renderPage(api);
    expect(await screen.findByText(REF_A)).toBeTruthy();
    expect(screen.getByText(REF_B)).toBeTruthy();
    expect(screen.getByText("Confirmed, to groom").parentElement?.textContent).toBe("Confirmed, to groom4");
    expect(screen.getByText("All bookings").parentElement?.textContent).toBe("All bookings8");
    expect(screen.getByText("West Bay")).toBeTruthy();
    // Each booking names the pet by its type and breed, with the package below (D246).
    expect(screen.getAllByText("Adult cat · Persian").length).toBe(2);
    expect(SAMPLE_DATA_PAGES.bookings).toBeUndefined();
    expect(screen.queryByRole("button", { name: /New booking/i })).toBeNull();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    await waitFor(() => expect(gets.at(-1)).toContain("status=awaiting_payment%2Cconfirmed%2Cin_progress"));
    fireEvent.change(screen.getByLabelText("Shop or home"), { target: { value: "home" } });
    await waitFor(() => expect(gets.at(-1)).toContain("location=home"));
    fireEvent.change(screen.getByLabelText("Search by booking, name, email or phone"), { target: { value: "33337777" } });
    await waitFor(() => expect(gets.at(-1)).toContain("q=33337777"));
  });

  it("the detail shows the pet, appointment and package; Start grooming asks first, then sends the version", async () => {
    const started = booking(REF_A, "in_progress", { version: 4 });
    const { api, posts } = stubApi([booking(REF_A, "confirmed")], () => started);
    renderPage(api);
    const panel = await openBooking(REF_A);
    // The pet as its type and breed, its age and notes; no name or weight (D246).
    expect(within(panel).getByText("Adult cat · Persian")).toBeTruthy();
    expect(within(panel).getByText("2 years 2 months")).toBeTruthy();
    expect(within(panel).queryByText(/kg/)).toBeNull();
    expect(within(panel).getByText(/Nervous of dryers/)).toBeTruthy();
    expect(within(panel).getByText("At the shop")).toBeTruthy();
    expect(within(panel).getByText(/Adult cat · Basic/)).toBeTruthy();
    expect(within(panel).getByText("Nail trim")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Start grooming" }));
    const dialog = await screen.findByRole("dialog", { name: `Move booking ${REF_A} to In progress?` });
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start grooming" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/bookings/${REF_A}/advance`, body: { version: 3 } }]));
    expect(await screen.findByText(`Booking ${REF_A} is now In progress.`)).toBeTruthy();
  });

  it("a home visit's shared point opens in Google Maps from the panel (D263)", async () => {
    const visit = booking(REF_A, "confirmed", {
      location: "home",
      address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } },
    });
    const { api } = stubApi([visit]);
    renderPage(api);
    const panel = await openBooking(REF_A);
    expect(within(panel).getByRole("link", { name: "Open in Google Maps (± 15 m)" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
  });

  it("the Customer card opens the customer's record, for roles that may view Customers (10d)", async () => {
    renderPage(stubApi([booking(REF_A, "confirmed")]).api, operations, { customers: viewOnly });
    let panel = await openBooking(REF_A);
    expect(within(panel).getByRole("link", { name: "Open customer record" })).toHaveAttribute("href", "/admin/customers?search=mariam%40example.invalid");
    cleanup();

    renderPage(stubApi([booking(REF_A, "confirmed")]).api);
    panel = await openBooking(REF_A);
    expect(within(panel).queryByRole("link", { name: "Open customer record" })).toBeNull();
  });

  it("No-show and one step back each ask first", async () => {
    const { api, posts } = stubApi([booking(REF_A, "confirmed")], (path) => booking(REF_A, path.endsWith("no-show") ? "no_show" : "confirmed", { version: 4 }));
    renderPage(api);
    const panel = await openBooking(REF_A);
    fireEvent.click(within(panel).getByRole("button", { name: "Mark no-show" }));
    const dialog = await screen.findByRole("dialog", { name: `Mark booking ${REF_A} as a no-show?` });
    expect(within(dialog).getByText(/nothing is refunded automatically/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark no-show" }));
    await waitFor(() => expect(posts.at(-1)?.path).toBe(`/admin/bookings/${REF_A}/no-show`));
  });

  it("cancel needs a reason, says what happens, and sends nothing before the button", async () => {
    const cancelled = booking(REF_A, "cancelled", { refundNeeded: true, version: 4 });
    const { api, posts } = stubApi([booking(REF_A, "confirmed")], () => cancelled);
    renderPage(api);
    const panel = await openBooking(REF_A);
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog", { name: `Cancel booking ${REF_A}?` });
    expect(within(dialog).getByText(/marked Refund needed/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(await within(dialog).findByText("Please give a reason (at least 3 characters).")).toBeTruthy();
    expect(posts).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Groomer is ill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/bookings/${REF_A}/cancel`, body: { version: 3, reason: "Groomer is ill" } }]));
    expect(await screen.findByText(`Booking ${REF_A} is cancelled and marked Refund needed.`)).toBeTruthy();
  });

  it("move: the free times for this booking, then one step; a time taken meanwhile says so and reads the times again", async () => {
    let refuse = true;
    const moved = booking(REF_A, "confirmed", { version: 4, appointment: { date: "2026-10-14", start: "14:30", end: "15:30", startsAt: "2026-10-14T11:30:00.000Z" } });
    const { api, gets, posts } = stubApi([booking(REF_A, "confirmed")], () => {
      if (refuse) {
        refuse = false;
        throw new ApiError("SLOT_UNAVAILABLE", "This time is no longer available.", 409);
      }
      return moved;
    });
    renderPage(api);
    const panel = await openBooking(REF_A);
    fireEvent.click(within(panel).getByRole("button", { name: "Move to another time" }));
    const dialog = await screen.findByRole("dialog", { name: `Move booking ${REF_A}?` });
    expect(within(dialog).getByRole("button", { name: "Move booking" })).toBeDisabled();
    // The shared date and time picker (D249) opens on the booking's own day, in staff's 24-hour times.
    expect(await within(dialog).findByRole("button", { name: "Tuesday, 13 October 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "11:00–12:00" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Wednesday, 14 October 2026" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "14:30–15:30" }));
    expect(within(dialog).getByRole("status", { name: "New time (Qatar)" })).toHaveTextContent("Wed, 14 October 2026 • 14:30–15:30");
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Move booking" }));
    expect(await within(dialog).findByText("That time is no longer free. Please choose another time.")).toBeTruthy();
    expect(gets.filter((path) => path.endsWith("/move-times")).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "14:30–15:30" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Move booking" }));
    await waitFor(() => expect(posts.at(-1)).toEqual({ path: `/admin/bookings/${REF_A}/move`, body: { version: 3, date: "2026-10-14", start: "14:30" } }));
    expect(await screen.findByText(/is now .*14 Oct, 14:30–15:30\. The customer gets an email\./)).toBeTruthy();
  });

  it("a late-paid booking whose time was taken: the note says to move it, and the move confirms it", async () => {
    const late = booking(REF_A, "expired", { attention: "paid_after_expiry", expiredAt: "2026-10-11T06:46:00.000Z", confirmedAt: null });
    const { api } = stubApi([late]);
    renderPage(api);
    const panel = await openBooking(REF_A);
    expect(within(panel).getByText(/Move the booking to a free time \(this confirms it\), or refund the payment\./)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Move and confirm" }));
    const dialog = await screen.findByRole("dialog", { name: `Move and confirm booking ${REF_A}?` });
    expect(within(dialog).getByText(/the booking is confirmed at that time/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Move and confirm" })).toBeTruthy();
  });

  it("View only: no actions; the payment section is the shared one, with Refund only for the Refund permission", async () => {
    const view = stubApi([booking(REF_A, "confirmed")]);
    renderPage(view.api, viewOnly);
    let panel = await openBooking(REF_A);
    expect(within(panel).queryByRole("button", { name: "Start grooming" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(await within(panel).findByText(`${REF_A}-P1`)).toBeTruthy();
    expect(view.gets).toContain(`/admin/bookings/${REF_A}/payments`);
    expect(within(panel).queryByRole("button", { name: `Refund payment ${REF_A}-P1` })).toBeNull();
    cleanup();

    const money = stubApi([booking(REF_A, "confirmed")]);
    renderPage(money.api, refunder);
    panel = await openBooking(REF_A);
    expect(await within(panel).findByRole("button", { name: `Refund payment ${REF_A}-P1` })).toBeTruthy();
  });

  it("the day view the Grooming calendar links to: that date's appointments, without cancelled ones", async () => {
    linked = new URLSearchParams({ date: "2026-10-13", location: "shop", time: "10:00" });
    const { api, gets } = stubApi([booking(REF_A, "confirmed"), booking(REF_B, "cancelled")]);
    renderPage(api);
    const list = await screen.findByRole("list", { name: "Appointments on this day" });
    expect(within(list).getByText(REF_A)).toBeTruthy();
    expect(within(list).queryByText(REF_B)).toBeNull();
    expect(gets.some((path) => path.includes("from=2026-10-13") && path.includes("to=2026-10-13") && path.includes("location=shop"))).toBe(true);
    expect(screen.getByRole("button", { name: "Day", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(gets.some((path) => path.includes("from=2026-10-14"))).toBe(true));
  });

  it("the linked time is marked only for that day, place and time, wherever the Day view goes", async () => {
    linked = new URLSearchParams({ date: "2026-10-13", location: "shop", time: "10:00" });
    const { api, gets } = dayApi([
      at(REF_A, "2026-10-13", "10:00"),
      at(REF_B, "2026-10-13", "11:00"),
      at(REF_D, "2026-10-13", "10:00", "home"),
      at(REF_C, "2026-10-14", "10:00"),
    ]);
    renderPage(api);
    await screen.findByText(REF_A);
    const list = () => screen.getByRole("list", { name: "Appointments on this day" });
    expect(marked(list())).toEqual([REF_A]);
    expect(within(list()).getAllByRole("listitem")[0]?.className).toContain("is-selected");
    // The day asks only for the bookings it shows.
    expect(gets.some((path) => new URL(path, "http://test").searchParams.get("status") === "awaiting_payment,confirmed,in_progress,completed,no_show")).toBe(
      true,
    );

    // Shop and home together: the home visit at 10:00 is another place, so it is not the linked time.
    fireEvent.change(screen.getByRole("combobox", { name: "Shop or home" }), { target: { value: "" } });
    await screen.findByText(REF_D);
    expect(marked(list())).toEqual([REF_A]);

    // The next day has its own 10:00, which is not the linked one.
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await screen.findByText(REF_C);
    expect(marked(list())).toEqual([]);
  });

  it("while another day loads, the previous day's appointments are not shown under its date", async () => {
    linked = new URLSearchParams({ date: "2026-10-13", location: "shop" });
    const { api, release } = dayApi([at(REF_A, "2026-10-13", "10:00"), at(REF_C, "2026-10-14", "10:00")], "2026-10-14");
    renderPage(api);
    await screen.findByText(REF_A);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByText("Loading the day…")).toBeTruthy();
    expect(screen.queryByText(REF_A)).toBeNull();
    expect(screen.queryByText("No appointments on this day.")).toBeNull();
    release();
    expect(await screen.findByText(REF_C)).toBeTruthy();
    expect(screen.queryByText("Loading the day…")).toBeNull();
  });

  it("in the Day view the CSV is the day on screen; in the List view it is the list's filters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("\uFEFFReference\r\n", {
          status: 200,
          headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="bookings.csv"' },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:bookings");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    linked = new URLSearchParams({ date: "2026-10-13", location: "shop", time: "10:00" });
    renderPage(dayApi([at(REF_A, "2026-10-13", "10:00")]).api, { ...operations, export: true });
    await screen.findByText(REF_A);

    fireEvent.click(screen.getByRole("button", { name: "Download this day (CSV)" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const day = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://test");
    expect(day.pathname).toBe("/api/admin/bookings/export.csv");
    expect(Object.fromEntries(day.searchParams)).toEqual({
      status: "awaiting_payment,confirmed,in_progress,completed,no_show",
      location: "shop",
      dateField: "appointment",
      from: "2026-10-13",
      to: "2026-10-13",
      sort: "appointment",
    });

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toBe(
      `/api/admin/bookings/export.csv?${adminBookingSearch(emptyAdminBookingFilters(), { paged: false })}`,
    );
    click.mockRestore();
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
  });

  it("a ?search= link opens the list with that search (the header search's booking results)", async () => {
    linked = new URLSearchParams(`search=${REF_A}`);
    const { api, gets } = stubApi([booking(REF_A, "confirmed")]);
    renderPage(api);
    expect(await screen.findByRole("button", { name: `View booking ${REF_A}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "List", pressed: true })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" })).toHaveValue(REF_A);
    expect(gets.some((path) => path.startsWith("/admin/bookings?") && path.includes(`q=${REF_A}`))).toBe(true);
  });

  it("a new link while the page is open: a search shows the list and a fresh day; a calendar time shows its day; the open booking closes", async () => {
    // A past date that today can never be, so going back to a fresh visit's day is visible.
    linked = new URLSearchParams({ date: "2026-01-05", location: "shop", time: "10:00" });
    const { api, gets } = stubApi([booking(REF_A, "confirmed"), booking(REF_B, "confirmed")]);
    const view = renderPage(api);
    await screen.findByRole("list", { name: "Appointments on this day" });

    linked = new URLSearchParams(`search=${REF_B}`);
    view.rerender(page(api));
    await waitFor(() => expect(gets).toContain(`/admin/bookings?${adminBookingSearch(emptyAdminBookingFilters(REF_B))}`));
    expect(screen.getByRole("button", { name: "List", pressed: true })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" })).toHaveValue(REF_B);
    expect(screen.queryByRole("list", { name: "Appointments on this day" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "open" } });
    // The Day view went back to a fresh visit's: today, shop and home visits.
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue(qatarToday());
    expect(screen.getByRole("combobox", { name: "Shop or home" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    await openBooking(REF_A);
    linked = new URLSearchParams({ date: "2026-10-14", location: "home", time: "09:00" });
    view.rerender(page(api));
    await waitFor(() =>
      expect(gets.some((path) => path.includes("location=home") && path.includes("from=2026-10-14") && path.includes("to=2026-10-14"))).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Day", pressed: true })).toBeTruthy();
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue("2026-10-14");
    expect(screen.getByRole("combobox", { name: "Shop or home" })).toHaveValue("home");
    expect(screen.queryByRole("complementary", { name: `Booking ${REF_A}` })).toBeNull();
    // The calendar link cleared the search and the list's filters too.
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("");
  });

  it("a bare link while the page is open (the sidebar's Bookings, or Back) drops the search and leaves the Day view", async () => {
    linked = new URLSearchParams(`search=${REF_A}`);
    const { api, gets } = stubApi([booking(REF_A, "confirmed")]);
    const view = renderPage(api);
    await screen.findByRole("button", { name: `View booking ${REF_A}` });
    const before = gets.length;
    linked = new URLSearchParams();
    view.rerender(page(api));
    await waitFor(() => expect(gets.slice(before)).toContain(`/admin/bookings?${adminBookingSearch(emptyAdminBookingFilters())}`));
    expect(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" })).toHaveValue("");

    linked = new URLSearchParams({ date: "2026-10-14", location: "shop" });
    view.rerender(page(api));
    expect(await screen.findByRole("button", { name: "Day", pressed: true })).toBeTruthy();
    linked = new URLSearchParams();
    view.rerender(page(api));
    expect(await screen.findByRole("button", { name: "List", pressed: true })).toBeTruthy();
  });

  it("the same address again keeps what staff typed, even as a new but equal link", async () => {
    linked = new URLSearchParams(`search=${REF_A}`);
    const { api, gets } = stubApi([booking(REF_A, "confirmed")]);
    const view = renderPage(api);
    await screen.findByRole("button", { name: `View booking ${REF_A}` });
    fireEvent.change(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" }), { target: { value: "Luna" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=Luna"))).toBe(true));
    const before = gets.length;
    // Next's development router can hand the page a new, equal search-params object for the same address.
    linked = new URLSearchParams(linked.toString());
    view.rerender(page(api));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByRole("textbox", { name: "Search by booking, name, email or phone" })).toHaveValue("Luna");
    expect(gets.slice(before).some((path) => path.includes(`q=${REF_A}`))).toBe(false);
  });

  it("an impossible date in the address is ignored rather than breaking the page", async () => {
    linked = new URLSearchParams({ date: "2026-02-30", location: "shop" });
    renderPage(stubApi([booking(REF_A, "confirmed")]).api);
    expect(await screen.findByRole("button", { name: "List", pressed: true })).toBeTruthy();
  });

  it("the list and CSV query strings", () => {
    expect(adminBookingSearch({ ...emptyAdminBookingFilters("Luna"), status: "confirmed", from: "2026-10-13" }, { paged: false })).toBe(
      "q=Luna&status=confirmed&dateField=appointment&from=2026-10-13&sort=appointment",
    );
  });
});

// --- 11e: a booking's offers for staff, and refunds at the discounted price -------------------------

describe("a booking's offers for staff (11e)", () => {
  it("shows the promotions with their use and the package after offers; Refund fills the package's paid amount (9A)", async () => {
    const discounted = booking(REF_A, "confirmed", {
      location: "home",
      visitFee: 2000,
      discount: 3000,
      total: 11000,
      promotions: [
        { promotionId: "0190f0a4-7c3e-7000-8000-00000000bb01", name: { en: "Spa day", ar: "يوم العناية" }, code: "SPA30", discount: 3000, status: "held" },
      ],
    });
    const { api } = stubApi([discounted]);
    renderPage(api, refunder);
    const detail = await openBooking(REF_A);
    expect(within(detail).getByText(/^Spa day ·/)).toBeTruthy();
    expect(within(detail).getByText("SPA30")).toBeTruthy();
    // The use counts while the booking awaits payment.
    expect(within(detail).getByText("Awaiting payment", { selector: ".orders-promotion-use" })).toBeTruthy();
    expect(within(detail).getByText(/^−\sQAR\s?30\.00$/)).toBeTruthy();
    expect(within(detail).getByText("Package after offers")).toBeTruthy();
    expect(within(detail).getByText(/^QAR\s?90\.00$/)).toBeTruthy();

    fireEvent.click(await within(detail).findByRole("button", { name: `Refund payment ${REF_A}-P1` }));
    const dialog = await screen.findByRole("dialog", { name: `Refund payment ${REF_A}-P1?` });
    const amount = within(dialog).getByRole("textbox", { name: /Amount in QAR/ }) as HTMLInputElement;
    fireEvent.click(within(dialog).getByRole("button", { name: /^Basic · QAR\s?90\.00$/ }));
    expect(amount.value).toBe("90.00");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Home visit fee · QAR\s?20\.00$/ }));
    expect(amount.value).toBe("20.00");
  });
});
