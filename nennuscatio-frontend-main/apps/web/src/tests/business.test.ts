import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMockRepository,
  remaining,
  financialRows,
  financeCsv,
  csvCell,
  safeUrl,
  isFutureSlot,
} from "@/mocks/adapters/business-repository";
import { seedDemo, bi, type Slot } from "@/mocks/data/business";
const guest = {
  name: "Test Guest",
  email: "test@example.invalid",
  phone: "+974 1234 5678",
};
function emptyBusiness() {
  const d = seedDemo();
  d.orders = [];
  d.bookings = [];
  return d;
}
function orderInput(key = "once") {
  return {
    key,
    guest,
    lines: [{ productId: "cat-food", variantId: "cf-15", quantity: 2 }],
    fulfilment: "pickup" as const,
    address: "",
    outcome: "success" as const,
  };
}
afterEach(() => vi.useRealTimers());
describe("shared business mocks", () => {
  it("does not offer past slots even when their manual active flag remains true", () => {
    const d = emptyBusiness();
    const slot = { ...d.slots[0], date: "2020-01-01" };
    expect(remaining(d, slot)).toBe(0);
  });
  it("rejects punctuation-only phone numbers and empty product images", () => {
    const r = createMockRepository(emptyBusiness());
    expect(() =>
      r.checkout({ ...orderInput(), guest: { ...guest, phone: "--------" } }),
    ).toThrow();
    expect(() =>
      r.saveProduct({ ...r.getSnapshot().products[0], image: "" }),
    ).toThrow();
    expect(() =>
      r.savePackage({ ...r.getSnapshot().packages[0], image: "" }),
    ).toThrow();
  });
  it("keeps seeds internally within slot capacities with eight configurations", () => {
    const d = seedDemo();
    expect(d.packages).toHaveLength(8);
    d.slots.forEach((s) => {
      const used =
        s.kind === "delivery"
          ? d.orders.filter(
              (o) => o.slotId === s.id && o.status !== "cancelled",
            ).length
          : d.bookings.filter(
              (b) => b.slotId === s.id && b.status !== "cancelled",
            ).length;
      expect(used).toBeLessThanOrEqual(s.capacity);
    });
  });
  it("combines exact money, reserves stock and replays a submission exactly once", () => {
    const r = createMockRepository(emptyBusiness());
    const before = r.getSnapshot().products[0].variants[0].stock;
    const id = r.checkout(orderInput());
    expect(r.checkout(orderInput())).toBe(id);
    expect(r.getSnapshot().orders).toHaveLength(1);
    expect(r.getSnapshot().orders[0].total).toBe(17000);
    expect(r.getSnapshot().products[0].variants[0].stock).toBe(before - 2);
  });
  it("rolls back failed stock/contact/delivery validation without partial writes", () => {
    const r = createMockRepository(emptyBusiness());
    const before = r.getSnapshot();
    expect(() =>
      r.checkout({
        ...orderInput(),
        lines: [{ productId: "cat-food", variantId: "cf-15", quantity: 999 }],
      }),
    ).toThrow();
    expect(r.getSnapshot()).toBe(before);
    expect(() =>
      r.checkout({ ...orderInput(), guest: { ...guest, email: "bad" } }),
    ).toThrow();
    expect(r.getSnapshot()).toBe(before);
    expect(() =>
      r.checkout({
        ...orderInput(),
        fulfilment: "delivery",
        slotId: "bad",
        address: "address",
      }),
    ).toThrow();
    expect(r.getSnapshot()).toBe(before);
  });
  it("does not submit failed/cancelled payments or count pending as settled", () => {
    const r = createMockRepository(emptyBusiness());
    expect(() => r.checkout({ ...orderInput(), outcome: "failed" })).toThrow();
    expect(() =>
      r.checkout({ ...orderInput(), outcome: "cancelled" }),
    ).toThrow();
    expect(r.getSnapshot().orders).toHaveLength(0);
    r.checkout({ ...orderInput(), outcome: "pending" });
    expect(
      financialRows(r.getSnapshot()).filter((x) => x.payment === "paid"),
    ).toHaveLength(0);
  });
  it("releases stock and delivery capacity exactly once after cancellation", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "delivery")!;
    const stock = r.getSnapshot().products[0].variants[0].stock;
    const id = r.checkout({
      ...orderInput(),
      fulfilment: "delivery",
      slotId: slot.id,
      address: "demo address",
    });
    expect(remaining(r.getSnapshot(), slot)).toBe(slot.capacity - 1);
    r.status("orders", id, "cancelled");
    expect(remaining(r.getSnapshot(), slot)).toBe(slot.capacity);
    expect(r.getSnapshot().products[0].variants[0].stock).toBe(stock);
    expect(() => r.status("orders", id, "cancelled")).toThrow();
    expect(financialRows(r.getSnapshot())).toHaveLength(0);
  });
  it("associates contacts only when both email and phone match", () => {
    const r = createMockRepository(emptyBusiness());
    r.checkout(orderInput("a"));
    r.checkout(orderInput("b"));
    expect(r.getSnapshot().orders[0].customerId).toBe(
      r.getSnapshot().orders[1].customerId,
    );
    r.checkout({
      ...orderInput("c"),
      guest: { ...guest, phone: "+974 8765 4321" },
    });
    expect(r.getSnapshot().orders[0].customerId).not.toBe(
      r.getSnapshot().orders[1].customerId,
    );
  });
  it("prevents two mock holders of the same grooming slot, expires and releases holds", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "grooming")!;
    r.hold(slot.id, "a");
    expect(() => r.hold(slot.id, "b")).toThrow();
    r.release("a");
    r.hold(slot.id, "b");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    r.hold(slot.id, "c");
    expect(r.getSnapshot().holds).toHaveLength(1);
  });
  it("confirms a held booking once, preserves package snapshots and releases on cancellation", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "grooming")!,
      p = r.getSnapshot().packages[0];
    r.hold(slot.id, "hold");
    const input = {
      key: "booking",
      holdId: "hold",
      packageId: p.id,
      slotId: slot.id,
      guest,
      petName: "Demo Milo",
      petNotes: "",
      outcome: "success" as const,
    };
    const id = r.book(input);
    expect(r.book(input)).toBe(id);
    expect(remaining(r.getSnapshot(), slot)).toBe(0);
    r.savePackage({
      ...p,
      price: p.price + 1000,
      name: bi("Changed", "تغيير"),
    });
    expect(r.getSnapshot().bookings[0].price).toBe(p.price);
    expect(r.getSnapshot().bookings[0].packageName.en).toBe(p.name.en);
    r.status("bookings", id, "cancelled");
    expect(remaining(r.getSnapshot(), slot)).toBe(1);
  });
  it("requires and stores an address for a Home Grooming booking", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "grooming")!;
    r.hold(slot.id, "home-hold");
    expect(() =>
      r.book({
        key: "missing-home-address",
        holdId: "home-hold",
        packageId: "kitty-basic",
        slotId: slot.id,
        guest,
        petName: "Milo",
        petNotes: "",
        location: "home",
        address: "",
        outcome: "success",
      }),
    ).toThrow();
    r.book({
      key: "home-address",
      holdId: "home-hold",
      packageId: "kitty-basic",
      slotId: slot.id,
      guest,
      petName: "Milo",
      petNotes: "",
      location: "home",
      address: "Demo home address · Doha",
      outcome: "success",
    });
    expect(r.getSnapshot().bookings[0]).toMatchObject({
      location: "home",
      address: "Demo home address · Doha",
    });
  });
  it("failed payment releases the grooming hold without booking", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "grooming")!;
    r.hold(slot.id, "hold");
    expect(() =>
      r.book({
        key: "fail",
        holdId: "hold",
        packageId: "kitty-basic",
        slotId: slot.id,
        guest,
        petName: "Milo",
        petNotes: "",
        outcome: "failed",
      }),
    ).toThrow();
    expect(r.getSnapshot().holds).toHaveLength(0);
    expect(r.getSnapshot().bookings).toHaveLength(0);
  });
  it("rejects expired holds and pending-payment status progression", () => {
    const r = createMockRepository(emptyBusiness()),
      slot = r.getSnapshot().slots.find((s) => s.kind === "grooming")!;
    r.hold(slot.id, "hold");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(() =>
      r.book({
        key: "late",
        holdId: "hold",
        packageId: "kitty-basic",
        slotId: slot.id,
        guest,
        petName: "Milo",
        petNotes: "",
        outcome: "success",
      }),
    ).toThrow();
    const id = r.checkout({ ...orderInput(), outcome: "pending" });
    expect(() => r.status("orders", id, "processing")).toThrow();
  });
  it("rejects duplicate SKUs and preserves historical orders when archiving", () => {
    const r = createMockRepository(emptyBusiness()),
      p = structuredClone(r.getSnapshot().products[0]);
    p.variants[0].sku = r.getSnapshot().products[1].variants[0].sku;
    expect(() => r.saveProduct(p)).toThrow();
    const id = r.checkout(orderInput());
    r.archiveProduct("cat-food");
    expect(r.getSnapshot().orders[0].id).toBe(id);
    expect(() => r.checkout(orderInput("new"))).toThrow();
  });
  it("rejects overlapping, duplicate, past or booked-slot closures", () => {
    const r = createMockRepository(emptyBusiness()),
      s = r.getSnapshot().slots.find((s) => s.kind === "grooming")!;
    expect(() => r.saveSlot({ ...s, id: "overlap", time: "10:00" })).toThrow();
    expect(() => r.saveSlot({ ...s, id: "duplicate" })).toThrow();
    r.hold(s.id, "hold");
    expect(() => r.saveSlot({ ...s, active: false })).toThrow();
    expect(isFutureSlot({ ...s, date: "2020-01-01" })).toBe(false);
    expect(isFutureSlot({ ...s, time: "25:00" })).toBe(false);
    expect(isFutureSlot({ ...s, date: "2027-02-30" })).toBe(false);
    const future = { ...s, id: "later", time: "19:00" } as Slot;
    r.saveSlot(future);
    expect(r.getSnapshot().slots.some((x) => x.id === "later")).toBe(true);
  });
  it("validates links and neutralises spreadsheet formulas", () => {
    expect(safeUrl("javascript:alert(1)")).toBe(false);
    expect(safeUrl("https://example.com")).toBe(true);
    expect(safeUrl("https://user:pass@example.com")).toBe(false);
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("exports only the supplied financial rows with safe QAR values", () => {
    const csv = financeCsv([
      {
        id: "=INJECT",
        date: "2026-09-29T10:00:00.000Z",
        source: "Shop",
        payment: "paid",
        amount: 12345,
      },
    ]);
    expect(csv).toBe(
      '\ufeff"Reference","Date (UTC)","Source","Payment","Amount (QAR)"\r\n"\'=INJECT","2026-09-29T10:00:00.000Z","Shop","paid","123.45"',
    );
    expect(csv).not.toContain("Customer");
  });
});
