"use client";

import {
  type CheckoutQuote,
  type CheckoutQuoteRequest,
  checkoutQuoteSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutResponseSchema,
  type CustomerOrder,
  customerOrderSchema,
  type DeliveryOptionsResponse,
  deliveryOptionsResponseSchema,
  deliveryWindowsResponseSchema,
  orderListResponseSchema,
  type OrderStatus,
  productListResponseSchema,
} from "@nennus-catio/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { promoCodeText } from "@/shared/lib/offers";
import { catalogProductsKey, toWebProduct } from "./catalog";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { errorMessage } from "./sessions";

/**
 * Checkout and customer orders (7b-2) over the 7b-1 API. Checkout reads products and delivery
 * options with `cache: "no-store"` under their own query keys, so a price or fee change is seen
 * at once instead of after the public pages' browser-cache lifetime.
 */
export const checkoutProductsKey = ["checkout", "products"] as const;
export const checkoutOptionsKey = ["checkout", "delivery-options"] as const;
export const deliveryWindowsKey = ["delivery", "windows"] as const;
export const myOrdersKey = ["orders", "mine"] as const;
export const checkoutQuoteKey = (request: CheckoutQuoteRequest) => ["checkout", "quote", JSON.stringify(request)] as const;
export const orderKey = (reference: string, guestKey: string | null) =>
  ["orders", reference, guestKey ? "guest" : "customer"] as const;

/** The private guest order key travels in this header; in links it sits after `#`. */
export const GUEST_KEY_HEADER = "X-Order-Key";
const KEY_STORE_PREFIX = "nc-order-key:";

export function orderHref(reference: string, guestKey: string | null): string {
  return guestKey ? `/orders/${reference}#k=${guestKey}` : `/orders/${reference}`;
}

/** Keeps the guest key for this tab, in case navigation drops the `#k=` part of the address. */
export function rememberGuestKey(reference: string, key: string): void {
  try {
    window.sessionStorage.setItem(KEY_STORE_PREFIX + reference, key);
  } catch {
    // The link in the order email still works.
  }
}

/** The key from the address (`#k=…`) or from this tab's memory; null for account orders. */
export function readGuestKey(reference: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("k");
  if (fromHash) {
    rememberGuestKey(reference, fromHash);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(KEY_STORE_PREFIX + reference);
  } catch {
    return null;
  }
}

export function useCheckoutProducts() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: checkoutProductsKey,
    queryFn: async ({ signal }) =>
      (await api.get("/catalog/products", productListResponseSchema, { signal, cache: "no-store" })).products.map(toWebProduct),
    staleTime: 0,
  });
}

/** `enabled`: false asks nothing (the cart in mock mode). */
export function useDeliveryOptions(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: checkoutOptionsKey,
    queryFn: ({ signal }) => api.get("/delivery/options", deliveryOptionsResponseSchema, { signal, cache: "no-store" }),
    enabled,
    staleTime: 0,
  });
}

/**
 * The delivery times customers can book. `leadDays` (#14): a cart with a Pet House asks for times from
 * the day the house can be ready (the quote's `houseLeadDays`), for the usual horizon from there.
 */
export function useBookableWindows(enabled: boolean, leadDays = 0) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: [...deliveryWindowsKey, leadDays] as const,
    queryFn: async ({ signal }) =>
      (await api.get(`/delivery/windows${leadDays > 0 ? `?leadDays=${leadDays}` : ""}`, deliveryWindowsResponseSchema, { signal, cache: "no-store" }))
        .windows,
    enabled,
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

/**
 * The server's price for the cart (11e): each line's discount, the delivery fee, the total and the
 * code's answer. Asked again whenever the cart, the area or the code changes; the last answer stays on
 * screen meanwhile (`isPlaceholderData`), so the page can tell when a total is not for this cart yet.
 * Null asks nothing.
 */
