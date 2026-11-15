import type { BookingStatus, PaymentAttention } from "@nennus-catio/contracts";

type Text = { readonly en: string; readonly ar: string };

/** Staff wording for each booking status (9f; the customer pages use BOOKING_STATUS_LABELS). */
export const ADMIN_BOOKING_STATUS: Readonly<Record<BookingStatus, Text>> = {
  awaiting_payment: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  completed: { en: "Completed", ar: "مكتمل" },
  no_show: { en: "No-show", ar: "لم يحضر" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  expired: { en: "Expired (not paid)", ar: "منتهي (لم يُدفع)" },
};

/** Which existing badge colour each status uses (`.status--*` in globals.css). */
export const ADMIN_BOOKING_TONE: Readonly<Record<BookingStatus, string>> = {
  awaiting_payment: "pending",
  confirmed: "confirmed",
  in_progress: "processing",
  completed: "completed",
  no_show: "closed",
  cancelled: "cancelled",
  expired: "closed",
};

/** The order of statuses in the filter. */
export const BOOKING_STATUS_FILTER_ORDER: readonly BookingStatus[] = [
  "awaiting_payment",
  "confirmed",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
  "expired",
];

/** The button for each step forward, named after where the booking goes. */
export const BOOKING_STEP_BUTTON: Readonly<Partial<Record<BookingStatus, Text>>> = {
  in_progress: { en: "Start grooming", ar: "ابدأ العناية" },
  completed: { en: "Mark completed", ar: "تحديد: مكتمل" },
};

/** Why a booking's payment needs staff, and what to do (as orders' D136, D146, D152). */
export const BOOKING_ATTENTION: Readonly<Record<PaymentAttention, { title: Text; action: Text }>> = {
  paid_after_expiry: {
    title: { en: "Paid after the time to pay ran out.", ar: "دُفع بعد انتهاء وقت الدفع." },
    action: {
      en: "The appointment time was no longer free. Move the booking to a free time (this confirms it), or refund the payment.",
      ar: "لم يعد الموعد متاحاً. انقل الحجز إلى موعد متاح (وهذا يؤكده)، أو استرد الدفعة.",
    },
  },
  paid_after_cancel: {
    title: { en: "Paid after the booking was cancelled.", ar: "دُفع بعد إلغاء الحجز." },
    action: { en: "Refund the payment.", ar: "استرد الدفعة." },
  },
  duplicate_payment: {
    title: { en: "Paid more than once.", ar: "دُفع أكثر من مرة." },
    action: { en: "Refund the extra payment.", ar: "استرد الدفعة الزائدة." },
  },
  amount_mismatch: {
    title: { en: "The payment company took a different amount.", ar: "أخذت شركة الدفع مبلغاً مختلفاً." },
    action: {
      en: "Refund it in the SkipCash dashboard, then close it here with the dashboard's reference.",
      ar: "استرده من لوحة SkipCash، ثم أغلقه هنا بمرجع اللوحة.",
    },
  },
};

/** "2 years 3 months" from months. */
export function petAge(months: number, text: (en: string, ar: string) => string): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 ? text(`${years} year${years === 1 ? "" : "s"}`, `${years} سنة`) : "",
    rest > 0 || years === 0 ? text(`${rest} month${rest === 1 ? "" : "s"}`, `${rest} شهراً`) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

