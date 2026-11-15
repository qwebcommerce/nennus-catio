// The admin shell in API mode (D141): sample-data banners, and a header search and bell that read
// real orders instead of the prototype store.
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type AdminOrderListResponse, normalisePermissions, ownerPermissions, type StaffProfile } from "@nennus-catio/contracts";
import en from "@/messages/en/common.json";
import { AdminLayout } from "@/layouts/admin/AdminLayout";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { logoFile } from "./helpers/logo";
import { SettingsProviders } from "./helpers/settings";

let pathname = "/admin/bookings";
vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
afterEach(cleanup);

const view = { view: true, edit: false, delete: false, export: false, refund: false };

function staff(isOwner = true, permissions = ownerPermissions()): StaffProfile {
  return { id: "s1", email: "owner@example.invalid", displayName: "Sara", isOwner, mustChangePassword: false, roleName: null, permissions };
}

const list: AdminOrderListResponse = {
  orders: [
    {
      reference: "NC-261009-4F7KQ2",
      status: "awaiting_payment",
      fulfilment: "delivery",
      placedAt: "2026-10-09T10:00:00.000Z",
      contactName: "Noor",
      contactPhone: "+974 3333 7777",
      area: { en: "The Pearl", ar: "اللؤلؤة" },
      window: { date: "2026-10-10", start: "09:00", end: "12:00" },
      itemCount: 2,
      hasHouse: false,
      total: 12_500,
      refundNeeded: false,
      attention: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  counts: {
    awaiting_payment: 2,
    confirmed: 0,
    preparing: 0,
    out_for_delivery: 0,
    ready_for_pickup: 0,
    delivered: 0,
    collected: 0,
    cancelled: 0,
    expired: 0,
  },
};

/** One real booking for the header search (9f). */
const bookingList = {
  bookings: [
    {
      reference: "GB-261012-4F7KQ2",
      status: "confirmed",
      location: "shop",
      placedAt: "2026-10-11T08:00:00.000Z",
      contactName: "Noor Booking",
      contactPhone: "+974 5555 1234",
      package: { group: { en: "Adult cat", ar: "قطة" }, name: { en: "Basic", ar: "أساسي" } },
      pet: { group: { en: "Adult cat", ar: "قطة" }, breed: "Persian" },
      appointment: { date: "2026-10-13", start: "10:00", end: "11:00", startsAt: "2026-10-13T07:00:00.000Z" },
      area: null,
      total: 12000,
      refundNeeded: false,
      attention: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  counts: { awaiting_payment: 0, confirmed: 1, in_progress: 0, completed: 0, no_show: 0, cancelled: 0, expired: 0 },
};

/** One customer record for the header search (10d). */
const customerList = {
  customers: [
    {
      id: "0197a000-0000-7000-8000-000000000001",
      email: "noor@example.invalid",
      name: "Noor Customer",
      phone: "+974 3333 7777",
      account: "none",
      firstSeenAt: "2026-10-09T10:00:00.000Z",
      lastActivityAt: "2026-10-11T08:00:00.000Z",
      orders: 1,
      bookings: 1,
      relocations: 0,
      totalPaid: 0,
      tags: [],
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  counts: { all: 1, accounts: 0, guests: 1, newThisMonth: 1 },
};

/** One relocation request for the header search, and the bell's counts (15d). */
function relocationList(path: string) {
  const toCheck = path.includes("needsAction=1");
  return {
    requests: [
      {
        reference: "RL-261020-4F7KQ2",
        status: "submitted",
        placedAt: "2026-10-20T08:00:00.000Z",
        updatedAt: "2026-10-20T08:00:00.000Z",
        contactName: "Noor Mover",
        contactPhone: "+974 5555 1234",
        pets: ["Milo"],
        destination: { en: "Philippines", ar: "الفلبين" },
        plannedDate: null,
        quote: null,
        documentsToReview: 0,
        documentsMissing: 0,
        paidOutside: false,
        refundNeeded: false,
        attention: null,
      },
    ],
    total: toCheck ? 1 : 4,
    page: 1,
    pageSize: 10,
    counts: { submitted: 2, documents_requested: 0, documents_received: 1, under_review: 1, quote_requested: 0, paid: 0, in_progress: 0, completed: 0, cancelled: 0 },
  };
}

/** The bell's POS part (#16 part 2c): an alert, a waiting price, and a pack the store sold short. */
const posAttention = {
  alerts: [{ kind: "items_silent", openedAt: "2026-10-26T11:00:00.000Z", lastItemsAt: "2026-10-26T09:50:00.000Z", keys: [] }],
  pricesWaiting: 2,
};
const posShort = {
  items: [{ code: "RC-KITTEN-2KG", sku: "RC-KITTEN-2KG", productName: { en: "Kitten food", ar: "طعام" }, label: { en: "2 kg pack", ar: "عبوة" }, short: 1 }],
};

function api(me: StaffProfile, searches: string[] = [], pos = false): ApiClient {
  return {
    get: async (path, schema) => {
      if (path === "/admin/auth/me") return schema.parse(me) as never;
      if (pos && path === "/admin/pos/attention") return schema.parse(posAttention) as never;
      if (pos && path === "/admin/pos/short") return schema.parse(posShort) as never;
      if (path.startsWith("/admin/orders?")) {
        searches.push(path);
        return schema.parse(list) as never;
      }
      if (path.startsWith("/admin/bookings?")) {
        searches.push(path);
        return schema.parse(bookingList) as never;
      }
      if (path.startsWith("/admin/customers?")) {
        searches.push(path);
        return schema.parse(customerList) as never;
      }
      if (path.startsWith("/admin/relocation?")) {
        searches.push(path);
        return schema.parse(relocationList(path)) as never;
      }
      throw new ApiError("NOT_FOUND", path, 404);
    },
    post: async () => {
      throw new ApiError("NOT_FOUND", "x", 404);
    },
    put: async () => {
      throw new ApiError("NOT_FOUND", "x", 404);
    },
    delete: async () => {
      throw new ApiError("NOT_FOUND", "x", 404);
    },
  };
}

function shell(client: ApiClient) {
  return render(
    <SettingsProviders api={client} messages={{ Admin: en.Admin }}>
      <AdminLayout>
        <p>page body</p>
      </AdminLayout>
    </SettingsProviders>,
  );
}

describe("admin shell in API mode", () => {
  it("shows a sample-data banner on pages that still run on the prototype store", async () => {
    pathname = "/admin/dispatch";
    shell(api(staff()));
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data\. This page shows demonstration figures until branch #17 \(FleetWiz dispatch\)/);
  });

  it("shows the cream logo at the top of the sidebar and the full logo at its foot, not the cat photo (D233)", async () => {
    pathname = "/admin/orders";
    shell(api(staff()));
    expect(await screen.findByText("page body")).toBeTruthy();
    const sidebar = document.querySelector(".admin-sidebar") as HTMLElement;
    expect([...sidebar.querySelectorAll("img")].map(logoFile)).toEqual([
      "/images/brand/nennus-catio-mark-light.png",
      "/images/brand/nennus-catio-wordmark-light.png",
      "/images/brand/nennus-catio-logo-light.png",
    ]);
    expect(sidebar.querySelector(".sidebar-logo")).toHaveTextContent("Happy Pets. Happier People.");
  });

  it("shows no banner on a page that reads the server", async () => {
    // Bookings read the server since 9f (the last grooming page with a banner, D141), Customers since 10d,
    // the Dashboard and Finance since #12 part 1.
    for (const page of ["/admin/orders", "/admin/bookings", "/admin/customers", "/admin", "/admin/finance"]) {
      pathname = page;
      shell(api(staff()));
      expect(await screen.findByText("page body")).toBeTruthy();
      expect(screen.queryByRole("note")).toBeNull();
      // The footer's notice names no page list that goes out of date, and no "until SkipCash is connected" (8c).
      expect(screen.getByText(/every other page uses the server\. Payments and refunds are test payments: no real money moves\./)).toBeTruthy();
      expect(screen.queryByText(/until SkipCash is connected/)).toBeNull();
      cleanup();
    }
  });

  it("counts orders awaiting payment and relocation requests waiting in the bell, and hides it without Orders or Relocation view", async () => {
    pathname = "/admin/orders";
    const searches: string[] = [];
    shell(api(staff(), searches));
    const bell = await screen.findByRole("button", { name: "Needs attention" });
    fireEvent.click(bell);
    expect(await screen.findByText(/^2 orders are awaiting payment/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Orders" })).toHaveAttribute("href", "/admin/orders");
    // Relocation (15d): new requests, documents to review, and refunds or payments to check.
    expect(await screen.findByRole("link", { name: "2 new relocation requests" })).toHaveAttribute("href", "/admin/relocation?status=submitted");
    expect(screen.getByRole("link", { name: "1 with documents to review" })).toHaveAttribute("href", "/admin/relocation?status=documents_received");
    expect(screen.getByRole("link", { name: "1 needing a refund or a payment check" })).toHaveAttribute("href", "/admin/relocation?needsAction=1");
    expect(searches.some((path) => path.includes("pageSize=10"))).toBe(true);
    cleanup();

    // A role with Relocation but not Orders: the bell shows relocation only.
    pathname = "/admin/relocation";
    shell(api(staff(false, normalisePermissions({ relocation: view }))));
    fireEvent.click(await screen.findByRole("button", { name: "Needs attention" }));
    expect(await screen.findByRole("link", { name: "2 new relocation requests" })).toBeTruthy();
    expect(screen.queryByText(/orders are awaiting payment/)).toBeNull();
    cleanup();

    pathname = "/admin/settings";
    shell(api(staff(false, normalisePermissions({ settings: view }))));
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Needs attention" })).toBeNull();
  });

  it("the POS in the bell (#16 part 2c): alerts and waiting prices for the owner and Catalogue View, short packs for Orders View", async () => {
    pathname = "/admin/orders";
    shell(api(staff(), [], true));
    fireEvent.click(await screen.findByRole("button", { name: "Needs attention" }));
    expect(await screen.findByText(/^Stock updates from the POS have stopped: the last came at 26 Oct 2026, 12:50\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute("href", "/admin/integrations");
    expect(screen.getByRole("link", { name: "2 POS prices waiting for a decision" })).toHaveAttribute("href", "/admin/products?section=pos");
    expect(screen.getByRole("link", { name: /^Kitten food · 2 kg pack: short by 1\./ })).toHaveAttribute("href", "/admin/orders?search=RC-KITTEN-2KG");
    cleanup();

    // Catalogue View: the alert and the prices, not the short packs, and no Integrations link (the owner's page).
    pathname = "/admin/products";
    shell(api(staff(false, normalisePermissions({ products: view })), [], true));
    fireEvent.click(await screen.findByRole("button", { name: "Needs attention" }));
    expect(await screen.findByText(/^Stock updates from the POS have stopped/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "2 POS prices waiting for a decision" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /short by/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open Integrations" })).toBeNull();
    cleanup();

    // Orders View only: the short packs, not the alert.
    pathname = "/admin/orders";
    shell(api(staff(false, normalisePermissions({ orders: view })), [], true));
    fireEvent.click(await screen.findByRole("button", { name: "Needs attention" }));
    expect(await screen.findByRole("link", { name: /^Kitten food · 2 kg pack: short by 1\./ })).toBeTruthy();
    expect(screen.queryByText(/stock updates have stopped/)).toBeNull();
    expect(screen.queryByRole("link", { name: /prices waiting/ })).toBeNull();
  });

  it("searches real orders, bookings and customers from the header and links to their pages", async () => {
    pathname = "/admin/orders";
    const searches: string[] = [];
    shell(api(staff(), searches));
    const input = await screen.findByLabelText("Search by reference, name, phone or email");
    fireEvent.change(input, { target: { value: "Noor" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    const result = await screen.findByRole("link", { name: /NC-261009-4F7KQ2 · Noor/ });
    expect(result).toHaveAttribute("href", "/admin/orders?search=NC-261009-4F7KQ2");
    expect(searches.some((path) => path.includes("q=Noor"))).toBe(true);
    // A booking result names the pet by its type and breed (D246).
    const booking = await screen.findByRole("link", { name: /GB-261012-4F7KQ2 · Noor Booking · Adult cat · Persian/ });
    expect(booking).toHaveAttribute("href", "/admin/bookings?search=GB-261012-4F7KQ2");
    expect(searches.some((path) => path.startsWith("/admin/bookings?") && path.includes("q=Noor"))).toBe(true);
    // Customers (10d): one result per record, opening it on the Customers page.
    const customer = await screen.findByRole("link", { name: /Noor Customer · noor@example\.invalid/ });
    expect(customer).toHaveAttribute("href", "/admin/customers?search=noor%40example.invalid");
    expect(searches.some((path) => path.startsWith("/admin/customers?") && path.includes("q=Noor"))).toBe(true);
    expect(screen.getByRole("link", { name: "Open all matching orders" })).toHaveAttribute("href", "/admin/orders?search=Noor");
    expect(screen.getByRole("link", { name: "Open all matching bookings" })).toHaveAttribute("href", "/admin/bookings?search=Noor");
    expect(screen.getByRole("link", { name: "Open all matching customers" })).toHaveAttribute("href", "/admin/customers?search=Noor");
    // Relocation requests (15d), by reference, name or pet.
    const relocation = await screen.findByRole("link", { name: /RL-261020-4F7KQ2 · Noor Mover · Milo/ });
    expect(relocation).toHaveAttribute("href", "/admin/relocation?search=RL-261020-4F7KQ2");
    expect(searches.some((path) => path.startsWith("/admin/relocation?") && path.includes("q=Noor"))).toBe(true);
    expect(screen.getByRole("link", { name: "Open all matching relocation requests" })).toHaveAttribute("href", "/admin/relocation?search=Noor");
    expect(screen.queryByText("Demo employee · preview role")).toBeNull();
  });

  it("a role with Customers but not Orders searches customers only, and is never left waiting on orders", async () => {
    pathname = "/admin/customers";
    const searches: string[] = [];
    shell(api(staff(false, normalisePermissions({ customers: view })), searches));
    const input = await screen.findByLabelText("Search by reference, name, phone or email");
    fireEvent.change(input, { target: { value: "Noor" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(await screen.findByRole("link", { name: /Noor Customer · noor@example\.invalid/ })).toBeTruthy();
    expect(screen.queryByText("Searching…")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open all matching orders" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open all matching bookings" })).toBeNull();
    expect(searches.some((path) => path.startsWith("/admin/orders?") && path.includes("q=Noor"))).toBe(false);
  });

  it("Promotions (11d): no sample-data banner and no demo date picker; Create only for roles that may create", async () => {
    pathname = "/admin/promotions";
    shell(api(staff()));
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByLabelText("Promotions date (Qatar)")).toBeNull();
    expect(screen.getByRole("button", { name: /Create Promotion/ })).toBeTruthy();
    cleanup();

    shell(api(staff(false, normalisePermissions({ promotions: view }))));
    expect(await screen.findByText("page body")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create Promotion/ })).toBeNull();
  });
});
