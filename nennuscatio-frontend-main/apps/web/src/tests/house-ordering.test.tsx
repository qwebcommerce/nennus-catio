// #14 part 14b (D268): Pet Houses ordered on the website. The house page's "how much, when, how it
// arrives" box and Add to cart; the card; the cart and checkout with a house (its estimate, pickup, the
// delivery times from the day it can be ready, the Pet House delivery line); the order page; the messages.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  CheckoutQuote,
  CheckoutQuoteRequest,
  CustomerOrder,
  DeliveryOptionsResponse,
  PublicDeliveryWindow,
  PublicProduct,
} from "@nennus-catio/contracts";
import type { ZodType } from "zod";
import { MyOrdersPage } from "@/features/account/pages/MyOrdersPage";
import { CartPage } from "@/features/cart/pages/CartPage";
import { CheckoutApiPage, checkoutFieldMessage } from "@/features/checkout/pages/CheckoutApiPage";
import { OrderPage } from "@/features/orders/pages/OrderPage";
import { HouseCard } from "@/features/pet-houses/components/HouseCard";
import { HouseDetails } from "@/features/pet-houses/components/HouseDetails";
import { earliestHouseDay } from "@/features/pet-houses/lib/ordering";
import { toWebProduct } from "@/shared/api/catalog";
import { type ApiClient, ApiError, type RequestOptions } from "@/shared/api/client";
import { orderErrorMessage } from "@/shared/api/orders";
import { CART_STORAGE_KEY, type CartLine, CartProvider, parseStoredCart } from "@/shared/cart/CartProvider";
import { formatMoney, formatQatarDay } from "@/shared/lib/format";
import { SettingsProviders, stubSettings } from "./helpers/settings";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/pet-houses",
  useRouter: () => ({ push, replace: push }),
}));

