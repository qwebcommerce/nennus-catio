"use client";

import {
  type AdminRelocation,
  type AdminRelocationSort,
  type AskRelocationDocument,
  adminRelocationListResponseSchema,
  adminRelocationSchema,
  type IssueRelocationQuote,
  type RecordRelocationPaidOutside,
  type RecordRelocationRefundOutside,
  type RelocationSettings,
  relocationSettingsSchema,
  type ReviewRelocationDocument,
  type SaveRelocationDestination,
  type SaveRelocationDocumentType,
  type UpdateRelocationSettings,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff relocation requests (15d) over `/api/admin/relocation` (15b): the list with its cards, one
 * request with every staff change, and the owner's settings. Every step, the quote, a review, an ask and
 * the money outside the website send the request's `version`; the API refuses a change made on an
 * out-of-date copy, and the panel then reads the request again. API mode only.
 */
export const adminRelocationKey = ["admin", "relocation"] as const;
const listKey = [...adminRelocationKey, "list"] as const;
export const adminRelocationDetailKey = (reference: string) => [...adminRelocationKey, "detail", reference] as const;
export const relocationSettingsKey = [...adminRelocationKey, "settings"] as const;

/** The filters on the page. `status` is "" (all), "open" (not completed or cancelled) or one status. */
export interface AdminRelocationFilters {
  q: string;
  status: string;
  needsAction: boolean;
  from: string;
  to: string;
  sort: AdminRelocationSort;
  page: number;
  pageSize: number;
}

const OPEN_STATUSES = ["submitted", "documents_requested", "documents_received", "under_review", "quote_requested", "paid", "in_progress"];

export function emptyAdminRelocationFilters(q = "", status = "", needsAction = false): AdminRelocationFilters {
  return { q, status, needsAction, from: "", to: "", sort: "newest", page: 1, pageSize: 25 };
}

/** The query string for the list and the downloads (the downloads ignore pages). */
export function adminRelocationSearch(filters: AdminRelocationFilters, { paged = true } = {}): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.status) params.set("status", filters.status === "open" ? OPEN_STATUSES.join(",") : filters.status);
  if (filters.needsAction) params.set("needsAction", "1");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  if (paged) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }
  return params.toString();
}

export function useAdminRelocationList(search: string, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...listKey, search],
    queryFn: ({ signal }) => api.get(`/admin/relocation?${search}`, adminRelocationListResponseSchema, { signal }),
    // Keep the old page on screen while the next one loads, so the table does not jump.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

export function useAdminRelocation(reference: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: adminRelocationDetailKey(reference ?? ""),
    queryFn: ({ signal }) => api.get(`/admin/relocation/${encodeURIComponent(reference ?? "")}`, adminRelocationSchema, { signal }),
    enabled: reference !== null,
  });
}

/** A staff member opens a file: always a download, audited each time (plan section 4.3). */
export function staffRelocationFileHref(reference: string, documentId: string): string {
  return `/api/admin/relocation/${encodeURIComponent(reference)}/files/${encodeURIComponent(documentId)}`;
}

type Change = { method: "post" | "delete"; path: string; body?: unknown };

/**
 * One change answering with the request: it replaces the panel's copy; the lists and every other admin
 * screen (cards, the bell, the customer record) are read again. A refused change reads the request again.
 */
