import { type Dashboard, normalisePermissions, type PermissionMap, type StaffProfile } from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { AdminDashboardPage } from "@/features/admin/dashboard/pages/AdminDashboardPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { formatMoney, formatSignedMoney } from "@/shared/lib/format";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

beforeEach(() => {
  // Only the clock's date is fixed (10 September 2026, Qatar); timers stay real for the queries.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-10T09:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const view = { view: true, edit: false, delete: false, export: false, refund: false };
const slow = { timeout: 5000 };
const qar = (minor: number) => formatMoney(minor, "en").replace(/\s+/g, " ");

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Manager", permissions };
}

const full: Dashboard = {
  date: "2026-09-10",
  days: 1,
  money: {
    day: { paid: 141_500, refunds: 7500, net: 134_000 },
    period: { paid: 141_500, refunds: 7500, net: 134_000, averageOrder: 65_250, discounts: 0 },
    series: Array.from({ length: 24 }, (_, hour) => ({ key: String(hour).padStart(2, "0"), net: hour === 15 ? 125_000 : hour === 9 ? -7500 : 0 })),
  },
  orders: {
    paidToday: 2,
    paidInPeriod: 2,
    deliveriesToday: 2,
    toPrepare: 2,
    deliveriesNotOut: 2,
    recent: [
      { reference: "NC-260910-FA0007", paidAt: "2026-09-10T12:00:00.000Z", customerName: "House Buyer", type: "houses", total: 125_000, status: "confirmed" },
      { reference: "NC-260910-FA0006", paidAt: "2026-09-10T07:00:00.000Z", customerName: "Cancelled Paid", type: "products", total: 5500, status: "cancelled" },
    ],
    operations: [
      { kind: "delivery", reference: "NC-260908-FA0001", time: "09:00", end: "12:00", customerName: "Mariam Finance", area: { en: "West Bay", ar: "الخليج الغربي" }, status: "confirmed" },
      { kind: "order", reference: "NC-260910-FA0006", time: "10:00", customerName: "Cancelled Paid", fulfilment: "delivery", total: 5500, status: "cancelled" },
    ],
    operationTotals: { orders: 2, deliveries: 2 },
  },
  bookings: {
    today: 1,
    paidInPeriod: 2,
    upcoming: [
      {
        reference: "GB-260910-FB0003",
        startsAt: "2026-09-15T08:00:00.000Z",
        customerName: "Upcoming Groom",
        pet: { group: { en: "Small pet", ar: "حيوان صغير" }, breed: "Persian" },
        packageName: { en: "Bath", ar: "استحمام" },
        location: "shop",
        status: "confirmed",
      },
    ],
    operations: [
      {
        kind: "booking",
        reference: "GB-260910-FB0009",
        time: "11:00",
        end: "12:00",
        customerName: "Today Groom",
        pet: { group: { en: "Adult cat", ar: "قطة بالغة" }, breed: "" },
        packageName: { en: "Full groom", ar: "عناية كاملة" },
        location: "home",
        status: "confirmed",
      },
    ],
    operationTotals: { bookings: 1 },
  },
  relocation: null,
  attention: { payments: 2, refunds: 3 },
  stock: {
    outOfStock: 1,
    low: 2,
    alerts: [
      { productId: "01a133ec-cc45-73cc-b0a8-fa2e355749ab", product: { en: "Cat food", ar: "طعام قطط" }, label: { en: "2 kg", ar: "٢ كغ" }, sku: "FOOD-2KG", stock: 0, threshold: 5 },
    ],
  },
};

function stubApi(dashboard: Dashboard) {
  const gets: string[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.startsWith("/admin/dashboard?")) {
        const days = Number(new URLSearchParams(path.split("?")[1]).get("days"));
        return schema.parse({ ...dashboard, days }) as never;
      }
      throw new ApiError("NOT_FOUND", "Not found.", 404);
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
  return { api, gets };
}

function renderDashboard(api: ApiClient, permissions: Partial<PermissionMap>, locale: "en" | "ar" = "en") {
  return render(
    <SettingsProviders api={api} locale={locale}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ dashboard: view, ...permissions }))}>
          <DashboardDateProvider>
            <AdminDashboardPage />
          </DashboardDateProvider>
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

const everything = { finance: view, orders: view, bookings: view, products: view, promotions: view };

