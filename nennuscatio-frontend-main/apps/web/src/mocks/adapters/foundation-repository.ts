import type { FoundationRepository } from "@nennus-catio/contracts";
import { foundationAreas, siteContent } from "../data/foundation";

export type PreviewScenario = "normal" | "empty" | "unavailable";
export class PreviewUnavailableError extends Error {
  readonly code = "UNAVAILABLE";
  constructor() {
    super("Synthetic preview unavailable");
  }
}
export function createFoundationRepository(
  scenario: PreviewScenario = "normal",
): FoundationRepository {
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (scenario === "unavailable") throw new PreviewUnavailableError();
  };
  return {
    async getSiteContent(signal) {
      check(signal);
      return structuredClone(siteContent);
    },
    async getArea(id, signal) {
      check(signal);
      const area = structuredClone(foundationAreas[id]);
      return scenario === "empty" ? { ...area, steps: [] } : area;
    },
  };
}
