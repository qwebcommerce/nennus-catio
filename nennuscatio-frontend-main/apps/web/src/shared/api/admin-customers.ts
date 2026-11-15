"use client";

import {
  type AdminCrmTag,
  type AdminCustomer,
  type AdminCustomerSort,
  adminCrmTagListResponseSchema,
  adminCrmTagSchema,
  adminCustomerListResponseSchema,
  adminCustomerNoteSchema,
  adminCustomerSchema,
  CRM_LIMITS,
  customerTagsResponseSchema,
  okResponseSchema,
  type SaveCrmTagRequest,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Staff customer records (10d) over `/api/admin/customers` and the owner's tag list over
 * `/api/admin/customer-tags` (10c). API mode only; mock mode keeps the demo Customers page. Every change
 * reads the admin data again afterwards (lists, the record, the tag list and the header search).
 */
export const adminCustomersKey = ["admin", "customers"] as const;
const listKey = [...adminCustomersKey, "list"] as const;
export const adminCustomerDetailKey = (id: string) => [...adminCustomersKey, "detail", id] as const;
const tagListKey = ["admin", "customer-tags"] as const;

/** The filters on the page. "" means "any". */
export interface AdminCustomerFilters {
  q: string;
  kind: "" | "account" | "guest";
  tag: string;
  has: "" | "orders" | "bookings";
  from: string;
  to: string;
  sort: AdminCustomerSort;
  page: number;
  pageSize: number;
}

export function emptyAdminCustomerFilters(q = ""): AdminCustomerFilters {
  return { q, kind: "", tag: "", has: "", from: "", to: "", sort: "activity", page: 1, pageSize: 25 };
}

/** The query string for the list and the CSV export (the export ignores pages). */
export function adminCustomerSearch(filters: AdminCustomerFilters, { paged = true } = {}): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.has) params.set("has", filters.has);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  if (paged) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }
  return params.toString();
}

export function useAdminCustomers(search: string, options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...listKey, search],
    queryFn: ({ signal }) => api.get(`/admin/customers?${search}`, adminCustomerListResponseSchema, { signal }),
    // Keep the old page on screen while the next one loads, so the table does not jump.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useAdminCustomer(id: string | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: adminCustomerDetailKey(id ?? ""),
    queryFn: ({ signal }) => api.get(`/admin/customers/${encodeURIComponent(id ?? "")}`, adminCustomerSchema, { signal }),
    enabled: id !== null,
  });
}

/** The owner's tag list, for the filter, the tag editor and Manage tags. */
export function useCrmTags(options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: tagListKey,
    queryFn: ({ signal }) => api.get("/admin/customer-tags", adminCrmTagListResponseSchema, { signal }),
    enabled: options.enabled ?? true,
  });
}

/** A change that, once settled, reads the admin data again (and the record at once if it failed). */
function useCustomerChange<Input, Output>(send: (input: Input) => Promise<Output>, recordOf?: (input: Input) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onError: (_error, input) => {
      const id = recordOf?.(input);
      if (id) void queryClient.invalidateQueries({ queryKey: adminCustomerDetailKey(id) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useAddCustomerNote() {
  const { api } = useRepositories();
  return useCustomerChange(({ id, text }: { id: string; text: string }) =>
    api.post(`/admin/customers/${encodeURIComponent(id)}/notes`, { text }, adminCustomerNoteSchema),
  );
}

export function useDeleteCustomerNote() {
  const { api } = useRepositories();
  return useCustomerChange(({ id, noteId }: { id: string; noteId: string }) =>
    api.delete(`/admin/customers/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, okResponseSchema),
  );
}

/** Replaces the customer's tags; refused if someone else changed them since `customer` was read. */
export function useSetCustomerTags() {
  const { api } = useRepositories();
  return useCustomerChange(
    ({ customer, tagIds }: { customer: AdminCustomer; tagIds: string[] }) =>
      api.put(`/admin/customers/${encodeURIComponent(customer.id)}/tags`, { version: customer.version, tagIds }, customerTagsResponseSchema),
    ({ customer }) => customer.id,
  );
}

/** Adds a tag to the list, or saves one (with the version it was read at). */
export function useSaveCrmTag() {
  const { api } = useRepositories();
  return useCustomerChange(({ tag, body }: { tag: AdminCrmTag | null; body: SaveCrmTagRequest }) =>
    tag
      ? api.put(`/admin/customer-tags/${encodeURIComponent(tag.id)}`, { ...body, version: tag.version }, adminCrmTagSchema)
      : api.post("/admin/customer-tags", body, adminCrmTagSchema),
  );
}

export function useDeleteCrmTag() {
  const { api } = useRepositories();
  return useCustomerChange(({ tag }: { tag: AdminCrmTag }) => api.delete(`/admin/customer-tags/${encodeURIComponent(tag.id)}`, okResponseSchema));
}

/** One readable line for a failed customer or tag action. */
export function describeAdminCustomerError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "CONFLICT":
      return error.fields["name.en"] || error.fields["name.ar"]
        ? text("Another tag already has this name.", "يوجد وسم آخر بهذا الاسم.")
        : text(
            "Someone else changed this a moment ago. It has been reloaded: please check it and try again.",
            "غيّر شخص آخر هذا للتو. تمت إعادة تحميله: راجعه ثم حاول مرة أخرى.",
          );
    case "LIMIT_REACHED":
      return text(
        `The tag list is full (${CRM_LIMITS.maxTags} tags). Delete one to add another.`,
        `قائمة الوسوم ممتلئة (${CRM_LIMITS.maxTags} وسماً). احذف واحداً لإضافة آخر.`,
      );
    case "VALIDATION_FAILED":
      if (error.fields.tagIds)
        return text(
          "A tag was deleted from the list meanwhile. The tags have been reloaded: please choose again.",
          "حُذف وسم من القائمة في الأثناء. أُعيد تحميل الوسوم: يرجى الاختيار مرة أخرى.",
        );
      return [error.message, ...Object.values(error.fields)].join(" · ");
    case "FORBIDDEN":
      return text("Your role cannot make this change.", "لا يسمح دورك بهذا التغيير.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This could not be found. It may have been deleted.", "تعذّر العثور على هذا. ربما حُذف.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
