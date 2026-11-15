import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type AdminProduct, adminProductSchema, normalisePermissions, type StaffProfile } from "@nennus-catio/contracts";
import { DashboardDateProvider } from "@/features/admin/dashboard/components/DashboardDate";
import { CatalogueWorkspaceProvider } from "@/features/admin/products/CatalogueWorkspace";
import { CatalogueDetail } from "@/features/admin/products/components/CatalogueDetail";
import { AdminProductsPage } from "@/features/admin/products/pages/AdminProductsPage";
import { ProductEditor } from "@/features/admin/products/components/ProductEditor";
import { StockAdjustDialog } from "@/features/admin/products/components/StockAdjustDialog";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { describeSaveError, toSaveRequest, toWebAdminProduct, useSaveCategory } from "@/shared/api/admin-catalog";
import { type ApiClient, ApiError, createApiClient } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(cleanup);

const text = (en: string) => en;

const adminProduct: AdminProduct = {
  id: "0197a000-0000-7000-8000-0000000000aa",
  slug: "cat-food",
  category: "food",
  brand: "Oasis Nutrition",
  featured: false,
  bestSeller: false,
  name: { en: "Everyday Cat Nutrition", ar: "تغذية القطط اليومية" },
  description: { en: "Desc", ar: "وصف" },
  petTypes: ["cats", "dogs"],
  images: [{ url: "/images/a.png", alt: { en: "A", ar: "أ" } }],
  house: null,
  active: true,
  isSample: true,
  version: 3,
  updatedAt: "2026-10-07T08:00:00.000Z",
  variants: [
    {
      id: "0197a000-0000-7000-8000-0000000000bb",
      code: "cf-15",
      sku: "FO-CF-15",
      label: { en: "1.5 kg pack", ar: "عبوة ١٫٥ كغ" },
      weightGrams: 1500,
      price: 8500,
      stock: 32,
      lowStockThreshold: 5,
      active: true,
      pos: null,
    },
  ],
};

describe("admin catalogue mapping", () => {
  it("keeps codes for existing packs, sends none for new ones, and carries version and weight", () => {
    const product = toWebAdminProduct(adminProduct);
    expect(product.serverId).toBe(adminProduct.id);
    expect(product.isSample).toBe(true);
    expect(product.variants[0]?.serverId).toBe(adminProduct.variants[0]?.id);
    const edited = {
      ...product,
      variants: [
        ...product.variants,
        { id: "tmp-new", label: { en: "Sample pouch", ar: "عبوة" }, sku: "FO-NEW", unit: "piece" as const, price: 900, stock: 4 },
      ],
    };
    const request = toSaveRequest(edited, product);
    expect(request.version).toBe(3);
    expect(request.petTypes).toEqual(["cats", "dogs"]);
    expect(request.variants.map((variant) => variant.code)).toEqual(["cf-15", undefined]);
    expect(request.variants.map((variant) => variant.weightGrams)).toEqual([1500, null]);
    expect(request.images).toEqual([{ url: "/images/a.png", alt: { en: "Everyday Cat Nutrition", ar: "تغذية القطط اليومية" } }]);
  });

  it("a Pet House always suits exactly its one pet", () => {
    const house = toWebAdminProduct({
      ...adminProduct,
      category: "pet-houses",
      petTypes: ["cats"],
      house: {
        collection: "indoor",
        purchaseMode: "fixed",
        availability: "unconfirmed",
        dimensions: null,
        features: [],
        leadTime: null,
        deliveryFee: null,
        fulfilment: "delivery",
        provisional: true,
        source: null,
      },
    });
    expect(toSaveRequest({ ...house, pets: ["cats", "dogs"] }, house).petTypes).toEqual(["cats"]);
  });

  it("explains a conflict and lists field problems", () => {
    expect(describeSaveError(new ApiError("CONFLICT", "x", 409), text)).toMatch(/Someone else saved this product/);
    const fields = new ApiError("CONFLICT", "Another product already uses this SKU.", 409, {
      fields: [{ path: "variants.0.sku", message: "Another product already uses this SKU." }],
    });
    expect(describeSaveError(fields, text)).toContain("variants.0.sku");
  });
});

