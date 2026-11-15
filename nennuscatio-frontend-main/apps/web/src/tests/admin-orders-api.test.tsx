import {
  type AdminOrder,
  type AdminOrderPayments,
  type AdminOrderSummary,
  canChangeDeliveryTime,
  cancellingAsksAboutStock,
  type Fulfilment,
  nextOrderStatus,
  normalisePermissions,
  type OrderStatus,
  type PermissionMap,
  previousOrderStatus,
  type PublicDeliveryWindow,
  type StaffProfile,
  staffCanCancel,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseQar } from "@/features/admin/orders/lib/payment-labels";
import { AdminOrdersPage } from "@/features/admin/orders/pages/AdminOrdersPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { adminOrderSearch, emptyAdminOrderFilters, linkedOrderFilters } from "@/shared/api/admin-orders";
import { fetchDownload } from "@/shared/api/downloads";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { formatMoney } from "@/shared/lib/format";
import { listLines, listReferences, rowText, timeRows } from "./helpers/day-table";
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
const manager = { view: true, edit: true, delete: false, export: true, refund: false };

const REF_A = "NC-261008-ABCDEF";
const REF_B = "NC-261008-GHJKMN";

function order(reference: string, status: OrderStatus, fulfilment: Fulfilment = "delivery", version = 3): AdminOrder {
  const delivery = fulfilment === "delivery";
  return {
    reference,
    status,
    fulfilment,
    placedAt: "2026-10-08T06:30:00.000Z",
    contactName: "Mariam Test",
    contactPhone: "+974 3333 7777",
    area: delivery ? { en: "West Bay", ar: "الخليج الغربي" } : null,
    window: delivery ? { date: "2026-10-09", start: "09:00", end: "12:00" } : null,
    itemCount: 2,
    hasHouse: false,
    total: 9500,
    refundNeeded: false,
    attention: null,
    locale: "en",
    contact: { name: "Mariam Test", email: "mariam@example.invalid", phone: "+974 3333 7777" },
    hasAccount: false,
    address: delivery
      ? { zone: "66", street: "850", building: "12", floor: "3", flat: "4", landmark: "Blue gate", note: "Call first", pin: null }
      : null,
    lines: [
      {
        product: "salmon-kibble",
        variant: "2kg",
        sku: "SK-2",
        name: { en: "Salmon kibble", ar: "طعام السلمون" },
        label: { en: "2 kg bag", ar: "كيس ٢ كغ" },
        weightGrams: 2000,
        unitPrice: 4000,
        quantity: 2,
        discount: 0,
        lineTotal: 8000,
        house: null,
      },
    ],
    subtotal: 8000,
    deliveryFee: 1500,
    houseDeliveryFee: 0,
    discount: 0,
    promotions: [],
    holdExpiresAt: status === "awaiting_payment" ? "2026-10-08T06:45:00.000Z" : null,
    confirmedAt: status === "awaiting_payment" ? null : "2026-10-08T06:31:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    stockReturned: null,
    expiredAt: null,
    history: [
      { from: null, to: "awaiting_payment", actor: "guest", staffName: null, reason: null, at: "2026-10-08T06:30:00.000Z" },
      { from: "awaiting_payment", to: "confirmed", actor: "system", staffName: null, reason: null, at: "2026-10-08T06:31:00.000Z" },
      ...(status === "preparing"
        ? [{ from: "confirmed" as const, to: "preparing" as const, actor: "staff" as const, staffName: "Sara", reason: null, at: "2026-10-08T07:00:00.000Z" }]
        : []),
    ],
    version,
    actions: {
      next: nextOrderStatus(status, fulfilment),
      back: previousOrderStatus(status),
      cancel: staffCanCancel(status),
      asksAboutStock: cancellingAsksAboutStock(status),
      changeTime: canChangeDeliveryTime(status, fulfilment),
    },
  };
}

function summary(full: AdminOrder): AdminOrderSummary {
  const { reference, status, fulfilment, placedAt, contactName, contactPhone, area, window, itemCount, hasHouse, total, refundNeeded, attention } = full;
  return { reference, status, fulfilment, placedAt, contactName, contactPhone, area, window, itemCount, hasHouse, total, refundNeeded, attention };
}

/** An order's payment panel (8b); no attempts unless a test gives them. */
function paymentPanel(reference: string, overrides: Partial<AdminOrderPayments> = {}): AdminOrderPayments {
  return {
    orderReference: reference,
    attention: null,
    refundNeeded: false,
    attempts: [],
    refunds: [],
    actions: { refundable: [], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
    ...overrides,
  };
}

const counts = (values: Partial<Record<OrderStatus, number>>) => ({
  awaiting_payment: 0,
  confirmed: 0,
  preparing: 0,
  out_for_delivery: 0,
  ready_for_pickup: 0,
  delivered: 0,
  collected: 0,
  cancelled: 0,
  expired: 0,
  ...values,
});

function stubApi(
  orders: AdminOrder[],
  post?: (path: string, body: unknown) => unknown,
  extra: { panels?: Record<string, AdminOrderPayments>; windows?: PublicDeliveryWindow[] } = {},
) {
  const gets: string[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.endsWith("/payments")) {
        const reference = decodeURIComponent(path.split("/").at(-2) ?? "");
        return schema.parse(extra.panels?.[reference] ?? paymentPanel(reference)) as never;
      }
      // The times an order can move to (#14): "Change delivery time" and "Confirm with a new delivery time".
      if (path.endsWith("/delivery-windows")) return schema.parse({ windows: extra.windows ?? [] }) as never;
      if (path === "/delivery/options") {
        return schema.parse({
          areas: [{ id: "8c1d6c8e-58c4-4c39-9a7a-2f0f1f7b0a11", name: { en: "West Bay", ar: "الخليج الغربي" }, fee: 1500, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } }],
          pickup: { enabled: true, instructions: { en: "", ar: "" } },
          leadTimeMinutes: 120,
          horizonDays: 14,
        }) as never;
      }
      if (path.startsWith("/admin/orders?")) {
        return schema.parse({
          orders: orders.map(summary),
          total: orders.length,
          page: 1,
          pageSize: 25,
          counts: counts({ confirmed: 4, preparing: 2, out_for_delivery: 1, ready_for_pickup: 1, awaiting_payment: 1 }),
        }) as never;
      }
      const reference = decodeURIComponent(path.split("/").pop() ?? "");
      const found = orders.find((item) => item.reference === reference);
      if (!found) throw new ApiError("NOT_FOUND", "Order not found.", 404);
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
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Operations", permissions };
}

function page(api: ApiClient, orders = operations, others: Partial<PermissionMap> = {}) {
  return (
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ orders, ...others }))}>
          <AdminOrdersPage />
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>
  );
}

function renderPage(api: ApiClient, orders = operations, others: Partial<PermissionMap> = {}) {
  return render(page(api, orders, others));
}

async function openOrder(reference: string) {
  fireEvent.click(await screen.findByRole("button", { name: `View order ${reference}` }));
  return screen.findByRole("complementary", { name: `Order ${reference}` });
}

