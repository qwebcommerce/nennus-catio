import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addressPinSchema,
  apiErrorCodeSchema,
  checkoutQuoteSchema,
  checkoutRequestSchema,
  customerOrderSchema,
  customerPaymentSchema,
  HOUSE_MAX_LEAD_DAYS,
  MAX_PIN_ACCURACY_METRES,
  ORDER_LIMITS,
  orderLineSchema,
  orderReferenceSchema,
  pinMapsUrl,
  qatarAddressSchema,
} from "../src/index.js";

const address = { zone: "66", street: "850", building: "12" };
const base = {
  idempotencyKey: "0197a000-0000-7000-8000-000000000001",
  locale: "en",
  contact: { name: " Sara ", email: " Sara@Example.Invalid ", phone: "+974 5555 1234" },
  lines: [{ product: "cat-food", variant: "cf-15", quantity: 2 }],
  expectedTotal: 17000,
};
const delivery = {
  ...base,
  fulfilment: "delivery",
  delivery: { areaId: "0197a000-0000-7000-8000-0000000000a1", windowId: "0197a000-0000-7000-8000-0000000000b1", address },
};

test("a delivery checkout needs area, window and address; pickup must not send them", () => {
  const parsed = checkoutRequestSchema.parse(delivery);
  assert.equal(parsed.contact.email, "sara@example.invalid");
  assert.equal(parsed.contact.name, "Sara");
  assert.equal(parsed.delivery?.address.floor, "");
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, delivery: null }).success, false);
  assert.equal(checkoutRequestSchema.safeParse({ ...base, fulfilment: "pickup", delivery: null }).success, true);
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, fulfilment: "pickup" }).success, false);
});

test("lines: 1 to 30 distinct items, 1 to 99 of each", () => {
  const line = (variant: string, quantity = 1) => ({ product: "cat-food", variant, quantity });
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, lines: [] }).success, false);
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, lines: [line("a", 0)] }).success, false);
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, lines: [line("a", ORDER_LIMITS.maxQuantity + 1)] }).success, false);
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, lines: [line("a", 1.5)] }).success, false);
  const duplicate = checkoutRequestSchema.safeParse({ ...delivery, lines: [line("a"), line("b"), line("a", 2)] });
  assert.equal(duplicate.success, false);
  assert.deepEqual(duplicate.error?.issues.map((issue) => issue.path.join(".")), ["lines.2"]);
  const many = Array.from({ length: ORDER_LIMITS.maxLines + 1 }, (_, index) => line(`p${index}`));
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, lines: many }).success, false);
});

test("the Qatar address plate takes numbers only for zone, street and building", () => {
  assert.equal(qatarAddressSchema.safeParse(address).success, true);
  assert.equal(qatarAddressSchema.safeParse({ ...address, zone: "1234" }).success, false);
  assert.equal(qatarAddressSchema.safeParse({ ...address, street: "Al Sadd St" }).success, false);
  assert.equal(qatarAddressSchema.safeParse({ ...address, building: "" }).success, false);
  assert.equal(qatarAddressSchema.safeParse({ ...address, note: "x".repeat(301) }).success, false);
});

test("a shared point (D263) is optional, inside Qatar, at most 1 km rough, and opens in Google Maps", () => {
  assert.equal(qatarAddressSchema.parse(address).pin, null, "no point unless one is sent");
  const pin = { lat: 25.285447, lng: 51.53104, accuracy: 12 };
  assert.deepEqual(qatarAddressSchema.parse({ ...address, pin }).pin, pin);
  for (const [lat, lng] of [
    [21.4225, 39.8262],
    [24.39, 51.5],
    [26.31, 51.5],
    [25.3, 50.69],
    [25.3, 51.71],
  ]) {
    assert.equal(addressPinSchema.safeParse({ lat, lng, accuracy: 10 }).success, false, `${lat},${lng}`);
  }
  for (const accuracy of [-1, 1000.5, 1001]) assert.equal(addressPinSchema.safeParse({ ...pin, accuracy }).success, false, String(accuracy));
  assert.equal(addressPinSchema.safeParse({ ...pin, accuracy: MAX_PIN_ACCURACY_METRES }).success, true);
  assert.equal(addressPinSchema.safeParse({ lat: 25.3, lng: 51.5 }).success, false, "all three or none");
  assert.equal(pinMapsUrl(pin), "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
});

test("phone numbers are checked", () => {
  for (const phone of ["5555", "call me", "+974 5555 1234 5555 1234", `+${"1".repeat(20)}`, "55+551234"]) {
    assert.equal(checkoutRequestSchema.safeParse({ ...delivery, contact: { ...base.contact, phone } }).success, false, phone);
  }
  // 20 characters is the most the database column holds, "+" included.
  for (const phone of ["55551234", "+974 (5555) 12-34"]) {
    assert.equal(checkoutRequestSchema.safeParse({ ...delivery, contact: { ...base.contact, phone } }).success, true, phone);
  }
});

test("phones are ones SkipCash accepts: Qatari, or another country's with its code (8c)", () => {
  // SkipCash refused 0912345678 in its sandbox and accepted the others (2026-10-11).
  for (const phone of ["0919987622", "0912345678", "1234567890", "+0 912 345 6789", `+${"1".repeat(15)}`, "00 12 34 56", "0000 0000"]) {
    const parsed = checkoutRequestSchema.safeParse({ ...delivery, contact: { ...base.contact, phone } });
    assert.equal(parsed.success, false, phone);
    assert.match(parsed.error?.issues[0]?.message ?? "", /Qatari number, or add your country code/, phone);
  }
  for (const phone of [
    "55551234",
    "5555 1234",
    "+974 5555 1234",
    "974 5555 1234",
    "00974 5555 1234",
    "+63 912 345 6789",
    "0063 912 345 6789",
    "+1 (202) 555-0199",
    `+${"1".repeat(14)}`,
  ]) {
    assert.equal(checkoutRequestSchema.safeParse({ ...delivery, contact: { ...base.contact, phone } }).success, true, phone);
  }
});

test("idempotency keys and totals are checked", () => {
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, idempotencyKey: "retry-1" }).success, false);
  assert.equal(checkoutRequestSchema.safeParse({ ...delivery, expectedTotal: -1 }).success, false);
});

