// The POS on staff's screens (#16 part 2c; the part 2 plan's sections 1.7, 3, 4 and 9 (2c)): the
// editor's locks and the owner's "Edit anyway" behind its pop-up; the POS items tab and its actions,
// each risky one asked first (D128); the owner's Integrations page (keys with the password again,
// health, alert settings).
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  type AdminPosIntegration,
  type AdminPosItem,
  type AdminPosItemListResponse,
  type AdminProduct,
  normalisePermissions,
  ownerPermissions,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { AdminIntegrationsApiPage } from "@/features/admin/integrations/pages/AdminIntegrationsApiPage";
import { CatalogueWorkspaceProvider } from "@/features/admin/products/CatalogueWorkspace";
import { CatalogueDetail } from "@/features/admin/products/components/CatalogueDetail";
import { ProductEditor } from "@/features/admin/products/components/ProductEditor";
import { AdminProductsPage } from "@/features/admin/products/pages/AdminProductsPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { describeSaveError, toSaveRequest, toWebAdminProduct } from "@/shared/api/admin-catalog";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(cleanup);

const catalogueEdit = { view: true, edit: true, delete: false, export: false, refund: false };
const catalogueView = { view: true, edit: false, delete: false, export: false, refund: false };

function person(isOwner: boolean, permissions = isOwner ? ownerPermissions() : normalisePermissions({ products: catalogueEdit })): StaffProfile {
  return { id: "s", email: isOwner ? "owner@example.invalid" : "s@example.invalid", displayName: isOwner ? "Owner" : "Sara", isOwner, mustChangePassword: false, roleName: isOwner ? null : "Catalogue", permissions };
}

const PACK_ID = "0197a000-0000-7000-8000-0000000000bb";
const managed: AdminProduct = {
  id: "0197a000-0000-7000-8000-0000000000aa",
  slug: "kitten-food",
  category: "food",
  brand: null,
  featured: false,
  bestSeller: false,
  name: { en: "Kitten food", ar: "طعام القطط الصغيرة" },
  description: { en: "Desc", ar: "وصف" },
  petTypes: ["cats"],
  images: [{ url: "/images/a.png", alt: { en: "A", ar: "أ" } }],
  house: null,
  active: true,
  isSample: false,
  version: 7,
  updatedAt: "2026-10-26T08:00:00.000Z",
  variants: [
    {
      id: PACK_ID,
      code: "kf-2",
      sku: "RC-KITTEN-2KG",
      label: { en: "2 kg pack", ar: "عبوة ٢ كغ" },
      weightGrams: 2000,
      price: 8500,
      stock: 9,
      lowStockThreshold: 5,
      // The POS switched it off: a save must keep it off (the 2b limitation, fixed in 2c).
      active: false,
      pos: { code: "RC-KITTEN-2KG", appliedAt: "2026-10-26T11:05:00.000Z", overriddenAt: null, heldPrice: 3000 },
    },
  ],
};

const categories = { categories: [{ id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false }] };

function providers(api: ApiClient, staff: StaffProfile, children: React.ReactNode) {
  return (
    <SettingsProviders api={api}>
      <MockDataProvider>
        <StaffIdentityProvider demoRole={staff.isOwner ? "owner" : "core"}>
          <AdminAccessProvider staff={staff}>{children}</AdminAccessProvider>
        </StaffIdentityProvider>
      </MockDataProvider>
    </SettingsProviders>
  );
}

const notFound = async () => {
  throw new ApiError("NOT_FOUND", "x", 404);
};

