import { describe, expect, it } from "vitest";
import { resolveDataSource } from "@/shared/api/data-source";

describe("data source selection", () => {
  it("defaults to the API when nothing is set", () => {
    expect(resolveDataSource(undefined, "development")).toBe("api");
    expect(resolveDataSource("", "production")).toBe("api");
    expect(resolveDataSource("api", "production")).toBe("api");
  });

  it("allows the mock only outside production builds", () => {
    expect(resolveDataSource("mock", "development")).toBe("mock");
    expect(resolveDataSource("mock", "test")).toBe("mock");
    expect(() => resolveDataSource("mock", "production")).toThrow(/development-only/);
  });

  it("rejects unknown values instead of silently falling back", () => {
    expect(() => resolveDataSource("live", "development")).toThrow(/NEXT_PUBLIC_DATA_SOURCE/);
    expect(() => resolveDataSource("Mock", "development")).toThrow(/NEXT_PUBLIC_DATA_SOURCE/);
  });
});
