import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { seedDemo } from "@/mocks/data/business";
import {
  dashboardSnapshot,
  dashboardItemCount,
  isHouseOrder,
  qatarDay,
  qatarTime,
  shiftDay,
  stockAlerts,
} from "@/features/admin/dashboard/lib/dashboard";
import { AdminDashboardPage } from "@/features/admin/dashboard/pages/AdminDashboardPage";
import {
  DashboardDateControl,
  DashboardDateProvider,
} from "@/features/admin/dashboard/components/DashboardDate";

let state = seedDemo();
vi.mock("@/mocks/MockDataProvider", () => ({ useBusiness: () => state }));
vi.mock("@/layouts/global/GlobalProviders", () => ({
  useDemoIdentity: () => ({ role: "core" }),
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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function dashboard(locale: "en" | "ar" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Qatar">
      <DashboardDateProvider>
        <DashboardDateControl />
        <AdminDashboardPage />
      </DashboardDateProvider>
    </NextIntlClientProvider>,
  );
}
describe("dashboard record-derived summaries", () => {
  it("keeps seed booking timestamps stable across server/client initialisation hours", () => {
    const initial = seedDemo().bookings[0].date;
    vi.setSystemTime(new Date("2026-09-30T14:00:00Z"));
    expect(seedDemo().bookings[0].date).toBe(initial);
  });
  it("uses singular/plural item copy in English and Arabic", () => {
    expect(dashboardItemCount(1, "en")).toBe("1 item");
    expect(dashboardItemCount(3, "en")).toBe("3 items");
    expect(dashboardItemCount(1, "ar")).toBe("قطعة واحدة");
    expect(dashboardItemCount(2, "ar")).toBe("قطعتان");
    expect(dashboardItemCount(3, "ar")).toBe("٣ قطع");
  });
  it("uses Qatar dates/hours around midnight and shifts across month boundaries", () => {
    expect(qatarDay("2026-09-30T21:30:00Z")).toBe("2026-10-01");
    expect(qatarTime("2026-09-30T21:30:00Z")).toBe("00:30");
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("excludes cancelled/pending revenue and puts paid revenue in the actual Qatar-hour bucket", () => {
    state.bookings = [];
    const order = {
      ...state.orders[0],
      date: "2026-09-30T21:30:00Z",
      total: 12345,
      status: "processing" as const,
    };
    state.orders = [
      order,
      { ...order, id: "pending", payment: "pending" },
      { ...order, id: "cancelled", status: "cancelled" },
    ];
    const result = dashboardSnapshot(state, "2026-10-01");
    expect(result.revenue).toBe(12345);
    expect(result.orders).toHaveLength(2);
    expect(result.averageOrder).toBe(12345);
    expect(result.series[0].value).toBe(12345);
    expect(result.series.reduce((sum, bucket) => sum + bucket.value, 0)).toBe(
      result.revenue,
    );
    expect(dashboardSnapshot(state, "2026-09-30").revenue).toBe(0);
  });
  it("uses appointment dates for bookings and only paid, open delivery orders for deliveries", () => {
    const booking = {
      ...state.bookings[0],
      date: "2026-09-25T08:00:00Z",
      status: "confirmed" as const,
    };
    state.bookings = [
      booking,
      { ...booking, id: "cancelled", status: "cancelled" },
    ];
    const delivery = {
      ...state.orders[0],
      status: "processing" as const,
      payment: "paid" as const,
    };
    state.orders = [
      delivery,
      { ...delivery, id: "unpaid", payment: "pending" },
      { ...delivery, id: "done", status: "completed" },
    ];
    expect(dashboardSnapshot(state, state.slots[0].date).bookings).toHaveLength(
      1,
    );
    expect(dashboardSnapshot(state, "2026-09-25").bookings).toHaveLength(0);
    expect(
      dashboardSnapshot(state, state.slots[0].date).deliveries,
    ).toHaveLength(1);
  });
  it("changes period totals and retains zero buckets rather than inventing chart bars", () => {
    state.bookings = [];
    const result = dashboardSnapshot(state, "2026-09-30", 7);
    expect(result.orders.length).toBeGreaterThan(0);
    expect(result.revenue).toBeGreaterThan(0);
    expect(result.series).toHaveLength(7);
    expect(result.series.reduce((sum, b) => sum + b.value, 0)).toBe(
      result.revenue,
    );
    const empty = dashboardSnapshot(state, "2027-01-01", 30);
    expect(empty.revenue).toBe(0);
    expect(empty.series.every((b) => b.value === 0)).toBe(true);
  });
  it("counts SKU stock states, excludes archived products/houses and detects shared house order records", () => {
    const product = state.products[0];
    state.products = [
      {
        ...product,
        variants: [
          { ...product.variants[0], stock: 0 },
          { ...product.variants[0], id: "low", stock: 3 },
        ],
      },
      {
        ...product,
        id: "inactive",
        active: false,
        variants: [{ ...product.variants[0], stock: 0 }],
      },
      {
        ...state.products.find((p) => p.house)!,
        variants: [{ ...product.variants[0], stock: 0 }],
      },
    ];
    expect(stockAlerts(state).map((a) => a.variant.stock)).toEqual([0, 3]);
    expect(
      isHouseOrder(state, {
        ...state.orders[0],
        items: [
          { ...state.orders[0].items[0], productId: state.products[2].id },
        ],
      }),
    ).toBe(true);
  });
});
// These render the whole dashboard and query it by role: about 0.5 s alone, but over the default
// 5 s when the full suite runs in parallel (seen twice on 2026-10-08). The longer limit is for that load.
describe("dashboard controls", { timeout: 15_000 }, () => {
  it("filters operations, houses and Home Grooming with honest empty states", () => {
    dashboard();
    fireEvent.change(screen.getByLabelText("Dashboard date (Qatar)"), {
      target: { value: state.slots[0].date },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Operation type" })).getByRole(
        "button",
        { name: "Orders (0)" },
      ),
    );
    expect(screen.getByText("No operations for this selection.")).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Order category" })).getByRole(
        "button",
        { name: "Houses (0)" },
      ),
    );
    expect(
      screen.getByText("No house orders. House checkout is not enabled yet."),
    ).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Booking location" })).getByRole(
        "button",
        { name: "Home service (3)" },
      ),
    );
    expect(
      screen
        .getByRole("button", { name: "Home service (3)" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.className === "dash-booking-row"),
    ).toHaveLength(3);
  });
  it("changes dashboard date and performance period without copying reference totals", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(
      screen
        .getByRole("button", { name: "7 days" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Dashboard date (Qatar)"), {
      target: { value: "2027-01-01" },
    });
    expect(screen.getByText("Daily operations")).toBeTruthy();
    expect(screen.getByText("No operations for this selection.")).toBeTruthy();
    expect(screen.queryByText("QAR 12,680")).toBeNull();
    fireEvent.input(screen.getByLabelText("Dashboard date (Qatar)"), {
      target: { value: "2026-09-30" },
    });
    expect(screen.getByText("Today’s operations")).toBeTruthy();
  });
  it("localises primary content and uses the configured date in Arabic", () => {
    dashboard("ar");
    expect(screen.getByRole("heading", { name: "لوحة التحكم" })).toBeTruthy();
    expect(
      screen.getByLabelText("تاريخ لوحة التحكم (قطر)").getAttribute("value"),
    ).toBe("2026-09-30");
    expect(screen.getByRole("group", { name: "مكان العناية" })).toBeTruthy();
    expect(screen.getByText("بانتظار ربط FleetWiz")).toBeTruthy();
  });
});