describe("a pack the POS manages, in the product editor", () => {
  function editor(staff: StaffProfile, calls: { path: string; body: unknown }[]) {
    const api: ApiClient = {
      get: async (_path, schema) => schema.parse(categories) as never,
      post: async (path, body, schema) => {
        calls.push({ path, body });
        const override = body as { stock: number; price: number; active: boolean };
        const pack = managed.variants[0];
        if (!pack) throw new Error("pack");
        return schema.parse({
          ...managed,
          variants: [{ ...pack, stock: override.stock, price: override.price, active: override.active, pos: { ...pack.pos, overriddenAt: "2026-10-26T11:30:00.000Z" } }],
        }) as never;
      },
      put: async (path, body, schema) => {
        calls.push({ path, body });
        return schema.parse(managed) as never;
      },
      delete: notFound,
    };
    const onClose = vi.fn();
    render(providers(api, staff, <ProductEditor initial={toWebAdminProduct(managed)} onClose={onClose} />));
    return { onClose };
  }

  it("shows its SKU, price and stock from the POS, read-only, with when, its on/off and the waiting price; no Adjust stock; a save keeps them unchanged", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const { onClose } = editor(person(false), calls);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("SKU")).toBeDisabled();
    expect(within(dialog).getByLabelText("Price · QAR")).toBeDisabled();
    expect(within(dialog).getByLabelText("Stock")).toBeDisabled();
    const note = within(dialog).getByRole("note");
    expect(note).toHaveTextContent("From the POS · item RC-KITTEN-2KG · updated 26 Oct 2026, 14:05");
    expect(note).toHaveTextContent("Switched off in the POS: not sold online.");
    expect(note).toHaveTextContent("The POS sent QAR 30.00, less than half the price: it waits for staff on the POS items list.");
    expect(within(dialog).queryByRole("button", { name: /Adjust stock/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Edit anyway/ })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls[0]?.body).toMatchObject({ version: 7, variants: [{ code: "kf-2", sku: "RC-KITTEN-2KG", price: 8500, active: false }] });
  });

  it("the owner's Edit anyway asks first with what will happen; Cancel sends nothing; then stock with a reason, price and on/off, recorded and shown", async () => {
    const calls: { path: string; body: unknown }[] = [];
    editor(person(true), calls);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit anyway 2 kg pack" }));
    const question = await screen.findByRole("dialog", { name: "Edit a pack that the POS manages?" });
    expect(question).toHaveTextContent(
      "This pack's stock, price and on/off come from the POS. Your change applies now, but the POS's next update of this pack replaces it: within minutes if it changes in the POS, and at the latest with tonight's full list. To keep it, make the same change in the POS. Staff cannot do this. It is recorded.",
    );
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit a pack that the POS manages?" })).toBeNull());
    expect(calls, JSON.stringify(calls)).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit anyway 2 kg pack" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Edit a pack that the POS manages?" })).getByRole("button", { name: "Edit anyway" }));
    const form = await screen.findByRole("dialog", { name: "Edit anyway" });
    fireEvent.change(within(form).getByLabelText("Stock"), { target: { value: "20" } });
    fireEvent.change(within(form).getByLabelText("Price · QAR"), { target: { value: "79.5" } });
    fireEvent.click(within(form).getByLabelText("On sale (sold online)"));
    fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "ab" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save the change" }));
    expect(await within(form).findByText(/Write a short reason/)).toBeTruthy();
    expect(calls).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "Counted the shelf" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save the change" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: `/admin/catalog/variants/${PACK_ID}/override`, body: { stock: 20, price: 7950, active: true, reason: "Counted the shelf" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit anyway" })).toBeNull());
    expect(within(dialog).getByRole("note")).toHaveTextContent("Changed by the owner at 26 Oct 2026, 14:30; the POS's next update replaces it.");
    expect(within(dialog).getByLabelText("Stock")).toHaveValue("20");
  });

  it("the details panel says From the POS instead of Adjust, and marks the SKU", async () => {
    const api: ApiClient = { get: async (_path, schema) => schema.parse(categories) as never, post: notFound, put: notFound, delete: notFound };
    render(providers(api, person(false), <CatalogueDetail record={toWebAdminProduct(managed)} date="2026-10-26" onClose={vi.fn()} onEdit={vi.fn()} />));
    expect(await screen.findByText("From the POS")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Adjust/ })).toBeNull();
    expect(screen.getByTitle("Follows POS item RC-KITTEN-2KG")).toHaveTextContent("POS");
  });

  it("explains a POS change met while editing, and keeps a pack's on/off in every save", () => {
    const text = (en: string) => en;
    const refused = new ApiError("CONFLICT", "This pack's stock, price and on/off come from the POS (item X).", 409, {
      fields: [{ path: "variants.0.price", message: "This pack follows POS item X." }],
    });
    expect(describeSaveError(refused, text)).toMatch(/^The POS updated a pack of this product while you were editing/);
    const product = toWebAdminProduct(managed);
    expect(toSaveRequest(product, product).variants[0]?.active).toBe(false);
  });
});

