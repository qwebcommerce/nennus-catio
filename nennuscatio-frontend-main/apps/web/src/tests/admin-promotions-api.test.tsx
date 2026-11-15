// 11d: the staff Promotions page in API mode (plan BRANCH_11 section 6): the four cards, the tabs and
// filters, the table, a promotion's details with its real uses (linking to their orders and bookings for
// roles that may open them), the editor (every kind, the real choices, each refusal at its field, the
// version), switching on or off and deleting (both ask first, D128), and the Promotions permissions.
import {
  type AdminPromotion,
  type AdminPromotionDetail,
  normalisePermissions,
  type PermissionMap,
  type PromotionOptions,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPromotionsPage } from "@/features/admin/promotions/pages/AdminPromotionsPage";
import { PromotionsCreateButton, PromotionsWorkspaceProvider } from "@/features/admin/promotions/PromotionsWorkspace";
import { SAMPLE_DATA_PAGES } from "@/layouts/admin/navigation";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const everything = { view: true, edit: true, delete: true, export: false, refund: false };
const editor = { view: true, edit: true, delete: false, export: false, refund: false };
const viewOnly = { view: true, edit: false, delete: false, export: false, refund: false };

const uuid = (n: number) => `0197a000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-13";
const FOOD = uuid(20);
const CAT_FOOD = uuid(21);
const CAT_FOOD_2KG = uuid(22);
const TOY = uuid(23);
const TOY_PACK = uuid(24);
const BASIC = uuid(25);

function promotion(overrides: Partial<AdminPromotion> = {}): AdminPromotion {
  return {
    id: uuid(1),
    name: { en: "Food week", ar: "أسبوع الطعام" },
    description: { en: "15% off food.", ar: "خصم على الطعام." },
    type: "discount",
    offer: "percent",
    value: 15,
    buyGet: null,
    targetKind: "categories",
    targets: [{ id: FOOD, name: { en: "Food", ar: "طعام" } }],
    bundleItems: [],
    code: null,
    minSpend: 0,
    eligibility: "all",
    usageLimit: 0,
    perCustomerLimit: 0,
    usesCount: 3,
    usedCount: 2,
    discountGiven: 1270,
    startsOn: "2026-10-01",
    endsOn: "2026-10-16",
    enabled: true,
    visible: true,
    featured: false,
    image: null,
    status: "active",
    version: 4,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

const foodWeek = promotion();
const welcome = promotion({
  id: uuid(2),
  name: { en: "Welcome code", ar: "رمز الترحيب" },
  type: "code",
  code: "WELCOME10",
  value: 10,
  targetKind: "order",
  targets: [],
  eligibility: "new",
  perCustomerLimit: 1,
  usesCount: 0,
  usedCount: 0,
  discountGiven: 0,
  startsOn: "2026-10-20",
  endsOn: null,
  status: "scheduled",
  version: 1,
});
const bundle = promotion({
  id: uuid(3),
  name: { en: "Food and toy", ar: "طعام ولعبة" },
  type: "bundle",
  offer: "bundle_price",
  value: 4500,
  targetKind: "bundle",
  targets: [],
  bundleItems: [
    { variantId: CAT_FOOD_2KG, productName: { en: "Cat food", ar: "طعام قطط" }, label: { en: "2 kg", ar: "2 كغ" }, price: 4230, quantity: 1 },
    { variantId: TOY_PACK, productName: { en: "Toy mouse", ar: "فأر" }, label: { en: "One", ar: "واحد" }, price: 1000, quantity: 1 },
  ],
  enabled: false,
  status: "inactive",
  usesCount: 0,
  usedCount: 0,
  discountGiven: 0,
  version: 2,
});

const OPTIONS: PromotionOptions = {
  categories: [
    { id: FOOD, name: { en: "Food", ar: "طعام" }, active: true },
    { id: uuid(26), name: { en: "Toys", ar: "ألعاب" }, active: true },
  ],
  products: [
    {
      id: CAT_FOOD,
      name: { en: "Cat food", ar: "طعام قطط" },
      categoryId: FOOD,
      active: true,
      packs: [{ id: CAT_FOOD_2KG, label: { en: "2 kg", ar: "2 كغ" }, price: 4230, active: true }],
    },
    {
      id: TOY,
      name: { en: "Toy mouse", ar: "فأر" },
      categoryId: uuid(26),
      active: false,
      packs: [{ id: TOY_PACK, label: { en: "One", ar: "واحد" }, price: 1000, active: true }],
    },
  ],
  groomingPackages: [{ id: BASIC, group: { en: "Adult cat", ar: "قطة بالغة" }, name: { en: "Basic", ar: "أساسي" }, price: 8000, active: true }],
};

function detailOf(row: AdminPromotion): AdminPromotionDetail {
  const used = row.id === foodWeek.id;
  return {
    today: TODAY,
    promotion: row,
    uses: used
      ? [
          { id: uuid(40), status: "used", kind: "order", payableId: uuid(41), reference: "NC-261012-4F7KQ2", discount: 635, createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:10:00.000Z" },
          { id: uuid(42), status: "held", kind: "booking", payableId: uuid(43), reference: "GB-261012-ABCDEF", discount: 1200, createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z" },
        ]
      : [],
    usesTotal: used ? 3 : 0,
  };
}

type Change = { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown };

function stubApi(rows: AdminPromotion[] = [foodWeek, welcome, bundle], answer?: (change: Change) => unknown) {
  const gets: string[] = [];
  const changes: Change[] = [];
  const send = (change: Change) => {
    changes.push(change);
    if (answer) return answer(change);
    if (change.method === "DELETE") return { status: "ok" };
    const id = change.path.split("/")[3];
    const saved = rows.find((row) => row.id === id) ?? { ...foodWeek, id: uuid(99), version: 1 };
    return detailOf(saved);
  };
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path === "/admin/promotions") {
        return schema.parse({
          today: TODAY,
          promotions: rows,
          counts: { all: rows.length, active: 1, scheduled: 1, ended: 0, inactive: 1, endingSoon: 1, usedThisMonth: 7 },
        }) as never;
      }
      if (path === "/admin/promotions/options") return schema.parse(OPTIONS) as never;
      const found = rows.find((row) => path === `/admin/promotions/${row.id}`);
      if (!found) throw new ApiError("NOT_FOUND", "This promotion does not exist.", 404);
      return schema.parse(detailOf(found)) as never;
    },
    post: async (path, body, schema) => schema.parse(send({ method: "POST", path, body })) as never,
    put: async (path, body, schema) => schema.parse(send({ method: "PUT", path, body })) as never,
    delete: async (path, schema) => schema.parse(send({ method: "DELETE", path })) as never,
  };
  return { api, gets, changes };
}

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Marketing", permissions };
}

function renderPage(api: ApiClient, promotions = everything, others: Partial<PermissionMap> = { orders: viewOnly }) {
  return render(
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ promotions, ...others }))}>
          <PromotionsWorkspaceProvider>
            <PromotionsCreateButton />
            <AdminPromotionsPage />
          </PromotionsWorkspaceProvider>
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

async function openPromotion(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Open promotion ${name}` }));
  return screen.findByRole("complementary", { name });
}

