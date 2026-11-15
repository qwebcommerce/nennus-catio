import assert from "node:assert/strict";
import { test } from "node:test";
import { HOUSE_MAX_LEAD_DAYS, houseGaps, type PetHouseDetails, petHouseDetailsSchema, publicProductSchema, slugSchema } from "../src/index.js";

test("slugs are lower-case words joined by single hyphens", () => {
  for (const ok of ["cat-food", "house-terracotta-roof-cat-villa", "cf-15"]) {
    assert.equal(slugSchema.safeParse(ok).success, true, ok);
  }
  for (const bad of ["Cat-Food", "cat--food", "-cat", "cat food", "", "cat_food"]) {
    assert.equal(slugSchema.safeParse(bad).success, false, bad);
  }
});

test("the public product shape requires both languages and non-negative money", () => {
  const product = {
    slug: "cat-food",
    category: "food",
    brand: null,
    featured: false,
    bestSeller: false,
    name: { en: "Cat food", ar: "طعام القطط" },
    description: { en: "", ar: "" },
    petTypes: ["cats"],
    images: [],
    variants: [
      { code: "cf-15", sku: "FO-CF-15", label: { en: "1.5 kg", ar: "١٫٥ كغ" }, weightGrams: 1500, price: 8500, salePrice: null, stock: 2 },
    ],
    house: null,
    offers: [],
  };
  assert.equal(publicProductSchema.safeParse(product).success, true);
  // A sale price and an offer label (#11, 11b).
  const offer = {
    name: { en: "Food week", ar: "أسبوع الطعام" },
    offer: "percent",
    value: 15,
    buyGet: null,
    bundle: null,
    eligibility: "all",
    minSpend: 0,
    perCustomerLimit: 0,
    endsOn: "2026-10-31",
  };
  assert.equal(
    publicProductSchema.safeParse({ ...product, variants: [{ ...product.variants[0], salePrice: 7225 }], offers: [offer] }).success,
    true,
  );
  assert.equal(publicProductSchema.safeParse({ ...product, offers: [{ ...offer, offer: "free_gift" }] }).success, false);
  // An offer limited per customer says how often (D210 2A); it is a label, never a sale price.
  assert.equal(publicProductSchema.safeParse({ ...product, offers: [{ ...offer, perCustomerLimit: 1 }] }).success, true);
  assert.equal(publicProductSchema.safeParse({ ...product, offers: [{ ...offer, perCustomerLimit: -1 }] }).success, false);
  assert.equal(publicProductSchema.safeParse({ ...product, offers: [{ ...offer, perCustomerLimit: undefined }] }).success, false);
  assert.equal(publicProductSchema.safeParse({ ...product, variants: [{ ...product.variants[0], salePrice: -1 }] }).success, false);
  assert.equal(
    publicProductSchema.safeParse({ ...product, variants: [{ ...product.variants[0], price: -1 }] }).success,
    false,
  );
  assert.equal(
    publicProductSchema.safeParse({ ...product, variants: [{ ...product.variants[0], weightGrams: 0 }] }).success,
    false,
  );
  assert.equal(publicProductSchema.safeParse({ ...product, name: { en: "Only English" } }).success, false);
});

test("saving a product: unique SKUs ignoring case, prices above zero unless price-on-request, safe image addresses", async () => {
  const { saveProductRequestSchema } = await import("../src/index.js");
  const pack = { sku: "FO-A", label: { en: "1 kg", ar: "١ كغ" }, weightGrams: 1000, price: 100, stock: 1, lowStockThreshold: null, active: true };
  const base = {
    category: "food",
    petTypes: ["cats"],
    brand: null,
    name: { en: "A", ar: "أ" },
    description: { en: "", ar: "" },
    active: true,
    featured: false,
    bestSeller: false,
    images: [{ url: "/images/a.png", alt: { en: "", ar: "" } }],
    variants: [pack],
    house: null,
  };
  assert.equal(saveProductRequestSchema.safeParse(base).success, true);
  const duplicate = saveProductRequestSchema.safeParse({ ...base, variants: [pack, { ...pack, sku: "fo-a" }] });
  assert.deepEqual(duplicate.error?.issues.map((issue) => issue.path.join(".")), ["variants.1.sku"]);
  assert.equal(saveProductRequestSchema.safeParse({ ...base, variants: [{ ...pack, price: 0 }] }).success, false);
  const inquiryHouse = {
    ...base,
    category: "pet-houses",
    variants: [{ ...pack, price: 0 }],
    house: {
      collection: "indoor",
      purchaseMode: "inquiry",
      availability: "unconfirmed",
      dimensions: null,
      features: [],
      leadTime: null,
      deliveryFee: null,
      fulfilment: "delivery",
      provisional: true,
      source: null,
    },
  };
  assert.equal(saveProductRequestSchema.safeParse(inquiryHouse).success, true);
  for (const url of ["/api/media/0197a000-0000-7000-8000-000000000001.webp", "https://cdn.example.invalid/a.jpg"]) {
    assert.equal(saveProductRequestSchema.safeParse({ ...base, images: [{ url, alt: { en: "", ar: "" } }] }).success, true, url);
  }
  for (const url of ["javascript:alert(1)", "data:image/png;base64,AA", "/api/media/../../x.webp", "http://example.invalid/a.png"]) {
    assert.equal(saveProductRequestSchema.safeParse({ ...base, images: [{ url, alt: { en: "", ar: "" } }] }).success, false, url);
  }
});

test("a Pet House can be ordered online only once every detail is complete (#14, D268)", () => {
  const ready: PetHouseDetails = {
    collection: "indoor",
    purchaseMode: "fixed",
    availability: "made-to-order",
    dimensions: null,
    features: [],
    leadTime: { minDays: 7, maxDays: 10 },
    deliveryFee: 10_000,
    fulfilment: "delivery",
    provisional: false,
    source: null,
  };
  assert.deepEqual(houseGaps(ready, [290_000]), []);
  assert.deepEqual(houseGaps({ ...ready, deliveryFee: 0 }, [290_000]), [], "free delivery (0) is a choice, not a gap");
  assert.deepEqual(houseGaps({ ...ready, availability: "in-stock", leadTime: { minDays: 0, maxDays: 0 } }, [1]), []);
  // Each missing detail is named, in the checklist's order.
  assert.deepEqual(
    houseGaps({ ...ready, purchaseMode: "inquiry", availability: "unconfirmed", leadTime: null, deliveryFee: null, provisional: true }, [0]),
    ["price", "availability", "leadTime", "deliveryFee", "checked"],
  );
  assert.deepEqual(houseGaps(ready, []), ["price"], "no size customers can choose");
  assert.deepEqual(houseGaps(ready, [290_000, 0]), ["price"], "every size needs a price");
  assert.deepEqual(houseGaps({ ...ready, provisional: true }, [290_000]), ["checked"], "a sample model is never sold by mistake");
  // "Ready in about … days" up to HOUSE_MAX_LEAD_DAYS, and a delivery charge up to QAR 10,000.
  assert.equal(petHouseDetailsSchema.safeParse({ ...ready, leadTime: { minDays: 0, maxDays: HOUSE_MAX_LEAD_DAYS } }).success, true);
  assert.equal(petHouseDetailsSchema.safeParse({ ...ready, leadTime: { minDays: 0, maxDays: HOUSE_MAX_LEAD_DAYS + 1 } }).success, false);
  assert.equal(petHouseDetailsSchema.safeParse({ ...ready, deliveryFee: 1_000_000 }).success, true);
  assert.equal(petHouseDetailsSchema.safeParse({ ...ready, deliveryFee: 1_000_001 }).success, false);
});
