import {
  type FinanceDetail,
  type FinanceOverview,
  type FinancePaymentList,
  type FinanceRefundList,
  type FinanceTransactionList,
  normalisePermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { FinanceOverviewPage } from "@/features/admin/finance/pages/FinanceOverviewPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { financeListSearch, emptyFinanceFilters, qarToMinor } from "@/shared/api/admin-finance";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { formatMoney, formatSignedMoney } from "@/shared/lib/format";
import { SettingsProviders } from "./helpers/settings";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
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
  vi.unstubAllGlobals();
});

const view = { view: true, edit: false, delete: false, export: false, refund: false };
const viewExport = { view: true, edit: false, delete: false, export: true, refund: false };

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Fatima", isOwner: false, mustChangePassword: false, roleName: "Finance", permissions };
}

const overview: FinanceOverview = {
  from: "2026-09-01",
  to: "2026-09-30",
  grouping: "day",
  paid: { amount: 185_200, count: 11 },
  refunds: { amount: 15_000, count: 3 },
  net: 170_200,
  toRefund: { amount: 9000, count: 3 },
  sales: { count: 10, items: 169_000, discount: 1800, deliveryFees: 8500, visitFees: 2000, total: 177_700 },
  otherPayments: { amount: 7500, count: 1 },
  outside: { paid: { amount: 0, count: 0 }, refunded: { amount: 0, count: 0 } },
  byType: [
    { type: "products", paid: 40_000, refunds: 9000, net: 31_000 },
    { type: "houses", paid: 125_000, refunds: 0, net: 125_000 },
    { type: "grooming", paid: 20_200, refunds: 6000, net: 14_200 },
  ],
  promotions: [{ name: { en: "Food 10", ar: "طعام ١٠" }, code: null, uses: 1, discount: 1000 }],
  series: [
    { start: "2026-09-08", paid: 21_700, refunds: 0, net: 21_700 },
    { start: "2026-09-15", paid: 3000, refunds: 7500, net: -4500 },
  ],
};

