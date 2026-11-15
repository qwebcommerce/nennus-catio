import { describe, expect, it } from "vitest";
import {
  createFoundationRepository,
  PreviewUnavailableError,
} from "@/mocks/adapters/foundation-repository";

describe("typed synthetic repository", () => {
  it("provides QAR/Qatar content with disabled unapproved socials", async () => {
    const content = await createFoundationRepository().getSiteContent();
    expect(content.currency).toBe("QAR");
    expect(content.timeZone).toBe("Asia/Qatar");
    expect(content.socialLinks).toEqual({
      instagram: null,
      facebook: null,
      whatsapp: null,
    });
  });
  it("keeps the four-step Shop flow bilingual", async () => {
    const area = await createFoundationRepository().getArea("shop");
    expect(area.steps).toHaveLength(4);
    expect(area.steps.every((step) => step.en && step.ar)).toBe(true);
  });
  it("does not expose mutable shared fixtures", async () => {
    const first = await createFoundationRepository().getArea("shop");
    (first.steps as { en: string; ar: string }[])[0].en = "Changed";
    expect(
      (await createFoundationRepository().getArea("shop")).steps[0].en,
    ).toBe("Category");
  });
  it("has deliberate empty and unavailable scenarios", async () => {
    expect(
      (await createFoundationRepository("empty").getArea("shop")).steps,
    ).toEqual([]);
    await expect(
      createFoundationRepository("unavailable").getArea("shop"),
    ).rejects.toBeInstanceOf(PreviewUnavailableError);
  });
  it("honours a cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createFoundationRepository().getArea("shop", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
