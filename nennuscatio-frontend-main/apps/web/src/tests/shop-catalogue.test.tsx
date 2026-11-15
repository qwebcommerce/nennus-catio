import type { ComponentProps, ReactNode } from "react";
import { useLocale } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  seedDemo,
  shopCategories,
  categories,
  cataloguePetTypes,
  type Product,
} from "@/mocks/data/business";
import { publicPetTypes } from "@/mocks/data/public-pets";
import { seedPetHouses } from "@/mocks/data/pet-houses";
import { createMockRepository } from "@/mocks/adapters/business-repository";
import { MockDataProvider } from "@/mocks/MockDataProvider";
import {
  isShopProduct,
  selectShopProducts,
  shopBrandFacets,
} from "@/features/shop/lib/catalogue";
import { ProductPage } from "@/features/shop/pages/ProductPage";
import { PetHousePage } from "@/features/pet-houses/pages/PetHousePage";
import { HouseCard } from "@/features/pet-houses/components/HouseCard";
import { SettingsProviders, stubSettings } from "./helpers/settings";

// Next's navigation runtime is checked in the browser, not executed inside jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a {...props} href={`/${useLocale()}${href}`}>
      {children}
    </a>
  ),
}));

function page(children: ReactNode, locale: "en" | "ar" = "en") {
  return render(
    <SettingsProviders locale={locale} getPublicSettings={async () => stubSettings()}>
      <MockDataProvider>{children}</MockDataProvider>
    </SettingsProviders>,
  );
}

describe("reference-led public Shop catalogue", () => {
  it("combines multiple brands with pet, category and search filters", () => {
    const products = seedDemo().products;
    expect(selectShopProducts(products, { brands: [" OASIS   NUTRITION "] })).toHaveLength(5);
    expect(selectShopProducts(products, { brands: ["Oasis Nutrition", "Gentle Care"] })).toHaveLength(7);
    expect(selectShopProducts(products, { brands: ["Oasis Nutrition"], pet: "cats", category: "food" })).toHaveLength(2);
    expect(selectShopProducts(products, { brands: ["Gentle Care"], search: "shampoo" }).map((p) => p.id)).toEqual(["pet-shampoo"]);
    expect(selectShopProducts(products, { brands: ["unknown brand"] })).toEqual([]);
    expect(selectShopProducts(products, { brands: ["Gentle Care"], category: "pet-houses" })).toEqual([]);
    expect(selectShopProducts(products, { brands: [] })).toHaveLength(70);
  });
  it("derives brand counts and retains zero-result selections for clearing", () => {
    const products = seedDemo().products;
    expect(shopBrandFacets(selectShopProducts(products))).toEqual([
      { id: "gentle care", name: "Gentle Care", count: 2 },
      { id: "natural essentials", name: "Natural Essentials", count: 3 },
      { id: "oasis nutrition", name: "Oasis Nutrition", count: 5 },
    ]);
    expect(shopBrandFacets(selectShopProducts(products, { category: "food" }), ["gentle care"])).toContainEqual({ id: "gentle care", name: "gentle care", count: 0 });
    const renamed = { ...products[0], brand: " OASIS   NUTRITION " };
    expect(shopBrandFacets([renamed, products[1]])[0].count).toBe(2);
  });
  it("supports optional editable brands and rejects oversized values atomically", () => {
    const repo = createMockRepository();
    const product = structuredClone(repo.getSnapshot().products[0]);
    product.brand = "  Demo  Brand  ";
    repo.saveProduct(product);
    expect(repo.getSnapshot().products[0].brand).toBe("Demo Brand");
    const before = repo.getSnapshot();
    product.brand = "x".repeat(81);
    expect(() => repo.saveProduct(product)).toThrow("Brand must be at most 80 characters");
    expect(repo.getSnapshot()).toBe(before);
    product.brand = "";
    repo.saveProduct(product);
    expect(repo.getSnapshot().products[0].brand).toBeUndefined();
  });
  it("shows eight public pet groups and a house category without losing admin types", () => {
    expect(publicPetTypes.map((p) => p.id)).toEqual([
      "cats", "dogs", "birds", "small-pets", "other-pets", "reptiles", "fish", "exotic-pets",
    ]);
    expect(shopCategories.map((p) => p.id)).not.toContain("pet-houses");
    expect(categories.map((p) => p.id)).toContain("pet-houses");
    expect(cataloguePetTypes.map((p) => p.id)).toContain("horses");
  });
  it("shares ten ordinary products and sixty houses without altering the source", () => {
    const state = seedDemo();
    const before = structuredClone(state.products);
    const products = selectShopProducts(state.products);
    expect(products).toHaveLength(70);
    expect(products.every(isShopProduct)).toBe(true);
    expect(products.filter((p) => p.house)).toHaveLength(60);
    expect(state.products).toEqual(before);
    expect(state.products).toHaveLength(70);
  });
  it("finds houses in every public pet group and only houses in the house category", () => {
    const products = seedDemo().products;
    for (const group of publicPetTypes) {
      expect(selectShopProducts(products, { pet: group.id }).some((p) => p.house)).toBe(true);
    }
    expect(selectShopProducts(products, { category: "pet-houses" })).toHaveLength(60);
    expect(selectShopProducts(products, { category: "unknown-category" })).toEqual([]);
    expect(selectShopProducts(products, { pet: "unknown-pet" })).toEqual([]);
  });
  it("searches ordinary products and houses in English and Arabic and sorts without mutation", () => {
    const products = seedDemo().products;
    const first = products[0];
    expect(
      selectShopProducts(products, { search: ` ${first.name.en} ` }),
    ).toEqual([first]);
    expect(
      selectShopProducts(products, { search: first.name.ar, locale: "ar" }),
    ).toEqual([first]);
    expect(
      selectShopProducts(products, { search: seedPetHouses()[0].name.en }),
    ).toContainEqual(seedPetHouses()[0]);
    const sorted = selectShopProducts(products, { sort: "price" });
    const prices = sorted.map((p) => p.house?.purchaseMode === "inquiry"
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...p.variants.map((v) => v.price)));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(products[0]).toBe(first);
  });
  it("shows seeded dog products and houses while allowing ordinary-product additions", () => {
    const repo = createMockRepository();
    expect(
      selectShopProducts(repo.getSnapshot().products, { pet: "dogs" }).map((p) => p.id),
    ).toContain("dog-food");
    const dog: Product = structuredClone(repo.getSnapshot().products[0]);
    dog.id = "test-dog-product";
    dog.pet = "dogs";
    dog.variants = dog.variants.map((v, i) => ({
      ...v,
      id: `dog-${i}`,
      sku: `TEST-DOG-${i}`,
    }));
    repo.saveProduct(dog);
    expect(selectShopProducts(repo.getSnapshot().products, { pet: "dogs" }).map((p) => p.id)).toContain(dog.id);
    expect(repo.getSnapshot().products.filter((p) => p.house)).toHaveLength(60);
  });
  it("rejects unsupported ordinary-product assignments atomically", () => {
    const repo = createMockRepository();
    const before = repo.getSnapshot();
    const product = structuredClone(before.products[0]);
    product.pet = "unapproved-type" as Product["pet"];
    expect(() => repo.saveProduct(product)).toThrow("Choose a Shop category");
    expect(repo.getSnapshot()).toBe(before);
    product.pet = "cats";
    product.category = "unapproved-category";
    expect(() => repo.saveProduct(product)).toThrow("Choose a Shop category");
    expect(repo.getSnapshot()).toBe(before);
  });
  it("does not treat malformed house metadata or inactive products as Shop listings", () => {
    const product = structuredClone(seedDemo().products[0]);
    product.house = seedPetHouses()[0].house;
    expect(isShopProduct(product)).toBe(false);
    delete product.house;
    product.active = false;
    expect(selectShopProducts([product])).toEqual([]);
  });
});