const transactions: FinanceTransactionList = {
  rows: [
    {
      kind: "order",
      reference: "NC-260909-FA0003",
      type: "products",
      paidAt: "2026-09-09T09:00:00.000Z",
      customerName: "Huda Duplicate",
      paid: 15_000,
      refunded: 7500,
      status: "partly_refunded",
      provider: "skipcash",
      payments: 2,
    },
    {
      kind: "booking",
      reference: "GB-260908-FB0001",
      type: "grooming",
      paidAt: "2026-09-08T07:00:00.000Z",
      customerName: "Aisha Groom",
      paid: 9200,
      refunded: 0,
      status: "paid",
      provider: "skipcash",
      payments: 1,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  sum: 24_200,
};

const payments: FinancePaymentList = {
  rows: [
    {
      reference: "FIN-P3B",
      provider: "skipcash",
      providerPaymentId: "sc-fin-p3b",
      source: { kind: "order", reference: "NC-260909-FA0003" },
      type: "products",
      customerName: "Huda Duplicate",
      amount: 7500,
      refunded: 7500,
      succeededAt: "2026-09-09T09:05:00.000Z",
      extra: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  sum: 7500,
};

const refunds: FinanceRefundList = {
  rows: [
    {
      id: "01a133ec-cc45-73cc-b0a8-fa2e355749ab",
      paymentReference: "FIN-P6",
      providerRefundId: "sc-r6",
      manualReference: null,
      source: { kind: "order", reference: "NC-260910-FA0006" },
      type: "products",
      customerName: "Cancelled Paid",
      amount: 5500,
      method: "api",
      status: "processing",
      reason: "Cancelled",
      requestedAt: "2026-09-10T08:05:00.000Z",
      requestedBy: "Owner",
      completedAt: null,
      completedBy: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  sum: 5500,
};

function detail(overrides: Partial<FinanceDetail> = {}): FinanceDetail {
  return {
    kind: "order",
    reference: "NC-260909-FA0003",
    type: "products",
    status: "preparing",
    placedAt: "2026-09-09T08:55:00.000Z",
    customer: { name: "Huda Duplicate", recordId: null },
    fulfilment: "delivery",
    lines: [{ name: { en: "Cat food", ar: "طعام قطط" }, label: { en: "2 kg", ar: "٢ كغ" }, quantity: 1, unitPrice: 6000, discount: 0, total: 6000 }],
    booking: null,
    breakdown: { items: 6000, discount: 0, deliveryFee: 1500, visitFee: 0, total: 7500 },
    promotions: [],
    payments: [
      { reference: "FIN-P3A", provider: "skipcash", providerPaymentId: "sc-fin-p3a", amount: 7500, refunded: 0, succeededAt: "2026-09-09T09:00:00.000Z" },
      { reference: "FIN-P3B", provider: "skipcash", providerPaymentId: "sc-fin-p3b", amount: 7500, refunded: 7500, succeededAt: "2026-09-09T09:05:00.000Z" },
    ],
    refunds: [
      {
        id: "01a133ec-cc45-73cc-b0a8-fa2e355749ac",
        paymentReference: "FIN-P3B",
        providerRefundId: "sc-r3",
        manualReference: null,
        amount: 7500,
        method: "api",
        status: "completed",
        reason: "Paid twice",
        requestedAt: "2026-09-10T05:55:00.000Z",
        requestedBy: "Owner",
        completedAt: "2026-09-10T06:00:00.000Z",
        completedBy: null,
      },
    ],
    paid: 15_000,
    refunded: 7500,
    toRefund: 0,
    refundNeeded: false,
    attention: null,
    ...overrides,
  };
}

function stubApi(options: { detail?: FinanceDetail; overview?: FinanceOverview } = {}) {
  const gets: string[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.startsWith("/admin/finance/overview?")) return schema.parse(options.overview ?? overview) as never;
      if (path.startsWith("/admin/finance/transactions?")) return schema.parse(transactions) as never;
      if (path.startsWith("/admin/finance/payments?")) return schema.parse(payments) as never;
      if (path.startsWith("/admin/finance/refunds?")) return schema.parse(refunds) as never;
      if (path.startsWith("/admin/finance/transactions/")) return schema.parse(options.detail ?? detail()) as never;
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

function renderFinance(api: ApiClient, permissions: Partial<PermissionMap> = { finance: view }, locale: "en" | "ar" = "en") {
  return render(
    <SettingsProviders api={api} locale={locale}>
      <StaffIdentityProvider demoRole="finance">
        <AdminAccessProvider staff={staff(normalisePermissions(permissions))}>
          <DashboardDateProvider>
            <FinanceOverviewPage />
          </DashboardDateProvider>
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

/** Money as the page shows it after the test library's normalising (a non-breaking space becomes a space). */
const qar = (minor: number, locale: "en" | "ar" = "en") => formatMoney(minor, locale).replace(/\s+/g, " ");
const signedQar = (minor: number) => formatSignedMoney(minor, "en").replace(/\s+/g, " ");

/** The first render loads the whole page, which can take more than the default second on a busy machine. */
const slow = { timeout: 5000 };

const last = (gets: string[], prefix: string) => [...gets].reverse().find((path) => path.startsWith(prefix)) ?? "";

describe("the real Finance page", () => {


  it("shows the month's online sales from the server, with To refund instead of Outstanding", async () => {
    const { api, gets } = stubApi();
    renderFinance(api);
    expect(await screen.findByText(qar(170_200), {}, slow)).toBeTruthy();
    const cards = within(document.querySelector(".finance-metrics") as HTMLElement);
    expect(cards.getByText("Online sales")).toBeTruthy();
    expect(cards.getByText("To refund")).toBeTruthy();
    expect(screen.getByText(qar(9000))).toBeTruthy();
    expect(screen.getByText("Owed back now on 3 orders, bookings or relocation requests")).toBeTruthy();
    expect(screen.queryByText("Outstanding")).toBeNull();
    expect(screen.queryByText(/Demo data|synthetic/i)).toBeNull();
    // The month of the dashboard date (10 September), Qatar days, grouped by day.
    expect(gets).toContain("/admin/finance/overview?from=2026-09-01&to=2026-09-30&grouping=day");
    // Where the money came from: sales, other payments and promotions.
    expect(screen.getByText("Other payments (1: paid twice or late)")).toBeTruthy();
    expect(screen.getByText(/Food 10/)).toBeTruthy();
  });

  it("shows what was paid and refunded outside the website apart from online sales (15d)", async () => {
    const { api } = stubApi({ overview: { ...overview, outside: { paid: { amount: 150_000, count: 1 }, refunded: { amount: 50_000, count: 1 } } } });
    renderFinance(api);
    expect(await screen.findByText("Paid outside the website (relocation, 1)", {}, slow)).toBeTruthy();
    const lines = within(document.querySelector(".finance-outside") as HTMLElement);
    expect(lines.getByText("Paid outside the website (relocation, 1)")).toBeTruthy();
    expect(lines.getByText(qar(150_000))).toBeTruthy();
    expect(lines.getByText("Refunded outside the website (1)")).toBeTruthy();
    expect(lines.getByText(/Not included in online sales or any figure above/)).toBeTruthy();
    // The online figures are unchanged by it.
    expect(within(document.querySelector(".finance-metrics") as HTMLElement).getByText(qar(170_200))).toBeTruthy();
  });

  it("shows no outside-the-website lines when there are none", async () => {
    renderFinance(stubApi().api);
    expect(await screen.findByText(qar(170_200), {}, slow)).toBeTruthy();
    expect(document.querySelector(".finance-outside")).toBeNull();
  });

  it("shows a net below zero instead of failing", async () => {
    const { api } = stubApi({ overview: { ...overview, net: -4500 } });
    renderFinance(api);
    expect(await screen.findByText(signedQar(-4500), {}, slow)).toBeTruthy();
    expect(formatSignedMoney(-4500, "en")).toMatch(/^−QAR/);
  });

  it("lists transactions, then each tab asks the server with its own filters", async () => {
    const { api, gets } = stubApi();
    renderFinance(api);
    const table = await screen.findByRole("table", {}, slow);
    expect(await within(table).findByText("Partly refunded", {}, slow)).toBeTruthy();
    expect(within(table).getByText("2 payments")).toBeTruthy();
    expect(last(gets, "/admin/finance/transactions?")).toBe(
      "/admin/finance/transactions?from=2026-09-01&to=2026-09-30&sort=date&order=desc&page=1&pageSize=25",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(await screen.findByText("sc-fin-p3b")).toBeTruthy();
    expect(screen.getByText("Another payment")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Payment company"), { target: { value: "skipcash" } });
    await waitFor(() => expect(last(gets, "/admin/finance/payments?")).toContain("provider=skipcash"));

    fireEvent.click(screen.getByRole("tab", { name: "Refunds" }));
    expect(await screen.findByText("sc-r6")).toBeTruthy();
    // The payments tab's company filter is not sent to refunds.
    expect(last(gets, "/admin/finance/refunds?")).not.toContain("provider");
    fireEvent.change(screen.getByLabelText("Refund status"), { target: { value: "in_progress" } });
    await waitFor(() => expect(last(gets, "/admin/finance/refunds?")).toContain("status=in_progress"));
  });

  it("sends the search, the amounts in dirhams and the sort to the server; a wrong range asks nothing", async () => {
    const { api, gets } = stubApi();
    renderFinance(api);
    await screen.findByText("Huda Duplicate", {}, slow);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "huda" } });
    await waitFor(() => expect(last(gets, "/admin/finance/transactions?")).toContain("q=huda"));
    fireEvent.click(screen.getByRole("button", { name: "More Filters" }));
    fireEvent.change(screen.getByLabelText("Minimum amount (QAR)"), { target: { value: "100.5" } });
    await waitFor(() => expect(last(gets, "/admin/finance/transactions?")).toContain("min=10050"));
    fireEvent.click(screen.getByRole("button", { name: /^Amount/ }));
    await waitFor(() => expect(last(gets, "/admin/finance/transactions?")).toContain("sort=amount&order=desc"));
    const before = gets.length;
    fireEvent.change(screen.getByLabelText("Maximum amount (QAR)"), { target: { value: "50" } });
    expect(await screen.findByText("Minimum amount must not exceed maximum amount.")).toBeTruthy();
    expect(gets.slice(before).some((path) => path.includes("max=5000"))).toBe(false);
  });

  it("refuses a custom period longer than a year before asking the server", async () => {
    const { api, gets } = stubApi();
    renderFinance(api);
    await screen.findByText(qar(170_200), {}, slow);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date (Qatar)"), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByLabelText("To date (Qatar)"), { target: { value: "2026-09-10" } });
    expect(await screen.findByText("Choose at most 366 days.")).toBeTruthy();
    expect(gets.some((path) => path.includes("from=2025-01-01"))).toBe(false);
  });

  it("opens a transaction: the payment company's ids, no contact details, links only where the role may go", async () => {
    const { api, gets } = stubApi();
    renderFinance(api);
    fireEvent.click(await screen.findByRole("button", { name: "Open transaction NC-260909-FA0003" }, slow));
    const panel = await screen.findByRole("complementary", { name: "Order NC-260909-FA0003" });
    expect(await within(panel).findByText("sc-fin-p3a")).toBeTruthy();
    expect(within(panel).getByText("sc-r3")).toBeTruthy();
    expect(within(panel).getByText("Contact details are not shown in Finance.")).toBeTruthy();
    expect(within(panel).queryByText("View customer")).toBeNull();
    // Finance alone may not open the order page.
    expect(within(panel).queryByText("View order")).toBeNull();
    expect(gets).toContain("/admin/finance/transactions/order/NC-260909-FA0003");
  });

  it("links the customer record and the order for roles that may view them", async () => {
    const { api } = stubApi({ detail: detail({ customer: { name: "Huda Duplicate", recordId: "01a133ec-cc45-73cc-b0a8-fa2e355749ad" } }) });
    renderFinance(api, { finance: view, customers: view, orders: view });
    fireEvent.click(await screen.findByRole("button", { name: "Open transaction NC-260909-FA0003" }, slow));
    const panel = await screen.findByRole("complementary", { name: "Order NC-260909-FA0003" });
    expect((await within(panel).findByText("View customer")).closest("a")?.getAttribute("href")).toBe("/admin/customers?search=Huda%20Duplicate");
    expect(within(panel).getByText("View order").closest("a")?.getAttribute("href")).toBe("/admin/orders?search=NC-260909-FA0003");
  });

  it("links a relocation payment to its request, only for roles with Relocation view (15d)", async () => {
    const relocation = detail({ kind: "relocation", reference: "RL-260909-ABCDEF", type: "relocation", status: "paid", fulfilment: null });
    renderFinance(stubApi({ detail: relocation }).api, { finance: view, relocation: view });
    fireEvent.click(await screen.findByRole("button", { name: "Open transaction NC-260909-FA0003" }, slow));
    const panel = await screen.findByRole("complementary", { name: "Order NC-260909-FA0003" });
    const links = await within(panel).findAllByRole("link", { name: "View request" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/admin/relocation?search=RL-260909-ABCDEF", "/admin/relocation?search=RL-260909-ABCDEF"]);
    cleanup();

    renderFinance(stubApi({ detail: relocation }).api, { finance: view });
    fireEvent.click(await screen.findByRole("button", { name: "Open transaction NC-260909-FA0003" }, slow));
    const unlinked = await screen.findByRole("complementary", { name: "Order NC-260909-FA0003" });
    expect(await within(unlinked).findByText("RL-260909-ABCDEF")).toBeTruthy();
    expect(within(unlinked).queryByRole("link", { name: "View request" })).toBeNull();
  });

  it("offers the CSV only with Export, for the tab and its filters", async () => {
    const { api } = stubApi();
    renderFinance(api);
    await screen.findByText("Huda Duplicate", {}, slow);
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
    cleanup();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("csv", { status: 200, headers: { "content-disposition": 'attachment; filename="finance-transactions-2026-09-10.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:finance");
    URL.revokeObjectURL = vi.fn();
    renderFinance(stubApi().api, { finance: viewExport });
    fireEvent.click(await screen.findByRole("button", { name: "Download CSV" }, slow));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/finance/transactions/export.csv?from=2026-09-01&to=2026-09-30&sort=date&order=desc");
  });

  it("reads in Arabic", async () => {
    const { api } = stubApi();
    renderFinance(api, { finance: view }, "ar");
    expect(await screen.findByText(qar(170_200, "ar"), {}, slow)).toBeTruthy();
    const cards = within(document.querySelector(".finance-metrics") as HTMLElement);
    expect(cards.getByText("مبيعات الموقع")).toBeTruthy();
    expect(cards.getByText("للاسترداد")).toBeTruthy();
  });
});

describe("finance filters as a query", () => {
  it("sends only the tab's own filters, amounts in dirhams", () => {
    const filters = { ...emptyFinanceFilters(), q: " huda ", type: "grooming" as const, status: "completed", provider: "skipcash" as const, method: "manual" as const, min: "12.34", max: "" };
    const period = { from: "2026-09-01", to: "2026-09-30" };
    expect(financeListSearch("transactions", period, filters)).toBe(
      "from=2026-09-01&to=2026-09-30&q=huda&type=grooming&status=completed&min=1234&sort=date&order=desc&page=1&pageSize=25",
    );
    expect(financeListSearch("payments", period, filters, { paged: false })).toBe(
      "from=2026-09-01&to=2026-09-30&q=huda&type=grooming&provider=skipcash&min=1234&sort=date&order=desc",
    );
    expect(financeListSearch("refunds", period, filters)).toContain("status=completed&method=manual");
    expect(qarToMinor("")).toBeUndefined();
    expect(qarToMinor("-1")).toBeUndefined();
    expect(qarToMinor("abc")).toBeUndefined();
    expect(qarToMinor("0.1")).toBe(10);
  });
});