describe("admin promotions (API mode)", () => {
  it("lists real promotions with the four cards and the tabs; no sample-data banner or prototype wording", async () => {
    const { api } = stubApi();
    renderPage(api);
    const row = (await screen.findByRole("button", { name: "Open promotion Food week" })).closest("tr") as HTMLElement;
    expect(row.textContent).toContain("15% off");
    expect(row.textContent).toContain("Categories");
    expect(row.textContent).toContain("3 uses");
    expect(within(row).getByText("Active")).toBeTruthy();
    const code = screen.getByRole("button", { name: "Open promotion Welcome code" }).closest("tr") as HTMLElement;
    expect(code.textContent).toContain("WELCOME10");
    expect(code.textContent).toContain("Promo Code");
    expect(within(code).getByText("Scheduled")).toBeTruthy();
    const set = screen.getByRole("button", { name: "Open promotion Food and toy" }).closest("tr") as HTMLElement;
    expect(set.textContent).toMatch(/QAR\s?45 a set/);
    expect(within(set).getByText("Inactive")).toBeTruthy();

    expect(screen.getByText("Active promotions").parentElement?.textContent).toContain("1");
    expect(screen.getByText("Ending soon").parentElement?.textContent).toContain("1");
    expect(screen.getByText("Uses this month").parentElement?.textContent).toContain("7");
    expect(screen.getByRole("tab", { name: "All promotions (3)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Promo codes (1)" })).toBeTruthy();
    expect(SAMPLE_DATA_PAGES.promotions).toBeUndefined();
    expect(screen.queryByText(/Frontend prototype/)).toBeNull();
  });

  it("filters by tab, status, dates and search", async () => {
    const { api } = stubApi();
    renderPage(api);
    await screen.findByRole("button", { name: "Open promotion Food week" });
    fireEvent.click(screen.getByRole("tab", { name: "Promo codes (1)" }));
    expect(screen.queryByRole("button", { name: "Open promotion Food week" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open promotion Welcome code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "All promotions (3)" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter status" }), { target: { value: "inactive" } });
    expect(screen.getByRole("button", { name: "Open promotion Food and toy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open promotion Food week" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter status" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter dates" }), { target: { value: "ending" } });
    expect(screen.getByRole("button", { name: "Open promotion Food week" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open promotion Welcome code" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter dates" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search promotions" }), { target: { value: "welcome10" } });
    expect(screen.getByRole("button", { name: "Open promotion Welcome code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open promotion Food week" })).toBeNull();
  });

  it("the details show the conditions and the real uses, linking only to pages the role may open", async () => {
    const { api } = stubApi();
    renderPage(api);
    const panel = await openPromotion("Food week");
    expect(await within(panel).findByText("NC-261012-4F7KQ2")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "NC-261012-4F7KQ2" })).toHaveAttribute("href", "/admin/orders?search=NC-261012-4F7KQ2");
    // No Bookings rights: the booking's reference is shown, not linked.
    expect(within(panel).queryByRole("link", { name: "GB-261012-ABCDEF" })).toBeNull();
    expect(within(panel).getByText("GB-261012-ABCDEF")).toBeTruthy();
    expect(within(panel).getByText("The newest 2 of 3 uses.")).toBeTruthy();
    expect(panel.textContent).toContain("Categories: Food");
    expect(panel.textContent).toContain("Paid uses2");
    // Used: it can be switched off, never deleted.
    expect(within(panel).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(panel).getByText(/cannot be deleted: switch it off/)).toBeTruthy();
  });

  it("creating a promotion sends the chosen products and the request the API expects", async () => {
    const { api, changes } = stubApi();
    renderPage(api);
    await screen.findByRole("button", { name: "Open promotion Food week" });
    fireEvent.click(screen.getByRole("button", { name: /Create Promotion/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create promotion" });
    fireEvent.change(within(dialog).getByLabelText("Name (English)"), { target: { value: "Cat food sale" } });
    fireEvent.change(within(dialog).getByLabelText("Name (Arabic)"), { target: { value: "تخفيض" } });
    fireEvent.change(within(dialog).getByLabelText("Discount (%)"), { target: { value: "20" } });
    fireEvent.change(within(dialog).getByLabelText("Applies to"), { target: { value: "products" } });
    fireEvent.click(await within(dialog).findByLabelText(/Cat food/));
    expect(within(dialog).getByText(/Toy mouse/).closest("label")?.textContent).toContain("(hidden)");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toMatchObject({
      method: "POST",
      path: "/admin/promotions",
      body: {
        name: { en: "Cat food sale", ar: "تخفيض" },
        type: "discount",
        offer: "percent",
        value: 20,
        targetKind: "products",
        targetIds: [CAT_FOOD],
        code: null,
        startsOn: TODAY,
        endsOn: null,
        enabled: true,
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create promotion" })).toBeNull());
    expect(screen.getByText("The promotion is saved.")).toBeTruthy();
  });

  it("each refusal shows at its field: checked here first, then the API's answer", async () => {
    const { api, changes } = stubApi(undefined, () => {
      throw new ApiError("VALIDATION_FAILED", "Please check the highlighted fields.", 400, {
        fields: [{ path: "code", message: "Another promotion already uses this code." }],
      });
    });
    renderPage(api);
    await screen.findByRole("button", { name: "Open promotion Food week" });
    fireEvent.click(screen.getByRole("button", { name: /Create Promotion/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create promotion" });
    // Nothing typed: refused here, nothing sent.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    expect(await within(dialog).findAllByText("Please check the highlighted fields.")).toBeTruthy();
    expect(changes).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Name (English)"), { target: { value: "Ten off" } });
    fireEvent.change(within(dialog).getByLabelText("Name (Arabic)"), { target: { value: "عشرة" } });
    fireEvent.change(within(dialog).getByLabelText("Promotion type"), { target: { value: "code" } });
    fireEvent.change(within(dialog).getByLabelText("Promo code"), { target: { value: "welcome10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    expect(await within(dialog).findByText("Another promotion already uses this code.")).toBeTruthy();
    expect(changes[0]?.body).toMatchObject({ type: "code", code: "WELCOME10" });
  });

  it("an offer for new customers suggests once per customer", async () => {
    const { api } = stubApi();
    renderPage(api);
    await screen.findByRole("button", { name: "Open promotion Food week" });
    fireEvent.click(screen.getByRole("button", { name: /Create Promotion/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create promotion" });
    fireEvent.change(within(dialog).getByLabelText("Who can use it"), { target: { value: "new" } });
    expect(within(dialog).getByLabelText("Uses per customer (0 = no limit)")).toHaveValue("1");
    expect(within(dialog).getByText(/Set to once per customer/)).toBeTruthy();
  });

  it("a bundle: packs with quantities, and what the items cost today", async () => {
    const { api, changes } = stubApi();
    renderPage(api);
    await screen.findByRole("button", { name: "Open promotion Food week" });
    fireEvent.click(screen.getByRole("button", { name: /Create Promotion/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create promotion" });
    fireEvent.change(within(dialog).getByLabelText("Name (English)"), { target: { value: "Starter set" } });
    fireEvent.change(within(dialog).getByLabelText("Name (Arabic)"), { target: { value: "مجموعة" } });
    fireEvent.change(within(dialog).getByLabelText("Promotion type"), { target: { value: "bundle" } });
    await within(dialog).findAllByRole("option", { name: /Cat food · 2 kg/ });
    fireEvent.change(within(dialog).getByLabelText("Pack 1"), { target: { value: CAT_FOOD_2KG } });
    fireEvent.change(within(dialog).getByLabelText("Pack 2"), { target: { value: TOY_PACK } });
    expect(within(dialog).getByText(/These items cost QAR\s?52\.30 today/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Price of one set (QAR)"), { target: { value: "45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]?.body).toMatchObject({
      type: "bundle",
      offer: "bundle_price",
      value: 4500,
      targetKind: "bundle",
      targetIds: [],
      bundleItems: [
        { variantId: CAT_FOOD_2KG, quantity: 1 },
        { variantId: TOY_PACK, quantity: 1 },
      ],
    });
  });

  it("editing sends the version it started from; someone else's change in between is said plainly", async () => {
    let attempt = 0;
    const { api, changes } = stubApi(undefined, (change) => {
      attempt += 1;
      if (attempt === 2) throw new ApiError("CONFLICT", "Someone else changed this promotion. Reload to see the latest version.", 409);
      return detailOf({ ...foodWeek, ...(change.body as object), version: 5 } as AdminPromotion);
    });
    renderPage(api, editor);
    const panel = await openPromotion("Food week");
    fireEvent.click(within(panel).getByRole("button", { name: "Edit promotion" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit promotion" });
    expect(within(dialog).getByLabelText("Discount (%)")).toHaveValue("15");
    fireEvent.change(within(dialog).getByLabelText("Discount (%)"), { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toMatchObject({ method: "PUT", path: `/admin/promotions/${foodWeek.id}`, body: { version: 4, value: 25, targetIds: [FOOD] } });

    // The saved promotion's details stay open.
    const again = await screen.findByRole("complementary", { name: "Food week" });
    fireEvent.click(within(again).getByRole("button", { name: "Edit promotion" }));
    dialog = await screen.findByRole("dialog", { name: "Edit promotion" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save promotion" }));
    expect(await within(dialog).findByText(/Someone else changed this promotion while you were editing/)).toBeTruthy();
  });

  it("switching off asks first and sends the version; Cancel sends nothing", async () => {
    const { api, changes } = stubApi();
    renderPage(api, editor);
    const panel = await openPromotion("Food week");
    fireEvent.click(within(panel).getByRole("button", { name: "Switch off" }));
    let ask = await screen.findByRole("dialog", { name: "Switch off “Food week”?" });
    expect(ask.textContent).toContain("keep their discount");
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changes).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Switch off" }));
    ask = await screen.findByRole("dialog", { name: "Switch off “Food week”?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(changes).toEqual([{ method: "PUT", path: `/admin/promotions/${foodWeek.id}/enabled`, body: { enabled: false, version: 4 } }]));
  });

  it("switching on asks first too (D128: reactivating)", async () => {
    const { api, changes } = stubApi();
    renderPage(api, editor);
    const panel = await openPromotion("Food and toy");
    fireEvent.click(within(panel).getByRole("button", { name: "Switch on" }));
    const ask = await screen.findByRole("dialog", { name: "Switch on “Food and toy”?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Switch on" }));
    await waitFor(() => expect(changes).toEqual([{ method: "PUT", path: `/admin/promotions/${bundle.id}/enabled`, body: { enabled: true, version: 2 } }]));
  });

  it("deleting a promotion nobody used asks first", async () => {
    const { api, changes } = stubApi();
    renderPage(api);
    const panel = await openPromotion("Welcome code");
    const remove = await within(panel).findByRole("button", { name: "Delete" });
    fireEvent.click(remove);
    const ask = await screen.findByRole("dialog", { name: "Delete “Welcome code”?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(changes).toEqual([{ method: "DELETE", path: `/admin/promotions/${welcome.id}` }]));
    expect(await screen.findByText("The promotion is deleted.")).toBeTruthy();
  });

  it("View only: no Create, Edit, Switch or Delete", async () => {
    const { api } = stubApi();
    renderPage(api, viewOnly);
    const panel = await openPromotion("Welcome code");
    await within(panel).findByText(/No order or booking has used it yet/);
    expect(within(panel).queryByRole("button", { name: "Edit promotion" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Switch/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Delete" })).toBeNull();
    // The header's Create (rendered here as in the shell) does nothing for View: no editor opens.
    fireEvent.click(screen.getByRole("button", { name: /Create Promotion/ }));
    expect(screen.queryByRole("dialog", { name: "Create promotion" })).toBeNull();
  });

  it("shows the API's error and a retry when the list cannot be read", async () => {
    const api: ApiClient = {
      get: async () => {
        throw new ApiError("NETWORK", "The server could not be reached.");
      },
      post: async () => ({}) as never,
      put: async () => ({}) as never,
      delete: async () => ({}) as never,
    };
    renderPage(api);
    expect(await screen.findByText("The server could not be reached. Please try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