test("order references have the NC-YYMMDD-XXXXXX form without look-alike letters", () => {
  assert.equal(orderReferenceSchema.safeParse("NC-261008-4F7KQ2").success, true);
  for (const bad of ["NC-261008-4F7K", "NC-261008-4F7KQO", "nc-261008-4F7KQ2", "NC-2610-4F7KQ2", "NC-261008-4F7KQI"]) {
    assert.equal(orderReferenceSchema.safeParse(bad).success, false, bad);
  }
});

test("checkout refusals have their own error codes", () => {
  for (const code of ["ITEM_UNAVAILABLE", "OUT_OF_STOCK", "SLOT_UNAVAILABLE", "PRICE_CHANGED", "HOLD_EXPIRED", "NOT_CANCELLABLE"]) {
    assert.equal(apiErrorCodeSchema.safeParse(code).success, true, code);
  }
});

test("a Pet House line keeps its own copy; the quote names the houses' delivery part and how far ahead delivery starts (#14)", () => {
  const line = {
    product: "house-cat-villa",
    variant: "standard",
    sku: "PH-VILLA",
    name: { en: "Cat villa", ar: "فيلا القطط" },
    label: { en: "Standard", ar: "قياسي" },
    weightGrams: null,
    unitPrice: 290_000,
    quantity: 1,
    discount: 0,
    lineTotal: 290_000,
    house: { madeToOrder: true, leadTime: { minDays: 7, maxDays: 10 }, deliveryFee: 10_000 },
  };
  assert.equal(orderLineSchema.safeParse(line).success, true);
  assert.equal(orderLineSchema.safeParse({ ...line, house: null }).success, true, "other items have none");
  assert.equal(orderLineSchema.safeParse({ ...line, house: undefined }).success, false, "always said, null or a copy");
  assert.equal(orderLineSchema.safeParse({ ...line, house: { ...line.house, deliveryFee: -1 } }).success, false);

  const quote = { lines: [], subtotal: 290_000, discount: 0, deliveryFee: 12_000, houseDeliveryFee: 10_000, houseLeadDays: 10, total: 302_000, promotions: [], code: null };
  assert.equal(checkoutQuoteSchema.safeParse(quote).success, true);
  assert.equal(checkoutQuoteSchema.safeParse({ ...quote, houseDeliveryFee: 0, houseLeadDays: null }).success, true, "no house");
  assert.equal(checkoutQuoteSchema.safeParse({ ...quote, houseLeadDays: HOUSE_MAX_LEAD_DAYS + 1 }).success, false);
  assert.ok("houseDeliveryFee" in customerOrderSchema.shape);
});

test("an order view carries no internal ids", () => {
  const keys = Object.keys(customerOrderSchema.shape);
  for (const internal of ["id", "customerId", "version", "guestLinkVersion"]) assert.equal(keys.includes(internal), false, internal);
  const paymentKeys = Object.keys(customerPaymentSchema.shape);
  for (const internal of ["id", "providerPaymentId", "checkoutUrl", "amount"]) assert.equal(paymentKeys.includes(internal), false, internal);
});

test("the customer's payment details: what Pay now may offer, the latest attempt and why staff are involved (8b)", () => {
  const payment = {
    canPay: true,
    latest: { reference: "NC-261010-4F7KQ2-P1", status: "failed" },
    attemptsLeft: 2,
    attention: null,
  };
  assert.deepEqual(customerPaymentSchema.parse(payment), payment);
  assert.equal(customerPaymentSchema.safeParse({ ...payment, attemptsLeft: -1 }).success, false);
  assert.equal(customerPaymentSchema.safeParse({ ...payment, latest: { reference: "x", status: "paid" } }).success, false);
  assert.equal(customerPaymentSchema.safeParse({ ...payment, attention: "paid_after_expiry" }).success, true);
  assert.equal(customerPaymentSchema.safeParse({ ...payment, attention: "late" }).success, false);
});