describe("stock adjustment dialog", () => {
  it("requires a reason, previews the result and sends removals as negative numbers", async () => {
    const onAdjust = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(
      <SettingsProviders>
        <StockAdjustDialog
          productName="Cat food"
          variant={{ id: "cf-15", label: { en: "1.5 kg", ar: "١٫٥" }, sku: "FO-CF-15", unit: "weight", price: 1, stock: 10 }}
          onClose={onClose}
          onAdjust={onAdjust}
        />
      </SettingsProviders>,
    );
    fireEvent.click(screen.getByLabelText("Remove units (damaged, counted less)"));
    fireEvent.change(screen.getByLabelText("How many units"), { target: { value: "3" } });
    expect(screen.getByText("7")).toBeTruthy();
    // An empty reason is stopped by the browser (required); a too-short one by the dialog itself.
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Save stock change" }));
    expect(await screen.findByText(/Write a short reason/)).toBeTruthy();
    expect(onAdjust).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Damaged bags" } });
    fireEvent.click(screen.getByRole("button", { name: "Save stock change" }));
    await waitFor(() => expect(onAdjust).toHaveBeenCalledWith(-3, "Damaged bags"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("category saves check the server's answer (review L13)", () => {
  const category = { id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false };

  function SaveHarness() {
    const save = useSaveCategory();
    const [result, setResult] = useState("idle");
    return (
      <div>
        <p>{result}</p>
        <button
          type="button"
          onClick={() =>
            save
              .mutateAsync({ category: null, name: { en: "Treats", ar: "مكافآت" }, sortOrder: 5, active: true })
              .then(() => setResult("saved"), (error: unknown) => setResult(error instanceof ApiError ? error.code : "failed"))
          }
        >
          save
        </button>
      </div>
    );
  }

  function renderWithReply(reply: unknown) {
    const api = createApiClient({ fetchImpl: async () => new Response(JSON.stringify(reply), { status: 201 }) });
    render(
      <SettingsProviders api={api}>
        <SaveHarness />
      </SettingsProviders>,
    );
  }

  it("an answer that is not a category is refused instead of passing silently", async () => {
    renderWithReply({ unexpected: true });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByText("INVALID_RESPONSE")).toBeTruthy();
  });

  it("a proper category answer saves", async () => {
    renderWithReply(category);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByText("saved")).toBeTruthy();
  });
});

describe("Visible on Store asks before hiding a product (D128, review M3)", () => {
  const staff: StaffProfile = {
    id: "s",
    email: "s@example.invalid",
    displayName: "Sara",
    isOwner: false,
    mustChangePassword: false,
    roleName: "Catalogue",
    permissions: normalisePermissions({ products: { view: true, edit: true, delete: false, export: false, refund: false } }),
  };

  function detail(active: boolean) {
    const sent: { path: string; body: { active: boolean; version?: number } }[] = [];
    const api: ApiClient = {
      get: async (path, schema) =>
        schema.parse(
          path === "/admin/catalog/products"
            ? { products: [{ ...adminProduct, active }] }
            : { categories: [{ id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false }] },
        ) as never,
      post: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
      put: async (path, body, schema) => {
        sent.push({ path, body: body as { active: boolean; version?: number } });
        return schema.parse({ ...adminProduct, active: (body as { active: boolean }).active, version: 4 }) as never;
      },
      delete: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
    };
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={staff}>
              <CatalogueDetail record={{ ...toWebAdminProduct(adminProduct), active }} date="2026-10-09" onClose={vi.fn()} onEdit={vi.fn()} />
            </AdminAccessProvider>
          </StaffIdentityProvider>
        </MockDataProvider>
      </SettingsProviders>,
    );
    return { sent, toggle: () => screen.getByRole("switch", { name: /Visible on Store/ }) };
  }

  it("turning it off asks first; Cancel sends nothing; confirming sends one save with the version", async () => {
    const { sent, toggle } = detail(true);
    // Kept from before the question opens: an open dialog hides the page behind it from the accessibility tree.
    const visible = toggle();
    fireEvent.click(visible);
    const question = await screen.findByRole("dialog", { name: "Hide “Everyday Cat Nutrition” from the store?" });
    expect(question).toHaveTextContent("Customers will no longer see it on the website or be able to order it.");
    expect(sent).toHaveLength(0);
    expect(visible).toBeChecked();

    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sent).toHaveLength(0);
    expect(toggle()).toBeChecked();

    fireEvent.click(toggle());
    const again = await screen.findByRole("dialog");
    fireEvent.click(within(again).getByRole("button", { name: "Hide from store" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.path).toBe(`/admin/catalog/products/${adminProduct.id}`);
    expect(sent[0]?.body).toMatchObject({ active: false, version: 3 });
  });

  it("turning a hidden product back on saves straight away, like switching a delivery city back on", async () => {
    const { sent, toggle } = detail(false);
    fireEvent.click(toggle());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.body).toMatchObject({ active: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("product editor against the API", () => {
  const staff: StaffProfile = {
    id: "s",
    email: "s@example.invalid",
    displayName: "Sara",
    isOwner: false,
    mustChangePassword: false,
    roleName: "Catalogue",
    permissions: normalisePermissions({ products: { view: true, edit: true, delete: false, export: false, refund: false } }),
  };

  function editor(put: (body: unknown) => unknown) {
    const api: ApiClient = {
      get: async (_path, schema) =>
        schema.parse({ categories: [{ id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false }] }) as never,
      post: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
      put: async (_path, body, schema) => schema.parse(await put(body)) as never,
      delete: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
    };
    const onClose = vi.fn();
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={staff}>
              <ProductEditor initial={toWebAdminProduct(adminProduct)} onClose={onClose} />
            </AdminAccessProvider>
          </StaffIdentityProvider>
        </MockDataProvider>
      </SettingsProviders>,
    );
    return { onClose };
  }

  it("locks stock of existing packs, asks for the pack weight and saves with the version", async () => {
    let sent: { version?: number; variants: { code?: string; weightGrams: number | null }[] } | undefined;
    const { onClose } = editor((body) => {
      sent = body as typeof sent;
      return adminProductSchema.parse({ ...adminProduct, version: 4, isSample: false });
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Stock")).toBeDisabled();
    expect(within(dialog).getByLabelText("Pack weight · grams")).toHaveValue("1500");
    expect(within(dialog).queryByRole("button", { name: "Delete product" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent?.version).toBe(3);
    expect(sent?.variants[0]).toMatchObject({ code: "cf-15", weightGrams: 1500 });
  });

  it("the price takes digits and a point as staff type them, never letters; Arabic digits are read (D230)", async () => {
    let sent: { variants: { price: number }[] } | undefined;
    const { onClose } = editor((body) => {
      sent = body as typeof sent;
      return adminProductSchema.parse({ ...adminProduct, version: 4, isSample: false });
    });
    const dialog = await screen.findByRole("dialog");
    const price = within(dialog).getByLabelText("Price · QAR") as HTMLInputElement;
    expect(price).toHaveValue("85");
    for (const [typed, shown] of [
      ["9", "9"],
      ["99", "99"],
      ["99.", "99."],
      ["99.5x", "99.5"],
      ["99.50", "99.50"],
    ]) {
      fireEvent.change(price, { target: { value: typed } });
      expect(price).toHaveValue(shown);
    }
    fireEvent.change(price, { target: { value: "١٢٫٧٥" } });
    expect(price).toHaveValue("12.75");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent?.variants[0]?.price).toBe(1275);
  });

  it("a new product's first pack takes a starting stock (a 2026-10-07 report: it was stuck at 0)", async () => {
    let created: { variants: { code?: string; stock: number }[] } | undefined;
    const api: ApiClient = {
      get: async (_path, schema) =>
        schema.parse({ categories: [{ id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false }] }) as never,
      post: async (_path, body, schema) => {
        created = body as typeof created;
        return schema.parse({ ...adminProduct, id: "0197a000-0000-7000-8000-0000000000cc", slug: "new-item", isSample: false, version: 1 }) as never;
      },
      put: async () => {
        throw new Error("a new product must be created, not updated");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const fresh = {
      id: "tmp-product",
      name: { en: "New item", ar: "منتج جديد" },
      description: { en: "Desc", ar: "وصف" },
      category: "food",
      pet: "cats" as const,
      image: "/images/essentials.png",
      active: true,
      variants: [{ id: "tmp-pack", label: { en: "1 piece", ar: "قطعة" }, sku: "NEW-1", unit: "piece" as const, price: 1500, stock: 0 }],
    };
    const onClose = vi.fn();
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={staff}>
              <ProductEditor initial={fresh} onClose={onClose} />
            </AdminAccessProvider>
          </StaffIdentityProvider>
        </MockDataProvider>
      </SettingsProviders>,
    );
    const dialog = await screen.findByRole("dialog");
    const stock = within(dialog).getByLabelText("Stock");
    expect(stock).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: /Adjust stock/ })).toBeNull();
    fireEvent.change(stock, { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(created?.variants[0]).toMatchObject({ stock: 25 });
    expect(created?.variants[0]?.code).toBeUndefined();
  });

  it("offers Adjust stock inside the editor for saved packs", async () => {
    editor(() => adminProduct);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Adjust stock/ }));
    expect(await screen.findByRole("dialog", { name: "Adjust stock" })).toBeTruthy();
  });

  it("keeps a gallery slot added while another photo is still uploading (2026-10-07)", async () => {
    let finish: (url: string) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = (url) =>
              resolve(new Response(JSON.stringify({ url, width: 10, height: 10 }), { status: 201, headers: { "Content-Type": "application/json" } }));
          }),
      ),
    );
    try {
      editor(() => adminProduct);
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Add gallery image" }));
      fireEvent.change(within(dialog).getAllByLabelText(/^Upload image/)[1] as HTMLElement, {
        target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add gallery image" }));
      finish("/api/media/0197a000-0000-7000-8000-0000000000d1.webp");
      await waitFor(() =>
        expect(within(dialog).getAllByLabelText(/^Image address/)[1]).toHaveValue("/api/media/0197a000-0000-7000-8000-0000000000d1.webp"),
      );
      expect(within(dialog).getAllByLabelText(/^Image address/)).toHaveLength(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("adds several gallery photos chosen at once and saves them all", async () => {
    let uploads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        uploads += 1;
        const url = `/api/media/0197a000-0000-7000-8000-00000000000${uploads}.webp`;
        return new Response(JSON.stringify({ url, width: 10, height: 10 }), { status: 201, headers: { "Content-Type": "application/json" } });
      }),
    );
    try {
      let sent: { images: { url: string }[] } | undefined;
      const { onClose } = editor((body) => {
        sent = body as typeof sent;
        return adminProduct;
      });
      const dialog = await screen.findByRole("dialog");
      const files = ["a.png", "b.jpg", "c.webp"].map(
        (name) => new File(["x"], name, { type: name.endsWith("png") ? "image/png" : name.endsWith("jpg") ? "image/jpeg" : "image/webp" }),
      );
      fireEvent.change(within(dialog).getByLabelText(/^Add photos/), { target: { files } });
      await waitFor(() => expect(within(dialog).getAllByLabelText(/^Image address/)).toHaveLength(4));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(sent?.images.map((image) => image.url)).toEqual([
        "/images/a.png",
        "/api/media/0197a000-0000-7000-8000-000000000001.webp",
        "/api/media/0197a000-0000-7000-8000-000000000002.webp",
        "/api/media/0197a000-0000-7000-8000-000000000003.webp",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows a clear message when someone else saved first", async () => {
    editor(() => {
      throw new ApiError("CONFLICT", "Someone else changed this product.", 409);
    });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save product" }));
    expect(await within(dialog).findByText(/Someone else saved this product while you were editing/)).toBeTruthy();
  });
});

/** A Pet House model as the API sends it; by default like the 60 sample models: not ready (#14). */
function houseProduct(overrides: Partial<AdminProduct> = {}, house: Partial<NonNullable<AdminProduct["house"]>> = {}): AdminProduct {
  return {
    ...adminProduct,
    id: "0197a000-0000-7000-8000-0000000000e1",
    slug: "terracotta-roof-cat-villa",
    category: "pet-houses",
    brand: null,
    petTypes: ["cats"],
    name: { en: "Terracotta Roof Cat Villa", ar: "فيلا القطط بسقف قرميدي" },
    house: {
      collection: "indoor",
      purchaseMode: "fixed",
      availability: "unconfirmed",
      dimensions: null,
      features: [],
      leadTime: null,
      deliveryFee: null,
      fulfilment: "delivery",
      provisional: true,
      source: null,
      ...house,
    },
    variants: [
      {
        id: "0197a000-0000-7000-8000-0000000000e2",
        code: "standard",
        sku: "PH-VILLA",
        label: { en: "Standard", ar: "قياسي" },
        weightGrams: null,
        price: 294200,
        stock: 0,
        lowStockThreshold: 5,
        active: true,
        pos: null,
      },
    ],
    ...overrides,
  };
}

const houseCategories = (active = true) => ({
  categories: [
    { id: "c1", slug: "food", name: { en: "Food & treats", ar: "طعام" }, sortOrder: 0, active: true, productCount: 1, isHouseCategory: false },
    { id: "c2", slug: "pet-houses", name: { en: "Pet Houses", ar: "بيوت الحيوانات" }, sortOrder: 1, active, productCount: 2, isHouseCategory: true },
  ],
});

describe("the Pet House editor (#14, D268)", () => {
  const staff: StaffProfile = {
    id: "s",
    email: "s@example.invalid",
    displayName: "Sara",
    isOwner: false,
    mustChangePassword: false,
    roleName: "Catalogue",
    permissions: normalisePermissions({ products: { view: true, edit: true, delete: false, export: false, refund: false } }),
  };

  function houseEditor(product: AdminProduct, put: (body: unknown) => unknown = () => product, categoryShown = true) {
    const api: ApiClient = {
      get: async (_path, schema) => schema.parse(houseCategories(categoryShown)) as never,
      post: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
      put: async (_path, body, schema) => schema.parse(await put(body)) as never,
      delete: async () => {
        throw new ApiError("NOT_FOUND", "x", 404);
      },
    };
    const onClose = vi.fn();
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={staff}>
              <ProductEditor initial={toWebAdminProduct(product)} onClose={onClose} />
            </AdminAccessProvider>
          </StaffIdentityProvider>
        </MockDataProvider>
      </SettingsProviders>,
    );
    return { onClose };
  }

  it("is four plain steps, with the checklist saying what is missing", async () => {
    houseEditor(houseProduct());
    const dialog = await screen.findByRole("dialog", { name: "Pet House editor" });
    for (const step of ["What it is", "Price and sizes", "Availability and delivery", "Ready for online orders"]) {
      expect(within(dialog).getByRole("group", { name: step })).toBeTruthy();
    }
    // Plain words: sizes, not "SKU options"; no "Sold as" or pack weight for a house.
    expect(within(dialog).getByText("Sizes and prices")).toBeTruthy();
    expect(within(dialog).getByLabelText("Size name · EN")).toHaveValue("Standard");
    expect(within(dialog).queryByLabelText("Sold as")).toBeNull();
    expect(within(dialog).queryByText("SKU options")).toBeNull();
    expect(within(dialog).getByLabelText("Suitable for")).toHaveValue("cats");
    const ready = within(dialog).getByRole("group", { name: "Ready for online orders" });
    expect(ready.textContent).toContain("Not ready: 4 left");
    expect(ready.textContent).toContain("Choose In stock or Made to order in step 3.");
    expect(ready.textContent).toContain("Add the days in step 3.");
    expect(ready.textContent).toContain("Add it in step 3 (0 = no extra charge).");
    expect(within(ready).getByRole("checkbox", { name: /Details checked/ })).not.toBeChecked();
    expect(ready.textContent).toContain("“Ask about it on WhatsApp” instead of Add to cart");
  });

  it("filling in the steps makes it ready, and saves what customers will see", async () => {
    let sent: { house: NonNullable<AdminProduct["house"]>; variants: { stock: number }[] } | undefined;
    const product = houseProduct();
    const { onClose } = houseEditor(product, (body) => {
      sent = body as typeof sent;
      return { ...product, version: 4 };
    });
    const dialog = await screen.findByRole("dialog", { name: "Pet House editor" });
    // In stock counts stock; made to order has none to count.
    fireEvent.click(within(dialog).getByRole("radio", { name: /^In stock/ }));
    expect(within(dialog).getByLabelText("Stock")).toBeDisabled();
    expect(within(dialog).getByLabelText("Low-stock threshold")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Made to order/ }));
    expect(within(dialog).queryByLabelText("Stock")).toBeNull();
    expect(within(dialog).queryByLabelText("Low-stock threshold")).toBeNull();
    // Both numbers of days or none: one alone makes the other required.
    const shortest = within(dialog).getByLabelText("Shortest · days");
    const longest = within(dialog).getByLabelText("Longest · days");
    expect(longest).not.toBeRequired();
    fireEvent.change(shortest, { target: { value: "7" } });
    expect(longest).toBeRequired();
    fireEvent.change(longest, { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Delivery charge for this house · QAR"), { target: { value: "100" } });
    const ready = within(dialog).getByRole("group", { name: "Ready for online orders" });
    expect(ready.textContent).toContain("Not ready: 1 left");
    fireEvent.click(within(ready).getByRole("checkbox", { name: /Details checked/ }));
    expect(ready.textContent).toContain("Ready: customers can order it online once you save.");
    expect(ready.textContent).toContain("Made to order: ready in about 7–10 days");
    expect(ready.textContent).toContain("Delivery: QAR");
    expect(ready.textContent).toContain("for this house, plus your area's usual fee");
    expect(ready.textContent).toContain("and the Add to cart button.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Pet House" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent?.house).toMatchObject({
      availability: "made-to-order",
      leadTime: { minDays: 7, maxDays: 10 },
      deliveryFee: 10000,
      provisional: false,
    });
  });

  it("a hidden model or Pet Houses category is not ready, and says where to show it", async () => {
    houseEditor(
      houseProduct({ active: false }, { availability: "made-to-order", leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 0, provisional: false }),
      undefined,
      false,
    );
    const dialog = await screen.findByRole("dialog", { name: "Pet House editor" });
    const ready = within(dialog).getByRole("group", { name: "Ready for online orders" });
    await waitFor(() => expect(ready.textContent).toContain("It is hidden: show it under Catalogue → Categories."));
    expect(ready.textContent).toContain("Set Store visibility to Active below.");
    expect(ready.textContent).toContain("Not ready: 1 left");
    expect(ready.textContent).toContain("Delivery charge: no extra charge");
    expect(ready.textContent).toContain("“Ask about it on WhatsApp” instead of Add to cart");
  });

  it("an empty delivery charge is not set yet; 0 is no extra charge", async () => {
    houseEditor(houseProduct({}, { availability: "made-to-order", leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 5000, provisional: false }));
    const dialog = await screen.findByRole("dialog", { name: "Pet House editor" });
    const ready = within(dialog).getByRole("group", { name: "Ready for online orders" });
    const charge = within(dialog).getByLabelText("Delivery charge for this house · QAR");
    expect(ready.textContent).toContain("Ready: customers can order it online once you save.");
    fireEvent.change(charge, { target: { value: "" } });
    expect(ready.textContent).toContain("Add it in step 3 (0 = no extra charge).");
    expect(ready.textContent).toContain("Not ready: 1 left");
    fireEvent.change(charge, { target: { value: "0" } });
    expect(ready.textContent).toContain("Delivery charge: no extra charge");
    expect(ready.textContent).toContain("Delivery: your area's usual fee, with no extra charge for this house");
  });

  it("price on request is never sold online", async () => {
    houseEditor(houseProduct({}, { purchaseMode: "inquiry", availability: "made-to-order", leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 0, provisional: false }));
    const dialog = await screen.findByRole("dialog", { name: "Pet House editor" });
    expect(within(dialog).getByRole("radio", { name: /^Price on request/ })).toBeChecked();
    expect(within(dialog).getByLabelText("Price · QAR")).toBeDisabled();
    const ready = within(dialog).getByRole("group", { name: "Ready for online orders" });
    expect(ready.textContent).toContain("Choose Fixed price in step 2");
    expect(ready.textContent).toContain("“Price on request” and “Ask for a price on WhatsApp”");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Fixed price/ }));
    expect(ready.textContent).toContain("Ready: customers can order it online once you save.");
  });
});

describe("the Pet Houses tab (#14)", () => {
  const owner: StaffProfile = {
    id: "o",
    email: "o@example.invalid",
    displayName: "Owner",
    isOwner: true,
    mustChangePassword: false,
    roleName: "Owner",
    permissions: normalisePermissions({ products: { view: true, edit: true, delete: true, export: false, refund: false } }),
  };
  const ready = houseProduct(
    { id: "0197a000-0000-7000-8000-0000000000f1", slug: "ready-cabin", name: { en: "Ready Cabin", ar: "كوخ جاهز" } },
    { availability: "made-to-order", leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 10000, provisional: false },
  );
  const sample = houseProduct({}, { leadTime: { minDays: 7, maxDays: 10 } });
  const onlyFee = houseProduct(
    { id: "0197a000-0000-7000-8000-0000000000f2", slug: "fee-missing", name: { en: "Fee Missing Hut", ar: "كوخ" } },
    { availability: "in-stock", leadTime: { minDays: 1, maxDays: 2 }, provisional: false },
  );

  const paused = houseProduct(
    { id: "0197a000-0000-7000-8000-0000000000f3", slug: "paused-house", name: { en: "Paused Palace", ar: "قصر" }, active: false },
    { availability: "made-to-order", leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 0, provisional: false },
  );

  function renderTab() {
    const api: ApiClient = {
      get: async (path, schema) =>
        schema.parse(path.includes("categories") ? houseCategories() : { products: [adminProduct, ready, sample, onlyFee, paused] }) as never,
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
    render(
      <SettingsProviders api={api}>
        <MockDataProvider>
          <StaffIdentityProvider demoRole="core">
            <AdminAccessProvider staff={owner}>
              <DashboardDateProvider>
                <CatalogueWorkspaceProvider>
                  <AdminProductsPage />
                </CatalogueWorkspaceProvider>
              </DashboardDateProvider>
            </AdminAccessProvider>
          </StaffIdentityProvider>
        </MockDataProvider>
      </SettingsProviders>,
    );
  }

  const row = (name: string) => screen.getAllByRole("row").find((item) => item.textContent?.includes(name));

  it("marks each model ready or not, with what is missing, and filters by it", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /^Pet Houses/ }));
    await screen.findByText("Ready Cabin");
    expect(row("Ready Cabin")?.textContent).toContain("Ready to order online");
    expect(row("Terracotta Roof Cat Villa")?.textContent).toContain("Not ready: 3 things missing");
    expect(row("Fee Missing Hut")?.textContent).toContain("Not ready: delivery charge missing");
    expect(row("Paused Palace")?.textContent).toContain("Ready, but hidden from customers");
    // Made to order has no stock count; an unconfirmed model says so.
    expect(row("Ready Cabin")?.textContent).toContain("Made to order");
    expect(row("Terracotta Roof Cat Villa")?.textContent).toContain("Unconfirmed");
    fireEvent.change(screen.getByRole("combobox", { name: "Online orders" }), { target: { value: "not-ready" } });
    await waitFor(() => expect(screen.queryByText("Ready Cabin")).toBeNull());
    expect(screen.getByText("Terracotta Roof Cat Villa")).toBeTruthy();
    expect(screen.getByText("Fee Missing Hut")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Online orders" }), { target: { value: "ready" } });
    expect(await screen.findByText("Ready Cabin")).toBeTruthy();
    expect(screen.queryByText("Terracotta Roof Cat Villa")).toBeNull();
    // Out of stock: an in-stock model with none left, never a made-to-order one (it has no stock to count).
    fireEvent.change(screen.getByRole("combobox", { name: "Online orders" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Catalogue stock" }), { target: { value: "out" } });
    expect(await screen.findByText("Fee Missing Hut")).toBeTruthy();
    expect(screen.queryByText("Ready Cabin")).toBeNull();
    // The Products tab has no such filter.
    fireEvent.click(screen.getByRole("button", { name: /^Products/ }));
    expect(screen.queryByRole("combobox", { name: "Online orders" })).toBeNull();
  });

  it("the details panel says whether the model can be ordered online", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /^Pet Houses/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Details for Fee Missing Hut" }));
    const fact = async (name: string) =>
      (await screen.findAllByRole("term")).find((term) => term.textContent === name)?.nextElementSibling?.textContent;
    expect(await fact("Online orders")).toBe("Not ready: delivery charge missing");
    expect(await fact("Availability")).toBe("In stock");
    expect(await fact("Ready in about")).toBe("1–2 days");
    expect(await fact("Delivery charge")).toBe("Not set yet");
  });
});