// --- The POS items tab ----------------------------------------------------------------------------

function item(overrides: Partial<AdminPosItem> = {}): AdminPosItem {
  return {
    id: "0197a000-0000-7000-8000-000000000101",
    code: "WH-TUNA-85G",
    name: "Whiskas Tuna 85 g",
    stock: 40,
    price: 450,
    active: true,
    countedAt: "2026-10-26T11:00:00.000Z",
    firstSeenAt: "2026-10-26T10:00:00.000Z",
    lastSeenAt: "2026-10-26T11:00:00.000Z",
    status: "new",
    linkable: true,
    heldPrice: null,
    priceRefused: false,
    short: 0,
    silent: false,
    overriddenAt: null,
    pack: null,
    ...overrides,
  };
}

const own: AdminProduct = {
  ...managed,
  id: "0197a000-0000-7000-8000-0000000000c1",
  slug: "tuna-pouch",
  name: { en: "Tuna pouch", ar: "كيس تونة" },
  version: 2,
  variants: [{ id: "0197a000-0000-7000-8000-0000000000c2", code: "tp-1", sku: "WEB-TUNA", label: { en: "85 g", ar: "٨٥ غ" }, weightGrams: 85, price: 500, stock: 3, lowStockThreshold: 5, active: true, pos: null }],
};

function listOf(items: AdminPosItem[]): AdminPosItemListResponse {
  return { items, total: items.length, page: 1, pageSize: 25, counts: { all: items.length, new: items.filter((row) => row.status === "new").length, linked: 0, attention: 0, notSoldOnline: 0 } };
}

function catalogue(staff: StaffProfile, items: AdminPosItem[]) {
  const gets: string[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.startsWith("/admin/pos/items?")) return schema.parse(listOf(items)) as never;
      if (path === "/admin/catalog/products") return schema.parse({ products: [managed, own] }) as never;
      return schema.parse(categories) as never;
    },
    post: async (path, body, schema) => {
      posts.push({ path, body });
      if (path.endsWith("-price")) return schema.parse(managed) as never;
      return schema.parse(item({ status: path.endsWith("/link") ? "linked" : "not_sold_online" })) as never;
    },
    put: notFound,
    delete: notFound,
  };
  render(
    providers(
      api,
      staff,
      <DashboardDateProvider>
        <CatalogueWorkspaceProvider>
          <AdminProductsPage />
        </CatalogueWorkspaceProvider>
      </DashboardDateProvider>,
    ),
  );
  return { gets, posts };
}