beforeEach(() => {
  push.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- Fixtures ---------------------------------------------------------------------------------------

const AREA_ID = "0197a000-0000-7000-8000-0000000000a1";
const WINDOW_ID = "0197a000-0000-7000-8000-0000000000b1";
const REFERENCE = "NC-261018-4F7KQ2";
const PRICE = 290_000;
const HOUSE_FEE = 10_000;
const AREA_FEE = 1_500;
// The page's text is matched with its spaces made plain; the formatter puts a no-break space after "QAR".
const qar = (minor: number) => formatMoney(minor, "en").replace(/\s/g, " ");

const villa: PublicProduct = {
  slug: "house-villa",
  category: "pet-houses",
  brand: null,
  featured: false,
  bestSeller: false,
  name: { en: "Cat Villa", ar: "فيلا القطط" },
  description: { en: "Two levels and a balcony.", ar: "طابقان وشرفة." },
  petTypes: ["cats", "small-pets"],
  images: [{ url: "/images/villa.png", alt: { en: "Villa", ar: "فيلا" } }],
  variants: [{ code: "standard", sku: "PH-VILLA", label: { en: "Standard", ar: "قياسي" }, weightGrams: null, price: PRICE, salePrice: null, stock: 0 }],
  house: {
    collection: "indoor",
    purchaseMode: "fixed",
    availability: "made-to-order",
    dimensions: { height: 95, width: 70, depth: 55 },
    features: [],
    leadTime: { minDays: 7, maxDays: 10 },
    deliveryFee: HOUSE_FEE,
    fulfilment: "delivery",
    provisional: false,
    source: null,
  },
  offers: [],
};
const house = (patch: Partial<NonNullable<PublicProduct["house"]>> = {}, product: Partial<PublicProduct> = {}): PublicProduct => ({
  ...villa,
  ...product,
  house: { ...(villa.house as NonNullable<PublicProduct["house"]>), ...patch },
});
const food: PublicProduct = {
  ...villa,
  slug: "cat-food",
  category: "food",
  name: { en: "Everyday Cat Nutrition", ar: "تغذية القطط اليومية" },
  petTypes: ["cats"],
  variants: [{ code: "cf-15", sku: "FO-CF-15", label: { en: "1.5 kg pack", ar: "عبوة" }, weightGrams: 1500, price: 8_500, salePrice: null, stock: 5 }],
  house: null,
};
const options: DeliveryOptionsResponse = {
  areas: [{ id: AREA_ID, name: { en: "West Bay", ar: "الخليج الغربي" }, fee: AREA_FEE, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } }],
  pickup: { enabled: true, instructions: { en: "Collect at the counter.", ar: "الاستلام من الكاونتر." } },
  leadTimeMinutes: 120,
  horizonDays: 14,
};
const day = earliestHouseDay(10);
const windows: PublicDeliveryWindow[] = [
  { id: WINDOW_ID, date: day, start: "09:00", end: "12:00", startsAt: `${day}T06:00:00.000Z`, seatsLeft: 3 },
];
const WHATSAPP = stubSettings({ socialLinks: { whatsapp: "https://wa.me/97455551234" } });

// --- API stub -----------------------------------------------------------------------------------------

type Handler = (body: unknown, options?: RequestOptions) => unknown;
interface Call {
  key: string;
  body: unknown;
}

function stubApi(routes: Record<string, Handler>): ApiClient & { calls: Call[] } {
  const calls: Call[] = [];
  const handle = async <T,>(key: string, body: unknown, schema: ZodType<T>, options?: RequestOptions): Promise<T> => {
    calls.push({ key, body });
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

/** The server's price: list prices, the area's fee and each house's own charge, per house (D268 question 1). */
function priceOf(request: CheckoutQuoteRequest, catalogue: PublicProduct[]): CheckoutQuote {
  const lines = request.lines.map((line) => {
    const unitPrice = catalogue.find((item) => item.slug === line.product)?.variants[0]?.price ?? 0;
    return { product: line.product, variant: line.variant, unitPrice, quantity: line.quantity, discount: 0, lineTotal: unitPrice * line.quantity };
  });
  const houseLines = request.lines.flatMap((line) => {
    const item = catalogue.find((entry) => entry.slug === line.product);
    return item?.house ? [{ house: item.house, quantity: line.quantity }] : [];
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const houseDeliveryFee = request.delivery ? houseLines.reduce((sum, line) => sum + (line.house.deliveryFee ?? 0) * line.quantity, 0) : 0;
  const deliveryFee = request.delivery ? AREA_FEE + houseDeliveryFee : 0;
  return {
    lines,
    subtotal,
    discount: 0,
    deliveryFee,
    houseDeliveryFee,
    houseLeadDays: houseLines.length ? Math.max(...houseLines.map((line) => line.house.leadTime?.maxDays ?? 0)) : null,
    total: subtotal + deliveryFee,
    promotions: [],
    code: null,
  };
}

function renderWith(ui: ReactNode, api: ApiClient, setup: { cart?: CartLine[]; catalogue?: PublicProduct[]; source?: "api" | "mock" } = {}) {
  if (setup.cart) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(setup.cart));
  return render(
    <SettingsProviders
      api={api}
      source={setup.source ?? "api"}
      getPublicSettings={async () => WHATSAPP}
      listProducts={async () => (setup.catalogue ?? [villa, food]).map(toWebProduct)}
    >
      <CartProvider>{ui}</CartProvider>
    </SettingsProviders>,
  );
}

const noApi = stubApi({});

// --- The house page --------------------------------------------------------------------------------------

describe("the house page (D268)", () => {
  it("a ready model: who it suits, how much, when and how it arrives, then Add to cart", async () => {
    renderWith(<HouseDetails product={toWebProduct(villa)} />, noApi);
    expect(screen.getByText("Suitable for: Cats, Small pets")).toBeTruthy();
    expect(screen.getByText(qar(PRICE))).toBeTruthy();
    const box = screen.getByRole("region", { name: "Delivery and timing" });
    expect(within(box).getByText("Made to order: ready in about 7–10 days")).toBeTruthy();
    expect(within(box).getByText(formatQatarDay(day, "en"))).toBeTruthy();
    expect(within(box).getByText(`Delivery: ${qar(HOUSE_FEE)} for this house, plus your area's usual fee`)).toBeTruthy();

    // Made to order: no stock needed, any quantity up to the order limit.
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(await screen.findByText("Added to your cart.")).toBeTruthy();
    await waitFor(() =>
      expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))).toEqual([{ productId: "house-villa", variantId: "standard", quantity: 2 }]),
    );
    // A custom version stays a WhatsApp conversation, offered quietly under the button.
    expect(await screen.findByRole("link", { name: /Discuss a custom design on WhatsApp/ })).toBeTruthy();
    expect(screen.queryByText(/cannot be ordered online yet/)).toBeNull();
  });

  it("a model that is not ready, or priced on request, keeps WhatsApp as its button", async () => {
    renderWith(<HouseDetails product={toWebProduct(house({ provisional: true }))} />, noApi);
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
    expect(screen.getByText("This model cannot be ordered online yet. Ask us about it on WhatsApp.")).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Ask about it on WhatsApp/ })).toBeTruthy();
    cleanup();

    renderWith(<HouseDetails product={toWebProduct(house({ purchaseMode: "inquiry" }))} />, noApi);
    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Ask for a price on WhatsApp/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  });

  it("an in-stock model with none left says so; the demo never sells houses", async () => {
    renderWith(<HouseDetails product={toWebProduct(house({ availability: "in-stock", leadTime: { minDays: 1, maxDays: 2 } }))} />, noApi);
    expect(screen.getByRole("button", { name: "Out of stock" })).toBeDisabled();
    cleanup();

    renderWith(<HouseDetails product={toWebProduct(villa)} />, noApi, { source: "mock" });
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  });

  it("the card says whether a model is ordered online or asked about", () => {
    renderWith(<HouseCard product={toWebProduct(villa)} />, noApi);
    expect(screen.getByText("Order online")).toBeTruthy();
    expect(screen.getByText("Ready in about 7–10 days")).toBeTruthy();
    cleanup();
    renderWith(<HouseCard product={toWebProduct(house({ deliveryFee: null }))} />, noApi);
    expect(screen.getByText("View model & ask on WhatsApp")).toBeTruthy();
  });
});

