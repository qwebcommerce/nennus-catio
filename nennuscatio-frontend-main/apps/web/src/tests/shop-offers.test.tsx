// 11e: offers in the shop (sale prices and labels on cards and product pages, the price filter and sort
// after offers) and the home page's featured offers.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { FeaturedOffer, ProductOffer, PublicProduct } from "@nennus-catio/contracts";
import { FeaturedOffers } from "@/features/landing/components/FeaturedOffers";
import { cheapestPack, selectShopProducts, sortPrice } from "@/features/shop/lib/catalogue";
import { ProductPage } from "@/features/shop/pages/ProductPage";
import { ReferenceShopPage } from "@/features/shop/pages/ReferenceShopPage";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { toWebProduct } from "@/shared/api/catalog";
import { formatDiscount, formatMoney } from "@/shared/lib/format";
import { offerConditions, offerMoney, offerText } from "@/shared/lib/offers";
import { SettingsProviders } from "./helpers/settings";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  search = "";
});

const money = (minor: number, locale: "en" | "ar" = "en") => formatMoney(minor, locale).replace(/\s/g, " ");

function offer(overrides: Partial<ProductOffer> = {}): ProductOffer {
  return {
    name: { en: "Food sale", ar: "تخفيضات الطعام" },
    offer: "percent",
    value: 15,
    buyGet: null,
    bundle: null,
    eligibility: "all",
    minSpend: 0,
    perCustomerLimit: 0,
    endsOn: null,
    ...overrides,
  };
}

function product(slug: string, price: number, salePrice: number | null, offers: ProductOffer[] = []): PublicProduct {
  return {
    slug,
    category: "food",
    brand: null,
    featured: false,
    bestSeller: false,
    name: { en: `Item ${slug}`, ar: `منتج ${slug}` },
    description: { en: "Desc", ar: "وصف" },
    petTypes: ["cats"],
    images: [{ url: "/images/a.png", alt: { en: "A", ar: "أ" } }],
    variants: [{ code: "pack", sku: slug.toUpperCase(), label: { en: "Pack", ar: "عبوة" }, weightGrams: 1000, price, salePrice, stock: 5 }],
    house: null,
    offers,
  };
}

/** The shop with these products from the API. */
function withCatalog(products: PublicProduct[], ui: ReactNode) {
  return render(
    <SettingsProviders listProducts={async () => products.map(toWebProduct)}>
      <MockDataProvider>{ui}</MockDataProvider>
    </SettingsProviders>,
  );
}

describe("offer wording (11e)", () => {
  const en = (english: string) => english;
  const ar = (_english: string, arabic: string) => arabic;
  it("says what an offer gives, and who and when, in English and Arabic", () => {
    expect(offerText(offer(), en, "en")).toBe("15% off");
    expect(offerText(offer({ offer: "buy_get", value: 0, buyGet: { buy: 2, get: 1, percent: 100 } }), en, "en")).toBe("Buy 2, get 1 free");
    expect(offerText(offer({ offer: "buy_get", value: 0, buyGet: { buy: 2, get: 1, percent: 100 } }), ar, "ar")).toBe("اشترِ 2 واحصل على 1 مجاناً");
    expect(offerConditions(offer({ eligibility: "registered", perCustomerLimit: 1, minSpend: 5000, endsOn: "2026-10-30" }), en, "en")).toEqual([
      "Members",
      "Once per customer",
      `Spend ${offerMoney(5000, "en")}+`,
      "Until 30 Oct",
    ]);
    expect(offerConditions(offer({ eligibility: "new" }), ar, "ar")).toEqual(["للعملاء الجدد"]);
    expect(offerConditions(offer(), en, "en")).toEqual([]);
  });

  it("an amount taken off keeps its minus sign at the start in Arabic too", () => {
    expect(formatDiscount(2550, "en")).toBe(`− ${formatMoney(2550, "en")}`);
    // The Arabic locale's own negative form: its marks keep the minus at the start in right-to-left text.
    expect(formatDiscount(2550, "ar")).toBe(new Intl.NumberFormat("ar-QA", { style: "currency", currency: "QAR" }).format(-25.5));
    expect(formatDiscount(2550, "ar").startsWith("؜-")).toBe(true);
    expect(() => formatDiscount(-1, "ar")).toThrow(RangeError);
  });
});