export function useCheckoutQuote(request: CheckoutQuoteRequest | null) {
  const { api, source } = useRepositories();
  return useQuery({
    queryKey: request ? checkoutQuoteKey(request) : (["checkout", "quote", null] as const),
    queryFn: ({ signal }) => api.post("/checkout/quote", request, checkoutQuoteSchema, { signal, cache: "no-store" }),
    enabled: request !== null && source === "api",
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/**
 * Where the cart prices its items (11e): pickup when it is offered, otherwise any delivery area. The cart
 * shows the items' discounts only; checkout adds the delivery the customer chooses. Null while there is
 * nowhere to order to, as checkout would refuse the cart then.
 */
export function cartQuotePlace(
  options: DeliveryOptionsResponse | undefined,
  /** The cart has a Pet House that is delivered only (#14): it can only be priced for delivery. */
  deliveryOnly = false,
): Pick<CheckoutQuoteRequest, "fulfilment" | "delivery"> | null {
  if (!options) return null;
  if (options.pickup.enabled && !deliveryOnly) return { fulfilment: "pickup", delivery: null };
  const area = options.areas[0];
  return area ? { fulfilment: "delivery", delivery: { areaId: area.id } } : null;
}

/**
 * The promo code box's Apply (11e): one quote with the typed code, kept as the quote for that request so
 * the page shows it at once. A code the server does not know is then left out of later quotes, so it is
 * not counted as another guess each time the cart changes (D207).
 */
export function useTryCheckoutCode() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CheckoutQuoteRequest): Promise<CheckoutQuote> => api.post("/checkout/quote", request, checkoutQuoteSchema),
    onSuccess: (quote, request) => queryClient.setQueryData(checkoutQuoteKey(request), quote),
  });
}

export function usePlaceOrder() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CheckoutRequest) => api.post("/checkout", request, checkoutResponseSchema),
    onSuccess: (result: CheckoutResponse) => {
      queryClient.setQueryData(orderKey(result.order.reference, result.guestKey), result.order);
      void queryClient.invalidateQueries({ queryKey: catalogProductsKey });
      void queryClient.invalidateQueries({ queryKey: checkoutProductsKey });
      void queryClient.invalidateQueries({ queryKey: deliveryWindowsKey });
      void queryClient.invalidateQueries({ queryKey: myOrdersKey });
    },
  });
}

export function useMyOrders(enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: myOrdersKey,
    queryFn: async ({ signal }) => (await api.get("/orders", orderListResponseSchema, { signal, cache: "no-store" })).orders,
    enabled,
    staleTime: 0,
  });
}

/**
 * A guest key means the guest endpoint, even when someone is logged in; otherwise the account's.
 * `poll` says how often to ask again for the order on screen (8b: while a payment is being checked).
 */
export function useOrder(
  reference: string,
  guestKey: string | null,
  enabled: boolean,
  poll?: (order: CustomerOrder | undefined) => number | false,
) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: orderKey(reference, guestKey),
    queryFn: ({ signal }) =>
      guestKey
        ? api.get(`/guest-orders/${reference}`, customerOrderSchema, {
            signal,
            cache: "no-store",
            headers: { [GUEST_KEY_HEADER]: guestKey },
          })
        : api.get(`/orders/${reference}`, customerOrderSchema, { signal, cache: "no-store" }),
    enabled,
    staleTime: 0,
    retry: false,
    refetchInterval: poll ? (query) => poll(query.state.data) : undefined,
  });
}