// --- The cart and checkout ---------------------------------------------------------------------------------

describe("the cart and checkout with a Pet House (D268)", () => {
  const quoteRoute = (catalogue: PublicProduct[]): Handler => (body) => priceOf(body as CheckoutQuoteRequest, catalogue);

  it("the cart takes a ready house beyond its stock, says how its delivery is charged, and that the rest comes with it", async () => {
    const api = stubApi({ "GET /delivery/options": () => options, "POST /checkout/quote": quoteRoute([villa, food]) });
    renderWith(<CartPage />, api, {
      cart: [
        { productId: "house-villa", variantId: "standard", quantity: 2 },
        { productId: "cat-food", variantId: "cf-15", quantity: 1 },
      ],
    });
    expect(await screen.findByText("Pet House · made to order, ready in about 7–10 days")).toBeTruthy();
    expect(screen.getByText(/Each Pet House adds its own delivery charge at checkout/)).toBeTruthy();
    expect(screen.getByText(/Everything in this order arrives with your Pet House/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue to checkout" })).toBeTruthy();
    // A delivery-only house is priced for delivery, never pickup.
    await waitFor(() => expect(api.calls.some((call) => call.key === "POST /checkout/quote")).toBe(true));
    const priced = api.calls.find((call) => call.key === "POST /checkout/quote")?.body as CheckoutQuoteRequest;
    expect(priced.fulfilment).toBe("delivery");
  });

  it("the cart refuses a house that cannot be ordered online any more", async () => {
    const api = stubApi({ "GET /delivery/options": () => options, "POST /checkout/quote": quoteRoute([villa]) });
    renderWith(<CartPage />, api, { cart: [{ productId: "house-villa", variantId: "standard", quantity: 1 }], catalogue: [house({ deliveryFee: null })] });
    expect(await screen.findByText(/This Pet House cannot be ordered online at the moment/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  });

  it("checkout: no pickup for a delivery-only house, times from the day it can be ready, and its own delivery line", async () => {
    const api = stubApi({
      "GET /catalog/products": () => ({ products: [villa, food] }),
      "POST /checkout/quote": quoteRoute([villa, food]),
      "GET /delivery/options": () => options,
      "GET /delivery/windows?leadDays=10": () => ({ windows }),
      "GET /auth/me": () => {
        throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
      },
      "POST /checkout": () => {
        throw new ApiError("SLOT_UNAVAILABLE", "Your Pet House cannot be delivered this early. Please choose a later delivery time.", 409);
      },
    });
    renderWith(<CheckoutApiPage />, api, {
      cart: [
        { productId: "house-villa", variantId: "standard", quantity: 1 },
        { productId: "cat-food", variantId: "cf-15", quantity: 1 },
      ],
    });
    expect(await screen.findByText("The Pet House in your cart is delivered, so pickup is not available for this order.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pick up from the shop" })).toBeNull();
    expect(screen.getByText("Pet House · made to order, ready in about 7–10 days")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sara@example.invalid" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+974 5555 1234" } });
    fireEvent.change(screen.getByLabelText("Area"), { target: { value: AREA_ID } });
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "66" } });
    fireEvent.change(screen.getByLabelText("Street"), { target: { value: "850" } });
    fireEvent.change(screen.getByLabelText("Building"), { target: { value: "12" } });

    // The times start on the day the house can be ready (the quote's houseLeadDays), and the page says so.
    expect(
      await screen.findByText(`Your Pet House can be delivered from ${formatQatarDay(day, "en")}. Everything in this order arrives with it.`),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "09:00 AM – 12:00 PM 3 left" }));
    expect(api.calls.some((call) => call.key === "GET /delivery/windows?leadDays=10")).toBe(true);
    expect(api.calls.some((call) => call.key === "GET /delivery/windows")).toBe(false);

    // The area's fee and the house's own charge on separate lines.
    const summary = screen.getByRole("heading", { name: "Review your order" }).closest("aside") as HTMLElement;
    await waitFor(() => expect(within(summary).getByText("Pet House delivery (1 house)")).toBeTruthy());
    expect(within(summary).getByText(qar(HOUSE_FEE))).toBeTruthy();
    expect(within(summary).getByText(qar(AREA_FEE))).toBeTruthy();
    expect(within(summary).getByText(qar(PRICE + 8_500 + AREA_FEE + HOUSE_FEE))).toBeTruthy();

    // A time the house cannot meet: the server's refusal in the customer's words.
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText("Your Pet House cannot be delivered this early. Please choose one of the later times.")).toBeTruthy();
    const sent = api.calls.find((call) => call.key === "POST /checkout")?.body as { lines: { product: string }[]; fulfilment: string };
    expect(sent.fulfilment).toBe("delivery");
    expect(sent.lines.map((line) => line.product)).toEqual(["house-villa", "cat-food"]);
  });

  it("the server's refusals in the customer's words", () => {
    const text = (en: string) => en;
    expect(checkoutFieldMessage("lines.0", "This Pet House cannot be ordered online at the moment. Ask us about it on WhatsApp.", text)).toBe(
      "This Pet House cannot be ordered online at the moment.",
    );
    expect(checkoutFieldMessage("fulfilment", "A Pet House in your cart is delivered only. Please choose delivery.", text)).toBe(
      "A Pet House in your cart is delivered only. Please choose delivery.",
    );
    expect(orderErrorMessage(new ApiError("SLOT_UNAVAILABLE", "This delivery time is no longer available.", 409), text)).toBe(
      "That delivery time has just filled up or closed. Please choose another time.",
    );
  });
});

