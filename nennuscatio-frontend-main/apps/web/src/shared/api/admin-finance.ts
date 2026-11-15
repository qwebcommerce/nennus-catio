"use client";

import {
  financeDetailSchema,
  type FinanceGrouping,
  financeOverviewSchema,
  financePaymentListSchema,
  financeRefundListSchema,
  financeTransactionListSchema,
  type FinanceType,
  type PayableKind,
  type PaymentProvider,
  type RefundMethod,
} from "@nennus-catio/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Finance (#12 part 1, D222-D223) over `/api/admin/finance`. API mode only; mock mode keeps the demo
 * Finance page. Read-only: the page never changes money; refunds stay on the order or booking.
 */
export const adminFinanceKey = ["admin", "finance"] as const;

export type FinanceTab = "transactions" | "payments" | "refunds";

/** The list filters on the page; `min`/`max` are what staff typed in QAR. */
export interface FinanceListFilters {
  q: string;
  type: "" | FinanceType;
  /** A transaction status (Transactions) or a refund group (Refunds). */
  status: string;
  provider: "" | PaymentProvider;
  method: "" | RefundMethod;
  min: string;
  max: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export function emptyFinanceFilters(): FinanceListFilters {
  return { q: "", type: "", status: "", provider: "", method: "", min: "", max: "", sort: "date", order: "desc", page: 1, pageSize: 25 };
}

/** QAR typed by staff in dirhams (QAR 0.01), or undefined when empty or not a number. */
export function qarToMinor(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined;
}

export function financeOverviewSearch(from: string, to: string, grouping: FinanceGrouping): string {
  return new URLSearchParams({ from, to, grouping }).toString();
}

/** The query string of a list and of its CSV (the CSV ignores pages). Only the tab's own filters are sent. */
export function financeListSearch(
  tab: FinanceTab,
  period: { from: string; to: string },
  filters: FinanceListFilters,
  { paged = true } = {},
): string {
  const params = new URLSearchParams({ from: period.from, to: period.to });
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.type) params.set("type", filters.type);
  if (filters.status && tab !== "payments") params.set("status", filters.status);
  if (filters.provider && tab === "payments") params.set("provider", filters.provider);
  if (filters.method && tab === "refunds") params.set("method", filters.method);
  const min = qarToMinor(filters.min);
  const max = qarToMinor(filters.max);
  if (min !== undefined) params.set("min", String(min));
  if (max !== undefined) params.set("max", String(max));
  params.set("sort", filters.sort);
  params.set("order", filters.order);
  if (paged) {
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
  }
  return params.toString();
}

export function useFinanceOverview(search: string, options: { enabled?: boolean } = {}) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminFinanceKey, "overview", search],
    queryFn: ({ signal }) => api.get(`/admin/finance/overview?${search}`, financeOverviewSchema, { signal }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useFinanceTransactions(search: string, enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminFinanceKey, "transactions", search],
    queryFn: ({ signal }) => api.get(`/admin/finance/transactions?${search}`, financeTransactionListSchema, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFinancePayments(search: string, enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminFinanceKey, "payments", search],
    queryFn: ({ signal }) => api.get(`/admin/finance/payments?${search}`, financePaymentListSchema, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFinanceRefunds(search: string, enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminFinanceKey, "refunds", search],
    queryFn: ({ signal }) => api.get(`/admin/finance/refunds?${search}`, financeRefundListSchema, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFinanceDetail(selected: { kind: PayableKind; reference: string } | null) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...adminFinanceKey, "detail", selected?.kind ?? "", selected?.reference ?? ""],
    queryFn: ({ signal }) =>
      api.get(
        `/admin/finance/transactions/${selected?.kind ?? "order"}/${encodeURIComponent(selected?.reference ?? "")}`,
        financeDetailSchema,
        { signal },
      ),
    enabled: selected !== null,
  });
}

/** One readable line for a failed finance request. */
export function describeFinanceError(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "FORBIDDEN":
      return text("Your role cannot see this.", "لا يسمح دورك بعرض هذا.");
    case "NETWORK":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    case "NOT_FOUND":
      return text("This transaction could not be found.", "تعذّر العثور على هذه المعاملة.");
    case "VALIDATION_FAILED":
      return text("Please check the dates and amounts.", "يرجى التحقق من التواريخ والمبالغ.");
    default:
      return [error.message, ...Object.values(error.fields)].join(" · ");
  }
}