describe("the real Dashboard", () => {
  it("shows the day for a role that may see every page", async () => {
    const { api, gets } = stubApi(full);
    renderDashboard(api, everything);
    expect(await screen.findByText("Today’s online sales", {}, slow)).toBeTruthy();
    expect(gets).toContain("/admin/dashboard?date=2026-09-10&days=1");
    // The day's net on its card, and the same for the one-day performance period.
    expect(screen.getAllByText(qar(134_000))).toHaveLength(2);
    expect(screen.getByText("Orders paid today")).toBeTruthy();
    expect(screen.getByText("Deliveries today")).toBeTruthy();
    // Today's operations: deliveries, paid orders and appointments, by time.
    const operations = within(screen.getByRole("table"));
    expect(operations.getAllByRole("row").slice(1).map((row) => row.textContent?.slice(0, 5))).toEqual(["09:00", "10:00", "11:00"]);
    // A booking names the pet by its type, and its breed when given (D246).
    expect(operations.getByText("Adult cat")).toBeTruthy();
    expect(screen.getByText("Small pet · Persian")).toBeTruthy();
    // Needs attention: each item opens its page, filtered.
    const links = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(links(/Paid orders waiting to be prepared/)).toBe("/admin/orders?status=confirmed");
    expect(links(/This day’s deliveries not out yet/)).toBe("/admin/orders?window=2026-09-10");
    expect(links(/Payments to check/)).toBe("/admin/orders?needsAction=1");
    expect(links(/Orders, bookings and relocation requests owing money back/)).toBe("/admin/finance");
    expect(links(/Packs low or out of stock/)).toBe("/admin/products");
    // Custom house requests stay on WhatsApp (D68): no count here.
    expect(screen.queryByText("Custom house requests")).toBeNull();
    expect(screen.getByText("FOOD-2KG")).toBeTruthy();
    expect(screen.getByText(qar(65_250))).toBeTruthy();
    expect(screen.queryByText(/Demo/)).toBeNull();
  });

  it("relocation (15d): quotes paid in the period and the requests waiting for the team, for Relocation view only", async () => {
    const withRelocation: Dashboard = {
      ...full,
      money: null,
      orders: null,
      bookings: null,
      stock: null,
      relocation: { waiting: { submitted: 2, documentsReceived: 1, underReview: 1, paid: 1 }, inProgress: 3, paidInPeriod: 4 },
      attention: { payments: 1, refunds: null },
    };
    renderDashboard(stubApi(withRelocation).api, { relocation: view });
    expect(await screen.findByText("Relocation quotes paid", {}, slow)).toBeTruthy();
    const waiting = screen.getByRole("link", { name: /Relocation requests waiting for the team/ });
    expect(waiting).toHaveAttribute("href", "/admin/relocation");
    expect(waiting).toHaveTextContent("5");
    // A payment to check leads to the Relocation page when the role sees no orders or bookings.
    expect(screen.getByRole("link", { name: /Payments to check/ })).toHaveAttribute("href", "/admin/relocation?needsAction=1");
  });

  it("asks for 7 and 30 days", async () => {
    const { api, gets } = stubApi(full);
    renderDashboard(api, everything);
    await screen.findByText("Today’s online sales", {}, slow);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(gets).toContain("/admin/dashboard?date=2026-09-10&days=7"));
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(gets).toContain("/admin/dashboard?date=2026-09-10&days=30"));
  });

  it("Recent paid orders: Houses lists the Pet House orders, and says plainly when there are none (#14)", async () => {
    renderDashboard(stubApi(full).api, everything);
    await screen.findByText("Recent paid orders", {}, slow);
    // Only the list itself: the day's operations name orders too.
    const recent = () => within(screen.getByText("Recent paid orders").closest("section") as HTMLElement);
    fireEvent.click(recent().getByRole("button", { name: "Houses (1)" }));
    expect(recent().getByText("NC-260910-FA0007")).toBeTruthy();
    expect(recent().queryByText("NC-260910-FA0006")).toBeNull();
    cleanup();

    const productsOnly: Dashboard = {
      ...full,
      orders: full.orders && { ...full.orders, recent: full.orders.recent.filter((order) => order.type === "products") },
    };
    renderDashboard(stubApi(productsOnly).api, everything);
    await screen.findByText("Recent paid orders", {}, slow);
    fireEvent.click(screen.getByRole("button", { name: "Houses (0)" }));
    expect(screen.getByText("No paid Pet House orders yet.")).toBeTruthy();
    expect(screen.queryByText(/opens later/)).toBeNull();
  });

  it("shows a day below zero instead of failing", async () => {
    const below = { ...full, money: full.money && { ...full.money, day: { paid: 3000, refunds: 7500, net: -4500 } } };
    renderDashboard(stubApi(below).api, everything);
    expect(await screen.findByText(formatSignedMoney(-4500, "en").replace(/\s+/g, " "), {}, slow)).toBeTruthy();
  });

  it("without Finance View: the server sends no money and the page shows none", async () => {
    const operationsOnly: Dashboard = { ...full, money: null, bookings: null, stock: null, attention: { payments: 2, refunds: null } };
    renderDashboard(stubApi(operationsOnly).api, { orders: view });
    expect(await screen.findByText("Orders paid today", {}, slow)).toBeTruthy();
    expect(screen.queryByText(/online sales/i)).toBeNull();
    expect(screen.queryByText("Average order")).toBeNull();
    expect(screen.queryByRole("link", { name: /owing money back/ })).toBeNull();
    expect(screen.queryByText("Bookings today")).toBeNull();
  });

  it("a role that may see no other page gets a short note", async () => {
    const nothing: Dashboard = { ...full, money: null, orders: null, bookings: null, stock: null, attention: { payments: null, refunds: null } };
    renderDashboard(stubApi(nothing).api, {});
    expect(await screen.findByText("Nothing here for your role.", {}, slow)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reads in Arabic", async () => {
    renderDashboard(stubApi(full).api, everything, "ar");
    expect(await screen.findByText("مبيعات الموقع اليوم", {}, slow)).toBeTruthy();
    expect(screen.getByText("يحتاج إلى متابعة")).toBeTruthy();
  });
});
