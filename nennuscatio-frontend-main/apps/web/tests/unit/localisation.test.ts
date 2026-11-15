import { describe, expect, it } from "vitest";
import en from "@/messages/en/common.json";
import ar from "@/messages/ar/common.json";
import { formatMoney, formatQatarDate } from "@/shared/lib/format";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || !value) return [prefix];
  return Object.entries(value).flatMap(([key, next]) =>
    keys(next, `${prefix}.${key}`),
  );
}
describe("locale and exact-money boundary", () => {
  it("has identical English/Arabic message coverage", () =>
    expect(keys(ar).sort()).toEqual(keys(en).sort()));
  it("formats QAR from minor units", () =>
    expect(formatMoney(12345, "en")).toMatch(/123\.45/));
  it("rejects fractional/negative minor units", () => {
    expect(() => formatMoney(1.5, "en")).toThrow(RangeError);
    expect(() => formatMoney(-10, "en")).toThrow(RangeError);
  });
  it("formats a UTC date in Qatar's business timezone", () =>
    expect(formatQatarDate("2026-09-26T22:00:00Z", "en")).toMatch(/27/));
});
