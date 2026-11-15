// 10d: the staff Customers page in API mode (plan BRANCH_10 section 5): the cards, account or guest,
// search, filters, sort and pages; a record's tabs; notes (a delete asks first, D128); a customer's tags
// (version-checked) and the owner's tag list (a delete asks first and says how many customers lose the
// tag); the CSV for Export only; a link from another page opens the record once; no sample-data banner.
import {
  type AdminCrmTag,
  type AdminCustomer,
  type AdminCustomerSummary,
  normalisePermissions,
  type PermissionMap,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCustomersPage } from "@/features/admin/customers/pages/AdminCustomersPage";
import { SAMPLE_DATA_PAGES } from "@/layouts/admin/navigation";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { adminCustomerSearch, emptyAdminCustomerFilters } from "@/shared/api/admin-customers";
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

const everything = { view: true, edit: true, delete: true, export: true, refund: false };
const editor = { view: true, edit: true, delete: false, export: false, refund: false };
const viewOnly = { view: true, edit: false, delete: false, export: false, refund: false };

const uuid = (n: number) => `0197a000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const MARIAM = uuid(1);
const NAMELESS = uuid(2);
const NOTE = uuid(3);
const PET = uuid(4);
const VIP: AdminCrmTag = { id: uuid(10), name: { en: "VIP", ar: "مميز" }, colour: "amber", sortOrder: 0, customers: 3, version: 1 };
const LATE: AdminCrmTag = { id: uuid(11), name: { en: "Late payer", ar: "متأخر" }, colour: "red", sortOrder: 0, customers: 0, version: 2 };

function record(overrides: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    id: MARIAM,
    email: "mariam@example.invalid",
    name: "Mariam Test",
    phone: "+974 3333 7777",
    account: "confirmed",
    firstSeenAt: "2026-09-01T08:00:00.000Z",
    lastActivityAt: "2026-10-12T08:00:00.000Z",
    orders: 2,
    bookings: 1,
    relocations: 1,
    totalPaid: 12_000,
    tags: [{ id: VIP.id, name: VIP.name, colour: "amber", appliedAt: "2026-10-12T09:00:00.000Z", appliedBy: "Sara" }],
    accountDetails: {
      registeredAt: "2026-09-01T08:00:00.000Z",
      confirmedAt: "2026-09-01T08:05:00.000Z",
      lastLoginAt: "2026-10-12T07:55:00.000Z",
      profile: { name: "Mariam Test", phone: "+974 3333 7777" },
    },
    savedAddresses: [
      {
        id: uuid(5),
        label: "Home",
        area: { id: uuid(6), name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: uuid(7), city: { en: "Doha", ar: "الدوحة" } },
        address: { zone: "66", street: "850", building: "12", floor: "3", flat: "4", landmark: "", note: "", pin: null },
        isDefault: true,
        delivery: true,
        homeVisits: true,
        version: 1,
      },
    ],
    savedPets: [
      {
        id: PET,
        name: "Luna",
        petType: { slug: "cats", name: { en: "Cats", ar: "قطط" } },
        breed: "Persian",
        bornMonth: "2024-08",
        weightGrams: 4200,
        notes: "Nervous of dryers",
        version: 1,
      },
    ],
    petsSeen: [
      { pet: { group: { en: "Adult cat", ar: "قطة بالغة" }, breed: "Persian" }, ageMonths: 26, lastAppointmentAt: "2026-10-13T07:00:00.000Z", bookings: 2, savedPetId: PET },
      { pet: { group: { en: "Kitten", ar: "قطة صغيرة" }, breed: "" }, ageMonths: 5, lastAppointmentAt: "2026-09-20T07:00:00.000Z", bookings: 1, savedPetId: null },
    ],
    recentOrders: [
      {
        reference: "NC-261012-4F7KQ2",
        status: "confirmed",
        fulfilment: "delivery",
        placedAt: "2026-10-12T08:00:00.000Z",
        contactName: "Mariam Test",
        contactPhone: "+974 3333 7777",
        area: { en: "West Bay", ar: "الخليج الغربي" },
        window: { date: "2026-10-13", start: "09:00", end: "12:00" },
        itemCount: 2,
        hasHouse: false,
        total: 4_000,
        refundNeeded: false,
        attention: null,
      },
    ],
    recentBookings: [
      {
        reference: "GB-261012-ABCDEF",
        status: "confirmed",
        location: "shop",
        placedAt: "2026-10-11T08:00:00.000Z",
        contactName: "Mariam Test",
        contactPhone: "+974 3333 7777",
        package: { group: { en: "Adult cat", ar: "قطة بالغة" }, name: { en: "Basic", ar: "أساسي" } },
        pet: { group: { en: "Adult cat", ar: "قطة بالغة" }, breed: "Persian" },
        appointment: { date: "2026-10-13", start: "10:00", end: "11:00", startsAt: "2026-10-13T07:00:00.000Z" },
        area: null,
        total: 8_000,
        refundNeeded: false,
        attention: null,
      },
    ],
    recentRelocations: [
      {
        reference: "RL-261020-ABCDEF",
        status: "quote_requested",
        placedAt: "2026-10-20T08:00:00.000Z",
        updatedAt: "2026-10-21T08:00:00.000Z",
        contactName: "Mariam Test",
        contactPhone: "+974 3333 7777",
        pets: ["Milo", "Luna"],
        destination: { en: "Philippines", ar: "الفلبين" },
        plannedDate: "2026-12-15",
        quote: 125_000,
        documentsToReview: 0,
        documentsMissing: 0,
        paidOutside: false,
        refundNeeded: false,
        attention: null,
      },
    ],
    notes: [{ id: NOTE, text: "Prefers mornings", staffName: "Sara", createdAt: "2026-10-12T10:00:00.000Z" }],
    version: 3,
    ...overrides,
  };
}

/** A guest who gave no name or phone: shown by the email. */
const nameless = record({
  id: NAMELESS,
  email: "no.name@example.invalid",
  name: null,
  phone: null,
  account: "none",
  accountDetails: null,
  savedAddresses: [],
  savedPets: [],
  petsSeen: [],
  recentOrders: [],
  recentBookings: [],
  recentRelocations: [],
  notes: [],
  tags: [],
  orders: 0,
  bookings: 0,
  relocations: 0,
  totalPaid: 0,
});

const summary = (row: AdminCustomer): AdminCustomerSummary => ({
  id: row.id,
  email: row.email,
  name: row.name,
  phone: row.phone,
  account: row.account,
  firstSeenAt: row.firstSeenAt,
  lastActivityAt: row.lastActivityAt,
  orders: row.orders,
  bookings: row.bookings,
  relocations: row.relocations,
  totalPaid: row.totalPaid,
  tags: row.tags.map(({ id, name, colour }) => ({ id, name, colour })),
});

type Change = { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown };

function stubApi(records: AdminCustomer[], answer: (change: Change) => unknown = () => ({ status: "ok" })) {
  const gets: string[] = [];
  const changes: Change[] = [];
  const send = (change: Change) => {
    changes.push(change);
    return answer(change);
  };
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path === "/admin/customer-tags") return schema.parse({ tags: [VIP, LATE] }) as never;
      if (path.startsWith("/admin/customers?")) {
        const q = (new URLSearchParams(path.split("?")[1]).get("q") ?? "").toLowerCase();
        const rows = records.filter((row) => !q || row.email.includes(q) || (row.name ?? "").toLowerCase().includes(q));
        return schema.parse({
          customers: rows.map(summary),
          total: rows.length,
          page: 1,
          pageSize: 25,
          counts: { all: 12, accounts: 5, guests: 7, newThisMonth: 4 },
        }) as never;
      }
      const found = records.find((row) => path === `/admin/customers/${row.id}`);
      if (!found) throw new ApiError("NOT_FOUND", "This customer does not exist.", 404);
      return schema.parse(found) as never;
    },
    post: async (path, body, schema) => schema.parse(send({ method: "POST", path, body })) as never,
    put: async (path, body, schema) => schema.parse(send({ method: "PUT", path, body })) as never,
    delete: async (path, schema) => schema.parse(send({ method: "DELETE", path })) as never,
  };
  return { api, gets, changes };
}

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Front desk", permissions };
}

function page(api: ApiClient, customers = everything, others: Partial<PermissionMap> = {}) {
  return (
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ customers, ...others }))}>
          <AdminCustomersPage />
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>
  );
}

function renderPage(api: ApiClient, customers = everything, others: Partial<PermissionMap> = {}) {
  return render(page(api, customers, others));
}

async function openCustomer(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: `View customer ${label}` }));
  const panel = await screen.findByRole("complementary", { name: label });
  // The record arrives after the panel opens.
  await within(panel).findByRole("tab", { name: "Overview" });
  return panel;
}

describe("admin customers (API mode)", () => {
  it("lists real customers with the cards and account or guest; no sample-data banner and no Add Customer", async () => {
    const { api, gets } = stubApi([record(), nameless]);
    renderPage(api);
    expect(await screen.findByRole("button", { name: "Mariam Test" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "no.name@example.invalid" })).toBeTruthy();
    expect(screen.getByText("All customers").parentElement?.textContent).toBe("All customers12");
    expect(screen.getByText("With an account").parentElement?.textContent).toBe("With an account5");
    expect(screen.getByText("New this month").parentElement?.textContent).toBe("New this month4");
    const mariam = screen.getByRole("button", { name: "Mariam Test" }).closest("tr") as HTMLElement;
    expect(within(mariam).getByText("VIP")).toBeTruthy();
    expect(within(mariam).getByText("Account")).toBeTruthy();
    expect(mariam.textContent).toContain("120.00");
    const guest = screen.getByRole("button", { name: "no.name@example.invalid" }).closest("tr") as HTMLElement;
    expect(within(guest).getByText("Guest")).toBeTruthy();
    expect(SAMPLE_DATA_PAGES.customers).toBeUndefined();
    expect(screen.queryByRole("button", { name: /Add Customer/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Download CSV/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guests (7)" }));
    await waitFor(() => expect(gets.at(-1)).toContain("kind=guest"));
    expect(screen.getByRole("button", { name: "Guests (7)", pressed: true })).toBeTruthy();
  });

  it("searches after typing stops and sends the filters and sort to the API", async () => {
    const { api, gets } = stubApi([record()]);
    renderPage(api);
    await screen.findByRole("button", { name: "Mariam Test" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search by name, email or phone" }), { target: { value: "33337777" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=33337777"))).toBe(true));
    const tag = screen.getByRole("combobox", { name: "Tag" });
    await within(tag).findByRole("option", { name: "VIP" });
    fireEvent.change(tag, { target: { value: VIP.id } });
    await waitFor(() => expect(gets.at(-1)).toContain(`tag=${VIP.id}`));
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "orders" } });
    await waitFor(() => expect(gets.at(-1)).toContain("has=orders"));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "spend" } });
    await waitFor(() => expect(gets.at(-1)).toContain("sort=spend"));
    fireEvent.change(screen.getByLabelText("Last active from"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(gets.at(-1)).toContain("from=2026-10-01"));
  });

  it("the list and CSV query strings", () => {
    expect(
      adminCustomerSearch(
        { ...emptyAdminCustomerFilters("Mariam"), kind: "account", tag: VIP.id, has: "bookings", from: "2026-10-01", to: "2026-10-12", sort: "name" },
        { paged: false },
      ),
    ).toBe(`q=Mariam&kind=account&tag=${VIP.id}&has=bookings&from=2026-10-01&to=2026-10-12&sort=name`);
    expect(adminCustomerSearch(emptyAdminCustomerFilters())).toBe("sort=activity&page=1&pageSize=25");
  });

  it("a record's tabs: the account and saved addresses, pets saved and seen, and orders and bookings linking to their pages", async () => {
    const pinned = record();
    pinned.savedAddresses = pinned.savedAddresses.map((saved) => ({ ...saved, address: { ...saved.address, pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } } }));
    const { api } = stubApi([pinned]);
    renderPage(api, viewOnly, { orders: viewOnly, bookings: viewOnly });
    const panel = await openCustomer("Mariam Test");
    const inPanel = within(panel);
    expect(inPanel.getByText("mariam@example.invalid")).toBeTruthy();
    // A saved address's point (D263).
    expect(inPanel.getByRole("link", { name: "Open in Google Maps (± 15 m)" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
    expect(inPanel.getByText("Email confirmed")).toBeTruthy();
    expect(inPanel.getByText("Last login")).toBeTruthy();
    expect(inPanel.getByText("Home")).toBeTruthy();
    expect(inPanel.getByText("Zone 66, Street 850, Building 12 · Floor 3 · Flat 4")).toBeTruthy();
    expect(inPanel.getByText("West Bay, Doha")).toBeTruthy();

    fireEvent.click(inPanel.getByRole("tab", { name: "Pets" }));
    expect(inPanel.getByRole("heading", { name: "Saved pets" })).toBeTruthy();
    expect(inPanel.getByText(/Cats · Persian/)).toBeTruthy();
    expect(inPanel.getByText(/Nervous of dryers/)).toBeTruthy();
    expect(inPanel.getByRole("heading", { name: "Pets seen in bookings" })).toBeTruthy();
    // Pets seen are named by their type and breed, with no name or weight (D246).
    expect(inPanel.getByText("Adult cat · Persian")).toBeTruthy();
    expect(inPanel.getByText("Kitten")).toBeTruthy();
    expect(inPanel.getByText(/2 bookings/)).toBeTruthy();
    expect(inPanel.getByText("Saved pet")).toBeTruthy();

    fireEvent.click(inPanel.getByRole("tab", { name: "Orders" }));
    expect(inPanel.getByRole("link", { name: "NC-261012-4F7KQ2" })).toHaveAttribute("href", "/admin/orders?search=NC-261012-4F7KQ2");
    fireEvent.click(inPanel.getByRole("tab", { name: "Bookings" }));
    expect(inPanel.getByRole("link", { name: "GB-261012-ABCDEF" })).toHaveAttribute("href", "/admin/bookings?search=GB-261012-ABCDEF");
    expect(inPanel.getByText(/Adult cat · Persian · Basic/)).toBeTruthy();
  });

  it("the Relocation tab (15d): the count on its card, the requests with their status and quote, linked only for Relocation view", async () => {
    const { api } = stubApi([record()]);
    renderPage(api, viewOnly, { relocation: viewOnly });
    const panel = await openCustomer("Mariam Test");
    const inPanel = within(panel);
    fireEvent.click(inPanel.getByRole("button", { name: /1\s*Relocation requests/ }));
    expect(inPanel.getByRole("tab", { name: "Relocation" })).toHaveAttribute("aria-selected", "true");
    expect(inPanel.getByRole("link", { name: "RL-261020-ABCDEF" })).toHaveAttribute("href", "/admin/relocation?search=RL-261020-ABCDEF");
    expect(inPanel.getByText("Quote sent, awaiting payment")).toBeTruthy();
    expect(inPanel.getByText(/Milo, Luna/)).toBeTruthy();
    cleanup();

    renderPage(stubApi([record()]).api, viewOnly);
    const unlinked = within(await openCustomer("Mariam Test"));
    fireEvent.click(unlinked.getByRole("tab", { name: "Relocation" }));
    expect(unlinked.getByText("RL-261020-ABCDEF")).toBeTruthy();
    expect(unlinked.queryByRole("link", { name: "RL-261020-ABCDEF" })).toBeNull();
  });

  it("without Orders or Bookings view, a record names its orders and bookings without links to pages that role cannot open", async () => {
    const { api } = stubApi([record()]);
    renderPage(api, viewOnly);
    const panel = await openCustomer("Mariam Test");
    fireEvent.click(within(panel).getByRole("tab", { name: "Orders" }));
    expect(within(panel).getByText("NC-261012-4F7KQ2")).toBeTruthy();
    expect(within(panel).queryByRole("link", { name: "NC-261012-4F7KQ2" })).toBeNull();
  });

  it("a Pet House order is marked on the record, as on the Orders page (#14)", async () => {
    const base = record();
    const [plain] = base.recentOrders;
    if (!plain) throw new Error("the record has an order");
    const house = { ...plain, reference: "NC-261012-HMS7K2", itemCount: 1, hasHouse: true };
    const { api } = stubApi([record({ recentOrders: [house, plain] })]);
    renderPage(api, viewOnly, { orders: viewOnly });
    const panel = await openCustomer("Mariam Test");
    fireEvent.click(within(panel).getByRole("tab", { name: "Orders" }));
    const line = (reference: string) => within(panel).getByRole("link", { name: reference }).closest("li")?.textContent;
    expect(line("NC-261012-HMS7K2")).toContain("Pet House");
    expect(line("NC-261012-4F7KQ2")).not.toContain("Pet House");
  });

  it("a record without a name or phone is shown by its email, as a guest", async () => {
    const { api } = stubApi([nameless]);
    renderPage(api);
    const panel = await openCustomer("no.name@example.invalid");
    expect(within(panel).getByRole("heading", { name: "no.name@example.invalid", level: 2 })).toBeTruthy();
    expect(within(panel).getByText(/No account: a guest who ordered or booked with this email/)).toBeTruthy();
    expect(within(panel).getByText("Guest")).toBeTruthy();
  });

  it("notes: Create/Edit adds one; Delete asks first and sends nothing before the button", async () => {
    const added = { id: uuid(20), text: "Call before delivery", staffName: "Sara", createdAt: "2026-10-13T08:00:00.000Z" };
    const { api, changes } = stubApi([record()], (change) => (change.method === "POST" ? added : { status: "ok" }));
    renderPage(api);
    const panel = await openCustomer("Mariam Test");
    fireEvent.click(within(panel).getByRole("tab", { name: "Notes" }));
    expect(within(panel).getByText("Prefers mornings")).toBeTruthy();
    fireEvent.change(within(panel).getByRole("textbox", { name: "New note" }), { target: { value: "  Call before delivery " } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(changes).toEqual([{ method: "POST", path: `/admin/customers/${MARIAM}/notes`, body: { text: "Call before delivery" } }]));

    fireEvent.click(within(panel).getByRole("button", { name: /^Delete note by Sara/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this note?" });
    expect(dialog.textContent).toContain("cannot be brought back");
    expect(changes).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(changes.at(-1)).toEqual({ method: "DELETE", path: `/admin/customers/${MARIAM}/notes/${NOTE}` }));
  });

  it("View only reads notes and tags but cannot add, delete or change them", async () => {
    const { api } = stubApi([record()]);
    renderPage(api, viewOnly);
    expect(await screen.findByRole("button", { name: "Mariam Test" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manage tags" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Download CSV/ })).toBeNull();
    const panel = await openCustomer("Mariam Test");
    expect(within(panel).getByText("VIP")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Edit tags" })).toBeNull();
    fireEvent.click(within(panel).getByRole("tab", { name: "Notes" }));
    expect(within(panel).getByText("Prefers mornings")).toBeTruthy();
    expect(within(panel).queryByRole("textbox", { name: "New note" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /^Delete note/ })).toBeNull();
  });

  it("tags on a customer: the whole set with the version; a change by someone else in between says so and reloads", async () => {
    let refuse = true;
    const { api, gets, changes } = stubApi([record()], () => {
      if (refuse) {
        refuse = false;
        throw new ApiError("CONFLICT", "Someone else changed this customer's tags.", 409);
      }
      return { tags: [], version: 4 };
    });
    renderPage(api, editor);
    const panel = await openCustomer("Mariam Test");
    fireEvent.click(within(panel).getByRole("button", { name: "Edit tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Tags for Mariam Test" });
    expect(within(dialog).getByRole("checkbox", { name: "VIP" })).toBeChecked();
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: "Late payer" }));
    expect(changes).toHaveLength(0);
    const detailReads = gets.filter((path) => path === `/admin/customers/${MARIAM}`).length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Save tags" }));
    expect(await within(dialog).findByText(/Someone else changed this a moment ago/)).toBeTruthy();
    expect(changes[0]).toEqual({ method: "PUT", path: `/admin/customers/${MARIAM}/tags`, body: { version: 3, tagIds: [VIP.id, LATE.id] } });
    await waitFor(() => expect(gets.filter((path) => path === `/admin/customers/${MARIAM}`).length).toBeGreaterThan(detailReads));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save tags" }));
    await waitFor(() => expect(changes).toHaveLength(2));
  });

  it("the owner's tag list: add and edit with the version; a delete asks first and says how many customers lose the tag", async () => {
    const gold = { id: uuid(12), name: { en: "Gold", ar: "ذهبي" }, colour: "green", sortOrder: 0, customers: 0, version: 1 };
    const { api, changes } = stubApi([record()], (change) =>
      change.method === "DELETE" ? { status: "ok" } : change.method === "POST" ? gold : { ...VIP, colour: "purple", version: 2 },
    );
    renderPage(api);
    fireEvent.click(await screen.findByRole("button", { name: "Manage tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Customer tags" });
    expect(await within(dialog).findByText("3 customers")).toBeTruthy();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "English name" }), { target: { value: "Gold" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Arabic name" }), { target: { value: "ذهبي" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Colour" }), { target: { value: "green" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add tag" }));
    await waitFor(() =>
      expect(changes).toEqual([{ method: "POST", path: "/admin/customer-tags", body: { name: { en: "Gold", ar: "ذهبي" }, colour: "green", sortOrder: 0 } }]),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit VIP" }));
    expect(within(dialog).getByRole("textbox", { name: "English name" })).toHaveValue("VIP");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Colour" }), { target: { value: "purple" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save tag" }));
    await waitFor(() =>
      expect(changes.at(-1)).toEqual({
        method: "PUT",
        path: `/admin/customer-tags/${VIP.id}`,
        body: { name: { en: "VIP", ar: "مميز" }, colour: "purple", sortOrder: 0, version: 1 },
      }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete VIP" }));
    const confirm = await screen.findByRole("dialog", { name: 'Delete the tag "VIP"?' });
    expect(confirm.textContent).toContain("It comes off 3 customers");
    expect(changes).toHaveLength(2);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete tag" }));
    await waitFor(() => expect(changes.at(-1)).toEqual({ method: "DELETE", path: `/admin/customer-tags/${VIP.id}` }));
  });

  it("the tag list says when a name is taken, and Create/Edit without Delete cannot delete tags", async () => {
    const { api } = stubApi([record()], () => {
      throw new ApiError("CONFLICT", "Another tag already has this name.", 409, { fields: [{ path: "name.en", message: "Another tag already has this name." }] });
    });
    renderPage(api, editor);
    fireEvent.click(await screen.findByRole("button", { name: "Manage tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Customer tags" });
    await within(dialog).findByText("3 customers");
    expect(within(dialog).queryByRole("button", { name: "Delete VIP" })).toBeNull();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "English name" }), { target: { value: "vip" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Arabic name" }), { target: { value: "آخر" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add tag" }));
    expect(await within(dialog).findByText("Another tag already has this name.")).toBeTruthy();
  });

  it("Download CSV sends the filters without pages and saves the file", async () => {
    const fetchMock = vi.fn(
      async () => new Response("﻿Name,Email\r\n", { status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="customers-2026-10-13.csv"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:customers");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { api } = stubApi([record()]);
    renderPage(api);
    await screen.findByRole("button", { name: "Mariam Test" });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/admin/customers/export.csv?sort=activity");
    click.mockRestore();
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
  });

  it("a link from another page (?search=email) fills the search and opens that customer, once", async () => {
    linked = new URLSearchParams("search=Mariam%40example.invalid");
    const { api, gets } = stubApi([record(), nameless]);
    renderPage(api);
    const panel = await screen.findByRole("complementary", { name: "Mariam Test" });
    expect(gets.find((path) => path.startsWith("/admin/customers?"))).toContain("q=Mariam%40example.invalid");
    fireEvent.click(within(panel).getByRole("button", { name: "Close customer details" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    // The list reads again (here: another sort) with the same search: the record stays closed.
    const reads = gets.length;
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "name" } });
    await waitFor(() => expect(gets.length).toBeGreaterThan(reads));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("a new link while the page is open (the header search) searches for it and opens that customer", async () => {
    linked = new URLSearchParams("search=example.invalid");
    const { api, gets } = stubApi([record(), nameless]);
    const view = renderPage(api);
    expect(await screen.findByRole("button", { name: "Mariam Test" })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
    linked = new URLSearchParams("search=no.name%40example.invalid");
    view.rerender(page(api));
    expect(await screen.findByRole("complementary", { name: "no.name@example.invalid" })).toBeTruthy();
    expect(gets.some((path) => path.includes("q=no.name%40example.invalid"))).toBe(true);
    expect(screen.getByRole("textbox", { name: "Search by name, email or phone" })).toHaveValue("no.name@example.invalid");
  });

  it("the same address again keeps what staff typed, even as a new but equal link", async () => {
    linked = new URLSearchParams("search=example.invalid");
    const { api, gets } = stubApi([record(), nameless]);
    const view = renderPage(api);
    await screen.findByRole("button", { name: "Mariam Test" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search by name, email or phone" }), { target: { value: "33337777" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=33337777"))).toBe(true));
    const before = gets.length;
    // Next's development router can hand the page a new, equal search-params object for the same address.
    linked = new URLSearchParams(linked.toString());
    view.rerender(page(api));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByRole("textbox", { name: "Search by name, email or phone" })).toHaveValue("33337777");
    expect(gets.slice(before).some((path) => path.includes("q=example.invalid"))).toBe(false);
  });

  it("a new link clears an earlier download's error, as a fresh visit would", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    linked = new URLSearchParams("search=example.invalid");
    const { api } = stubApi([record(), nameless]);
    const view = renderPage(api);
    await screen.findByRole("button", { name: "Mariam Test" });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    linked = new URLSearchParams("search=no.name%40example.invalid");
    view.rerender(page(api));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a search that is not one customer's email opens nothing", async () => {
    linked = new URLSearchParams("search=example.invalid");
    const { api } = stubApi([record(), nameless]);
    renderPage(api);
    expect(await screen.findByRole("button", { name: "Mariam Test" })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
