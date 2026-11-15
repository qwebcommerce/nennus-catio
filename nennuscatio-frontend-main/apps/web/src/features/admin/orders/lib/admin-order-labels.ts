import type { Locale, OrderStatus } from "@nennus-catio/contracts";

type Text = { readonly en: string; readonly ar: string };

/** A moment as staff read it: Qatar time, date and time. */
export function placedAt(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Staff wording for each order status (the customer pages use their own, ORDER_STATUS_LABELS). */
export const ADMIN_ORDER_STATUS: Readonly<Record<OrderStatus, Text>> = {
  awaiting_payment: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  preparing: { en: "Preparing", ar: "قيد التجهيز" },
  out_for_delivery: { en: "Out for delivery", ar: "خرج للتوصيل" },
  ready_for_pickup: { en: "Ready for pickup", ar: "جاهز للاستلام" },
  delivered: { en: "Delivered", ar: "تم التوصيل" },
  collected: { en: "Collected", ar: "تم الاستلام" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  expired: { en: "Expired (not paid)", ar: "منتهي (لم يُدفع)" },
};

/** Which existing badge colour each status uses (`.status--*` in globals.css). */
export const ADMIN_ORDER_TONE: Readonly<Record<OrderStatus, string>> = {
  awaiting_payment: "pending",
  confirmed: "confirmed",
  preparing: "processing",
  out_for_delivery: "ready",
  ready_for_pickup: "ready",
  delivered: "completed",
  collected: "completed",
  cancelled: "cancelled",
  expired: "closed",
};

/** The button for each step forward, named after where the order goes. */
export const NEXT_STEP_BUTTON: Readonly<Partial<Record<OrderStatus, Text>>> = {
  preparing: { en: "Start preparing", ar: "ابدأ التجهيز" },
  out_for_delivery: { en: "Mark out for delivery", ar: "تحديد: خرج للتوصيل" },
  ready_for_pickup: { en: "Mark ready for pickup", ar: "تحديد: جاهز للاستلام" },
  delivered: { en: "Mark delivered", ar: "تحديد: تم التوصيل" },
  collected: { en: "Mark collected", ar: "تحديد: تم الاستلام" },
};

/** What happens after each step forward, said in the "Are you sure?" question (D128, D133, D119). */
export const NEXT_STEP_EFFECT: Readonly<Partial<Record<OrderStatus, Text>>> = {
  preparing: {
    en: "After this the customer can no longer cancel the order online.",
    ar: "بعد ذلك لن يتمكن العميل من إلغاء الطلب عبر الموقع.",
  },
  out_for_delivery: {
    en: "The customer gets an email that the order is on its way.",
    ar: "سيصل العميل بريد إلكتروني بأن الطلب في الطريق.",
  },
  ready_for_pickup: {
    en: "The customer gets an email that the order is ready to collect.",
    ar: "سيصل العميل بريد إلكتروني بأن الطلب جاهز للاستلام.",
  },
  delivered: {
    en: "This finishes the order. It cannot be moved back or cancelled afterwards.",
    ar: "هذا ينهي الطلب. لا يمكن إرجاعه أو إلغاؤه بعد ذلك.",
  },
  collected: {
    en: "This finishes the order. It cannot be moved back or cancelled afterwards.",
    ar: "هذا ينهي الطلب. لا يمكن إرجاعه أو إلغاؤه بعد ذلك.",
  },
};

/** The status filter: everything, the orders still running, or one status. */
export const STATUS_FILTER_ORDER: readonly OrderStatus[] = [
  "awaiting_payment",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "collected",
  "cancelled",
  "expired",
];