/** Cancel the order. The answer replaces the cached order. */
export function useOrderAction(reference: string, guestKey: string | null, action: "cancel") {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<CustomerOrder> =>
      api.post(
        `/${guestKey ? "guest-orders" : "orders"}/${reference}/${action}`,
        {},
        customerOrderSchema,
        guestKey ? { headers: { [GUEST_KEY_HEADER]: guestKey } } : undefined,
      ),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKey(reference, guestKey), order);
      void queryClient.invalidateQueries({ queryKey: myOrdersKey });
      void queryClient.invalidateQueries({ queryKey: catalogProductsKey });
      void queryClient.invalidateQueries({ queryKey: deliveryWindowsKey });
    },
  });
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, { en: string; ar: string }>> = {
  awaiting_payment: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  preparing: { en: "Being prepared", ar: "قيد التجهيز" },
  out_for_delivery: { en: "Out for delivery", ar: "في الطريق إليك" },
  ready_for_pickup: { en: "Ready for pickup", ar: "جاهز للاستلام" },
  delivered: { en: "Delivered", ar: "تم التوصيل" },
  collected: { en: "Collected", ar: "تم الاستلام" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  expired: { en: "Expired (not paid in time)", ar: "منتهي (لم يُدفع في الوقت)" },
};

/** Checkout and order failures in words the customer can act on. */
export function orderErrorMessage(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return errorMessage(error, text);
  switch (error.code) {
    case "OUT_OF_STOCK":
      return text("Some items are no longer available in that quantity. Please check the highlighted items.", "بعض المنتجات لم تعد متوفرة بهذه الكمية. راجع المنتجات المحددة.");
    case "ITEM_UNAVAILABLE":
      return text("Some items can no longer be ordered. Please remove the highlighted items.", "بعض المنتجات لم يعد طلبها ممكناً. أزل المنتجات المحددة.");
    case "SLOT_UNAVAILABLE":
      // A time before the cart's Pet House can be ready (#14): the page then offers the later times.
      return /delivered this early/.test(error.message)
        ? text(
            "Your Pet House cannot be delivered this early. Please choose one of the later times.",
            "لا يمكن توصيل بيت الحيوان في هذا الموعد المبكر. اختر أحد المواعيد اللاحقة.",
          )
        : text("That delivery time has just filled up or closed. Please choose another time.", "امتلأ موعد التوصيل هذا أو أُغلق للتو. اختر موعداً آخر.");
    case "PRICE_CHANGED":
      // With `quote` (D207), the page shows the total for this checkout; placing the order again confirms it.
      return error.quote
        ? text(
            "The total for your order has changed (a price, the delivery fee or an offer). Please check the new total and place the order again.",
            "تغيّر إجمالي طلبك (سعر أو رسوم التوصيل أو عرض). راجع الإجمالي الجديد ثم أرسل الطلب مرة أخرى.",
          )
        : text("A price or the delivery fee has changed. Please check the new total and place the order again.", "تغيّر سعر أو رسوم التوصيل. راجع المجموع الجديد ثم أرسل الطلب مرة أخرى.");
    case "PROMO_CODE_INVALID":
      return error.codeStatus
        ? promoCodeText({ status: error.codeStatus, message: error.message }, text)
        : text("This promo code cannot be used. Please remove it to continue.", "لا يمكن استخدام هذا الرمز. أزله للمتابعة.");
    case "HOLD_EXPIRED":
      return text("The time to pay for this order has run out. Please place the order again.", "انتهى وقت الدفع لهذا الطلب. يرجى إرسال الطلب مرة أخرى.");
    case "NOT_CANCELLABLE":
      return text("This order can no longer be cancelled online. Please contact us.", "لم يعد بالإمكان إلغاء هذا الطلب عبر الموقع. يرجى التواصل معنا.");
    case "CONFLICT":
      return text("This checkout was already used. Please reload the page and try again.", "تم استخدام هذا الطلب بالفعل. أعد تحميل الصفحة وحاول مرة أخرى.");
    case "RATE_LIMITED":
      // Without a waiting time this is the "3 unpaid orders" rule, not too many attempts.
      return error.retryAfterSeconds === null
        ? text("You already have 3 unpaid orders. Pay for or cancel one of them, or wait a few minutes.", "لديك ٣ طلبات غير مدفوعة. ادفع أو ألغِ أحدها، أو انتظر بضع دقائق.")
        : errorMessage(error, text);
    case "NOT_FOUND":
      return text("We could not find this order.", "لم نعثر على هذا الطلب.");
    // Pay now (8b).
    case "PAYMENTS_UNAVAILABLE":
      return text("Online payment is not available at the moment. Please contact us to complete your order.", "الدفع الإلكتروني غير متاح حالياً. يرجى التواصل معنا لإتمام طلبك.");
    case "PAYMENT_ATTEMPTS_EXCEEDED":
      return text("This order has reached the limit of 3 payment attempts. Please place the order again.", "وصل هذا الطلب إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى إرسال الطلب مرة أخرى.");
    case "PAYMENT_IN_PROGRESS":
      return text("We have received your payment and are confirming your order. This page updates by itself.", "استلمنا دفعتك ونقوم بتأكيد طلبك. تتحدث هذه الصفحة تلقائياً.");
    case "PAYMENT_START_FAILED":
      return text("We could not open the payment page. Please try again in a moment.", "تعذّر فتح صفحة الدفع. يرجى المحاولة بعد قليل.");
    case "ORDER_NOT_PAYABLE":
      return text("This order cannot be paid: it is already paid or was cancelled.", "لا يمكن دفع هذا الطلب: إنه مدفوع بالفعل أو أُلغي.");
    default:
      return errorMessage(error, text);
  }
}
