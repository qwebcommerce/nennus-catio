import { describe, expect, it } from "vitest";
import { canPreviewModule } from "@/shared/lib/access";
import { adminNavigation } from "@/layouts/admin/navigation";

describe("demo navigation capabilities (not server security)", () => {
  it("restricts Finance to Finance", () => {
    expect(
      adminNavigation
        .filter((item) => canPreviewModule("finance", item.id))
        .map((item) => item.id),
    ).toEqual(["finance"]);
  });
  it("reserves Team & Access for Owner", () => {
    expect(canPreviewModule("core", "team")).toBe(false);
    expect(canPreviewModule("finance", "team")).toBe(false);
    expect(canPreviewModule("owner", "team")).toBe(true);
  });
  it("lets Core access operations without owner capabilities", () => {
    expect(canPreviewModule("core", "products")).toBe(true);
    expect(canPreviewModule("core", "groomingCalendar")).toBe(true);
  });
});
