import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminBookingSchema,
  adminPromotionSchema,
  apiErrorCodeSchema,
  apiErrorSchema,
  bookingQuoteRequestSchema,
  bookingQuoteSchema,
  bookingRequestSchema,
  checkoutQuoteRequestSchema,
  customerBookingSchema,
  groomingAvailabilityResponseSchema,
  orderPromotionSchema,
  PROMOTION_LIMITS,
  promoCodeStatusSchema,
  savePromotionRequestSchema,
  setPromotionEnabledRequestSchema,
} from "../src/index.js";

const id = (n: number) => `0197a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

const discount = {
  name: { en: " Food week ", ar: "أسبوع الطعام" },
  description: { en: "", ar: "" },
  type: "discount",
  offer: "percent",
  value: 15,
  buyGet: null,
  targetKind: "categories",
  targetIds: [id(1)],
  bundleItems: [],
  code: null,
  minSpend: 0,
  eligibility: "all",
  usageLimit: 0,
  perCustomerLimit: 0,
  startsOn: "2026-10-13",
  endsOn: null,
  enabled: true,
  visible: true,
  featured: false,
  image: null,
};

const issues = (value: unknown) => {
  const result = savePromotionRequestSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

test("a promotion request is trimmed, and a code is saved in capitals", () => {
  assert.equal(savePromotionRequestSchema.parse(discount).name.en, "Food week");
  const code = savePromotionRequestSchema.parse({ ...discount, type: "code", targetKind: "order", targetIds: [], code: " welcome_10 " });
  assert.equal(code.code, "WELCOME_10");
  for (const bad of ["ab", "with space", "x".repeat(33), "ünï"]) {
    assert.deepEqual(issues({ ...discount, type: "code", targetKind: "order", targetIds: [], code: bad }), ["code"], bad);
  }
});

test("type, offer and target go together as D202 says", () => {
  const bundle = { ...discount, type: "bundle", offer: "bundle_price", value: 4500, targetKind: "bundle", targetIds: [] };
  const packs = [
    { variantId: id(2), quantity: 1 },
    { variantId: id(3), quantity: 1 },
  ];
  assert.deepEqual(issues({ ...bundle, bundleItems: packs }), []);
  assert.deepEqual(issues({ ...bundle, bundleItems: [{ variantId: id(2), quantity: 2 }] }), [], "two of one pack is a bundle");
  assert.deepEqual(issues({ ...bundle, bundleItems: [{ variantId: id(2), quantity: 1 }] }), ["bundleItems"]);
  assert.ok(issues({ ...bundle, offer: "percent", bundleItems: packs }).includes("offer"));
  assert.ok(issues({ ...discount, targetKind: "bundle", targetIds: [] }).includes("targetKind"));
  assert.deepEqual(issues({ ...discount, bundleItems: packs }), ["bundleItems"]);

  const buyGet = { ...discount, offer: "buy_get", value: 0, buyGet: { buy: 2, get: 1, percent: 100 } };
  assert.deepEqual(issues(buyGet), []);
  assert.deepEqual(issues({ ...buyGet, targetKind: "order", targetIds: [] }), ["targetKind"]);
  assert.deepEqual(issues({ ...buyGet, targetKind: "all_grooming", targetIds: [] }), ["targetKind"]);
  assert.ok(issues({ ...buyGet, type: "code", code: "BOGO" }).includes("offer"));
  assert.deepEqual(issues({ ...buyGet, buyGet: null }), ["buyGet"]);
  assert.deepEqual(issues({ ...discount, buyGet: { buy: 1, get: 1, percent: 50 } }), ["buyGet"]);
  assert.deepEqual(issues({ ...buyGet, buyGet: { buy: 0, get: 1, percent: 100 } }), ["buyGet.buy"]);

  assert.deepEqual(issues({ ...discount, type: "code" }), ["code"]);
  assert.deepEqual(issues({ ...discount, code: "SPRING" }), ["code"]);
});

test("values, targets and dates", () => {
  assert.deepEqual(issues({ ...discount, value: 0 }), ["value"]);
  assert.deepEqual(issues({ ...discount, value: 101 }), ["value"]);
  assert.deepEqual(issues({ ...discount, offer: "fixed", value: 0 }), ["value"]);
  assert.deepEqual(issues({ ...discount, offer: "fixed", value: PROMOTION_LIMITS.maxAmount + 1 }), ["value"]);
  assert.deepEqual(issues({ ...discount, value: 12.5 }), ["value"]);
  assert.deepEqual(issues({ ...discount, targetIds: [] }), ["targetIds"]);
  assert.deepEqual(issues({ ...discount, targetIds: [id(1), id(1)] }), ["targetIds"]);
  assert.deepEqual(issues({ ...discount, targetKind: "all_products" }), ["targetIds"]);
  assert.deepEqual(issues({ ...discount, targetKind: "grooming_packages", targetIds: [id(4)] }), []);
  assert.deepEqual(issues({ ...discount, endsOn: "2026-10-12" }), ["endsOn"]);
  assert.deepEqual(issues({ ...discount, endsOn: "2026-10-13" }), [], "a one-day promotion");
  assert.deepEqual(issues({ ...discount, startsOn: "2026-02-30" }), ["startsOn"]);
  assert.deepEqual(issues({ ...discount, usageLimit: -1 }), ["usageLimit"]);
  assert.deepEqual(issues({ ...discount, eligibility: "vip" }), ["eligibility"]);
  assert.deepEqual(issues({ ...discount, image: "javascript:alert(1)" }), ["image"]);
});

test("switching on or off needs the version; a promotion as staff see it", () => {
  assert.equal(setPromotionEnabledRequestSchema.safeParse({ enabled: false }).success, false);
  assert.equal(setPromotionEnabledRequestSchema.safeParse({ enabled: false, version: 3 }).success, true);
  const keys = Object.keys(adminPromotionSchema.shape);
  for (const field of ["usesCount", "usedCount", "discountGiven", "status", "version"]) assert.ok(keys.includes(field), field);
  assert.equal(adminPromotionSchema.shape.code.safeParse("welcome10").success, false, "stored codes are capitals");
});

test("at checkout (11b): the code box takes any text up to 64 characters; the quote needs only the area", () => {
  const cart = { fulfilment: "pickup", delivery: null, lines: [{ product: "cat-food", variant: "cf-15", quantity: 1 }] };
  assert.equal(checkoutQuoteRequestSchema.parse({ ...cart, code: "  welcome10 " }).code, "welcome10");
  assert.equal(checkoutQuoteRequestSchema.parse(cart).code, undefined);
  assert.equal(checkoutQuoteRequestSchema.parse({ ...cart, code: null }).code, null);
  assert.equal(checkoutQuoteRequestSchema.safeParse({ ...cart, code: "x".repeat(65) }).success, false);
  const delivery = { ...cart, fulfilment: "delivery", delivery: { areaId: id(9) } };
  assert.equal(checkoutQuoteRequestSchema.safeParse(delivery).success, true);
  assert.equal(checkoutQuoteRequestSchema.safeParse({ ...delivery, delivery: null }).success, false);
  assert.equal(checkoutQuoteRequestSchema.safeParse({ ...cart, lines: [...cart.lines, ...cart.lines] }).success, false);
  assert.equal(apiErrorCodeSchema.safeParse("PROMO_CODE_INVALID").success, true);
  assert.deepEqual(Object.keys(orderPromotionSchema.shape).sort(), ["code", "discount", "name"], "customers see no ids");
  for (const status of ["applied", "unknown", "used_up_for_you", "min_spend"]) assert.equal(promoCodeStatusSchema.safeParse(status).success, true);
  assert.equal(promoCodeStatusSchema.safeParse("none").success, false, "no code is a null answer, not a status");
});

test("the error envelope carries checkout's price on PRICE_CHANGED and the code's reason on PROMO_CODE_INVALID (D207)", () => {
  const quote = { lines: [], subtotal: 1000, discount: 0, deliveryFee: 0, houseDeliveryFee: 0, houseLeadDays: null, total: 1000, promotions: [], code: null };
  assert.equal(apiErrorSchema.safeParse({ code: "PRICE_CHANGED", message: "Price changed.", quote }).success, true);
  assert.equal(apiErrorSchema.safeParse({ code: "PRICE_CHANGED", message: "Price changed.", quote: { total: -1 } }).success, false);
  assert.equal(apiErrorSchema.safeParse({ code: "PROMO_CODE_INVALID", message: "Expired.", codeStatus: "ended" }).success, true);
  assert.equal(apiErrorSchema.safeParse({ code: "PROMO_CODE_INVALID", message: "?", codeStatus: "expired_code" }).success, false);
});

test("grooming bookings (11c): the quote needs the area only for a home visit; the booking takes a code; PRICE_CHANGED carries the booking's price", () => {
  const shop = { packageId: id(1), location: "shop", home: null };
  assert.equal(bookingQuoteRequestSchema.parse({ ...shop, code: " groom10 " }).code, "groom10");
  assert.equal(bookingQuoteRequestSchema.parse(shop).code, undefined);
  assert.equal(bookingQuoteRequestSchema.safeParse({ ...shop, home: { areaId: id(2) } }).success, false, "a shop booking has no area");
  assert.equal(bookingQuoteRequestSchema.safeParse({ ...shop, location: "home" }).success, false, "a home visit needs its area");
  assert.equal(bookingQuoteRequestSchema.safeParse({ ...shop, location: "home", home: { areaId: id(2) } }).success, true);
  assert.equal(bookingQuoteRequestSchema.safeParse({ ...shop, code: "x".repeat(65) }).success, false);
  assert.ok("code" in bookingRequestSchema.shape);

  const bookingQuote = { price: 12000, visitFee: 0, discount: 1200, total: 10800, promotions: [], code: null };
  assert.equal(bookingQuoteSchema.safeParse(bookingQuote).success, true);
  assert.equal(bookingQuoteSchema.safeParse({ ...bookingQuote, total: 0 }).success, false, "a booking is never free (D202 question 7)");
  assert.equal(apiErrorSchema.safeParse({ code: "PRICE_CHANGED", message: "Price changed.", bookingQuote }).success, true);
  assert.equal(apiErrorSchema.safeParse({ code: "PRICE_CHANGED", message: "Price changed.", bookingQuote: { total: 1 } }).success, false);
  for (const shape of [customerBookingSchema.shape, groomingAvailabilityResponseSchema.shape]) {
    assert.ok("discount" in shape && "promotions" in shape);
  }
  assert.deepEqual(Object.keys(adminBookingSchema.shape.promotions.element.shape).sort(), ["code", "discount", "name", "promotionId", "status"]);
});
