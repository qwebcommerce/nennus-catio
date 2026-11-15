import { describe, it, expect } from "vitest";
import { seedDemo } from "@/mocks/data/business";
import {
  cataloguePerformance,
  stockState,
} from "@/features/admin/products/lib/catalogue";
describe("Catalogue helpers", () => {
  it("uses each SKU threshold, not the total product stock", () => {
    const variants = seedDemo().products.find((p) => !p.house)!.variants;
    expect(
      stockState([
        { ...variants[0], stock: 40 },
        { ...variants[0], stock: 6, lowStock: 10 },
      ]),
    ).toBe("low");
  });
  it("distinguishes empty inventory from the default low-stock threshold", () => {
    const v = seedDemo().products.find((p) => !p.house)!.variants[0];
    expect(stockState([{ ...v, stock: 0 }])).toBe("out");
    expect(stockState([{ ...v, stock: 5 }])).toBe("low");
    expect(stockState([{ ...v, stock: 6 }])).toBe("in");
  });
  it("counts paid non-cancelled item snapshots in the selected Qatar window", () => {
    const d = seedDemo(),
      p = d.products.find((p) => !p.house)!,
      base = d.orders[0];
    const order = {
      ...base,
      date: "2026-09-30T12:00:00Z",
      payment: "paid" as const,
      status: "completed" as const,
      fee: 999,
      items: [{ ...base.items[0], productId: p.id, quantity: 2, price: 1234 }],
    };
    d.orders = [
      order,
      { ...order, payment: "pending" },
      { ...order, status: "cancelled" },
      { ...order, date: "2026-08-01T12:00:00Z" },
      {
        ...order,
        items: [{ ...order.items[0], productId: "another-product" }],
      },
    ];
    expect(cataloguePerformance(d, p, "2026-09-30")).toEqual({
      units: 2,
      revenue: 2468,
      last: order.date,
    });
  });
  it("derives service performance only from the selected package", () => {
    const d = seedDemo(),
      p = d.packages[0],
      base = d.bookings[0];
    d.bookings = [
      {
        ...base,
        packageId: p.id,
        date: "2026-09-30",
        payment: "paid",
        status: "confirmed",
        price: 5000,
      },
      {
        ...base,
        packageId: p.id,
        date: "2026-09-30",
        payment: "pending",
        price: 5000,
      },
      {
        ...base,
        packageId: "different",
        date: "2026-09-30",
        payment: "paid",
        price: 5000,
      },
    ];
    expect(cataloguePerformance(d, p, "2026-09-30")).toEqual({
      units: 1,
      revenue: 5000,
      last: "2026-09-30",
    });
  });
});
