"use client";
import { useSyncExternalStore } from "react";
import {
  seedPromotions,
  type Promotion,
  type PromotionDraft,
} from "../data/promotions";

let records = seedPromotions();
const initial = records;
const listeners = new Set<() => void>();
function publish(next: Promotion[]) {
  records = next;
  for (const listener of listeners) listener();
}
export const mockPromotionsRepository = {
  getSnapshot: () => records,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  save: (draft: PromotionDraft, id?: string) => {
    const name = { en: draft.name.en.trim(), ar: draft.name.ar.trim() };
    const code = draft.type === "code" ? draft.code.trim().toUpperCase() : "";
    const validDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    if (!name.en || !name.ar || name.en.length > 100 || name.ar.length > 100)
      return { error: "name" } as const;
    if (
      !validDate(draft.from) ||
      (draft.to && (!validDate(draft.to) || draft.to < draft.from))
    )
      return { error: "dates" } as const;
    if (
      !Number.isFinite(draft.value) ||
      draft.value <= 0 ||
      (draft.offer === "percent"
        ? draft.value > 100
        : !Number.isSafeInteger(draft.value))
    )
      return { error: "offer" } as const;
    if (
      draft.type === "code" &&
      (!/^[A-Z0-9_-]{3,32}$/.test(code) ||
        records.some((p) => p.id !== id && p.code.toUpperCase() === code))
    )
      return { error: "code" } as const;
    if (
      !Number.isSafeInteger(draft.minimumSpend) ||
      draft.minimumSpend < 0 ||
      !Number.isSafeInteger(draft.limit) ||
      draft.limit < 0 ||
      !Number.isSafeInteger(draft.perCustomer) ||
      draft.perCustomer < 0
    )
      return { error: "limits" } as const;
    if (
      (draft.target === "selected-products" || draft.type === "bundle") &&
      draft.productIds.length < (draft.type === "bundle" ? 2 : 1)
    )
      return { error: "products" } as const;
    const existing = records.find((p) => p.id === id);
    if (id && !existing) return { error: "missing" } as const;
    if (draft.limit && existing && draft.limit < existing.redemptions.length)
      return { error: "limits" } as const;
    const promotion: Promotion = {
      ...draft,
      name,
      code,
      id: id ?? `PR-${crypto.randomUUID()}`,
      redemptions: existing?.redemptions ?? [],
    };
    publish(
      existing
        ? records.map((p) => (p.id === id ? promotion : p))
        : [promotion, ...records],
    );
    return { promotion } as const;
  },
  update: (
    id: string,
    change: Partial<Pick<Promotion, "enabled" | "visible" | "featured">>,
  ) => publish(records.map((p) => (p.id === id ? { ...p, ...change } : p))),
  reset: () => publish(seedPromotions()),
};
export function usePromotions() {
  return useSyncExternalStore(
    mockPromotionsRepository.subscribe,
    mockPromotionsRepository.getSnapshot,
    () => initial,
  );
}
