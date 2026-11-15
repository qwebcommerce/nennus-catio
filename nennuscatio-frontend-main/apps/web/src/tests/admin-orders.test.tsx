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
import {
  emptyOrderFilters,
  filteredOrders,
  orderCsv,
  orderKind,
  orderMoney,
} from "@/features/admin/orders/order-list";
import { AdminOrdersPage } from "@/features/admin/orders/pages/AdminOrdersPage";
import { createMockRepository } from "@/mocks/adapters/business-repository";
import { seedDemo } from "@/mocks/data/business";

let state = seedDemo();
let role = "core";
const status = vi.fn();
const checkout = vi.fn<(...args: unknown[]) => string>(() => "FO-DEMO");
vi.mock("@/mocks/MockDataProvider", () => ({
  useBusiness: () => state,
  repo: {
    status: (...args: unknown[]) => status(...args),
    checkout: (...args: unknown[]) => checkout(...args),
  },
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
  HTMLElement.prototype.scrollIntoView = vi.fn();
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
      <AdminOrdersPage />
    </NextIntlClientProvider>,
  );
}
describe("Orders record queries", () => {
  it("uses compact whole QAR without losing fractional amounts", () => {
    expect(orderMoney(13500, "en")).toContain("135");
    expect(orderMoney(13500, "en")).not.toContain(".00");
    expect(orderMoney(13525, "en")).toContain("135.25");
    expect(() => orderMoney(1.5, "en")).toThrow();
  });
  it("searches guest email, SKU and Arabic item names without altering source records", () => {
    const o = state.orders[0];
    const guest = state.guests.find((g) => g.id === o.customerId)!;
    for (const search of [guest.email, o.items[0].sku, o.items[0].name.ar]) {
      expect(
        filteredOrders(
          state,
          { ...emptyOrderFilters(), search },
          "2026-09-30",
        ).map((r) => r.id),
      ).toContain(o.id);
    }
    expect(state.orders).toHaveLength(12);
  });
  it("combines payment, fulfilment, channel, status and amount filters", () => {
    const o = state.orders[0];
    const f = {
      ...emptyOrderFilters(),
      payment: o.payment,
      fulfilment: o.fulfilment,
      channel: o.channel!,
      status: o.status,
      minimum: String(o.total / 100),
      maximum: String(o.total / 100),
    };
    expect(filteredOrders(state, f, "2026-09-30").map((r) => r.id)).toContain(
      o.id,
    );
    expect(
      filteredOrders(state, { ...f, channel: "admin" }, "2026-09-30"),
    ).toHaveLength(0);
  });
  it("uses Qatar dates at UTC midnight boundaries and inclusive date ranges", () => {
    state.orders = [{ ...state.orders[0], date: "2026-09-30T21:30:00Z" }];
    expect(
      filteredOrders(
        state,
        { ...emptyOrderFilters(), period: "today" },
        "2026-10-01",
      ),
    ).toHaveLength(1);
    expect(
      filteredOrders(
        state,
        { ...emptyOrderFilters(), period: "today" },
        "2026-09-30",
      ),
    ).toHaveLength(0);
    expect(
      filteredOrders(
        state,
        { ...emptyOrderFilters(), from: "2026-10-01", to: "2026-10-01" },
        "2026-10-02",
      ),
    ).toHaveLength(1);
  });
  it("recognises shared house metadata without fabricating house orders", () => {
    expect(
      filteredOrders(
        state,
        { ...emptyOrderFilters(), kind: "houses" },
        "2026-09-30",
      ),
    ).toHaveLength(0);
    const house = state.products.find((p) => p.house)!;
    const record = {
      ...state.orders[0],
      items: [{ ...state.orders[0].items[0], productId: house.id }],
    };
    expect(orderKind(state, record)).toBe("houses");
    state.orders = [record];
    expect(
      filteredOrders(
        state,
        { ...emptyOrderFilters(), kind: "houses" },
        "2026-09-30",
      ),
    ).toHaveLength(1);
  });
  it("sorts numerically and keeps a deterministic tie-breaker", () => {
    state.orders = [
      { ...state.orders[0], id: "b", total: 200 },
      { ...state.orders[0], id: "a", total: 200 },
      { ...state.orders[0], id: "c", total: 10 },
    ];
    expect(
      filteredOrders(
        state,
        emptyOrderFilters(),
        "2026-09-30",
        "total",
        false,
      ).map((o) => o.id),
    ).toEqual(["c", "a", "b"]);
    expect(
      filteredOrders(
        state,
        emptyOrderFilters(),
        "2026-09-30",
        "total",
        true,
      ).map((o) => o.id),
    ).toEqual(["a", "b", "c"]);
  });
  it("exports exact amounts, escapes spreadsheet formulas and excludes customer contact data", () => {
    const o = {
      ...state.orders[0],
      items: [
        {
          ...state.orders[0].items[0],
          sku: "=1+1",
          name: { en: 'Food, "special"', ar: "طعام" },
        },
      ],
    };
    const csv = orderCsv(o);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"Food, ""special"""');
    expect(csv).toContain((o.total / 100).toFixed(2));
    expect(csv).toContain("Not a tax invoice or payment receipt");
    expect(csv).not.toContain(
      state.guests.find((g) => g.id === o.customerId)!.email,
    );
  });
  it("records admin vs website origin through the existing checkout adapter", () => {
    state.orders = [];
    const r = createMockRepository(state);
    const input = {
      key: "admin-one",
      guest: state.guests[0],
      lines: [{ productId: "cat-food", variantId: "cf-15", quantity: 1 }],
      fulfilment: "pickup" as const,
      address: "",
      outcome: "success" as const,
      channel: "admin" as const,
    };
    r.checkout(input);
    expect(r.getSnapshot().orders[0].channel).toBe("admin");
    r.checkout({ ...input, key: "web-one", channel: undefined });
    expect(r.getSnapshot().orders[0].channel).toBe("website");
  });
});
describe("Orders preview controls", () => {
  it("paginates, changes page size and confines selection to the displayed page", () => {
    page();
    expect(screen.getByText("Showing 1–10 of 12 orders")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Select orders on this page"));
    expect(
      screen.getByText("10 selected · no bulk changes applied"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 11–12 of 12 orders")).toBeTruthy();
    expect(
      screen.queryByText("10 selected · no bulk changes applied"),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Orders per page"), {
      target: { value: "5" },
    });
    expect(screen.getByText("Showing 1–5 of 12 orders")).toBeTruthy();
  });
  it("filters pending orders, supports SKU search and resets honest house empty states", () => {
    page();
    fireEvent.change(screen.getByLabelText("Payment", { selector: "select" }), {
      target: { value: "pending" },
    });
    expect(screen.getByText("Showing 1–1 of 1 orders")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.change(
      screen.getByLabelText("Search orders, customer, SKU, product or house"),
      { target: { value: state.orders[0].items[0].sku } },
    );
    expect(
      screen.getAllByRole("button", { name: /^View order / }).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Houses (0)" }));
    expect(
      screen.getByText(
        "No house orders. Pet House checkout is not enabled yet.",
      ),
    ).toBeTruthy();
  });
  it("opens and closes a persistent details panel without removing the table", () => {
    page();
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View order FO-1009" }));
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(
      screen.getByText(
        "FleetWiz is not connected. No live fleet events are available.",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Close order details" }),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View order FO-1009" }));
    expect(screen.getByRole("complementary")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("validates extra filter ranges before applying them", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "More Filters" }));
    fireEvent.change(screen.getByLabelText("Minimum total (QAR)"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByLabelText("Maximum total (QAR)"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.getByText("The start must not exceed the end.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Maximum total (QAR)"), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("creates only synthetic admin product orders and keeps house checkout gated", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "New Order" }));
    const dialog = screen.getByRole("dialog");
    const sku = within(dialog).getByLabelText("Product / SKU");
    const houseIds = state.products
      .filter((p) => p.house)
      .flatMap((p) => p.variants.map((v) => v.id));
    expect(
      within(sku)
        .getAllByRole("option")
        .every((o) => !houseIds.includes((o as HTMLOptionElement).value)),
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Customer"), {
      target: { value: state.guests[0].id },
    });
    fireEvent.change(sku, { target: { value: "cf-15" } });
    // More than the pack's stock stops the form (D230: the shared number field checks its range).
    const quantity = within(dialog).getByLabelText("Quantity") as HTMLInputElement;
    const stock = state.products[0].variants[0].stock;
    fireEvent.change(quantity, { target: { value: String(stock + 1) } });
    expect(quantity.validity.valid).toBe(false);
    fireEvent.change(quantity, { target: { value: String(stock) } });
    expect(quantity.validity.valid).toBe(true);
    fireEvent.change(quantity, { target: { value: "1" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create demo order" }),
    );
    expect(checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "admin",
        outcome: "pending",
        fulfilment: "pickup",
      }),
    );
  });
  it("localises Arabic and retains Finance access restrictions", () => {
    page("ar");
    expect(screen.getByRole("heading", { name: "الطلبات" })).toBeTruthy();
    cleanup();
    role = "finance";
    page();
    expect(screen.queryByRole("button", { name: "New Order" })).toBeNull();
    expect(screen.getByText("Restricted preview")).toBeTruthy();
  });
});