function useRelocationChange<Input extends { request: AdminRelocation }>(send: (input: Input) => Change) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => {
      const { method, path, body } = send(input);
      const full = `/admin/relocation/${encodeURIComponent(input.request.reference)}/${path}`;
      return method === "delete" ? api.delete(full, adminRelocationSchema) : api.post(full, body ?? {}, adminRelocationSchema);
    },
    onSuccess: (request) => queryClient.setQueryData(adminRelocationDetailKey(request.reference), request),
    onError: (_error, { request }) => queryClient.invalidateQueries({ queryKey: adminRelocationDetailKey(request.reference) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

/** Start review, Start the relocation or Mark completed (plan section 4.2). */
export function useRelocationStep() {
  return useRelocationChange(({ request, step }: { request: AdminRelocation; step: "start-review" | "start" | "complete" }) => ({
    method: "post",
    path: step,
    body: { version: request.version },
  }));
}

export function useIssueRelocationQuote() {
  return useRelocationChange(({ request, amount, note }: { request: AdminRelocation } & Omit<IssueRelocationQuote, "version">) => ({
    method: "post",
    path: "issue-quote",
    body: { version: request.version, amount, note },
  }));
}

export function useWithdrawRelocationQuote() {
  return useRelocationChange(({ request, reason }: { request: AdminRelocation; reason: string }) => ({
    method: "post",
    path: "withdraw-quote",
    body: reason ? { version: request.version, reason } : { version: request.version },
  }));
}

export function useStaffCancelRelocation() {
  return useRelocationChange(({ request, reason }: { request: AdminRelocation; reason: string }) => ({
    method: "post",
    path: "cancel",
    body: { version: request.version, reason },
  }));
}

export function useReviewRelocationDocument() {
  return useRelocationChange(
    ({ request, slotId, outcome, reason }: { request: AdminRelocation; slotId: string } & Omit<ReviewRelocationDocument, "version">) => ({
      method: "post",
      path: `documents/${encodeURIComponent(slotId)}/review`,
      body: reason ? { version: request.version, outcome, reason } : { version: request.version, outcome },
    }),
  );
}

export function useAskRelocationDocument() {
  return useRelocationChange(({ request, ...ask }: { request: AdminRelocation } & Omit<AskRelocationDocument, "version">) => ({
    method: "post",
    path: "documents",
    body: { version: request.version, ...ask },
  }));
}

export function useDeleteRelocationFile() {
  return useRelocationChange(({ documentId }: { request: AdminRelocation; documentId: string }) => ({
    method: "delete",
    path: `files/${encodeURIComponent(documentId)}`,
  }));
}

export function useAddRelocationUpdate() {
  return useRelocationChange(({ text }: { request: AdminRelocation; text: string }) => ({ method: "post", path: "updates", body: { text } }));
}

export function useDeleteRelocationUpdate() {
  return useRelocationChange(({ updateId }: { request: AdminRelocation; updateId: string }) => ({
    method: "delete",
    path: `updates/${encodeURIComponent(updateId)}`,
  }));
}

export function useAddRelocationNote() {
  return useRelocationChange(({ text }: { request: AdminRelocation; text: string }) => ({ method: "post", path: "notes", body: { text } }));
}

export function useDeleteRelocationNote() {
  return useRelocationChange(({ noteId }: { request: AdminRelocation; noteId: string }) => ({
    method: "delete",
    path: `notes/${encodeURIComponent(noteId)}`,
  }));
}

export function useRecordRelocationPaidOutside() {
  return useRelocationChange(({ request, ...record }: { request: AdminRelocation } & Omit<RecordRelocationPaidOutside, "version">) => ({
    method: "post",
    path: "paid-outside",
    body: { version: request.version, ...record },
  }));
}

export function useRecordRelocationRefundOutside() {
  return useRelocationChange(({ request, ...record }: { request: AdminRelocation } & Omit<RecordRelocationRefundOutside, "version">) => ({
    method: "post",
    path: "refund-outside",
    body: { version: request.version, ...record },
  }));
}

// --- The owner's settings (plan section 4.7) -----------------------------------------------------------

export function useRelocationSettings(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: relocationSettingsKey,
    queryFn: ({ signal }) => api.get("/admin/relocation/settings", relocationSettingsSchema, { signal }),
    enabled,
    staleTime: 0,
  });
}

type SettingsChange =
  | { kind: "settings"; body: UpdateRelocationSettings }
  | { kind: "type"; id: string | null; body: SaveRelocationDocumentType & { version?: number } }
  | { kind: "deleteType"; id: string }
  | { kind: "destination"; id: string | null; body: SaveRelocationDestination & { version?: number } }
  | { kind: "deleteDestination"; id: string };

/** Every settings change answers with the whole settings; the form's choices are read again after it. */
export function useChangeRelocationSettings() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: SettingsChange): Promise<RelocationSettings> => {
      const base = "/admin/relocation/settings";
      switch (change.kind) {
        case "settings":
          return api.put(base, change.body, relocationSettingsSchema);
        case "type":
          return change.id
            ? api.put(`${base}/document-types/${encodeURIComponent(change.id)}`, change.body, relocationSettingsSchema)
            : api.post(`${base}/document-types`, change.body, relocationSettingsSchema);
        case "deleteType":
          return api.delete(`${base}/document-types/${encodeURIComponent(change.id)}`, relocationSettingsSchema);
        case "destination":
          return change.id
            ? api.put(`${base}/destinations/${encodeURIComponent(change.id)}`, change.body, relocationSettingsSchema)
            : api.post(`${base}/destinations`, change.body, relocationSettingsSchema);
        case "deleteDestination":
          return api.delete(`${base}/destinations/${encodeURIComponent(change.id)}`, relocationSettingsSchema);
      }
    },
    onSuccess: (settings) => queryClient.setQueryData(relocationSettingsKey, settings),
    onError: () => queryClient.invalidateQueries({ queryKey: relocationSettingsKey }),
  });
}

/** One readable line for a failed relocation action. */
export function describeAdminRelocationError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "CONFLICT":
      // The API's own words say why (a payment page open, the request over, or someone else's change).
      if (/payment page/i.test(error.message)) {
        return text(
          "The customer has a payment page open. The payment company closes it within about an hour: try again then, or cancel the request.",
          "لدى العميل صفحة دفع مفتوحة. تغلقها شركة الدفع خلال ساعة تقريباً: حاول مرة أخرى حينها، أو ألغِ الطلب.",
        );
      }
      if (/changed|reload|someone else/i.test(error.message)) {
        return text(
          "Someone else changed this request a moment ago. It has been reloaded: please check it and try again.",
          "غيّر شخص آخر هذا الطلب للتو. تمت إعادة تحميله: راجعه ثم حاول مرة أخرى.",
        );
      }
      return [error.message, ...Object.values(error.fields)].join(" · ");
    case "STATUS_CHANGE_NOT_ALLOWED":
      // The API says exactly why in English; Arabic gets the general reason.
      return text(error.message, "هذه الخطوة غير ممكنة في حالة الطلب الآن. تمت إعادة تحميله.");
    case "FORBIDDEN":
      return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This relocation request could not be found.", "تعذّر العثور على طلب النقل هذا.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
