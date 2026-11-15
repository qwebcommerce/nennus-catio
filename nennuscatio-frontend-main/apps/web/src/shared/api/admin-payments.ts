"use client";

import {
  type AdminOrder,
  type AdminOrderPayments,
  adminBookingPaymentsSchema,
  adminOrderPaymentsSchema,
  adminOrderSchema,
  adminRelocationPaymentsSchema,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminBookingsKey } from "./admin-bookings";
import { adminOrderDetailKey, adminOrdersKey } from "./admin-orders";
import { adminRelocationKey } from "./admin-relocation";
import type { ApiClient } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { deliveryWindowsKey } from "./orders";

/**
 * An order's, a booking's or a relocation request's money for staff (8b; bookings 9f; relocation 15d)
 * over `/api/admin/orders/:reference/...`, `/api/admin/bookings/:reference/...` and
 * `/api/admin/relocation/:reference/...` (8a-4, 9d, 15b): the payment panel, refunds (by API or recorded
 * for the dashboard), completing or withdrawing a manual refund, releasing an unanswered API refund
 * (8c), closing a wrong-amount payment, and the orders' "Confirm with a new delivery time". Every
 * screen asks first (D128).
 */

/** What is being paid for: an order, a grooming booking or a relocation quote. */
export interface Payable {
  readonly kind: "order" | "booking" | "relocation";
  readonly reference: string;
}

/** The panel without its reference field, the same for orders, bookings and relocation requests. */
export type PaymentPanel = Omit<AdminOrderPayments, "orderReference">;

const listKeyOf = (kind: Payable["kind"]) => (kind === "order" ? adminOrdersKey : kind === "booking" ? adminBookingsKey : adminRelocationKey);
export const paymentsKey = (payable: Payable) => [...listKeyOf(payable.kind), "payments", payable.reference] as const;
export const orderPaymentsKey = (reference: string) => paymentsKey({ kind: "order", reference });
const PAYABLE_PATH: Readonly<Record<Payable["kind"], string>> = { order: "orders", booking: "bookings", relocation: "relocation" };
const payablePath = (payable: Payable) => `/admin/${PAYABLE_PATH[payable.kind]}/${encodeURIComponent(payable.reference)}`;

async function readPanel(api: ApiClient, payable: Payable, path: string, body?: unknown, signal?: AbortSignal): Promise<PaymentPanel> {
  const full = `${payablePath(payable)}${path}`;
  if (payable.kind === "order") {
    return body === undefined ? api.get(full, adminOrderPaymentsSchema, { signal }) : api.post(full, body, adminOrderPaymentsSchema);
  }
  if (payable.kind === "booking") {
    return body === undefined ? api.get(full, adminBookingPaymentsSchema, { signal }) : api.post(full, body, adminBookingPaymentsSchema);
  }
  return body === undefined ? api.get(full, adminRelocationPaymentsSchema, { signal }) : api.post(full, body, adminRelocationPaymentsSchema);
}

export function usePayments(payable: Payable) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: paymentsKey(payable),
    queryFn: ({ signal }) => readPanel(api, payable, "/payments", undefined, signal),
  });
}

export function useOrderPayments(reference: string) {
  return usePayments({ kind: "order", reference });
}

/**
 * A money action answering with the new panel. Afterwards the order's or booking's flags, version and
 * list labels may have changed too (and a refused or unconfirmed refund changed the panel), so all of
 * its screens are read again.
 */
function usePanelAction<Input>(payable: Payable, path: (input: Input) => string, body: (input: Input) => unknown) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => readPanel(api, payable, path(input), body(input)),
    onSuccess: (panel) => queryClient.setQueryData(paymentsKey(payable), panel),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKeyOf(payable.kind) }),
  });
}

/** D137, D139: any amount up to what is left of the payment. */
export function useRefund(payable: Payable) {
  return usePanelAction(
    payable,
    (input: { paymentReference: string; amount: number; reason: string }) => `/payments/${encodeURIComponent(input.paymentReference)}/refund`,
    (input) => ({ amount: input.amount, reason: input.reason }),
  );
}

/** A manual refund done in the dashboard, or an unconfirmed one checked there (D76, D154). */
export function useCompleteRefund(payable: Payable) {
  return usePanelAction(
    payable,
    (input: { refundId: string; manualReference: string }) => `/refunds/${encodeURIComponent(input.refundId)}/complete`,
    (input) => ({ manualReference: input.manualReference }),
  );
}

/** A manual refund not done in the dashboard after all (8a-4 review F1). */
export function useWithdrawRefund(payable: Payable) {
  return usePanelAction(payable, (input: { refundId: string }) => `/refunds/${encodeURIComponent(input.refundId)}/withdraw`, () => ({}));
}

/** An API refund the payment company never answered, not found in its dashboard (8c, review M2). */
export function useReleaseRefund(payable: Payable) {
  return usePanelAction(payable, (input: { refundId: string }) => `/refunds/${encodeURIComponent(input.refundId)}/release`, () => ({}));
}

/** A wrong-amount payment refunded in the dashboard, closed here (D152). */
export function useCloseMismatch(payable: Payable) {
  return usePanelAction(
    payable,
    (input: { paymentReference: string; manualReference: string }) => `/payments/${encodeURIComponent(input.paymentReference)}/close-mismatch`,
    (input) => ({ manualReference: input.manualReference }),
  );
}

/**
 * "Confirm with a new delivery time" (D136, D153): the order is reserved again, so stock and the
 * delivery seats change too; every admin screen and the bookable windows are read again. Orders only:
 * a late-paid booking is confirmed by moving it (9f).
 */
export function useConfirmLatePayment() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ order, windowId }: { order: AdminOrder; windowId: string | null }) =>
      api.post(`${payablePath({ kind: "order", reference: order.reference })}/confirm-late-payment`, { version: order.version, windowId }, adminOrderSchema),
    onSuccess: (order) => queryClient.setQueryData(adminOrderDetailKey(order.reference), order),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: deliveryWindowsKey });
    },
  });
}
