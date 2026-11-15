import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PublicProduct } from "@nennus-catio/contracts";
import { ProductPage } from "@/features/shop/pages/ProductPage";
import { matchesPublicPet } from "@/mocks/data/public-pets";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import { type Repositories, DataSourceProvider } from "@/shared/api/DataSourceProvider";
import { toWebProduct } from "@/shared/api/catalog";
import { loggedOutApi, stubSettings } from "./helpers/settings";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

const food: PublicProduct = {
  slug: "cat-food",
  category: "food",
  brand: "Oasis Nutrition",
  featured: false,
  bestSeller: true,
  name: { en: "Everyday Cat Nutrition", ar: "تغذية القطط اليومية" },
  description: { en: "Desc", ar: "وصف" },
  petTypes: ["cats", "dogs"],
  images: [
    { url: "/images/a.png", alt: { en: "A", ar: "أ" } },
    { url: "/images/b.png", alt: { en: "B", ar: "ب" } },
  ],
  variants: [
    { code: "cf-15", sku: "FO-CF-15", label: { en: "1.5 kg pack", ar: "عبوة" }, weightGrams: 1500, price: 8500, salePrice: null, stock: 3 },
    { code: "cf-toy", sku: "FO-CF-TOY", label: { en: "1 piece", ar: "قطعة" }, weightGrams: null, price: 2000, salePrice: null, stock: 0 },
  ],
  house: null,
  offers: [],
};

describe("catalogue mapping from the API", () => {
  it("keeps the prototype ids so the sample cart keeps working (D107)", () => {
    const product = toWebProduct(food);
    expect(product.id).toBe("cat-food");
    expect(product.variants.map((variant) => variant.id)).toEqual(["cf-15", "cf-toy"]);
    expect(product.variants.map((variant) => variant.unit)).toEqual(["weight", "piece"]);
    expect(product.image).toBe("/images/a.png");
    expect(product.gallery).toEqual([{ id: "cat-food-1", src: "/images/b.png" }]);
    expect(product.brand).toBe("Oasis Nutrition");
  });

  it("a product suiting several pets appears in each of their groups", () => {
    const product = toWebProduct(food);
    expect(matchesPublicPet(product, "cats")).toBe(true);
    expect(matchesPublicPet(product, "dogs")).toBe(true);
    expect(matchesPublicPet(product, "birds")).toBe(false);
  });

  it("maps Pet House details, keeping unknown values unknown", () => {
    const house = toWebProduct({
      ...food,
      slug: "house-x",
      category: "pet-houses",
      house: {
        collection: "indoor",
        purchaseMode: "inquiry",
        availability: "unconfirmed",
        dimensions: { height: 95, width: 70, depth: 55 },
        features: [],
        leadTime: null,
        deliveryFee: null,
        fulfilment: "delivery",
        provisional: true,
        source: null,
      },
    });
    expect(house.house?.purchaseMode).toBe("inquiry");
    expect(house.house?.dimensions).toEqual({ height: 95, width: 70, depth: 55, unit: "cm" });
    expect(house.house?.deliveryFee).toBeNull();
    expect(house.house?.source).toBeUndefined();
  });
});

describe("product page loading states", () => {
  function productPage(listProducts: Repositories["catalog"]["listProducts"]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const repositories: Repositories = {
      source: "api",
      api: loggedOutApi,
      siteSettings: { getPublicSettings: async () => stubSettings() },
      catalog: { listProducts },
    };
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{}} timeZone="Asia/Qatar">
          <DataSourceProvider repositories={repositories}>
            <MockDataProvider>
              <ProductPage id="cat-food" />
            </MockDataProvider>
          </DataSourceProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it("shows loading, then an honest error with a working retry", async () => {
    let attempts = 0;
    productPage(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return [toWebProduct(food)];
    });
    expect(screen.getByText("Loading products…")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Products could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("This product is no longer available.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Everyday Cat Nutrition" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("shows the gallery photos as thumbnails that switch the main photo", async () => {
    productPage(async () => [toWebProduct(food)]);
    const main = await screen.findByRole("img", { name: "Everyday Cat Nutrition" });
    expect(main.getAttribute("src")).toMatch(/a\.png/);
    expect(screen.getByRole("button", { name: "Show photo 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show photo 2" }));
    expect(screen.getByRole("img", { name: "Everyday Cat Nutrition" }).getAttribute("src")).toMatch(/b\.png/);
    expect(screen.getByRole("button", { name: "Show photo 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows no thumbnails when a product has only its main photo", async () => {
    productPage(async () => [toWebProduct({ ...food, images: food.images.slice(0, 1) })]);
    expect(await screen.findByRole("img", { name: "Everyday Cat Nutrition" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show photo/ })).toBeNull();
  });
});
