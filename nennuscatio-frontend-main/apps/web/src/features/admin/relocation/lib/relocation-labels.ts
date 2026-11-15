import type { PaymentAttention, RelocationSlotStatus, RelocationStatus } from "@nennus-catio/contracts";

type Text = { readonly en: string; readonly ar: string };

/** "15 Dec 2026": a planned date with its year, since a relocation can be months ahead. */
export function plannedLabel(date: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qatar" }).format(
    new Date(`${date}T12:00:00+03:00`),
  );
}

/** Staff wording for each relocation status (15d; the customer pages use RELOCATION_STATUS_LABELS). */
export const ADMIN_RELOCATION_STATUS: Readonly<Record<RelocationStatus, Text>> = {
  submitted: { en: "Submitted", ar: "تم الإرسال" },
  documents_requested: { en: "Documents requested", ar: "مستندات مطلوبة" },
  documents_received: { en: "Documents received", ar: "مستندات مستلمة" },
  under_review: { en: "Under review", ar: "قيد المراجعة" },
  quote_requested: { en: "Quote sent, awaiting payment", ar: "عرض سعر مرسل بانتظار الدفع" },
  paid: { en: "Paid", ar: "مدفوع" },
  in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  completed: { en: "Completed", ar: "مكتمل" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

/** The order of statuses in the filter: the quotation's flow (D279). */
export const RELOCATION_STATUS_FILTER_ORDER: readonly RelocationStatus[] = [
  "submitted",
  "documents_requested",
  "documents_received",
  "under_review",
  "quote_requested",
  "paid",
  "in_progress",
  "completed",
  "cancelled",
];

/** A document as staff see it. */
export const ADMIN_SLOT_STATUS: Readonly<Record<RelocationSlotStatus, Text>> = {
  missing: { en: "Missing", ar: "غير مرفوع" },
  uploaded: { en: "To review", ar: "للمراجعة" },
  accepted: { en: "Accepted", ar: "مقبول" },
  needs_new_copy: { en: "New copy asked", ar: "طُلبت نسخة جديدة" },
};

export const ADMIN_SLOT_TONE: Readonly<Record<RelocationSlotStatus, string>> = {
  missing: "pending",
  uploaded: "processing",
  accepted: "completed",
  needs_new_copy: "pending",
};

export const PAID_OUTSIDE_METHOD: Readonly<Record<"bank_transfer" | "cash" | "other", Text>> = {
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  cash: { en: "Cash", ar: "نقداً" },
  other: { en: "Another way", ar: "طريقة أخرى" },
};

/** Why a relocation payment needs staff, and what to do (as bookings', with a quote's words; D281). */
export const RELOCATION_ATTENTION: Readonly<Record<PaymentAttention, { title: Text; action: Text }>> = {
  // A quote holds nothing and does not expire (15b): not expected, worded for safety.
  paid_after_expiry: {
    title: { en: "Paid late.", ar: "دُفع متأخراً." },
    action: { en: "Check the payment below and refund it if it is not wanted.", ar: "راجع الدفعة أدناه واستردها إن لم تكن مطلوبة." },
  },
  paid_after_cancel: {
    title: { en: "Paid after the request was cancelled.", ar: "دُفع بعد إلغاء الطلب." },
    action: { en: "Refund the payment on the Quote tab.", ar: "استرد الدفعة من تبويب عرض السعر." },
  },
  duplicate_payment: {
    title: { en: "A payment that was not for the current quote.", ar: "دفعة لا تخص عرض السعر الحالي." },
    action: {
      en: "Paid twice, paid online after a payment outside the website, or an old quote's page paid: refund it on the Quote tab.",
      ar: "دُفع مرتين، أو عبر الموقع بعد دفعة خارجه، أو دُفعت صفحة عرض سعر قديم: استردها من تبويب عرض السعر.",
    },
  },
  amount_mismatch: {
    title: { en: "The payment company took a different amount.", ar: "أخذت شركة الدفع مبلغاً مختلفاً." },
    action: {
      en: "Refund it in the SkipCash dashboard, then close it here with the dashboard's reference.",
      ar: "استرده من لوحة SkipCash، ثم أغلقه هنا بمرجع اللوحة.",
    },
  },
};
