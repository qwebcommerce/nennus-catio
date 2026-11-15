import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBookingsPage } from "@/features/admin/bookings/pages/AdminBookingsPage";
import {
  BookingsHeaderControls,
  BookingsWorkspaceProvider,
} from "@/features/admin/bookings/BookingsWorkspace";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import {
  bookingMetrics,
  bookingRows,
  type BookingFilters,
} from "@/features/admin/bookings/booking-list";
import {
  createMockRepository,
  remaining,
} from "@/mocks/adapters/business-repository";
import { seedDemo } from "@/mocks/data/business";

let state = seedDemo(),
  role = "core";
const status = vi.fn();
vi.mock("@/mocks/MockDataProvider", () => ({
  useBusiness: () => state,
  repo: { status: (...args: unknown[]) => status(...args) },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/layouts/global/GlobalProviders", () => ({
  useDemoIdentity: () => ({ role }),
}));
vi.mock("@/shared/ui/FeatureFoundation", () => ({
  FeatureFoundation: () => <p>Restricted preview</p>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T08:00:00Z"));
  state = seedDemo();
  role = "core";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function page(locale: "en" | "ar" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Qatar">
      <DashboardDateProvider>
        <BookingsWorkspaceProvider>
          <BookingsHeaderControls />
          <AdminBookingsPage />
        </BookingsWorkspaceProvider>
      </DashboardDateProvider>
    </NextIntlClientProvider>,
  );
}
const filters: BookingFilters = {
  search: "",
  location: "",
  status: "",
  packageId: "",
  date: "",
  payment: "",
  sort: "date",
  descending: false,
};
describe("Booking queries", () => {
  it("combines location, package, status and payment using real records", () => {
    const b = state.bookings[0];
    expect(
      bookingRows(
        state,
        {
          ...filters,
          location: b.location,
          packageId: b.packageId,
          status: b.status,
          payment: b.payment,
        },
        "2026-09-30",
      ).map((b) => b.id),
    ).toEqual([b.id]);
  });
  it("searches pet, customer email and Arabic package names without changing source order", () => {
    const b = state.bookings[0],
      ids = state.bookings.map((b) => b.id);
    for (const search of [
      b.petName,
      state.guests.find((g) => g.id === b.customerId)!.email,
      b.packageName.ar,
    ])
      expect(
        bookingRows(state, { ...filters, search }, "2026-09-30").map(
          (b) => b.id,
        ),
      ).toContain(b.id);
    expect(state.bookings.map((b) => b.id)).toEqual(ids);
  });
  it("uses scheduled Qatar slot days rather than creation dates", () => {
    expect(bookingMetrics(state, "2026-09-30").today).toBe(0);
    expect(bookingMetrics(state, "2026-10-01")).toEqual({
      today: 5,
      remaining: 5,
      upcoming: 7,
      attention: 1,
      completed: 0,
    });
    expect(
      bookingRows(state, { ...filters, date: "today" }, "2026-10-01"),
    ).toHaveLength(5);
    expect(
      bookingRows(state, { ...filters, date: "week" }, "2026-10-01"),
    ).toHaveLength(8);
  });
});
describe("Atomic mock booking actions", () => {
  it("reschedules an open booking, retains creation time, and releases old capacity", () => {
    const repo = createMockRepository(state),
      b = state.bookings[0],
      old = state.slots.find((s) => s.id === b.slotId)!,
      next = state.slots.find(
        (s) =>
          s.kind === "grooming" && s.id !== old.id && remaining(state, s) > 0,
      )!;
    const capacity = remaining(state, old),
      created = b.date;
    repo.rescheduleBooking(b.id, next.id);
    expect(repo.getSnapshot().bookings[0]).toMatchObject({
      slotId: next.id,
      date: created,
    });
    expect(remaining(repo.getSnapshot(), old)).toBe(capacity + 1);
    expect(repo.getSnapshot().bookings[0].activity).toHaveLength(1);
  });
  it("rejects full, held, inactive, past and delivery slots without changing the booking", () => {
    for (const kind of ["full", "held", "inactive", "past", "delivery"]) {
      const d = structuredClone(state),
        target = d.slots.find(
          (s) =>
            s.kind === "grooming" && !d.bookings.some((b) => b.slotId === s.id),
        )!;
      if (kind === "full") target.capacity = 0;
      if (kind === "held") {
        target.capacity = 1;
        d.holds.push({
          id: "other",
          slotId: target.id,
          expires: Date.now() + 60000,
        });
      }
      if (kind === "inactive") target.active = false;
      if (kind === "past") target.date = "2026-09-29";
      if (kind === "delivery") target.kind = "delivery";
      const repo = createMockRepository(d),
        before = repo.getSnapshot();
      expect(() =>
        repo.rescheduleBooking(d.bookings[0].id, target.id),
      ).toThrow();
      expect(repo.getSnapshot()).toBe(before);
    }
  });
  it("closed bookings cannot move, notes remain local and activity is not fabricated", () => {
    const repo = createMockRepository(state),
      b = state.bookings[0];
    expect(b.activity).toBeUndefined();
    repo.saveBookingNotes(b.id, {
      petNotes: "  Gentle care  ",
      internalNotes: "  Quiet drying  ",
    });
    expect(repo.getSnapshot().bookings[0]).toMatchObject({
      petNotes: "Gentle care",
      internalNotes: "Quiet drying",
    });
    expect(repo.getSnapshot().bookings[0].activity).toHaveLength(1);
    repo.saveBookingNotes(b.id, {
      petNotes: "Gentle care",
      internalNotes: "Quiet drying",
    });
    expect(repo.getSnapshot().bookings[0].activity).toHaveLength(1);
    expect(() =>
      repo.saveBookingNotes(b.id, {
        petNotes: "x".repeat(2001),
        internalNotes: "",
      }),
    ).toThrow();
    repo.status("bookings", b.id, "cancelled");
    expect(() =>
      repo.rescheduleBooking(
        b.id,
        state.slots.find((s) => s.kind === "grooming" && s.id !== b.slotId)!.id,
      ),
    ).toThrow();
  });
});
describe("Reference Bookings workspace", () => {
  it("starts closed, opens the inline panel, closes with x or Escape", () => {
    page();
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking GB-2001" }),
    );
    expect(screen.getByRole("complementary")).toHaveTextContent("GB-2001");
    fireEvent.click(
      screen.getByRole("button", { name: "Close booking details" }),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking GB-2002" }),
    );
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("filters locations and search, and shows an honest empty state", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Home Service (3)" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      4,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search booking, customer, pet" }),
      { target: { value: "not-a-record" } },
    );
    expect(
      screen.getByText("No matching bookings. Try resetting the filters."),
    ).toBeVisible();
  });
  it("paginates real bookings and switches to the working weekly calendar", () => {
    page();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Bookings per page" }),
      { target: { value: "5" } },
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      6,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 6–8 of 8 bookings")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Calendar" }),
    );
    expect(
      screen.getByRole("region", { name: "Booking calendar" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking GB-2001" }),
    );
    expect(screen.getByRole("complementary")).toBeVisible();
  });
  it("blocks pending payment progress and requires cancellation confirmation", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking GB-2007" }),
    );
    expect(
      screen.getByRole("button", { name: "Start grooming" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel demo booking" }),
    );
    expect(status).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(status).toHaveBeenCalledWith("bookings", "GB-2007", "cancelled");
  });
  it("renders Arabic actions and limits home booking to required addresses", () => {
    page("ar");
    fireEvent.click(screen.getByRole("button", { name: "حجز جديد" }));
    fireEvent.change(screen.getByRole("combobox", { name: "الموقع" }), {
      target: { value: "home" },
    });
    expect(
      screen.getByRole("textbox", { name: "عنوان المنزل" }),
    ).toBeRequired();
    expect(
      screen.getByRole("textbox", { name: "عنوان المنزل" }),
    ).toHaveAttribute("minlength", "8");
  });
  it("keeps Finance outside the operational bookings page", () => {
    role = "finance";
    page();
    expect(screen.getByText("Restricted preview")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
