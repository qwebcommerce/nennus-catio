import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminOrderQuerySchema,
  canChangeDeliveryTime,
  cancellingAsksAboutStock,
  changeDeliveryTimeRequestSchema,
  nextOrderStatus,
  orderStatusSchema,
  previousOrderStatus,
  staffCancelOrderRequestSchema,
  staffCanCancel,
} from "../src/index.js";

test("steps forward follow delivery or pickup; unpaid and finished orders do not move", () => {
  assert.equal(nextOrderStatus("confirmed", "delivery"), "preparing");
  assert.equal(nextOrderStatus("preparing", "delivery"), "out_for_delivery");
  assert.equal(nextOrderStatus("preparing", "pickup"), "ready_for_pickup");
  assert.equal(nextOrderStatus("out_for_delivery", "delivery"), "delivered");
  assert.equal(nextOrderStatus("ready_for_pickup", "pickup"), "collected");
  for (const status of ["awaiting_payment", "delivered", "collected", "cancelled", "expired"] as const) {
    assert.equal(nextOrderStatus(status, "delivery"), null, status);
  }
});

test("one step back (D132), never after Delivered or Collected", () => {
  assert.equal(previousOrderStatus("preparing"), "confirmed");
  assert.equal(previousOrderStatus("out_for_delivery"), "preparing");
  assert.equal(previousOrderStatus("ready_for_pickup"), "preparing");
  for (const status of ["awaiting_payment", "confirmed", "delivered", "collected", "cancelled", "expired"] as const) {
    assert.equal(previousOrderStatus(status), null, status);
  }
});

test("staff cancel any open order; the stock question starts at Preparing (D131)", () => {
  const open = orderStatusSchema.options.filter(staffCanCancel);
  assert.deepEqual(open, ["awaiting_payment", "confirmed", "preparing", "out_for_delivery", "ready_for_pickup"]);
  assert.deepEqual(orderStatusSchema.options.filter(cancellingAsksAboutStock), ["preparing", "out_for_delivery", "ready_for_pickup"]);
});

test("list filters: status lists, page sizes and defaults", () => {
  const parsed = adminOrderQuerySchema.parse({ status: "confirmed,preparing", page: "2", pageSize: "10" });
  assert.deepEqual(parsed.status, ["confirmed", "preparing"]);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 10);
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.dateField, "placed");
  assert.equal(adminOrderQuerySchema.safeParse({ status: "confirmed,shipped" }).success, false);
  assert.equal(adminOrderQuerySchema.safeParse({ pageSize: "1000" }).success, false);
  assert.equal(adminOrderQuerySchema.safeParse({ area: "not-a-uuid" }).success, false);
  // 8b: "Refund needed or payment to check" is one switch.
  assert.equal(adminOrderQuerySchema.parse({ needsAction: "1" }).needsAction, "1");
  assert.equal(adminOrderQuerySchema.parse({}).needsAction, undefined);
  assert.equal(adminOrderQuerySchema.safeParse({ needsAction: "yes" }).success, false);
});

test("a staff cancellation needs a real reason", () => {
  assert.equal(staffCancelOrderRequestSchema.safeParse({ version: 3, reason: "Customer asked by phone", returnStock: true }).success, true);
  assert.equal(staffCancelOrderRequestSchema.safeParse({ version: 3, reason: "  ", returnStock: true }).success, false);
  assert.equal(staffCancelOrderRequestSchema.safeParse({ version: 3, reason: "x".repeat(301), returnStock: false }).success, false);
});

test("a new delivery time: a paid delivery order that has not left yet (#14, D268)", () => {
  for (const status of orderStatusSchema.options) {
    const expected = status === "confirmed" || status === "preparing";
    assert.equal(canChangeDeliveryTime(status, "delivery"), expected, status);
    assert.equal(canChangeDeliveryTime(status, "pickup"), false, `pickup ${status}`);
  }
  const id = "0197a000-0000-7000-8000-0000000000b1";
  assert.equal(changeDeliveryTimeRequestSchema.safeParse({ version: 3, windowId: id }).success, true);
  assert.equal(changeDeliveryTimeRequestSchema.safeParse({ version: 3, windowId: "tomorrow" }).success, false);
  assert.equal(changeDeliveryTimeRequestSchema.safeParse({ windowId: id }).success, false, "the version the screen loaded");
  assert.equal(adminOrderQuerySchema.parse({ houses: "1" }).houses, "1", "only orders with a Pet House");
  assert.equal(adminOrderQuerySchema.safeParse({ houses: "yes" }).success, false);
});
