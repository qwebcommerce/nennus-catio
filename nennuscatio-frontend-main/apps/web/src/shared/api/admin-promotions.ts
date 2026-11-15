"use client";

import {
  type AdminPromotion,
  adminPromotionDetailSchema,
  adminPromotionsResponseSchema,
  okResponseSchema,
  promotionOptionsSchema,
  type SavePromotionRequest,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadImage } from "./admin-catalog";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff promotions (11d) over `/api/admin/promotions` (11a): the list with the cards' counts, one
 * promotion with its uses, the editor's choices, and the changes. API mode only; mock mode keeps the demo
 * Promotions page. Every change reads the promotions again afterwards.
 */
export const adminPromotionsKey = ["admin", "promotions"] as const;
const listKey = [...adminPromotionsKey, "list"] as const;
const optionsKey = [...adminPromotionsKey, "options"] as const;
export const adminPromotionDetailKey = (id: string) => [...adminPromotionsKey, "detail", id] as const;

/** Every promotion (the list stays small), with today's Qatar date and the cards' counts. */
export function useAdminPromotions() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => api.get("/admin/promotions", adminPromotionsResponseSchema, { signal }),
  });
}

/** One promotion with its newest 100 uses. */
export function useAdminPromotion(id: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: adminPromotionDetailKey(id ?? ""),
    queryFn: ({ signal }) => api.get(`/admin/promotions/${encodeURIComponent(id ?? "")}`, adminPromotionDetailSchema, { signal }),
    enabled: id !== null,
  });
}

/** What a promotion can be for: categories, products with packs, grooming packages (Promotions View). */
export function usePromotionOptions(options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: optionsKey,
    queryFn: ({ signal }) => api.get("/admin/promotions/options", promotionOptionsSchema, { signal }),
    enabled: options.enabled ?? true,
  });
}

/** A change that, once settled, reads the promotions again. */
function usePromotionChange<Input, Output>(send: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminPromotionsKey }),
  });
}

/** Creates a promotion, or saves one with the version the editor started from. */
export function useSavePromotion() {
  const { api } = useRepositories();
  return usePromotionChange(({ promotion, body }: { promotion: AdminPromotion | null; body: SavePromotionRequest }) =>
    promotion
      ? api.put(`/admin/promotions/${encodeURIComponent(promotion.id)}`, { ...body, version: promotion.version }, adminPromotionDetailSchema)
      : api.post("/admin/promotions", body, adminPromotionDetailSchema),
  );
}

/** Switches a promotion on or off (switching off asks first on screen, D128). */
export function useSetPromotionEnabled() {
  const { api } = useRepositories();
  return usePromotionChange(({ promotion, enabled }: { promotion: AdminPromotion; enabled: boolean }) =>
    api.put(`/admin/promotions/${encodeURIComponent(promotion.id)}/enabled`, { enabled, version: promotion.version }, adminPromotionDetailSchema),
  );
}

/**
 * Deletes a promotion that no order or booking ever got (asks first on screen, D128). Only the list is
 * read again: the deleted promotion's own details would answer "not found" while its panel closes.
 */
export function useDeletePromotion() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promotion }: { promotion: AdminPromotion }) => api.delete(`/admin/promotions/${encodeURIComponent(promotion.id)}`, okResponseSchema),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
  });
}

/** Uploads a promotion image under the Promotions permission (the API checks and re-encodes it). */
export function uploadPromotionImage(file: File): Promise<string> {
  return uploadImage(file, "/api/admin/promotions/media");
}

/** The editor's field names for the API's paths, so each refusal shows next to its field. */
export function promotionFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

/** One readable line for a failed promotion action. */
export function describeAdminPromotionError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "CONFLICT":
      // A stale save, or a delete of a promotion an order or booking got (the message says which).
      return error.message.startsWith("Someone else")
        ? text(
            "Someone else changed this promotion a moment ago. It has been reloaded: please check it and try again.",
            "غيّر شخص آخر هذا العرض للتو. تمت إعادة تحميله: راجعه ثم حاول مرة أخرى.",
          )
        : error.message;
    case "VALIDATION_FAILED":
      return text("Please check the highlighted fields.", "يرجى مراجعة الحقول المحددة.");
    case "FORBIDDEN":
      return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This promotion could not be found. It may have been deleted.", "تعذّر العثور على هذا العرض. ربما حُذف.");
    default:
      return error.message;
  }
}
