// 7b-2: the cart kept in the browser, checkout against the API, the order page and My orders; 10b: the
// profile and saved addresses at checkout.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  CheckoutQuote,
  CheckoutQuoteRequest,
  CheckoutRequest,
  CustomerOrder,
  DeliveryOptionsResponse,
  PublicDeliveryWindow,
  PublicProduct,
  QatarAddress,
  SavedAddress,
  SavedAddressInput,
} from "@nennus-catio/contracts";
import type { ZodType } from "zod";
import { MyOrdersPage } from "@/features/account/pages/MyOrdersPage";
import { CartPage } from "@/features/cart/pages/CartPage";
import { CheckoutApiPage } from "@/features/checkout/pages/CheckoutApiPage";
import { OrderPage } from "@/features/orders/pages/OrderPage";
import { type ApiClient, ApiError, type RequestOptions } from "@/shared/api/client";
import { isSafePaymentUrl, paymentNavigation } from "@/shared/api/payments";
import { CART_STORAGE_KEY, type CartLine, CartProvider, parseStoredCart, useCart } from "@/shared/cart/CartProvider";
import { areasByCity } from "@/shared/lib/delivery-areas";
import { formatMoney } from "@/shared/lib/format";
import { fakeGeolocation } from "./helpers/geolocation";
import { SettingsProviders } from "./helpers/settings";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/checkout",
  useRouter: () => ({ push, replace: push }),
}));

beforeEach(() => {
  push.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- Fixtures -------------------------------------------------------------------------------------

const AREA_ID = "0197a000-0000-7000-8000-0000000000a1";
const WINDOW_ID = "0197a000-0000-7000-8000-0000000000b1";
const REFERENCE = "NC-261009-4F7KQ2";
const GUEST_KEY = "k".repeat(43);

const product: PublicProduct = {
  slug: "cat-food",
  category: "food",
  brand: null,
  featured: false,
  bestSeller: false,
  name: { en: "Everyday Cat Nutrition", ar: "تغذية القطط اليومية" },
  description: { en: "Desc", ar: "وصف" },
  petTypes: ["cats"],
  images: [{ url: "/images/a.png", alt: { en: "A", ar: "أ" } }],
  variants: [{ code: "cf-15", sku: "FO-CF-15", label: { en: "1.5 kg pack", ar: "عبوة" }, weightGrams: 1500, price: 8500, salePrice: null, stock: 5 }],
  house: null,
  offers: [],
};
const options: DeliveryOptionsResponse = {
  areas: [{ id: AREA_ID, name: { en: "West Bay", ar: "الخليج الغربي" }, fee: 1500, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } }],
  pickup: { enabled: true, instructions: { en: "Collect at the counter.", ar: "الاستلام من الكاونتر." } },
  leadTimeMinutes: 120,
  horizonDays: 14,
};
const windows: PublicDeliveryWindow[] = [
  { id: WINDOW_ID, date: "2026-10-09", start: "09:00", end: "12:00", startsAt: "2026-10-09T06:00:00.000Z", seatsLeft: 4 },
];

function order(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    reference: REFERENCE,
    status: "awaiting_payment",
    fulfilment: "delivery",
    placedAt: new Date().toISOString(),
    holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    contact: { name: "Sara", email: "sara@example.invalid", phone: "+974 5555 1234" },
    delivery: {
      area: { en: "West Bay", ar: "الخليج الغربي" },
      address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: null },
      window: { date: "2026-10-09", start: "09:00", end: "12:00" },
    },
    lines: [
      {
        product: "cat-food",
        variant: "cf-15",
        sku: "FO-CF-15",
        name: product.name,
        label: { en: "1.5 kg pack", ar: "عبوة" },
        weightGrams: 1500,
        unitPrice: 8500,
        quantity: 2,
        discount: 0,
        lineTotal: 17000,
        house: null,
      },
    ],
    subtotal: 17000,
    deliveryFee: 1500,
    houseDeliveryFee: 0,
    discount: 0,
    total: 18500,
    promotions: [],
    canCancel: true,
    refundNeeded: false,
    cancelledAt: null,
    payment: { canPay: true, latest: null, attemptsLeft: 3, attention: null },
    ...overrides,
  };
}

// --- API stub ------------------------------------------------------------------------------------

type Handler = (body: unknown, options?: RequestOptions) => unknown;
interface Call {
  key: string;
  body: unknown;
  options?: RequestOptions;
}

function stubApi(routes: Record<string, Handler>): ApiClient & { calls: Call[] } {
  const calls: Call[] = [];
  const handle = async <T,>(key: string, body: unknown, schema: ZodType<T>, options?: RequestOptions): Promise<T> => {
    calls.push({ key, body, options });
    const route = routes[key];
    if (!route) throw new ApiError("NOT_FOUND", `No stub for ${key}`, 404);
    return schema.parse(await route(body, options));
  };
  return {
    calls,
    get: (path, schema, options) => handle(`GET ${path}`, undefined, schema, options),
    post: (path, body, schema, options) => handle(`POST ${path}`, body, schema, options),
    put: (path, body, schema) => handle(`PUT ${path}`, body, schema),
    delete: (path, schema) => handle(`DELETE ${path}`, undefined, schema),
  };
}

const guestSession: Handler = () => {
  throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
};

/**
 * The server's price (11e): the list prices, the area's fee and, when a test gives one, a discount on the
 * first line from one promotion.
 */