describe("separate house detail presentation", () => {
  it.each(["en", "ar"] as const)(
    "links house cards to their own %s detail route",
    (locale) => {
      const house = seedPetHouses()[0];
      page(<HouseCard product={house} />, locale);
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        `/${locale}/pet-houses/${house.id}`,
      );
    },
  );
  // The pages load the catalogue first (#6), so each test waits for its first element.
  it("offers a helpful onward link at a legacy Shop house URL, not house/cart content", async () => {
    const house = seedPetHouses()[0];
    page(<ProductPage id={house.id} />);
    expect(
      await screen.findByRole("link", { name: "View pet house" }),
    ).toHaveAttribute("href", `/en/pet-houses/${house.id}`);
    expect(
      screen.queryByRole("heading", { name: house.name.en }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add to cart" }),
    ).not.toBeInTheDocument();
  });
  it.each(["cat-food", "unknown-house"])(
    "does not display %s as a house model",
    async (id) => {
      page(<PetHousePage id={id} />);
      expect(
        await screen.findByText("This house model is unavailable."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Return to Pet Houses" }),
      ).toHaveAttribute("href", "/en/pet-houses");
    },
  );
  it("still displays an ordinary product with its cart action", async () => {
    page(<ProductPage id="cat-food" />);
    expect(await screen.findByRole("button", { name: "Add to cart" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to shop" })).toHaveAttribute(
      "href",
      "/en/shop",
    );
  });
  it("displays a house on its own detail page without enabling unapproved ordering", async () => {
    const house = seedPetHouses()[0];
    page(<PetHousePage id={house.id} />);
    expect(
      await screen.findByRole("heading", { name: house.name.en }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to pet houses" }),
    ).toHaveAttribute("href", expect.stringContaining("/en/pet-houses?"));
    expect(
      screen.queryByRole("button", { name: "Add to cart" }),
    ).not.toBeInTheDocument();
  });
});
