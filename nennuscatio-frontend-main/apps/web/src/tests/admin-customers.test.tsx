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
import { AdminCustomersPage } from "@/features/admin/customers/pages/AdminCustomersPage";
import {
  contactNeedsReview,
  customerDefaults,
  customerAddresses,
  customerHistory,
  customerMetrics,
  customerPets,
  customerRows,
} from "@/features/admin/customers/customer-list";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { createMockRepository } from "@/mocks/adapters/business-repository";
import { seedDemo } from "@/mocks/data/business";
let state = seedDemo(),
  role = "core";
vi.mock("@/mocks/MockDataProvider", () => ({
  useBusiness: () => state,
  repo: {},
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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function page(locale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Qatar">
      <DashboardDateProvider>
        <AdminCustomersPage />
      </DashboardDateProvider>
    </NextIntlClientProvider>,
  );
}
describe("Customer records", () => {
  it("derives consistent metrics and never invents registered users", () => {
    expect(customerMetrics(state, "2026-09-30")).toEqual({
      total: 6,
      new: 6,
      repeat: 6,
      pets: 8,
    });
    expect(
      customerRows(state, { ...customerDefaults, type: "registered" }),
    ).toHaveLength(0);
    expect(customerMetrics(state, "2026-10-01").new).toBe(0);
  });
  it("combines pet/activity/search filters and preserves source order", () => {
    const ids = state.guests.map((g) => g.id);
    expect(
      customerRows(state, {
        ...customerDefaults,
        search: "customer1@example.invalid",
        activity: "bookings",
        pet: "small",
      }).map((g) => g.id),
    ).toEqual(["guest-1"]);
    expect(
      customerRows(state, { ...customerDefaults, search: "GB-2001" }).map(
        (g) => g.id,
      ),
    ).toEqual(["guest-1"]);
    expect(state.guests.map((g) => g.id)).toEqual(ids);
  });
  it("groups submitted pets and actual delivery/home addresses only", () => {
    expect(customerPets(state, "guest-1")).toHaveLength(2);
    expect(customerAddresses(state, "guest-1")).toHaveLength(2);
    expect(customerAddresses(state, "guest-2")).toHaveLength(0);
    expect(customerHistory(state, "guest-1")).toHaveLength(4);
  });
  it("flags overlapping contacts without joining their history", () => {
    state.guests[1].email = state.guests[0].email.toUpperCase();
    expect(contactNeedsReview(state, state.guests[0])).toBe(true);
    expect(
      customerRows(state, { ...customerDefaults, review: true }),
    ).toHaveLength(2);
    expect(customerHistory(state, "guest-1")).toHaveLength(4);
  });
  it("adds/edits guest contacts without changing linked customer IDs", () => {
    const repo = createMockRepository(state);
    const id = repo.saveCustomer({
      name: "Demo New",
      email: "new@example.invalid",
      phone: "+974 0000 0099",
    });
    expect(repo.getSnapshot().guests.find((g) => g.id === id)?.createdAt).toBe(
      "2026-09-30T08:00:00.000Z",
    );
    repo.saveCustomer(
      {
        name: "Demo Updated",
        email: "updated@example.invalid",
        phone: "+974 0000 0098",
      },
      "guest-1",
    );
    expect(
      repo.getSnapshot().orders.filter((o) => o.customerId === "guest-1"),
    ).toHaveLength(2);
  });
  it("rejects invalid/overlapping contact writes atomically", () => {
    const repo = createMockRepository(state),
      snapshot = repo.getSnapshot();
    expect(() =>
      repo.saveCustomer({ name: "Bad", email: "bad", phone: "123" }),
    ).toThrow();
    expect(() =>
      repo.saveCustomer({
        name: "Duplicate",
        email: state.guests[0].email,
        phone: "+974 0000 0099",
      }),
    ).toThrow(/matches another/);
    expect(() =>
      repo.saveCustomer(
        {
          name: "Duplicate",
          email: "different@example.invalid",
          phone: state.guests[0].phone,
        },
        "guest-2",
      ),
    ).toThrow(/matches another/);
    expect(repo.getSnapshot()).toEqual(snapshot);
  });
  it("records only actual notes, bounds length and supports clearing", () => {
    const repo = createMockRepository(state);
    repo.saveCustomerNote("guest-1", " Quiet drying. ");
    expect(repo.getSnapshot().guests[0].note?.text).toBe("Quiet drying.");
    expect(() => repo.saveCustomerNote("guest-1", "x".repeat(2001))).toThrow();
    repo.saveCustomerNote("guest-1", "");
    expect(repo.getSnapshot().guests[0].note).toBeUndefined();
  });
});
describe("Customer reference UI", () => {
  it("opens/closes inline details and switches history tabs", () => {
    page();
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open customer Demo Customer 1" }),
    );
    const panel = screen.getByRole("complementary");
    expect(
      within(panel).getByRole("heading", { name: "Demo Customer 1" }),
    ).toBeTruthy();
    fireEvent.click(within(panel).getByRole("tab", { name: "Orders" }));
    expect(
      within(panel).getByRole("heading", { name: "Order History" }),
    ).toBeTruthy();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("supports registered empty state, search and pagination", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Registered (0)" }));
    expect(
      screen.getByText(
        "No registered accounts. Customer sign-in is an optional feature; current contacts are guests.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guests (6)" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Customers per page" }),
      { target: { value: "5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 6–6 of 6 customers")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search customers" }),
      { target: { value: "nonexistent" } },
    );
    expect(screen.getByText("No matching customers.")).toBeTruthy();
  });
  it("supports Arabic labels and excludes Finance operations", () => {
    page("ar");
    expect(screen.getByRole("heading", { name: "العملاء" })).toBeTruthy();
    cleanup();
    role = "finance";
    page();
    expect(screen.getByText("Restricted preview")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open customer Demo Customer 1" }),
    ).toBeNull();
  });
});