function priceOf(request: CheckoutQuoteRequest, offer?: { name: string; code?: string | null; discount: number }): CheckoutQuote {
  const lines = request.lines.map((line, index) => {
    const unitPrice = product.variants.find((variant) => variant.code === line.variant)?.price ?? 0;
    const discount = index === 0 ? (offer?.discount ?? 0) : 0;
    return { product: line.product, variant: line.variant, unitPrice, quantity: line.quantity, discount, lineTotal: unitPrice * line.quantity - discount };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discount = offer?.discount ?? 0;
  const deliveryFee = request.delivery ? (options.areas.find((area) => area.id === request.delivery?.areaId)?.fee ?? 0) : 0;
  return {
    lines,
    subtotal,
    discount,
    deliveryFee,
    houseDeliveryFee: 0,
    houseLeadDays: null,
    total: subtotal + deliveryFee - discount,
    promotions: offer ? [{ name: { en: offer.name, ar: `عرض ${offer.name}` }, code: offer.code ?? null, discount }] : [],
    code: request.code ? { status: "applied", message: "The code is applied." } : null,
  };
}

function checkoutRoutes(extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /catalog/products": () => ({ products: [product] }),
    "POST /checkout/quote": (body) => priceOf(body as CheckoutQuoteRequest),
    "GET /delivery/options": () => options,
    "GET /delivery/windows": () => ({ windows }),
    "GET /auth/me": guestSession,
    ...extra,
  };
}

function renderWith(ui: ReactNode, api: ApiClient, cart?: CartLine[]) {
  if (cart) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  return render(
    <SettingsProviders api={api}>
      <CartProvider>{ui}</CartProvider>
    </SettingsProviders>,
  );
}

const twoPacks: CartLine[] = [{ productId: "cat-food", variantId: "cf-15", quantity: 2 }];
const posts = (api: { calls: Call[] }, key: string) => api.calls.filter((call) => call.key === key);

async function fillDelivery() {
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Sara" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sara@example.invalid" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+974 5555 1234" } });
  fireEvent.change(screen.getByLabelText("Area"), { target: { value: AREA_ID } });
  fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "66" } });
  fireEvent.change(screen.getByLabelText("Street"), { target: { value: "850" } });
  fireEvent.change(screen.getByLabelText("Building"), { target: { value: "12" } });
  // The delivery time in the shared date and time picker (D249): it opens on the first free day, and
  // each window says how many places are left.
  fireEvent.click(await screen.findByRole("button", { name: "09:00 AM – 12:00 PM 4 left" }));
}

// --- Cart ------------------------------------------------------------------------------------------

function CartProbe() {
  const { cart, setCart, ready } = useCart();
  return (
    <div>
      <p>{ready ? `lines:${cart.length}` : "reading"}</p>
      <button type="button" onClick={() => setCart([...cart, { productId: "dog-food", variantId: "df-2", quantity: 1 }])}>
        add
      </button>
      <button type="button" onClick={() => setCart([])}>
        empty
      </button>
    </div>
  );
}

describe("cart kept in the browser", () => {
  it("reads the saved cart before saving anything, so a refresh keeps it", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(twoPacks));
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("lines:1")).toBeTruthy();
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))).toEqual(twoPacks);
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "empty" }));
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("drops malformed saved lines and keeps working when the browser blocks storage", async () => {
    expect(
      parseStoredCart(
        JSON.stringify([
          { productId: "cat-food", variantId: "cf-15", quantity: 500 },
          { productId: "cat-food", variantId: "cf-15", quantity: 1 },
          { productId: "<script>", variantId: "x", quantity: 1 },
          { productId: "dog-food", variantId: "df-2", quantity: 1.5 },
          "nonsense",
        ]),
      ),
    ).toEqual([{ productId: "cat-food", variantId: "cf-15", quantity: 99 }]);
    expect(parseStoredCart("{not json")).toEqual([]);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("lines:0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByText("lines:1")).toBeTruthy();
  });

  it("keeps every quantity between 1 and 99 whenever the cart changes, not only when it is read (review L12)", async () => {
    function QuantityProbe() {
      const { cart, setCart, ready } = useCart();
      const set = (quantity: number) => setCart([{ productId: "cat-food", variantId: "cf-15", quantity }]);
      return (
        <div>
          <p>{ready ? `quantity:${cart[0]?.quantity ?? "none"}` : "reading"}</p>
          <button type="button" onClick={() => set(150)}>too many</button>
          <button type="button" onClick={() => set(0)}>zero</button>
          <button type="button" onClick={() => set(2.7)}>fraction</button>
        </div>
      );
    }
    render(
      <CartProvider>
        <QuantityProbe />
      </CartProvider>,
    );
    expect(await screen.findByText("quantity:none")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "too many" }));
    expect(screen.getByText("quantity:99")).toBeTruthy();
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))[0]?.quantity).toBe(99);
    fireEvent.click(screen.getByRole("button", { name: "zero" }));
    expect(screen.getByText("quantity:1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "fraction" }));
    expect(screen.getByText("quantity:2")).toBeTruthy();
  });
});

// --- Checkout ------------------------------------------------------------------------------------