describe("sale prices in the shop (11e)", () => {
  it("keeps the sale price and offers from the API", () => {
    const mapped = toWebProduct(product("a", 4230, 3595, [offer()]));
    expect(mapped.variants[0]?.salePrice).toBe(3595);
    expect(mapped.offers?.map((entry) => entry.name.en)).toEqual(["Food sale"]);
  });

  it("the sort and the price filter use the price after the offer", () => {
    const products = [product("full", 3000, null), product("sale", 5000, 2500), product("plain", 2800, null)].map(toWebProduct);
    expect(selectShopProducts(products, { sort: "price" }).map((item) => item.id)).toEqual(["sale", "plain", "full"]);
    const sale = products[1];
    if (!sale) throw new Error("fixture");
    expect(sortPrice(sale)).toBe(2500);
    expect(cheapestPack(sale).price).toBe(5000);
  });

  it("cards show the sale price with the old price crossed out, and the offers as badges", async () => {
    search = "max=30";
    withCatalog(
      [
        product("sale", 5000, 2500, [offer({ value: 50 }), offer({ name: { en: "Members", ar: "أعضاء" }, eligibility: "registered", offer: "fixed", value: 500 })]),
        product("dear", 5000, null),
        product("label", 2000, null, [offer({ offer: "buy_get", value: 0, buyGet: { buy: 2, get: 1, percent: 100 }, perCustomerLimit: 1 })]),
      ],
      <ReferenceShopPage />,
    );
    // QAR 50.00 is above the QAR 30 limit, but its price after the offer is not.
    const card = (await screen.findByRole("heading", { name: "Item sale" })).closest("a") as HTMLElement;
    expect(screen.queryByRole("heading", { name: "Item dear" })).toBeNull();
    expect(within(card).getByText(money(2500), { exact: false })).toBeTruthy();
    expect(within(card).getByText(money(5000), { exact: false }).closest("del")).toBeTruthy();
    expect(within(card).getByText("50% off")).toBeTruthy();
    expect(within(card).getByText(/^QAR 5 off · Members$/)).toBeTruthy();
    const labelled = (await screen.findByRole("heading", { name: "Item label" })).closest("a") as HTMLElement;
    expect(within(labelled).getByText("Buy 2, get 1 free · Once per customer")).toBeTruthy();
    expect(within(labelled).queryByRole("deletion")).toBeNull();
  });

  it("the product page shows the sale price and each offer with its conditions", async () => {
    withCatalog(
      [
        product("cat-food", 5000, 4250, [
          offer(),
          offer({ name: { en: "Set of two", ar: "مجموعة" }, offer: "bundle_price", value: 6000, bundle: [{ product: "cat-food", variant: "pack", quantity: 2 }], endsOn: "2026-10-30" }),
        ]),
      ],
      <ProductPage id="cat-food" />,
    );
    expect(await screen.findByRole("heading", { name: "Item cat-food" })).toBeTruthy();
    const offers = screen.getByRole("region", { name: "Offers" });
    expect(within(offers).getByText("Food sale")).toBeTruthy();
    expect(within(offers).getByText("Set of two")).toBeTruthy();
    expect(within(offers).getByText("2 × Item cat-food (Pack)")).toBeTruthy();
    expect(within(offers).getByText("Until 30 Oct")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Pack · QAR\s?42\.50 \(was QAR\s?50\.00\)/ })).toBeTruthy();
  });
});

function featured(overrides: Partial<FeaturedOffer> = {}): FeaturedOffer {
  return {
    name: { en: "Weekend treat", ar: "عرض نهاية الأسبوع" },
    description: { en: "Our favourite food, for less.", ar: "طعامنا المفضل بسعر أقل." },
    offer: "percent",
    value: 20,
    buyGet: null,
    scope: "shop",
    code: null,
    eligibility: "all",
    minSpend: 0,
    perCustomerLimit: 0,
    endsOn: null,
    image: null,
    ...overrides,
  };
}

function featuredApi(offers: FeaturedOffer[] | "fail"): ApiClient {
  const fail = async () => {
    throw new ApiError("NOT_FOUND", "No stub", 404);
  };
  return {
    get: async <T,>(path: string, schema: { parse: (value: unknown) => T }) => {
      if (path !== "/promotions/featured" || offers === "fail") throw new ApiError("UNAVAILABLE", "Down", 503);
      return schema.parse({ offers });
    },
    post: fail,
    put: fail,
    delete: fail,
  } as ApiClient;
}

describe("featured offers on the home page (11e)", () => {
  it("shows each one with its offer, conditions, code and where to use it", async () => {
    render(
      <SettingsProviders api={featuredApi([featured(), featured({ name: { en: "Spa day", ar: "يوم العناية" }, scope: "grooming", code: "SPA10", offer: "fixed", value: 1000, eligibility: "new" })])}>
        <FeaturedOffers />
      </SettingsProviders>,
    );
    expect(await screen.findByRole("heading", { name: "Current offers" })).toBeTruthy();
    const shop = screen.getByRole("heading", { name: "Weekend treat" }).closest("article") as HTMLElement;
    expect(within(shop).getByText("20% off")).toBeTruthy();
    expect(within(shop).getByRole("link", { name: "Shop now" })).toHaveAttribute("href", "/shop");
    const spa = screen.getByRole("heading", { name: "Spa day" }).closest("article") as HTMLElement;
    expect(within(spa).getByText("SPA10")).toBeTruthy();
    expect(within(spa).getByText("New customers")).toBeTruthy();
    expect(within(spa).getByRole("link", { name: "Book grooming" })).toHaveAttribute("href", "/grooming/book");
  });

  it("shows nothing when there are none, or when they cannot be read", async () => {
    const { container } = render(
      <SettingsProviders api={featuredApi([])}>
        <FeaturedOffers />
      </SettingsProviders>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
    cleanup();
    const failed = render(
      <SettingsProviders api={featuredApi("fail")}>
        <FeaturedOffers />
      </SettingsProviders>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(failed.container.textContent).toBe("");
  });
});