// --- The order page ------------------------------------------------------------------------------------------

function houseOrder(status: CustomerOrder["status"]): CustomerOrder {
  return {
    reference: REFERENCE,
    status,
    fulfilment: "delivery",
    placedAt: "2026-10-18T08:00:00.000Z",
    holdExpiresAt: null,
    contact: { name: "Sara", email: "sara@example.invalid", phone: "+974 5555 1234" },
    delivery: {
      area: { en: "West Bay", ar: "الخليج الغربي" },
      address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: null },
      window: { date: day, start: "09:00", end: "12:00" },
    },
    lines: [
      {
        product: "house-villa",
        variant: "standard",
        sku: "PH-VILLA",
        name: villa.name,
        label: { en: "Standard", ar: "قياسي" },
        weightGrams: null,
        unitPrice: PRICE,
        quantity: 1,
        discount: 0,
        lineTotal: PRICE,
        house: { madeToOrder: true, leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: HOUSE_FEE },
      },
    ],
    subtotal: PRICE,
    deliveryFee: AREA_FEE + HOUSE_FEE,
    houseDeliveryFee: HOUSE_FEE,
    discount: 0,
    total: PRICE + AREA_FEE + HOUSE_FEE,
    promotions: [],
    canCancel: status === "confirmed",
    refundNeeded: false,
    cancelledAt: null,
    payment: { canPay: false, latest: null, attemptsLeft: 3, attention: null },
  };
}

describe("My orders with a Pet House", () => {
  it("marks the order that has a house", async () => {
    const api = stubApi({
      "GET /auth/me": () => ({ id: "c1", email: "member@example.invalid", emailVerified: true }),
      "GET /orders": () => ({
        orders: [
          { reference: REFERENCE, status: "confirmed", fulfilment: "delivery", placedAt: "2026-10-18T08:00:00.000Z", discount: 0, total: 301_500, hasHouse: true },
          { reference: "NC-261017-AB12CD", status: "delivered", fulfilment: "delivery", placedAt: "2026-10-17T08:00:00.000Z", discount: 0, total: 9_000, hasHouse: false },
        ],
      }),
    });
    renderWith(<MyOrdersPage />, api);
    const rows = await screen.findAllByRole("link", { name: /NC-/ });
    expect(rows[0]?.textContent).toContain("Pet House");
    expect(rows[1]?.textContent).not.toContain("Pet House");
  });
});

describe("the order page with a Pet House", () => {
  it("shows the house's own estimate, its delivery line, and that it is being made", async () => {
    const api = stubApi({ [`GET /orders/${REFERENCE}`]: () => houseOrder("preparing"), "GET /delivery/options": () => options });
    renderWith(<OrderPage reference={REFERENCE} />, api);
    expect(await screen.findByText("Your Pet House is being made.")).toBeTruthy();
    expect(screen.getByText("Pet House · made to order, ready in about 7–10 days")).toBeTruthy();
    expect(screen.getByText("Pet House delivery")).toBeTruthy();
    expect(screen.getByText(qar(HOUSE_FEE))).toBeTruthy();
    expect(screen.getByText(qar(AREA_FEE))).toBeTruthy();
    cleanup();

    renderWith(<OrderPage reference={REFERENCE} />, stubApi({ [`GET /orders/${REFERENCE}`]: () => houseOrder("confirmed"), "GET /delivery/options": () => options }));
    expect(await screen.findByText("Pet House delivery")).toBeTruthy();
    expect(screen.queryByText("Your Pet House is being made.")).toBeNull();
  });
});
