import type { PaymentAttention, PaymentStatus, RefundStatus } from "@nennus-catio/contracts";

type Text = { readonly en: string; readonly ar: string };

/** Staff wording for each payment attempt's status (8b). */
export const PAYMENT_STATUS: Readonly<Record<PaymentStatus, Text>> = {
  created: { en: "Starting", ar: "قيد البدء" },
  pending: { en: "Waiting for the customer", ar: "بانتظار العميل" },
  succeeded: { en: "Paid", ar: "مدفوع" },
  failed: { en: "Failed", ar: "فشل" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  abandoned: { en: "Abandoned (no answer in 24 hours)", ar: "متروك (لا رد خلال ٢٤ ساعة)" },
};

/** Which existing badge colour each payment status uses (`.status--*` in globals.css). */
export const PAYMENT_TONE: Readonly<Record<PaymentStatus, string>> = {
  created: "pending",
  pending: "pending",
  succeeded: "completed",
  failed: "cancelled",
  cancelled: "closed",
  abandoned: "closed",
};

/** Staff wording for each refund's status. */
export const REFUND_STATUS: Readonly<Record<RefundStatus, Text>> = {
  requested: { en: "Sent to the payment company", ar: "أُرسل إلى شركة الدفع" },
  processing: { en: "Processing at the payment company", ar: "قيد المعالجة لدى شركة الدفع" },
  completed: { en: "Refunded", ar: "تم الاسترداد" },
  failed: { en: "Refused, nothing refunded", ar: "مرفوض، لم يُسترد شيء" },
  pending_manual: { en: "To refund in the SkipCash dashboard", ar: "للاسترداد من لوحة SkipCash" },
  cancelled: { en: "Withdrawn", ar: "مسحوب" },
};

/** "Processing" without the provider's refund id: it never answered, so the outcome is unknown (D154). */
export const REFUND_UNCONFIRMED: Text = { en: "Not confirmed: check the SkipCash dashboard", ar: "غير مؤكد: راجع لوحة SkipCash" };

export const REFUND_TONE: Readonly<Record<RefundStatus, string>> = {
  requested: "pending",
  processing: "pending",
  completed: "completed",
  failed: "cancelled",
  pending_manual: "pending",
  cancelled: "closed",
};

/** Why a payment needs staff, and what to do (D136, D146, D152; plan section 13). */
export const ATTENTION: Readonly<Record<PaymentAttention, { title: Text; action: Text }>> = {
  paid_after_expiry: {
    title: { en: "Paid after the time to pay ran out.", ar: "دُفع بعد انتهاء وقت الدفع." },
    action: {
      en: "The items or the delivery time were no longer free. Confirm the order (with a new delivery time for delivery), or refund the payment.",
      ar: "لم تعد المنتجات أو موعد التوصيل متاحة. أكّد الطلب (بموعد توصيل جديد للتوصيل)، أو استرد الدفعة.",
    },
  },
  paid_after_cancel: {
    title: { en: "Paid after the order was cancelled.", ar: "دُفع بعد إلغاء الطلب." },
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

/** QAR typed by staff ("25", "25.5", "25.50") as minor units, or null when it is not an amount. */
export function parseQar(value: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Minor units as the plain number staff edit ("25.00"), without the currency sign. */
export function qarInput(minor: number): string {
  return (minor / 100).toFixed(2);
}