describe("checkout against the API", () => {
  it("reads fresh prices, shows the total and sends exactly the order the customer saw", async () => {
    const api = stubApi(
      checkoutRoutes({ "POST /checkout": () => ({ order: order(), guestKey: GUEST_KEY }) }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    // Logging in from checkout comes back to checkout; the cart is kept in the browser (review M8).
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/account/login?next=%2Fcheckout");
    expect(screen.getByRole("option", { name: `West Bay · ${formatMoney(1500, "en")}` })).toBeTruthy();
    // Areas sit under their city heading (D135).
    expect(within(screen.getByRole("group", { name: "Doha" })).getByRole("option", { name: /West Bay/ })).toBeTruthy();
    // Testing Library collapses the non-breaking space in the formatted amount.
    expect(screen.getByText(formatMoney(17000 + 1500, "en").replace(/\s/g, " "))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/orders/${REFERENCE}#k=${GUEST_KEY}`));

    const [sent] = posts(api, "POST /checkout");
    expect(sent?.body).toMatchObject({
      locale: "en",
      contact: { name: "Sara", email: "sara@example.invalid", phone: "+974 5555 1234" },
      fulfilment: "delivery",
      delivery: { areaId: AREA_ID, windowId: WINDOW_ID, address: { zone: "66", street: "850", building: "12" } },
      lines: [{ product: "cat-food", variant: "cf-15", quantity: 2 }],
      expectedTotal: 17000 + 1500,
    });
    expect((sent?.body as { idempotencyKey?: string } | undefined)?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    for (const read of ["GET /catalog/products", "GET /delivery/options", "GET /delivery/windows"]) {
      expect(api.calls.find((call) => call.key === read)?.options?.cache).toBe("no-store");
    }
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(`nc-order-key:${REFERENCE}`)).toBe(GUEST_KEY);
  });

  it("a shared location goes with the delivery (D263)", async () => {
    fakeGeolocation({ latitude: 25.285447, longitude: 51.53104, accuracy: 8.4 });
    const api = stubApi(checkoutRoutes({ "POST /checkout": () => ({ order: order(), guestKey: GUEST_KEY }) }));
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    expect(screen.getByText("Optional: it helps our driver find you.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByText("Location shared (± 9 m)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    expect((posts(api, "POST /checkout")[0]?.body as CheckoutRequest | undefined)?.delivery?.address.pin).toEqual({ lat: 25.285447, lng: 51.53104, accuracy: 9 });
  });

  it("when the delivery time just filled up: says so, reloads the times and clears the choice", async () => {
    const api = stubApi(
      checkoutRoutes({
        "POST /checkout": () => {
          throw new ApiError("SLOT_UNAVAILABLE", "This delivery time is no longer available.", 409);
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    const before = posts(api, "GET /delivery/windows").length;
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That delivery time has just filled up");
    await waitFor(() => expect(posts(api, "GET /delivery/windows").length).toBeGreaterThan(before));
    expect(screen.getByRole("button", { name: /^09:00 AM – 12:00 PM/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Choose a date and a time.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))).toEqual(twoPacks);
  });

  it("a retry of the same order reuses its key; a changed order gets a new key", async () => {
    const api = stubApi(
      checkoutRoutes({
        "POST /checkout": () => {
          throw new ApiError("NETWORK", "The server could not be reached.");
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    const placeOrder = () => fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    placeOrder();
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    await screen.findByRole("alert");
    placeOrder();
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+974 5555 9999" } });
    await screen.findByRole("alert");
    placeOrder();
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(3));
    const keys = posts(api, "POST /checkout").map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("pickup has no address, time or fee; fields are checked before anything is sent", async () => {
    const api = stubApi(
      checkoutRoutes({ "POST /checkout": () => ({ order: order({ fulfilment: "pickup", delivery: null, deliveryFee: 0, total: 17000 }), guestKey: GUEST_KEY }) }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    fireEvent.click(await screen.findByRole("button", { name: "Pick up from the shop" }));
    expect(screen.queryByLabelText("Zone")).toBeNull();
    expect(screen.getByText("Collect at the counter.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(posts(api, "POST /checkout")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sara@example.invalid" } });
    // Another country's local format: SkipCash refuses it at payment, so checkout refuses it first (8c).
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0919987622" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText("Use a Qatari number, or add your country code with + (for example +63 912 345 6789).")).toBeTruthy();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
    expect(posts(api, "POST /checkout")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "55551234" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    expect(posts(api, "POST /checkout")[0]?.body).toMatchObject({ fulfilment: "pickup", delivery: null, expectedTotal: 17000 });
  });

  it("field problems are explained in plain words, in English and Arabic", async () => {
    const api = stubApi(checkoutRoutes());
    renderWith(<CheckoutApiPage />, api, twoPacks);
    fireEvent.click(await screen.findByRole("button", { name: "Place order" }));
    expect(await screen.findByText("Choose your area.")).toBeTruthy();
    expect(screen.getByText("Choose a delivery time.")).toBeTruthy();
    expect(screen.getByText("Please enter your name.")).toBeTruthy();
    expect(screen.getAllByText("Numbers only.")).toHaveLength(3);
    expect(screen.queryByText(/Invalid|expected string/)).toBeNull();
    expect(posts(api, "POST /checkout")).toHaveLength(0);
    cleanup();

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(twoPacks));
    render(
      <SettingsProviders api={stubApi(checkoutRoutes())} locale="ar">
        <CartProvider>
          <CheckoutApiPage />
        </CartProvider>
      </SettingsProviders>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "أرسل الطلب" }));
    expect(await screen.findByText("اختر منطقتك.")).toBeTruthy();
    expect(screen.getByText("اختر موعد التوصيل.")).toBeTruthy();
  });

  it("logged-in customers order with their account email", async () => {
    const api = stubApi(
      checkoutRoutes({ "GET /auth/me": () => ({ id: "c1", email: "member@example.invalid", emailVerified: true }) }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    const email = await screen.findByLabelText("Email");
    expect(email).toHaveValue("member@example.invalid");
    expect(email).toHaveAttribute("readonly");
    expect(screen.getByText("Ordering as member@example.invalid")).toBeTruthy();
  });

  it("a quantity problem is shown on its line, in plain words (review L12)", async () => {
    const api = stubApi(
      checkoutRoutes({
        "POST /checkout": () => {
          throw new ApiError("VALIDATION_FAILED", "Please check the highlighted fields.", 400, {
            fields: [{ path: "lines.0.quantity", message: "Too big: expected number to be <=99" }],
          });
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/You can order up to 99 of one item\./)).toBeTruthy();
    expect(screen.queryByText(/no longer available/)).toBeNull();
  });

  it("items that can no longer be ordered send the customer back to the cart", async () => {
    const api = stubApi(checkoutRoutes());
    renderWith(<CheckoutApiPage />, api, [{ productId: "gone-item", variantId: "pack", quantity: 1 }]);
    expect(await screen.findByText(/need your attention/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Place order" })).toBeNull();
  });
});

// --- Order page ----------------------------------------------------------------------------------

const PAYMENT = `${REFERENCE}-P1`;
const payNowAnswer = (checkoutUrl = "/en/payments/fake/fake_0197a000-0000-7000-8000-0000000000c1") => ({
  payment: { reference: PAYMENT, status: "pending", checkoutUrl },
  holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
});

// --- 10b: logged-in customers' saved details ------------------------------------------------------

const FAR_AREA = "0197a000-0000-7000-8000-0000000000a2";
const SAVED_HOME = "0197a000-0000-7000-8000-0000000000d1";
const SAVED_OFFICE = "0197a000-0000-7000-8000-0000000000d2";
const SAVED_FAR = "0197a000-0000-7000-8000-0000000000d3";
const NEW_ADDRESS = "0197a000-0000-7000-8000-0000000000d4";
const member = { id: "c1", email: "member@example.invalid", emailVerified: true, name: "Mariam", phone: "+974 5555 9876" };
const PLATE: QatarAddress = { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: null };

function savedAddress(id: string, label: string, options: { isDefault?: boolean; areaId?: string; delivery?: boolean; plate?: Partial<QatarAddress> } = {}): SavedAddress {
  return {
    id,
    label,
    area: { id: options.areaId ?? AREA_ID, name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } },
    address: { ...PLATE, ...options.plate, pin: options.plate?.pin ?? null },
    isDefault: options.isDefault ?? false,
    delivery: options.delivery ?? true,
    homeVisits: true,
    version: 1,
  };
}

async function chooseWindow() {
  // The delivery time in the shared date and time picker (D249): it opens on the first free day, and
  // each window says how many places are left.
  fireEvent.click(await screen.findByRole("button", { name: "09:00 AM – 12:00 PM 4 left" }));
}

describe("checkout with saved details (10b)", () => {
  it("fills the name and phone from the profile and delivers to the default saved address", async () => {
    const api = stubApi(
      checkoutRoutes({
        "GET /auth/me": () => member,
        "GET /account/addresses": () => ({
          addresses: [
            savedAddress(SAVED_HOME, "Home", { isDefault: true, plate: { zone: "61", street: "300", building: "7", flat: "4", pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } } }),
            savedAddress(SAVED_OFFICE, "Office"),
            savedAddress(SAVED_FAR, "Beach house", { areaId: FAR_AREA, delivery: false }),
          ],
        }),
        "POST /checkout": () => ({ order: order(), guestKey: null }),
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    expect(await screen.findByLabelText("Name")).toHaveValue("Mariam");
    expect(screen.getByLabelText("Phone")).toHaveValue("+974 5555 9876");
    const deliverTo = screen.getByRole("group", { name: "Deliver to" });
    expect(within(deliverTo).getByRole("radio", { name: /^Home/ })).toBeChecked();
    expect(within(deliverTo).getByRole("radio", { name: /^Beach house/ })).toBeDisabled();
    expect(within(deliverTo).getByText("We do not deliver to this area at the moment.")).toBeTruthy();
    // The saved address is the order's address: no fields to fill, nothing offered to save.
    expect(screen.queryByLabelText("Area")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Save this address for next time" })).toBeNull();
    expect(screen.getByText("Location shared (± 15 m)")).toBeTruthy();

    await chooseWindow();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    expect(posts(api, "POST /checkout")[0]?.body).toMatchObject({
      contact: { name: "Mariam", email: "member@example.invalid", phone: "+974 5555 9876" },
      // The saved address brings its own point (D263).
      delivery: { areaId: AREA_ID, windowId: WINDOW_ID, address: { ...PLATE, zone: "61", street: "300", building: "7", flat: "4", pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } } },
    });
    expect(posts(api, "POST /account/addresses")).toHaveLength(0);
  });

  it("another saved address can be chosen, or a new one typed", async () => {
    const api = stubApi(
      checkoutRoutes({
        "GET /auth/me": () => member,
        "GET /account/addresses": () => ({
          addresses: [savedAddress(SAVED_HOME, "Home", { isDefault: true }), savedAddress(SAVED_OFFICE, "Office", { plate: { zone: "25", street: "920", building: "33" } })],
        }),
        "POST /checkout": () => ({ order: order(), guestKey: null }),
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    fireEvent.click(await screen.findByRole("radio", { name: /^Office/ }));
    fireEvent.click(screen.getByRole("radio", { name: "A new address" }));
    expect(screen.getByLabelText("Zone")).toHaveValue("");
    // Two addresses are saved already: saving this one is offered, not ticked.
    expect(screen.getByRole("checkbox", { name: "Save this address for next time" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /^Office/ }));
    await chooseWindow();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    expect((posts(api, "POST /checkout")[0]?.body as CheckoutRequest | undefined)?.delivery?.address).toEqual({ ...PLATE, zone: "25", street: "920", building: "33" });
  });

  it("a new address is saved through the account first (ticked when none is saved yet), and only once", async () => {
    let saved: SavedAddress[] = [];
    let attempts = 0;
    const api = stubApi(
      checkoutRoutes({
        "GET /auth/me": () => ({ ...member, name: null, phone: null }),
        "GET /account/addresses": () => ({ addresses: saved }),
        "POST /account/addresses": (body) => {
          const input = body as SavedAddressInput;
          saved = [{ ...savedAddress(NEW_ADDRESS, input.label, { isDefault: true }), address: input.address }];
          return { addresses: saved };
        },
        "POST /checkout": () => {
          attempts += 1;
          if (attempts === 1) throw new ApiError("PRICE_CHANGED", "A price changed.", 409);
          return { order: order(), guestKey: null };
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    expect(await screen.findByLabelText("Name")).toHaveValue("");
    expect(screen.queryByRole("group", { name: "Deliver to" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Save this address for next time" })).toBeChecked();
    expect(screen.getByLabelText("Name for this address (for example Home)")).toHaveValue("Home");

    await fillDelivery();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    const keys = api.calls.map((call) => call.key);
    expect(keys.indexOf("POST /account/addresses")).toBeLessThan(keys.indexOf("POST /checkout"));
    expect(posts(api, "POST /account/addresses")[0]?.body).toEqual({ label: "Home", areaId: AREA_ID, address: PLATE, makeDefault: false });

    // The first try was refused; the address is a saved one now, so trying again does not save it twice.
    expect(await screen.findByRole("radio", { name: /^Home/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(2));
    expect(posts(api, "POST /account/addresses")).toHaveLength(1);
    expect(posts(api, "POST /checkout")[1]?.body).toEqual(posts(api, "POST /checkout")[0]?.body);
  });

  it("when the address cannot be saved, nothing is ordered and the reason is shown", async () => {
    const api = stubApi(
      checkoutRoutes({
        "GET /auth/me": () => member,
        "GET /account/addresses": () => ({ addresses: [] }),
        "POST /account/addresses": () => {
          throw new ApiError("LIMIT_REACHED", "Limit reached.", 409);
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/The address could not be saved, so the order was not placed: You can save up to 5 addresses/)).toBeTruthy();
    expect(posts(api, "POST /checkout")).toHaveLength(0);
  });

  it("when the saved addresses cannot be read, checkout still works without them", async () => {
    const api = stubApi(
      checkoutRoutes({
        "GET /auth/me": () => member,
        "GET /account/addresses": () => {
          throw new ApiError("INTERNAL", "Down.", 500);
        },
        "POST /checkout": () => ({ order: order(), guestKey: null }),
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    expect(screen.queryByRole("checkbox", { name: "Save this address for next time" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(posts(api, "POST /checkout")).toHaveLength(1));
    expect(posts(api, "POST /account/addresses")).toHaveLength(0);
  });
});

describe("order page", () => {
  it("a guest link opens the order with its private key; Pay now goes to the payment page (8b)", async () => {
    window.location.hash = `#k=${GUEST_KEY}`;
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => {});
    const base = order();
    const pinned = order({ delivery: base.delivery && { ...base.delivery, address: { ...base.delivery.address, pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } } } });
    const api = stubApi({
      [`GET /guest-orders/${REFERENCE}`]: () => pinned,
      [`POST /guest-orders/${REFERENCE}/pay`]: () => payNowAnswer(),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText("Your order is waiting for payment")).toBeTruthy();
    // The point the customer shared (D263).
    expect(screen.getByRole("link", { name: "Location shared · View on Google Maps" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
    expect(screen.getByText(/Please pay within 15 minutes/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Simulate payment/ })).toBeNull();
    // The delivery day by name and the time in 12-hour form (D249).
    expect(screen.getByText(/Friday 9 October ·/).textContent).toMatch(/^Friday 9 October · 09:00 AM – 12:00 PM \(Qatar time\)$/);
    const read = api.calls.find((call) => call.key === `GET /guest-orders/${REFERENCE}`);
    expect(read?.options?.headers).toEqual({ "X-Order-Key": GUEST_KEY });

    fireEvent.click(screen.getByRole("button", { name: /^Pay QAR\s?185\.00 now$/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/en/payments/fake/fake_0197a000-0000-7000-8000-0000000000c1"));
    expect(posts(api, `POST /guest-orders/${REFERENCE}/pay`)[0]?.options?.headers).toEqual({ "X-Order-Key": GUEST_KEY });
    expect(screen.getByRole("button", { name: /^Pay QAR/ })).toBeDisabled();
  });

  it("never leaves for a payment address that is not https or this site", async () => {
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => {});
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () => order(),
      [`POST /orders/${REFERENCE}/pay`]: () => payNowAnswer("javascript:alert(1)"),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    fireEvent.click(await screen.findByRole("button", { name: /^Pay QAR/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    expect(isSafePaymentUrl("https://pay.example.invalid/x")).toBe(true);
    expect(isSafePaymentUrl("/en/payments/fake/x")).toBe(true);
    expect(isSafePaymentUrl("//elsewhere.invalid/x")).toBe(false);
    expect(isSafePaymentUrl("http://pay.example.invalid/x")).toBe(false);
  });

  it("back from the payment page it checks the payment until the order is confirmed", async () => {
    window.history.replaceState(null, "", `/en/orders/${REFERENCE}?payment=${PAYMENT}`);
    window.sessionStorage.setItem(`nc-order-key:${REFERENCE}`, GUEST_KEY);
    let reads = 0;
    const api = stubApi({
      [`GET /guest-orders/${REFERENCE}`]: () => {
        reads += 1;
        return reads < 2
          ? order({ payment: { canPay: true, latest: { reference: PAYMENT, status: "pending" }, attemptsLeft: 2, attention: null } })
          : order({
              status: "confirmed",
              holdExpiresAt: null,
              payment: { canPay: false, latest: { reference: PAYMENT, status: "succeeded" }, attemptsLeft: 2, attention: null },
            });
      },
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText("Checking your payment")).toBeTruthy();
    expect(screen.getByText(/Checking your payment… This takes a few seconds/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue to payment/ })).toBeNull();
    expect(await screen.findByText("Thank you, your order is confirmed", undefined, { timeout: 4_000 })).toBeTruthy();
    // The guest key came from this tab's memory: the way back has no #k=.
    const asked = posts(api, `GET /guest-orders/${REFERENCE}`);
    expect(asked.length).toBeGreaterThan(1);
    expect(asked.every((call) => call.options?.headers?.["X-Order-Key"] === GUEST_KEY)).toBe(true);
  });

  it("a payment that did not go through offers Pay again with the attempts left (D138)", async () => {
    window.history.replaceState(null, "", `/en/orders/${REFERENCE}?payment=${PAYMENT}`);
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () =>
        order({ payment: { canPay: true, latest: { reference: PAYMENT, status: "failed" }, attemptsLeft: 2, attention: null } }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/Your payment did not go through\. You can try again \(2 attempts left\)\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay again" })).toBeTruthy();
    expect(screen.queryByText("Checking your payment")).toBeNull();
  });

  it("an open payment offers Continue to payment; cancelling says a payment made is refunded (D146)", async () => {
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () =>
        order({ payment: { canPay: true, latest: { reference: PAYMENT, status: "pending" }, attemptsLeft: 2, attention: null } }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("button", { name: "Continue to payment" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(screen.getByText("Cancel this order? If you already paid, we will refund you.")).toBeTruthy();
  });

  it("no attempts left: no pay button, and the customer is told to order again (D147)", async () => {
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () =>
        order({ payment: { canPay: false, latest: { reference: `${REFERENCE}-P3`, status: "failed" }, attemptsLeft: 0, attention: null } }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/reached the limit of 3 payment attempts/)).toBeTruthy();
    expect(screen.getByText("Your payment did not go through.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });

  it("a payment received too late says what happens next (D136)", async () => {
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () =>
        order({
          status: "expired",
          holdExpiresAt: null,
          canCancel: false,
          payment: { canPay: false, latest: { reference: PAYMENT, status: "succeeded" }, attemptsLeft: 2, attention: "paid_after_expiry" },
        }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText("We received your payment")).toBeTruthy();
    expect(screen.getByText(/We will contact you to arrange another time or refund you/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });

  it("cancelling asks first, then shows the refund for a paid order", async () => {
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () => order({ status: "confirmed", holdExpiresAt: null }),
      [`POST /orders/${REFERENCE}/cancel`]: () =>
        order({ status: "cancelled", holdExpiresAt: null, canCancel: false, refundNeeded: true, cancelledAt: new Date().toISOString() }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(posts(api, `POST /orders/${REFERENCE}/cancel`)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel the order" }));
    expect(await screen.findByText("This order is cancelled")).toBeTruthy();
    expect(screen.getByText(/We will refund/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  it("without a key: a login prompt when logged out, a clear message when not found", async () => {
    const loggedOut = stubApi({
      [`GET /orders/${REFERENCE}`]: () => {
        throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
      },
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, loggedOut);
    expect(await screen.findByText("Log in to see this order.")).toBeTruthy();
    // After logging in, the customer comes back to this order (review M8).
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/account/login?next=%2Forders%2F${REFERENCE}`);
    cleanup();

    window.location.hash = "#k=wrong";
    const missing = stubApi({ "GET /delivery/options": () => options });
    renderWith(<OrderPage reference={REFERENCE} />, missing);
    expect(await screen.findByText(/We could not find this order/)).toBeTruthy();
  });

  it("when the time to pay runs out, the page says so and asks the server again", async () => {
    window.location.hash = `#k=${GUEST_KEY}`;
    const api = stubApi({
      [`GET /guest-orders/${REFERENCE}`]: () => order({ holdExpiresAt: new Date(Date.now() - 1_000).toISOString() }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/The time to pay has run out/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    await waitFor(() => expect(posts(api, `GET /guest-orders/${REFERENCE}`).length).toBeGreaterThan(1));
  });
});

// --- My orders -----------------------------------------------------------------------------------

describe("My orders", () => {
  it("lists the account's orders with links, newest first as the server sends them", async () => {
    const api = stubApi({
      "GET /auth/me": () => ({ id: "c1", email: "member@example.invalid", emailVerified: true }),
      "GET /orders": () => ({
        orders: [
          { reference: REFERENCE, status: "confirmed", fulfilment: "delivery", placedAt: "2026-10-08T07:00:00.000Z", discount: 1500, total: 18500, hasHouse: false },
          { reference: "NC-261007-AB12CD", status: "cancelled", fulfilment: "pickup", placedAt: "2026-10-07T07:00:00.000Z", discount: 0, total: 900, hasHouse: false },
        ],
      }),
    });
    renderWith(<MyOrdersPage />, api);
    const links = await screen.findAllByRole("link", { name: /NC-/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/orders/${REFERENCE}`, "/orders/NC-261007-AB12CD"]);
    expect(within(links[0] as HTMLElement).getByText("Confirmed")).toBeTruthy();
    // What offers saved (11e); nothing is said when there was no discount.
    expect(within(links[0] as HTMLElement).getByText(`Saved ${formatMoney(1500, "en")}`.replace(/\s/g, " "))).toBeTruthy();
    expect(within(links[1] as HTMLElement).queryByText(/Saved/)).toBeNull();
  });

  it("asks logged-out visitors to log in", async () => {
    const api = stubApi({ "GET /auth/me": guestSession });
    renderWith(<MyOrdersPage />, api);
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/account/login?next=%2Faccount%2Forders");
    expect(posts(api, "GET /orders")).toHaveLength(0);
  });
});

describe("checkout field messages", () => {
  it("groups areas under their cities in the order the server sends, even when a city comes back later", () => {
    const doha = { en: "Doha", ar: "الدوحة" };
    const rayyan = { en: "Al Rayyan", ar: "الريان" };
    const groups = areasByCity([
      { id: "1", cityId: "d", city: doha },
      { id: "2", cityId: "r", city: rayyan },
      { id: "3", cityId: "d", city: doha },
    ]);
    expect(groups.map((group) => [group.city.en, group.areas.map((area) => area.id)])).toEqual([
      ["Doha", ["1", "3"]],
      ["Al Rayyan", ["2"]],
    ]);
  });

  it("translate server messages about items, keeping the number left", async () => {
    const { checkoutFieldMessage } = await import("@/features/checkout/pages/CheckoutApiPage");
    const ar = (_en: string, arabic: string) => arabic;
    const en = (english: string) => english;
    expect(checkoutFieldMessage("lines.1", "Only 2 left.", ar)).toBe("المتوفر 2 فقط.");
    expect(checkoutFieldMessage("lines.0", "This item has just sold out.", en)).toBe("This item has just sold out.");
    expect(checkoutFieldMessage("delivery.areaId", "We no longer deliver to this area. Please choose another.", en)).toMatch(/no longer deliver/);
    expect(checkoutFieldMessage("delivery.areaId", "Invalid UUID", en)).toBe("Choose your area.");
    expect(checkoutFieldMessage("contact.name", undefined, en)).toBeUndefined();
    expect(checkoutFieldMessage("lines.0.quantity", "Too big", en)).toBe("You can order up to 99 of one item.");
    expect(checkoutFieldMessage("lines.0.quantity", "Too big", ar)).toBe("يمكنك طلب 99 قطعة كحد أقصى من المنتج الواحد.");
  });
});

// --- 11e: offers in the cart, at checkout and on the order page -----------------------------------

const money = (minor: number) => formatMoney(minor, "en").replace(/\s/g, " ");
const off = (minor: number) => `− ${money(minor)}`;

describe("offers at checkout (11e)", () => {
  it("the cart shows each discount and the total saved, from the server's quote", async () => {
    const api = stubApi({
      ...checkoutRoutes(),
      "POST /checkout/quote": (body) => priceOf(body as CheckoutQuoteRequest, { name: "Food sale", discount: 2550 }),
    });
    renderWith(<CartPage />, api, twoPacks);
    expect(await screen.findByText("Food sale")).toBeTruthy();
    expect(screen.getAllByText(off(2550)).length).toBeGreaterThan(0);
    expect(screen.getByText(money(17000 - 2550))).toBeTruthy();
    expect(screen.getByText(`You save ${money(2550)}`)).toBeTruthy();
    // Pickup is offered, so the items are priced for pickup; checkout adds the delivery the customer chooses.
    expect(posts(api, "POST /checkout/quote")[0]?.body).toEqual({
      fulfilment: "pickup",
      delivery: null,
      lines: [{ product: "cat-food", variant: "cf-15", quantity: 2 }],
      code: null,
    });
  });

  it("an applied code is sent with every quote and with the order; a code we do not know is not kept", async () => {
    const api = stubApi(
      checkoutRoutes({
        "POST /checkout/quote": (body) => {
          const request = body as CheckoutQuoteRequest;
          if (request.code === "NOPE") {
            return { ...priceOf({ ...request, code: null }), code: { status: "unknown", message: "We don't recognise this code. Please check it." } };
          }
          return priceOf(request, request.code === "SAVE10" ? { name: "Ten off", code: "SAVE10", discount: 1700 } : undefined);
        },
        "POST /checkout": () => ({ order: order(), guestKey: GUEST_KEY }),
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    const box = screen.getByLabelText("Promo code");

    fireEvent.change(box, { target: { value: "nope" } });
    // Enter applies the code; it never places the order.
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("We don't recognise this code. Please check it.")).toBeTruthy();
    expect(screen.getByLabelText("Promo code")).toHaveAttribute("aria-invalid", "true");
    expect(posts(api, "POST /checkout")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: " save10 " } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("The code is applied.")).toBeTruthy();
    expect(screen.getByText("SAVE10", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(off(1700))).toBeTruthy();
    expect(screen.getByText(money(17000 + 1500 - 1700))).toBeTruthy();
    // The unknown code is not sent again with later quotes (it would count as another guess, D207).
    const codes = posts(api, "POST /checkout/quote").map((call) => (call.body as CheckoutQuoteRequest).code);
    expect(codes.filter((code) => code === "NOPE")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(posts(api, "POST /checkout")[0]?.body).toMatchObject({ code: "SAVE10", expectedTotal: 17000 + 1500 - 1700 });
  });

  it("price changed: shows the server's total for this checkout and confirms it, without asking for another quote", async () => {
    let tries = 0;
    const api = stubApi(
      checkoutRoutes({
        // A guest counts as new in the quote; checkout knows the email has paid before (D205).
        "POST /checkout/quote": (body) => priceOf(body as CheckoutQuoteRequest, { name: "Welcome", discount: 1000 }),
        "POST /checkout": (body) => {
          tries += 1;
          const request = body as CheckoutRequest;
          if (tries === 1) {
            throw new ApiError("PRICE_CHANGED", "The total has changed.", 409, {
              quote: priceOf({
                fulfilment: request.fulfilment,
                delivery: request.delivery ? { areaId: request.delivery.areaId } : null,
                lines: request.lines,
                code: null,
              }),
            });
          }
          return { order: order(), guestKey: GUEST_KEY };
        },
      }),
    );
    renderWith(<CheckoutApiPage />, api, twoPacks);
    await fillDelivery();
    expect(await screen.findByText(off(1000))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The total for your order has changed");
    expect(screen.getByText(money(17000 + 1500))).toBeTruthy();
    expect(screen.queryByText(off(1000))).toBeNull();
    const quotes = posts(api, "POST /checkout/quote").length;

    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/orders/${REFERENCE}#k=${GUEST_KEY}`));
    const sent = posts(api, "POST /checkout").map((call) => (call.body as CheckoutRequest).expectedTotal);
    expect(sent).toEqual([17000 + 1500 - 1000, 17000 + 1500]);
    expect(posts(api, "POST /checkout/quote")).toHaveLength(quotes);
  });

  it("a code refused at checkout is explained at the code, and Remove takes it away", async () => {
    const routes = checkoutRoutes({
      "POST /checkout/quote": (body) => priceOf(body as CheckoutQuoteRequest, { name: "Ten off", code: "SAVE10", discount: 1700 }),
      "POST /checkout": () => {
        throw new ApiError("PROMO_CODE_INVALID", "You have already used this code.", 409, { codeStatus: "used_up_for_you" });
      },
    });
    renderWith(<CheckoutApiPage />, stubApi(routes), twoPacks);
    await fillDelivery();
    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "SAVE10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("The code is applied.");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText("You have already used this code.")).toBeTruthy();
    expect(screen.getByText(/Remove it to place the order without it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove the promo code SAVE10" }));
    expect(screen.queryByText("You have already used this code.")).toBeNull();
    expect(screen.getByLabelText("Promo code")).toHaveValue("");
  });

  it("words each code answer in English and Arabic", async () => {
    const { promoCodeText } = await import("@/shared/lib/offers");
    const ar = (_en: string, arabic: string) => arabic;
    const en = (english: string) => english;
    expect(promoCodeText({ status: "used_up_for_you", message: "You have already used this code." }, ar)).toBe("لقد استخدمت هذا الرمز من قبل.");
    // English keeps the server's sentence, which names the amount.
    expect(promoCodeText({ status: "min_spend", message: "Spend at least QAR 50.00 on items (after other offers) to use this code." }, en)).toMatch(/QAR 50\.00/);
    expect(promoCodeText({ status: "applied" }, en, "order", 0)).toMatch(/at least QAR 1/);
    expect(promoCodeText({ status: "no_matching_items" }, ar, "booking")).toMatch(/باقة العناية/);
  });

  it("the order page shows its promotions and each line's price after its discount", async () => {
    const line = order().lines[0];
    if (!line) throw new Error("fixture");
    const api = stubApi({
      [`GET /orders/${REFERENCE}`]: () =>
        order({
          status: "confirmed",
          lines: [{ ...line, discount: 1700, lineTotal: 17000 - 1700 }],
          discount: 1700,
          total: 18500 - 1700,
          promotions: [{ name: { en: "Ten off", ar: "خصم عشرة" }, code: "SAVE10", discount: 1700 }],
          payment: { canPay: false, latest: null, attemptsLeft: 3, attention: null },
        }),
      "GET /delivery/options": () => options,
    });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/^Ten off ·/)).toBeTruthy();
    expect(screen.getByText("SAVE10")).toBeTruthy();
    expect(screen.getByText(off(1700))).toBeTruthy();
    expect(screen.getByText(money(17000 - 1700))).toBeTruthy();
    expect(screen.getByText(money(18500 - 1700))).toBeTruthy();
  });
});