describe("admin orders (API mode)", () => {
  it("lists real orders with the status counts; there is no New Order button (D101)", async () => {
    const { api } = stubApi([order(REF_A, "confirmed"), order(REF_B, "awaiting_payment", "pickup")]);
    renderPage(api);
    expect(await screen.findByText(REF_A)).toBeTruthy();
    expect(screen.getByText(REF_B)).toBeTruthy();
    expect(screen.getByText("Paid, to prepare").parentElement?.textContent).toBe("Paid, to prepare4");
    expect(screen.getByText("All orders").parentElement?.textContent).toBe("All orders9");
    expect(screen.getAllByText("West Bay").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /New Order/i })).toBeNull();
    // Download CSV needs the Export permission.
    expect(screen.queryByRole("button", { name: /Download CSV/ })).toBeNull();
  });

  it("searches after typing stops and sends the filters to the API", async () => {
    const { api, gets } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api);
    await screen.findByText(REF_A);
    fireEvent.change(screen.getByRole("textbox", { name: /Search by order/ }), { target: { value: "33337777" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=33337777"))).toBe(true));
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "open" } });
    await waitFor(() =>
      expect(gets.some((path) => path.includes("status=awaiting_payment%2Cconfirmed%2Cpreparing%2Cout_for_delivery%2Cready_for_pickup"))).toBe(true),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Area" }), { target: { value: "8c1d6c8e-58c4-4c39-9a7a-2f0f1f7b0a11" } });
    await waitFor(() => expect(gets.some((path) => path.includes("area=8c1d6c8e"))).toBe(true));
  });

  it("a link from another page fills the search (?search=)", async () => {
    linked = new URLSearchParams("search=mariam%40example.invalid");
    const { api, gets } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api);
    await screen.findByText(REF_A);
    expect(gets.find((path) => path.startsWith("/admin/orders?"))).toContain("q=mariam%40example.invalid");
  });

  it("a Dashboard link opens the list filtered: status, needs action and a delivery day (#12)", async () => {
    linked = new URLSearchParams("status=confirmed&needsAction=1&window=2026-10-10");
    const { api, gets } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api);
    await screen.findByText(REF_A);
    const first = gets.find((path) => path.startsWith("/admin/orders?")) ?? "";
    expect(first).toContain("status=confirmed");
    expect(first).toContain("needsAction=1");
    expect(first).toContain("dateField=window&from=2026-10-10&to=2026-10-10");
    expect((screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement).value).toBe("confirmed");
    expect((screen.getByRole("checkbox", { name: "Only refund needed or payment to check" }) as HTMLInputElement).checked).toBe(true);
  });

  it("a link's unknown filters are ignored", () => {
    const filters = linkedOrderFilters(new URLSearchParams("status=lost&needsAction=yes&window=2026-02-30&search=NC"));
    expect(filters).toEqual({ ...emptyAdminOrderFilters("NC") });
    expect(linkedOrderFilters(new URLSearchParams("status=open")).status).toBe("open");
  });

  it("a new link while the page is open (the header search) searches for it: every filter resets and the open order closes", async () => {
    linked = new URLSearchParams("search=mariam%40example.invalid");
    const { api, gets } = stubApi([order(REF_A, "confirmed"), order(REF_B, "awaiting_payment", "pickup")]);
    const view = renderPage(api);
    await screen.findByText(REF_A);
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "open" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Delivery or pickup" }), { target: { value: "pickup" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "oldest" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Only refund needed or payment to check" }));
    await waitFor(() => expect(gets.at(-1)).toContain("needsAction=1"));
    await openOrder(REF_A);
    linked = new URLSearchParams(`search=${REF_B}`);
    view.rerender(page(api));
    // The whole request is a fresh visit's: no status, fulfilment, needs-action or sort left over, page 1.
    await waitFor(() => expect(gets).toContain(`/admin/orders?${adminOrderSearch(emptyAdminOrderFilters(REF_B))}`));
    expect(screen.getByRole("textbox", { name: /Search by order/ })).toHaveValue(REF_B);
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Delivery or pickup" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("newest");
    expect(screen.getByRole("checkbox", { name: "Only refund needed or payment to check" })).not.toBeChecked();
    expect(screen.queryByRole("complementary", { name: `Order ${REF_A}` })).toBeNull();
  });

  it("a bare link while the page is open (the sidebar's Orders, or Back) clears the search", async () => {
    linked = new URLSearchParams("search=mariam%40example.invalid");
    const { api, gets } = stubApi([order(REF_A, "confirmed")]);
    const view = renderPage(api);
    await screen.findByText(REF_A);
    await openOrder(REF_A);
    const before = gets.length;
    linked = new URLSearchParams();
    view.rerender(page(api));
    await waitFor(() => expect(gets.slice(before)).toContain(`/admin/orders?${adminOrderSearch(emptyAdminOrderFilters())}`));
    expect(screen.getByRole("textbox", { name: /Search by order/ })).toHaveValue("");
    expect(screen.queryByRole("complementary", { name: `Order ${REF_A}` })).toBeNull();
  });

  it("the same address again keeps what staff typed, even as a new but equal link", async () => {
    linked = new URLSearchParams("search=mariam%40example.invalid");
    const { api, gets } = stubApi([order(REF_A, "confirmed")]);
    const view = renderPage(api);
    await screen.findByText(REF_A);
    fireEvent.change(screen.getByRole("textbox", { name: /Search by order/ }), { target: { value: "33337777" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=33337777"))).toBe(true));
    const before = gets.length;
    // Next's development router can hand the page a new, equal search-params object for the same address.
    linked = new URLSearchParams(linked.toString());
    view.rerender(page(api));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByRole("textbox", { name: /Search by order/ })).toHaveValue("33337777");
    expect(gets.slice(before).some((path) => path.includes("q=mariam"))).toBe(false);
  });

  it("a new link clears an earlier download's error, as a fresh visit would", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    linked = new URLSearchParams("search=mariam%40example.invalid");
    const { api } = stubApi([order(REF_A, "confirmed")]);
    const view = renderPage(api, manager);
    await screen.findByText(REF_A);
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    linked = new URLSearchParams(`search=${REF_B}`);
    view.rerender(page(api, manager));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("the Customer card opens the customer's record, for roles that may view Customers (10d)", async () => {
    const { api } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api, operations, { customers: viewOnly });
    let panel = await openOrder(REF_A);
    expect(await within(panel).findByRole("link", { name: "Open customer record" })).toHaveAttribute(
      "href",
      "/admin/customers?search=mariam%40example.invalid",
    );
    cleanup();

    renderPage(stubApi([order(REF_A, "confirmed")]).api);
    panel = await openOrder(REF_A);
    await within(panel).findByText("mariam@example.invalid");
    expect(within(panel).queryByRole("link", { name: "Open customer record" })).toBeNull();
  });

  it("shows the whole order: customer, address, window, items, totals and history with staff names", async () => {
    const pinned = order(REF_A, "preparing");
    pinned.address = pinned.address && { ...pinned.address, pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } };
    const { api } = stubApi([pinned]);
    renderPage(api);
    const panel = await openOrder(REF_A);
    const inPanel = within(panel);
    expect(await inPanel.findByText("mariam@example.invalid")).toBeTruthy();
    // The shared point (D263), in a new tab.
    const map = inPanel.getByRole("link", { name: "Open in Google Maps (± 15 m)" });
    expect(map).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
    expect(map).toHaveAttribute("target", "_blank");
    expect(inPanel.getByText("Zone 66, Street 850, Building 12, Floor 3, Flat 4")).toBeTruthy();
    expect(inPanel.getByText(/Blue gate/)).toBeTruthy();
    expect(inPanel.getByText(/Call first/)).toBeTruthy();
    expect(inPanel.getByText("Salmon kibble")).toBeTruthy();
    expect(inPanel.getByText("SK-2")).toBeTruthy();
    expect(panel.textContent).toContain("95.00");
    expect(inPanel.getByText("Confirmed → Preparing")).toBeTruthy();
    expect(panel.textContent).toContain("Sara");
  });

  it("a step forward asks first; Cancel sends nothing; confirming sends the version", async () => {
    const preparing = order(REF_A, "preparing", "delivery", 4);
    const { api, posts } = stubApi([order(REF_A, "confirmed")], () => preparing);
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Start preparing" }));
    let dialog = await screen.findByRole("dialog", { name: `Move order ${REF_A} to Preparing?` });
    expect(dialog.textContent).toContain("can no longer cancel the order online");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toHaveLength(0);

    fireEvent.click(within(panel).getByRole("button", { name: "Start preparing" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Start preparing" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/advance`, body: { version: 3 } }]));
    expect(await within(panel).findByText(`Order ${REF_A} is now Preparing.`)).toBeTruthy();
  });

  it("going out for delivery warns that the customer is emailed (D133)", async () => {
    const { api } = stubApi([order(REF_A, "preparing")]);
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Mark out for delivery" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("gets an email that the order is on its way");
  });

  it("one step back asks first and says it is recorded (D132)", async () => {
    const { api, posts } = stubApi([order(REF_A, "preparing")], () => order(REF_A, "confirmed", "delivery", 4));
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Move back to Confirmed" }));
    const dialog = await screen.findByRole("dialog", { name: `Move order ${REF_A} back to Confirmed?` });
    expect(dialog.textContent).toContain("recorded in the history with your name");
    expect(dialog.textContent).toContain("can cancel the order online again");
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Move back to Confirmed" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/move-back`, body: { version: 3 } }]));
  });

  it("cancelling from Preparing needs a reason and asks about stock; unticked keeps the stock out (D131)", async () => {
    const cancelled: AdminOrder = {
      ...order(REF_A, "cancelled", "delivery", 4),
      refundNeeded: true,
      cancelledBy: "staff",
      cancelReason: "Damaged in packing",
      stockReturned: false,
    };
    const { api, posts } = stubApi([order(REF_A, "preparing")], () => cancelled);
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: `Cancel order ${REF_A}?` });
    expect(dialog.textContent).toContain("marked Refund needed");
    expect(dialog.textContent).toContain("delivery time is freed");
    const stock = within(dialog).getByRole("checkbox", { name: "Put the items back in stock" }) as HTMLInputElement;
    expect(stock.checked).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    expect(await within(dialog).findByText(/Please give a reason/)).toBeTruthy();
    expect(posts).toHaveLength(0);

    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Damaged in packing" } });
    fireEvent.click(stock);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { path: `/admin/orders/${REF_A}/cancel`, body: { version: 3, reason: "Damaged in packing", returnStock: false } },
      ]),
    );
    expect(await within(panel).findByText(`Order ${REF_A} is cancelled and marked Refund needed.`)).toBeTruthy();
  });

  it("cancelling an unpaid order does not ask about stock: it always goes back, and no refund is due", async () => {
    const { api, posts } = stubApi([order(REF_A, "awaiting_payment")], () => ({
      ...order(REF_A, "cancelled", "delivery", 4),
      stockReturned: true,
    }));
    renderPage(api);
    const panel = await openOrder(REF_A);
    expect(within(panel).queryByRole("button", { name: /Start preparing|Mark/ })).toBeNull();
    fireEvent.click(await within(panel).findByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(dialog.textContent).toContain("The items go back in stock.");
    expect(dialog.textContent).not.toContain("Refund needed");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Customer called" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(posts[0]?.body).toEqual({ version: 3, reason: "Customer called", returnStock: true }));
  });

  it("when someone else changed the order first, staff are told and the order reloads", async () => {
    const { api, gets } = stubApi([order(REF_A, "confirmed")], () => {
      throw new ApiError("CONFLICT", "This order was changed by someone else. Please reload.", 409);
    });
    renderPage(api);
    const panel = await openOrder(REF_A);
    await within(panel).findByText("mariam@example.invalid");
    const before = gets.filter((path) => path === `/admin/orders/${REF_A}`).length;
    fireEvent.click(within(panel).getByRole("button", { name: "Start preparing" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Start preparing" }));
    expect(await within(panel).findByText(/Someone else changed this order/)).toBeTruthy();
    await waitFor(() => expect(gets.filter((path) => path === `/admin/orders/${REF_A}`).length).toBeGreaterThan(before));
  });

  it("view-only roles see orders but no actions", async () => {
    const { api } = stubApi([order(REF_A, "preparing")]);
    renderPage(api, viewOnly);
    const panel = await openOrder(REF_A);
    await within(panel).findByText("mariam@example.invalid");
    expect(within(panel).queryByRole("button", { name: /Mark|Move back|Cancel order/ })).toBeNull();
  });

  it("roles with Export download the CSV with the current filters, without pages", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("﻿Reference\r\n", {
          status: 200,
          headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="orders-2026-10-08.csv"' },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:orders");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { api } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api, manager);
    await screen.findByText(REF_A);
    fireEvent.change(screen.getByRole("combobox", { name: "Delivery or pickup" }), { target: { value: "pickup" } });
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/^\/api\/admin\/orders\/export\.csv\?/);
    expect(url).toContain("fulfilment=pickup");
    expect(url).not.toContain("page=");
    click.mockRestore();
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
  });
});

// --- Payments (8b) -------------------------------------------------------------------------------

const refunder = { view: true, edit: true, delete: false, export: false, refund: true };
const P1 = `${REF_A}-P1`;
const REFUND_ID = "0190f0a4-7c3e-7000-8000-0000000000f1";

function paidAttempt(overrides: Partial<AdminOrderPayments["attempts"][number]> = {}): AdminOrderPayments["attempts"][number] {
  return {
    reference: P1,
    provider: "fake",
    status: "succeeded",
    amount: 9500,
    refunded: 0,
    createdAt: "2026-10-08T06:30:00.000Z",
    succeededAt: "2026-10-08T06:31:00.000Z",
    reported: null,
    mismatchClosed: null,
    ...overrides,
  };
}

function refundRow(overrides: Partial<AdminOrderPayments["refunds"][number]> = {}): AdminOrderPayments["refunds"][number] {
  return {
    id: REFUND_ID,
    paymentReference: P1,
    amount: 2000,
    reason: "Damaged bag",
    method: "manual",
    status: "pending_manual",
    providerRefundId: null,
    manualReference: null,
    requestedBy: "Sara",
    completedBy: null,
    createdAt: "2026-10-08T08:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

async function paymentSection(reference: string) {
  const panel = await openOrder(reference);
  const heading = await within(panel).findByRole("heading", { name: "Payment" });
  const section = heading.closest("section");
  if (!section) throw new Error("no Payment section");
  await within(section).findByRole("list", { name: "Payment attempts" });
  return { panel, section: within(section) };
}

describe("admin order payments (8b)", () => {
  it("lists the attempts and refunds; without Orders → Refund there are no money buttons", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt({ refunded: 1000 })],
        refunds: [refundRow({ amount: 1000, method: "api", status: "completed", providerRefundId: "fref_1", completedAt: "2026-10-08T08:01:00.000Z" })],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 8500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api } = stubApi([order(REF_A, "confirmed")], undefined, { panels });
    renderPage(api, operations);
    const { section } = await paymentSection(REF_A);
    // The attempt and the refund both name the payment.
    expect(section.getAllByText(P1)).toHaveLength(2);
    expect(section.getByText("Paid")).toBeTruthy();
    expect(section.getByText(/Refunded or being refunded/)).toBeTruthy();
    expect(section.getByText("Refunded")).toBeTruthy();
    expect(section.getByText("fref_1")).toBeTruthy();
    expect(section.queryByRole("button", { name: /Refund payment|Mark refunded|Withdraw/ })).toBeNull();
  });

  it("Refund asks first, checks the amount, and sends it in dirhams with the reason (D137, D139)", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 9500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api, posts } = stubApi([order(REF_A, "confirmed")], () => panels[REF_A], { panels });
    renderPage(api, refunder);
    const { section } = await paymentSection(REF_A);
    fireEvent.click(section.getByRole("button", { name: `Refund payment ${P1}` }));
    const dialog = await screen.findByRole("dialog", { name: `Refund payment ${P1}?` });
    expect(dialog.textContent).toContain("through the payment company");
    const amount = within(dialog).getByRole("textbox", { name: /Amount in QAR/ }) as HTMLInputElement;
    expect(amount.value).toBe("95.00");

    fireEvent.change(amount, { target: { value: "120" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Damaged bag" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refund" }));
    expect(await within(dialog).findByText(/At most QAR\s?95\.00/)).toBeTruthy();
    expect(posts).toHaveLength(0);

    fireEvent.change(amount, { target: { value: "10.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Refund QAR\s?10\.50/ }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/payments/${P1}/refund`, body: { amount: 1050, reason: "Damaged bag" } }]),
    );
    expect(await section.findByText(/Refund of QAR\s?10\.50 sent to the payment company/)).toBeTruthy();
  });

  it("a refund the payment company refused or did not confirm is reported, and the dialog closes", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 9500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api } = stubApi(
      [order(REF_A, "confirmed")],
      () => {
        throw new ApiError("REFUND_FAILED", "The payment company did not confirm this refund. It is kept as processing.", 502);
      },
      { panels },
    );
    renderPage(api, refunder);
    const { section } = await paymentSection(REF_A);
    fireEvent.click(section.getByRole("button", { name: `Refund payment ${P1}` }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Customer returned it" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Refund QAR/ }));
    expect(await section.findByText(/did not confirm this refund/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("manual refunds: the dashboard reference completes one; Withdraw warns about the SkipCash dashboard (F1)", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt({ refunded: 2000 })],
        refunds: [refundRow()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 7500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "manual" },
      }),
    };
    const { api, posts } = stubApi([order(REF_A, "confirmed")], () => panels[REF_A], { panels });
    renderPage(api, refunder);
    const { section } = await paymentSection(REF_A);
    expect(section.getByText("Refunds are made in the SkipCash dashboard")).toBeTruthy();
    expect(section.getByText("To refund in the SkipCash dashboard")).toBeTruthy();

    fireEvent.click(section.getByRole("button", { name: "Mark refunded" }));
    let dialog = await screen.findByRole("dialog", { name: /Mark the refund of QAR\s?20\.00 as refunded\?/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark refunded" }));
    expect(await within(dialog).findByText(/Enter the reference from the SkipCash dashboard/)).toBeTruthy();
    expect(posts).toHaveLength(0);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "SkipCash dashboard reference" }), { target: { value: " SC-778 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark refunded" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/refunds/${REFUND_ID}/complete`, body: { manualReference: "SC-778" } }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(section.getByRole("button", { name: "Withdraw" }));
    dialog = await screen.findByRole("dialog", { name: /Withdraw the refund of QAR\s?20\.00\?/ });
    expect(dialog.textContent).toContain("Withdraw only if you have not refunded this in the SkipCash dashboard");
    expect(posts).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw refund" }));
    await waitFor(() => expect(posts[1]).toEqual({ path: `/admin/orders/${REF_A}/refunds/${REFUND_ID}/withdraw`, body: {} }));
  });

  it("an API refund the payment company never answered is released only after asking; one it has updates by itself (8c)", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt({ refunded: 3000 })],
        refunds: [
          refundRow({ method: "api", status: "processing" }),
          refundRow({ id: "0190f0a4-7c3e-7000-8000-0000000000f2", amount: 1000, method: "api", status: "processing", providerRefundId: "sc-refund-1" }),
        ],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 6500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api, posts } = stubApi([order(REF_A, "confirmed")], () => panels[REF_A], { panels });
    renderPage(api, refunder);
    const { section } = await paymentSection(REF_A);
    expect(section.getByText(/SkipCash usually completes refunds within a day/)).toBeTruthy();
    expect(section.getAllByRole("button", { name: "Not refunded — release" })).toHaveLength(1);
    expect(section.queryByRole("button", { name: "Withdraw" })).toBeNull();
    // SkipCash takes one refund at a time per payment: the rest waits, with the reason shown.
    expect(section.queryByRole("button", { name: `Refund payment ${P1}` })).toBeNull();
    expect(section.getByText("Refund the rest after the refund in progress finishes (usually within a day).")).toBeTruthy();

    fireEvent.click(section.getByRole("button", { name: "Not refunded — release" }));
    const dialog = await screen.findByRole("dialog", { name: /Release the refund of QAR\s?20\.00\?/ });
    expect(dialog.textContent).toContain("Release it only if it is not in the SkipCash dashboard");
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Release refund" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/refunds/${REFUND_ID}/release`, body: {} }]));
    expect(await section.findByText("The refund was released. The amount can be refunded again.")).toBeTruthy();
  });

  it("a recorded manual refund says to refund it in the dashboard", async () => {
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 9500 }], closableMismatches: [], canConfirmLate: false, refundsBy: "manual" },
      }),
    };
    const { api, posts } = stubApi([order(REF_A, "confirmed")], () => panels[REF_A], { panels });
    renderPage(api, refunder);
    const { section } = await paymentSection(REF_A);
    fireEvent.click(section.getByRole("button", { name: `Refund payment ${P1}` }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("refunds only in its dashboard");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Cancelled by phone" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Record refund of QAR\s?95\.00/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(await section.findByText(/recorded\. Refund it in the SkipCash dashboard/)).toBeTruthy();
  });

  it("a wrong-amount payment: the detail says what to do; closing it needs the dashboard reference (D152)", async () => {
    const flagged: AdminOrder = { ...order(REF_A, "awaiting_payment"), attention: "amount_mismatch" };
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attention: "amount_mismatch",
        attempts: [paidAttempt({ status: "pending", succeededAt: null, reported: { amount: 2400, currency: "QAR", state: "succeeded" } })],
        actions: { refundable: [], closableMismatches: [P1], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api, posts } = stubApi([flagged], () => panels[REF_A], { panels });
    renderPage(api, refunder);
    expect(await screen.findByText("Payment to check")).toBeTruthy();
    const { panel, section } = await paymentSection(REF_A);
    expect(within(panel).getByText(/took a different amount/)).toBeTruthy();
    expect(section.getByText(/reported QAR\s?24\.00 \(succeeded\) instead of QAR\s?95\.00/)).toBeTruthy();
    fireEvent.click(section.getByRole("button", { name: "Close wrong amount" }));
    const dialog = await screen.findByRole("dialog", { name: `Close the wrong-amount payment ${P1}?` });
    expect(dialog.textContent).toMatch(/refund the QAR\s?24\.00 the customer actually paid/);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "SkipCash dashboard reference" }), { target: { value: "SC-900" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close payment" }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/payments/${P1}/close-mismatch`, body: { manualReference: "SC-900" } }]),
    );
  });

  it("a late payment is confirmed with a new delivery time (D136, D153); it needs Orders → Edit", async () => {
    const late: AdminOrder = { ...order(REF_A, "expired"), attention: "paid_after_expiry" };
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attention: "paid_after_expiry",
        attempts: [paidAttempt()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 9500 }], closableMismatches: [], canConfirmLate: true, refundsBy: "api" },
      }),
    };
    const windowId = "0197a000-0000-7000-8000-0000000000b9";
    const windows: PublicDeliveryWindow[] = [
      { id: windowId, date: "2026-10-12", start: "09:00", end: "12:00", startsAt: "2026-10-12T06:00:00.000Z", seatsLeft: 2 },
    ];
    const confirmed = order(REF_A, "confirmed", "delivery", 4);
    const { api, posts, gets } = stubApi([late], () => confirmed, { panels, windows });
    renderPage(api, refunder);
    const { panel, section } = await paymentSection(REF_A);
    expect(within(panel).getByText(/Paid after the time to pay ran out/)).toBeTruthy();
    fireEvent.click(section.getByRole("button", { name: "Confirm with a new delivery time" }));
    const dialog = await screen.findByRole("dialog", { name: `Confirm order ${REF_A}?` });
    expect(dialog.textContent).toContain("taken from stock again");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm the order" }));
    expect(await within(dialog).findByText(/Choose a new delivery time/)).toBeTruthy();
    // The staff list for this order (#14): further ahead for a Pet House, its old time again if a seat is free.
    expect(gets).toContain(`/admin/orders/${REF_A}/delivery-windows`);
    expect(gets).not.toContain("/delivery/windows");
    expect(posts).toHaveLength(0);
    // The shared date and time picker (D249), in staff's 24-hour times, with the places left.
    fireEvent.click(await within(dialog).findByRole("button", { name: "09:00–12:00 2 left" }));
    expect(within(dialog).getByRole("status", { name: "New delivery time" })).toHaveTextContent("Mon, 12 October 2026 • 09:00–12:00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm the order" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/confirm-late-payment`, body: { version: 3, windowId } }]));
    expect(await section.findByText(`Order ${REF_A} is confirmed. The customer gets an email.`)).toBeTruthy();
    cleanup();

    const { api: viewApi } = stubApi([late], undefined, { panels });
    renderPage(viewApi, viewOnly);
    const view = await paymentSection(REF_A);
    expect(view.section.queryByRole("button", { name: /Confirm/ })).toBeNull();
  });

  it("staff cancelling while the customer is paying are told a payment made is refunded (D146)", async () => {
    const panels = { [REF_A]: paymentPanel(REF_A, { attempts: [paidAttempt({ status: "pending", succeededAt: null })] }) };
    const { api } = stubApi([order(REF_A, "awaiting_payment")], undefined, { panels });
    renderPage(api);
    const { panel } = await paymentSection(REF_A);
    expect(within(panel).getByText("Waiting for the customer")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("If the customer has already paid, the order is marked Refund needed");
  });

  it("the list can show only orders needing a refund or a payment check", async () => {
    const { api, gets } = stubApi([{ ...order(REF_A, "expired"), attention: "paid_after_expiry" }, order(REF_B, "confirmed")]);
    renderPage(api);
    expect(await screen.findByText("Payment to check")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only refund needed or payment to check" }));
    await waitFor(() => expect(gets.some((path) => path.includes("needsAction=1"))).toBe(true));
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeTruthy();
  });
});

describe("admin order helpers", () => {
  it("reads amounts staff type in QAR as dirhams", () => {
    expect(parseQar("25")).toBe(2500);
    expect(parseQar(" 10.5 ")).toBe(1050);
    expect(parseQar("0.05")).toBe(5);
    expect(parseQar("10.505")).toBeNull();
    expect(parseQar("-1")).toBeNull();
    expect(parseQar("1,000")).toBeNull();
    expect(parseQar("")).toBeNull();
  });

  it("builds the list query: open statuses, dates only with a range, sort and pages", () => {
    expect(adminOrderSearch(emptyAdminOrderFilters())).toBe("sort=newest&page=1&pageSize=25");
    const search = new URLSearchParams(
      adminOrderSearch({ ...emptyAdminOrderFilters(" NC-261008 "), status: "open", dateField: "window", from: "2026-10-01", page: 2 }),
    );
    expect(search.get("q")).toBe("NC-261008");
    expect(search.get("status")).toBe("awaiting_payment,confirmed,preparing,out_for_delivery,ready_for_pickup");
    expect(search.get("dateField")).toBe("window");
    expect(search.get("from")).toBe("2026-10-01");
    expect(search.get("page")).toBe("2");
    expect(adminOrderSearch(emptyAdminOrderFilters(), { paged: false })).toBe("sort=newest");
    expect(new URLSearchParams(adminOrderSearch({ ...emptyAdminOrderFilters(), needsAction: true })).get("needsAction")).toBe("1");
  });

  it("a refused CSV download becomes a readable error", async () => {
    const refused = async () =>
      new Response(JSON.stringify({ code: "FORBIDDEN", message: "You do not have permission." }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    await expect(fetchDownload("/admin/orders", "csv", "sort=newest", "en", refused)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// --- 11e: an order's offers for staff, and refunds at the discounted price ---------------------------

describe("an order's offers for staff (11e)", () => {
  it("shows each item's discount and paid amount, and the promotions with their use; Refund fills an item's paid amount (9A)", async () => {
    const base = order(REF_A, "confirmed");
    const [line] = base.lines;
    if (!line) throw new Error("fixture");
    const discounted: AdminOrder = {
      ...base,
      lines: [{ ...line, discount: 1200, lineTotal: 6800 }],
      discount: 1200,
      total: 8300,
      promotions: [
        { promotionId: "0190f0a4-7c3e-7000-8000-00000000aa01", name: { en: "Kibble week", ar: "أسبوع الطعام" }, code: "KIBBLE", discount: 1200, status: "used" },
      ],
    };
    const panels = {
      [REF_A]: paymentPanel(REF_A, {
        attempts: [paidAttempt()],
        actions: { refundable: [{ paymentReference: P1, maxAmount: 8300 }], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
      }),
    };
    const { api } = stubApi([discounted], undefined, { panels });
    renderPage(api, refunder);
    const { panel, section } = await paymentSection(REF_A);

    // The side panel is narrow: the discount sits under what was paid, in the last column.
    const items = within(panel).getByRole("table");
    expect(within(items).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Item", "SKU", "Qty", "Unit price", "Paid"]);
    expect(within(items).getByText(/^−\sQAR\s?12\.00$/)).toBeTruthy();
    expect(within(items).getByText(/^QAR\s?68\.00$/)).toBeTruthy();
    const totals = within(panel).getByRole("heading", { name: "Order summary" }).closest("section") as HTMLElement;
    expect(within(totals).getByText(/^Kibble week ·/)).toBeTruthy();
    expect(within(totals).getByText("KIBBLE")).toBeTruthy();
    expect(within(totals).getByText("Paid")).toBeTruthy();
    expect(within(totals).getByText(/^QAR\s?83\.00$/)).toBeTruthy();

    fireEvent.click(section.getByRole("button", { name: `Refund payment ${P1}` }));
    const dialog = await screen.findByRole("dialog", { name: `Refund payment ${P1}?` });
    const amount = within(dialog).getByRole("textbox", { name: /Amount in QAR/ }) as HTMLInputElement;
    // One of two at its share of the paid amount, both, or the delivery fee: never the full price.
    fireEvent.click(within(dialog).getByRole("button", { name: /^One Salmon kibble · 2 kg bag · QAR\s?34\.00$/ }));
    expect(amount.value).toBe("34.00");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Salmon kibble · 2 kg bag × 2 · QAR\s?68\.00$/ }));
    expect(amount.value).toBe("68.00");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delivery fee · QAR\s?15\.00$/ }));
    expect(amount.value).toBe("15.00");
  });

  it("an order without offers keeps its plain items table", async () => {
    const { api } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api, operations);
    const panel = await openOrder(REF_A);
    const items = await within(panel).findByRole("table");
    expect(within(items).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Item", "SKU", "Qty", "Unit price", "Total"]);
    expect(within(items).queryByText(/^−/)).toBeNull();
  });
});

// --- Deliveries by day (D253) ------------------------------------------------------------------------

const REF_C = "NC-261008-PQRSTV";
const REF_D = "NC-261008-WXYZ12";
const REF_E = "NC-261008-345678";
const REF_F = "NC-261008-9ABCDE";

/** A delivery order in a given window. */
const inWindow = (reference: string, status: OrderStatus, start: string, end: string, date = "2026-10-09"): AdminOrder => ({
  ...order(reference, status),
  window: { date, start, end },
});

/**
 * An API that answers the list as the real one does for "Deliveries by day": only that date's orders, of
 * that kind, in the asked statuses. `hold` keeps one date's answer back until released; `total` says how
 * many the day has in all.
 */
function dayApi(orders: AdminOrder[], options: { hold?: string; total?: number } = {}) {
  const base = stubApi(orders);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api: ApiClient = {
    ...base.api,
    get: async (path, schema) => {
      if (!path.startsWith("/admin/orders?")) return base.api.get(path, schema);
      base.gets.push(path);
      const query = new URL(path, "http://test").searchParams;
      const from = query.get("from");
      if (options.hold && from === options.hold) await held;
      const statuses = query.get("status")?.split(",");
      const rows = orders.filter(
        (row) =>
          (!query.get("fulfilment") || row.fulfilment === query.get("fulfilment")) &&
          (!from || row.window?.date === from) &&
          (!statuses || statuses.includes(row.status)),
      );
      return schema.parse({
        orders: rows.map(summary),
        total: options.total ?? rows.length,
        page: 1,
        pageSize: Number(query.get("pageSize") ?? "25"),
        counts: counts({ confirmed: rows.length }),
      }) as never;
    },
  };
  return { api, gets: base.gets, release: () => release() };
}

// Not in window order on purpose: the day puts its windows in time order itself.
const theDay = [
  inWindow(REF_B, "preparing", "12:00", "15:00"),
  inWindow(REF_A, "confirmed", "09:00", "12:00"),
  inWindow(REF_C, "awaiting_payment", "12:00", "15:00"),
  inWindow(REF_D, "cancelled", "12:00", "15:00"),
  order(REF_E, "confirmed", "pickup"),
  inWindow(REF_F, "out_for_delivery", "09:00", "12:00", "2026-10-10"),
];

/** The day table's rows, one per window (D255: the same table as the Delivery page's Day overview). */
const windowsShown = () => timeRows(screen.getByRole("table", { name: "Delivery windows on this day" }));
/** A row's window and how many orders it has. */
const windowLine = rowText;

describe("Deliveries by day (D253)", () => {
  it("a Delivery page window opens that day's deliveries under each window, the linked one marked", async () => {
    linked = new URLSearchParams({ date: "2026-10-09", time: "09:00" });
    const { api, gets } = dayApi(theDay);
    renderPage(api);
    await screen.findByRole("table", { name: "Delivery windows on this day" });
    expect(screen.getByRole("button", { name: "Deliveries by day", pressed: true })).toBeTruthy();
    expect(windowsShown().map(windowLine)).toEqual([
      ["09:00–12:00", "1"],
      ["12:00–15:00", "2"],
    ]);
    expect(windowsShown()[0]).toHaveAttribute("aria-current", "true");
    expect(windowsShown()[1]).not.toHaveAttribute("aria-current");
    // Every window starts open, one line per order (D257). An unpaid order still holds its place, so the
    // counts match the Delivery page's "booked".
    const money = formatMoney(9500, "en");
    expect(listLines("Orders at 12:00–15:00")).toEqual([
      [REF_B, "Mariam Test", "+974 3333 7777", "West Bay", "2", money, "Preparing"],
      [REF_C, "Mariam Test", "+974 3333 7777", "West Bay", "2", money, "Awaiting payment"],
    ]);
    // Any window closes with a click, and opens again with the next.
    fireEvent.click(screen.getByRole("button", { name: "Orders at 12:00–15:00", expanded: true }));
    expect(listLines("Orders at 12:00–15:00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Orders at 12:00–15:00", expanded: false }));
    expect(listReferences("Orders at 12:00–15:00")).toEqual([REF_B, REF_C]);
    // Cancelled orders and pickups are not on it.
    expect(screen.queryByText(REF_D)).toBeNull();
    expect(screen.queryByText(REF_E)).toBeNull();
    // The day asks only for what it shows.
    const asked = gets.find((path) => path.includes("from=2026-10-09"));
    expect(Object.fromEntries(new URL(asked ?? "", "http://test").searchParams)).toEqual({
      status: "awaiting_payment,confirmed,preparing,out_for_delivery,delivered",
      fulfilment: "delivery",
      dateField: "window",
      from: "2026-10-09",
      to: "2026-10-09",
      sort: "window",
      page: "1",
      pageSize: "50",
    });

    // The next day has its own 09:00, which is not the linked one.
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByText(REF_F)).toBeTruthy();
    expect(windowsShown().map((item) => item.getAttribute("aria-current"))).toEqual([null]);
  });

  it("an order opens its panel with the next step, as in the list", async () => {
    linked = new URLSearchParams({ date: "2026-10-09" });
    renderPage(dayApi(theDay).api);
    fireEvent.click(await screen.findByRole("button", { name: REF_B }));
    const panel = await screen.findByRole("complementary", { name: `Order ${REF_B}` });
    expect(await within(panel).findByRole("button", { name: "Mark out for delivery" })).toBeTruthy();
  });

  it("while another day loads, the previous day's orders are not shown under its date", async () => {
    linked = new URLSearchParams({ date: "2026-10-09" });
    const { api, release } = dayApi(theDay, { hold: "2026-10-10" });
    renderPage(api);
    await screen.findByText(REF_A);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByText("Loading the day…")).toBeTruthy();
    expect(screen.queryByText(REF_A)).toBeNull();
    expect(screen.queryByText("No deliveries on this day.")).toBeNull();
    release();
    expect(await screen.findByText(REF_F)).toBeTruthy();
  });

  it("an empty day says so; a day with more than 50 says the list has the rest", async () => {
    linked = new URLSearchParams({ date: "2026-10-11" });
    renderPage(dayApi(theDay).api);
    expect(await screen.findByText("No deliveries on this day.")).toBeTruthy();
    cleanup();
    linked = new URLSearchParams({ date: "2026-10-09" });
    renderPage(dayApi(theDay, { total: 51 }).api);
    expect(await screen.findByText("Showing the first 50; use the list for the rest.")).toBeTruthy();
  });

  it("the download is the day on screen; in the List it is the list's filters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("﻿Reference\r\n", {
          status: 200,
          headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="orders.csv"' },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:orders");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    linked = new URLSearchParams({ date: "2026-10-09" });
    renderPage(dayApi(theDay).api, manager);
    await screen.findByText(REF_A);

    fireEvent.click(screen.getByRole("button", { name: "Download this day (CSV)" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const day = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://test");
    expect(day.pathname).toBe("/api/admin/orders/export.csv");
    expect(Object.fromEntries(day.searchParams)).toEqual({
      status: "awaiting_payment,confirmed,preparing,out_for_delivery,delivered",
      fulfilment: "delivery",
      dateField: "window",
      from: "2026-10-09",
      to: "2026-10-09",
      sort: "window",
    });

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toBe(`/api/admin/orders/export.csv?${adminOrderSearch(emptyAdminOrderFilters(), { paged: false })}`);
    click.mockRestore();
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
  });

  it("links while the page is open: a window shows its day; a search or a bare link shows the list", async () => {
    linked = new URLSearchParams(`search=${REF_A}`);
    const { api, gets } = dayApi(theDay);
    const view = render(page(api));
    expect(await screen.findByRole("button", { name: "List", pressed: true })).toBeTruthy();
    // The List does not ask for a day it does not show.
    expect(gets.some((path) => path.includes("fulfilment=delivery"))).toBe(false);

    linked = new URLSearchParams({ date: "2026-10-09", time: "09:00" });
    view.rerender(page(api));
    expect(await screen.findByRole("button", { name: "Deliveries by day", pressed: true })).toBeTruthy();
    expect(screen.getByLabelText("Day", { selector: "input" })).toHaveValue("2026-10-09");
    await screen.findByText(REF_A);
    expect(windowsShown()[0]).toHaveAttribute("aria-current", "true");

    linked = new URLSearchParams();
    view.rerender(page(api));
    expect(await screen.findByRole("button", { name: "List", pressed: true })).toBeTruthy();

    // A date that does not exist opens the List.
    linked = new URLSearchParams({ date: "2026-02-30" });
    view.rerender(page(api));
    expect(await screen.findByRole("button", { name: "List", pressed: true })).toBeTruthy();
  });
});

/** A paid order with a made-to-order Pet House (#14): QAR 15 for the area plus the house's own QAR 100. */
function houseOrder(reference: string, status: OrderStatus = "confirmed", fulfilment: Fulfilment = "delivery"): AdminOrder {
  const base = order(reference, status, fulfilment);
  const delivery = fulfilment === "delivery";
  return {
    ...base,
    hasHouse: true,
    itemCount: 1,
    window: delivery ? { date: "2026-10-28", start: "16:00", end: "18:00" } : null,
    lines: [
      {
        product: "terracotta-roof-cat-villa",
        variant: "standard",
        sku: "PH-VILLA",
        name: { en: "Terracotta Roof Cat Villa", ar: "فيلا القطط بسقف قرميدي" },
        label: { en: "Standard", ar: "قياسي" },
        weightGrams: null,
        unitPrice: 294200,
        quantity: 1,
        discount: 0,
        lineTotal: 294200,
        house: { madeToOrder: true, leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 10000 },
      },
    ],
    subtotal: 294200,
    deliveryFee: delivery ? 11500 : 0,
    houseDeliveryFee: delivery ? 10000 : 0,
    total: delivery ? 305700 : 294200,
  };
}

const LATER = "0197a000-0000-7000-8000-0000000000d1";
const laterWindows: PublicDeliveryWindow[] = [
  { id: LATER, date: "2026-11-20", start: "10:00", end: "12:00", startsAt: "2026-11-20T07:00:00.000Z", seatsLeft: 3 },
];

describe("Pet House orders (#14)", () => {
  it("the list marks Pet House orders, and can show only them", async () => {
    const { api, gets } = stubApi([houseOrder(REF_A), order(REF_B, "confirmed")]);
    renderPage(api);
    await screen.findByText(REF_A);
    const rows = screen.getAllByRole("row");
    const houseRow = rows.find((row) => row.textContent?.includes(REF_A));
    const otherRow = rows.find((row) => row.textContent?.includes(REF_B));
    expect(houseRow?.textContent).toContain("Pet House");
    expect(otherRow?.textContent).not.toContain("Pet House");
    fireEvent.click(screen.getByRole("checkbox", { name: "Pet House orders only" }));
    await waitFor(() => expect(gets.some((path) => path.startsWith("/admin/orders?") && path.includes("houses=1"))).toBe(true));
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeTruthy();
    // A link can open the list filtered too.
    expect(linkedOrderFilters(new URLSearchParams("houses=1")).houses).toBe(true);
    expect(adminOrderSearch({ ...emptyAdminOrderFilters(), houses: true })).toContain("houses=1");
  });

  it("the panel shows the house's estimate on its line, and its delivery charge apart from the area's fee", async () => {
    const { api } = stubApi([houseOrder(REF_A, "preparing")]);
    renderPage(api);
    const panel = await openOrder(REF_A);
    expect(await within(panel).findByText("Pet House · made to order · ready in about 7–10 days")).toBeTruthy();
    const summaryRows = within(panel)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(summaryRows).toContainEqual(["Delivery", formatMoney(1500, "en")]);
    expect(summaryRows).toContainEqual(["Pet House delivery", formatMoney(10000, "en")]);
    expect(summaryRows).toContainEqual(["Total", formatMoney(305700, "en")]);
    // Amounts may wrap after "QAR" in the narrow panel instead of running into the next column
    // (2026-10-18): a plain space there, where the money format puts a no-break one.
    const cells = within(panel).getAllByRole("cell").filter((cell) => cell.textContent?.includes("2,942.00"));
    expect(cells.map((cell) => cell.textContent)).toEqual(["QAR 2,942.00", "QAR 2,942.00"]);
    expect(formatMoney(294200, "en")).toBe("QAR\u00a02,942.00");
  });

  it("an order without a house keeps one delivery fee line", async () => {
    const { api } = stubApi([order(REF_A, "confirmed")]);
    renderPage(api);
    const panel = await openOrder(REF_A);
    await within(panel).findByText("Salmon kibble");
    const terms = within(panel)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(terms).toContain("Delivery fee");
    expect(terms).not.toContain("Pet House delivery");
    expect(panel.textContent).not.toContain("made to order");
  });

  it("Change delivery time: the order's own list of times, a confirmation naming both times, then the version and the window", async () => {
    const moved: AdminOrder = { ...houseOrder(REF_A), version: 4, window: { date: "2026-11-20", start: "10:00", end: "12:00" } };
    const { api, gets, posts } = stubApi([houseOrder(REF_A)], () => moved, { windows: laterWindows });
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Change delivery time" }));
    const dialog = await screen.findByRole("dialog", { name: `Change the delivery time of order ${REF_A}` });
    // A Pet House order is offered times further ahead: its own list, not the checkout's.
    expect(dialog.textContent).toContain("This order has a Pet House");
    expect(dialog.textContent).toContain("Wednesday 28 Oct, 16:00–18:00");
    expect(gets).toContain(`/admin/orders/${REF_A}/delivery-windows`);
    // Nothing chosen yet: it says so and sends nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Change delivery time" }));
    expect(await within(dialog).findByText("Choose the new delivery time.")).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("button", { name: "10:00–12:00 3 left" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Change delivery time" }));
    let confirm = await screen.findByRole("dialog", { name: `Move order ${REF_A} to Friday 20 Nov, 10:00–12:00?` });
    expect(confirm.textContent).toContain("It is now due Wednesday 28 Oct, 16:00–18:00.");
    expect(confirm.textContent).toContain("The customer gets an email with the new time");
    // Cancel sends nothing.
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Move order/ })).toBeNull());
    expect(posts).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Change delivery time" }));
    confirm = await screen.findByRole("dialog", { name: /Move order/ });
    fireEvent.click(within(confirm).getByRole("button", { name: "Change delivery time" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/admin/orders/${REF_A}/delivery-time`, body: { version: 3, windowId: LATER } }]));
    expect(await within(panel).findByText(`Order ${REF_A} is now due Friday 20 Nov, 10:00–12:00. The customer gets an email.`)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a time taken meanwhile is reported and the times reload", async () => {
    const { api, gets } = stubApi(
      [houseOrder(REF_A)],
      () => {
        throw new ApiError("SLOT_UNAVAILABLE", "That delivery time is no longer available.", 409);
      },
      { windows: laterWindows },
    );
    renderPage(api);
    const panel = await openOrder(REF_A);
    fireEvent.click(await within(panel).findByRole("button", { name: "Change delivery time" }));
    const dialog = await screen.findByRole("dialog", { name: `Change the delivery time of order ${REF_A}` });
    fireEvent.click(await within(dialog).findByRole("button", { name: "10:00–12:00 3 left" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Change delivery time" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: /Move order/ })).getByRole("button", { name: "Change delivery time" }));
    expect(await within(dialog).findByText("That delivery time has just filled up or closed. Choose another.")).toBeTruthy();
    await waitFor(() => expect(gets.filter((path) => path.endsWith("/delivery-windows")).length).toBeGreaterThan(1));
  });

  it("no Change delivery time for pickups, orders already out, or roles that cannot edit", async () => {
    const { api } = stubApi([houseOrder(REF_A, "out_for_delivery"), order(REF_B, "confirmed", "pickup")]);
    renderPage(api);
    let panel = await openOrder(REF_A);
    await within(panel).findByText("Terracotta Roof Cat Villa");
    expect(within(panel).queryByRole("button", { name: "Change delivery time" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Close order details" }));
    panel = await openOrder(REF_B);
    await within(panel).findByText("Salmon kibble");
    expect(within(panel).queryByRole("button", { name: "Change delivery time" })).toBeNull();
    cleanup();

    renderPage(stubApi([houseOrder(REF_A)]).api, viewOnly);
    panel = await openOrder(REF_A);
    await within(panel).findByText("Terracotta Roof Cat Villa");
    expect(within(panel).queryByRole("button", { name: "Change delivery time" })).toBeNull();
  });

  it("the day views mark an order with a Pet House, so the team knows a big item is coming", async () => {
    linked = new URLSearchParams({ date: "2026-10-28" });
    const { api } = dayApi([houseOrder(REF_A), inWindow(REF_B, "confirmed", "16:00", "18:00", "2026-10-28")]);
    renderPage(api);
    await screen.findByRole("table", { name: "Delivery windows on this day" });
    const money = (minor: number) => formatMoney(minor, "en");
    expect(listLines("Orders at 16:00–18:00")).toEqual([
      [REF_A, "Mariam Test", "+974 3333 7777", "West Bay", "1Pet House", money(305700), "Confirmed"],
      [REF_B, "Mariam Test", "+974 3333 7777", "West Bay", "2", money(9500), "Confirmed"],
    ]);
  });
});