describe("the POS items tab", () => {
  it("lists the POS's codes from the server with its views and counts, searches and pages there", async () => {
    const { gets } = catalogue(person(false), [item(), item({ id: "0197a000-0000-7000-8000-000000000102", code: "RC ODD", name: "Odd code", linkable: false })]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    expect(await screen.findByText("WH-TUNA-85G")).toBeTruthy();
    expect(screen.getByText("Whiskas Tuna 85 g")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New (2)" })).toBeTruthy();
    expect(screen.getByText("This code has characters a website SKU cannot have, so no pack can follow it.")).toBeTruthy();
    expect(gets.at(-1)).toBe("/admin/pos/items?view=all&page=1&pageSize=25");
    fireEvent.click(screen.getByRole("button", { name: "Needs attention (0)" }));
    await waitFor(() => expect(gets.at(-1)).toBe("/admin/pos/items?view=attention&page=1&pageSize=25"));
    fireEvent.change(screen.getByLabelText("Search POS codes"), { target: { value: "tuna" } });
    await waitFor(() => expect(gets.at(-1)).toBe("/admin/pos/items?q=tuna&view=attention&page=1&pageSize=25"));
  });

  it("Not sold online asks first; nothing is sent before the answer", async () => {
    const { posts } = catalogue(person(false), [item()]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    fireEvent.click(await screen.findByRole("button", { name: "Not sold online WH-TUNA-85G" }));
    const question = await screen.findByRole("dialog", { name: "Put WH-TUNA-85G aside as not sold online?" });
    expect(posts).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Not sold online" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/admin/pos/items/0197a000-0000-7000-8000-000000000101/sold-online", body: { notSoldOnline: true } }]));
  });

  it("Link to a pack: choose the product and one of its own packs, then confirm what changes", async () => {
    const { posts } = catalogue(person(false), [item()]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    fireEvent.click(await screen.findByRole("button", { name: "Link to a pack WH-TUNA-85G" }));
    const picker = await screen.findByRole("dialog", { name: "Link WH-TUNA-85G to a pack" });
    const productChoices = within(picker).getByLabelText("Product");
    // The managed product's only pack already follows a code: it is not offered.
    expect(within(productChoices).queryByRole("option", { name: "Kitten food" })).toBeNull();
    fireEvent.change(productChoices, { target: { value: own.id } });
    fireEvent.change(within(picker).getByLabelText("Pack"), { target: { value: own.variants[0]?.id } });
    fireEvent.click(within(picker).getByRole("button", { name: "Continue" }));
    const question = await screen.findByRole("dialog", { name: "Link WH-TUNA-85G to Tuna pouch · 85 g?" });
    expect(question).toHaveTextContent("The pack's SKU becomes WH-TUNA-85G, and from now on its stock, price and on/off come from the POS: the POS counts 40 at QAR 4.50.");
    expect(posts).toHaveLength(0);
    fireEvent.click(within(question).getByRole("button", { name: "Link the pack" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/admin/pos/items/0197a000-0000-7000-8000-000000000101/link", body: { variantId: own.variants[0]?.id } }]));
  });

  it("Create product opens the editor with the POS's code, name, count and price, which follow the POS once saved", async () => {
    catalogue(person(false), [item()]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create product WH-TUNA-85G" }));
    const dialog = await screen.findByRole("dialog", { name: "Product editor" });
    expect(within(dialog).getAllByLabelText(/^Name/)[0]).toHaveValue("Whiskas Tuna 85 g");
    expect(within(dialog).getByLabelText("SKU")).toHaveValue("WH-TUNA-85G");
    expect(within(dialog).getByLabelText("SKU")).toBeDisabled();
    expect(within(dialog).getByLabelText("Price · QAR")).toHaveValue("4.5");
    expect(within(dialog).getByLabelText("Price · QAR")).toBeDisabled();
    expect(within(dialog).getByLabelText("Stock")).toHaveValue("40");
    expect(within(dialog).getByRole("note")).toHaveTextContent("Follows POS item WH-TUNA-85G once saved");
  });

  it("Add as a pack opens the chosen product's editor with the new pack added", async () => {
    catalogue(person(false), [item()]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add as a pack WH-TUNA-85G" }));
    const picker = await screen.findByRole("dialog", { name: "Add WH-TUNA-85G as a pack" });
    fireEvent.change(within(picker).getByLabelText("Product"), { target: { value: own.id } });
    fireEvent.click(within(picker).getByRole("button", { name: "Open the editor" }));
    const dialog = await screen.findByRole("dialog", { name: "Product editor" });
    expect(within(dialog).getAllByLabelText("SKU").map((input) => (input as HTMLInputElement).value)).toEqual(["WEB-TUNA", "WH-TUNA-85G"]);
  });

  it("a waiting price is accepted or refused only after its question; a role that may only view sees no actions", async () => {
    const waiting = item({ status: "linked", heldPrice: 3000, pack: { variantId: PACK_ID, productId: managed.id, productSlug: managed.slug, productName: managed.name, productActive: true, label: { en: "2 kg pack", ar: "عبوة" }, sku: "RC-KITTEN-2KG", stock: 9, price: 8500, active: true } });
    const { posts } = catalogue(person(false), [waiting]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    expect(await screen.findByText("Price waiting: QAR 30.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept price WH-TUNA-85G" }));
    // Money has a non-breaking space ("QAR 30.00").
    const question = await screen.findByRole("dialog", { name: /^Sell Kitten food · 2 kg pack at QAR\s30\.00\?$/ });
    expect(question).toHaveTextContent("The pack's price drops from QAR 85.00 to QAR 30.00 at once, as the POS sent it.");
    fireEvent.click(within(question).getByRole("button", { name: "Accept the price" }));
    await waitFor(() => expect(posts.map((post) => post.path)).toEqual(["/admin/pos/items/0197a000-0000-7000-8000-000000000101/accept-price"]));
    cleanup();

    catalogue(person(false, normalisePermissions({ products: catalogueView })), [item(), waiting]);
    fireEvent.click(await screen.findByRole("button", { name: "POS items" }));
    expect(await screen.findAllByText("WH-TUNA-85G")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Create product|Not sold online WH|Accept price/ })).toBeNull();
  });
});

// --- The Integrations page --------------------------------------------------------------------------

const integration: AdminPosIntegration = {
  keys: [
    {
      id: "0197a000-0000-7000-8000-000000000201",
      name: "POS test",
      scopes: ["orders:read"],
      createdAt: "2026-10-21T10:00:00.000Z",
      createdBy: "command",
      revokedAt: null,
      lastUsedAt: "2026-10-26T11:00:00.000Z",
      fromEventId: 40,
      collection: { lastAt: "2026-10-26T11:00:00.000Z", after: 52, waiting: 3, oldestWaitingAt: "2026-10-26T10:20:00.000Z" },
      lastItemsAt: null,
    },
  ],
  lastEventId: 55,
  lastMessage: { receivedAt: "2026-10-26T11:02:00.000Z", countedAt: "2026-10-26T11:01:00.000Z", keyName: "POS test", items: 12, applied: 10, priceHeld: 1, priceRefused: 0, new: 1, stale: 0, short: 0 },
  settings: { itemsSilenceMinutes: 60, eventsLagMinutes: 30, alertEmail: null, ownerEmail: "owner@example.invalid", version: 4 },
  alerts: [{ kind: "events_lag", openedAt: "2026-10-26T10:51:00.000Z", lastItemsAt: null, keys: [{ name: "POS test", waiting: 3, oldestAt: "2026-10-26T10:20:00.000Z" }] }],
  items: { total: 12, linked: 10, new: 1, attention: 1 },
};

function integrations(options: { reauth?: boolean } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let reauthed = !options.reauth;
  const api: ApiClient = {
    get: async (_path, schema) => schema.parse(integration) as never,
    post: async (path, body, schema) => {
      calls.push({ method: "POST", path, body });
      if (path === "/admin/auth/reauthenticate") {
        reauthed = true;
        return schema.parse({ status: "ok" }) as never;
      }
      if (!reauthed && (path.endsWith("/keys") || path.endsWith("/scopes"))) throw new ApiError("REAUTH_REQUIRED", "Please enter your password again to continue.", 403);
      const key = integration.keys[0];
      if (!key) throw new Error("key");
      if (path.endsWith("/keys")) return schema.parse({ key: { ...key, id: "0197a000-0000-7000-8000-000000000202", name: "POS live", scopes: ["orders:read", "items:write"], createdBy: "owner" }, secret: `ncpos_${"a".repeat(43)}` }) as never;
      return schema.parse(path.endsWith("/revoke") ? { ...key, revokedAt: "2026-10-26T11:10:00.000Z", collection: null } : { ...key, scopes: (body as { scopes: string[] }).scopes }) as never;
    },
    put: async (path, body, schema) => {
      calls.push({ method: "PUT", path, body });
      return schema.parse({ ...integration.settings, ...(body as object), alertEmail: null, version: 5 }) as never;
    },
    delete: notFound,
  };
  render(providers(api, person(true), <AdminIntegrationsApiPage />));
  return { calls };
}

describe("the owner's Integrations page", () => {
  it("shows the open alert, the last items message, each key's collection and the list in figures", async () => {
    integrations();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Alert since 26 Oct 2026, 13:51 The POS is not collecting the website's orders and bookings (“POS test”: 3 waiting since 26 Oct 2026, 13:20).",
    );
    expect(screen.getByText("Last message 26 Oct 2026, 14:02, from “POS test”: 12 items.")).toBeTruthy();
    expect(screen.getByText("10 applied · 1 new · 1 price waiting · 0 price refused · 0 older than the last count · 0 short")).toBeTruthy();
    expect(screen.getByText(/last collected 26 Oct 2026, 14:00; 3 events wait, the oldest since 26 Oct 2026, 13:20\./)).toBeTruthy();
    expect(screen.getByText("12 codes: 10 linked, 1 new, 1 needing attention.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the POS items list" })).toHaveAttribute("href", "/admin/products?section=pos");
    expect(screen.getByText("by the server command")).toBeTruthy();
  });

  it("making a key asks for the password again, then shows the key once with a copy button", async () => {
    const { calls } = integrations({ reauth: true });
    fireEvent.click(await screen.findByRole("button", { name: "Make a key" }));
    const form = await screen.findByRole("dialog", { name: "Make a key" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "POS live" } });
    expect(within(form).getByLabelText("Send items (stock, prices, on/off)")).toBeChecked();
    fireEvent.click(within(form).getByRole("button", { name: "Make the key" }));
    const password = await screen.findByRole("dialog", { name: "Confirm it's you" });
    expect(password).toHaveTextContent("enter your password again to make a key or change what a key may do");
    fireEvent.change(within(password).getByLabelText("Your password"), { target: { value: "owner passphrase" } });
    fireEvent.click(within(password).getByRole("button", { name: "Confirm" }));
    const shown = await screen.findByRole("dialog", { name: "Pass this key on" });
    expect(within(shown).getByLabelText("The key")).toHaveValue(`ncpos_${"a".repeat(43)}`);
    expect(shown).toHaveTextContent("Shown only now: it is never shown again.");
    expect(within(shown).getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(calls.map((call) => call.path)).toEqual(["/admin/pos/integration/keys", "/admin/auth/reauthenticate", "/admin/pos/integration/keys"]);
    expect(calls[2]?.body).toEqual({ name: "POS live", scopes: ["orders:read", "items:write"] });
  });

  it("revoking and allowing items ask first and say what follows; nothing is sent before the answer", async () => {
    const { calls } = integrations();
    fireEvent.click(await screen.findByRole("button", { name: "Allow sending items POS test" }));
    const allow = await screen.findByRole("dialog", { name: "Let “POS test” send items?" });
    expect(allow).toHaveTextContent("Big price drops still wait for staff");
    expect(calls).toHaveLength(0);
    fireEvent.click(within(allow).getByRole("button", { name: "Allow sending items" }));
    await waitFor(() => expect(calls).toEqual([{ method: "POST", path: "/admin/pos/integration/keys/0197a000-0000-7000-8000-000000000201/scopes", body: { scopes: ["orders:read", "items:write"] } }]));

    fireEvent.click(screen.getByRole("button", { name: "Revoke POS test" }));
    const revoke = await screen.findByRole("dialog", { name: "Revoke the key “POS test”?" });
    expect(revoke).toHaveTextContent("when replacing a key, make the new one first");
    expect(calls).toHaveLength(1);
    fireEvent.click(within(revoke).getByRole("button", { name: "Revoke the key" }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe("/admin/pos/integration/keys/0197a000-0000-7000-8000-000000000201/revoke"));
  });

  it("saves the alert settings with the version read; an empty email means the owner's", async () => {
    const { calls } = integrations();
    const silence = await screen.findByLabelText("Minutes without a stock update");
    expect(screen.getByLabelText("Alert email")).toHaveAttribute("placeholder", "owner@example.invalid");
    fireEvent.change(silence, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert settings" }));
    await waitFor(() => expect(calls).toEqual([{ method: "PUT", path: "/admin/pos/integration/settings", body: { version: 4, itemsSilenceMinutes: 90, eventsLagMinutes: 30, alertEmail: "" } }]));
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });
});
