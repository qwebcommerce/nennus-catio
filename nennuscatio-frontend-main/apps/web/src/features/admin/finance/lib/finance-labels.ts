import type {
  FinanceRefundFilter,
  FinanceTransactionStatus,
  FinanceType,
  LocalisedText,
  PaymentAttention,
  PaymentProvider,
  RefundMethod,
  RefundStatus,
} from "@nennus-catio/contracts";

/** Words for the real Finance page (#12 part 1), English and Arabic. */

export const FINANCE_TYPE: Record<FinanceType, LocalisedText> = {
  products: { en: "Products", ar: "المنتجات" },
  houses: { en: "Pet Houses", ar: "بيوت الحيوانات" },
  grooming: { en: "Grooming", ar: "العناية" },
  relocation: { en: "Relocation", ar: "نقل الحيوانات" },
};

/** The demo page's style classes for each type. */
export const FINANCE_TYPE_CLASS: Record<FinanceType, "product" | "house" | "grooming" | "relocation"> = {
  products: "product",
  houses: "house",
  grooming: "grooming",
  relocation: "relocation",
};

export const FINANCE_TRANSACTION_STATUS: Record<FinanceTransactionStatus, LocalisedText> = {
  paid: { en: "Paid", ar: "مدفوع" },
  partly_refunded: { en: "Partly refunded", ar: "مسترد جزئياً" },
  refunded: { en: "Refunded", ar: "مسترد" },
};

export const PAYMENT_PROVIDER: Record<PaymentProvider, LocalisedText> = {
  skipcash: { en: "SkipCash", ar: "SkipCash" },
  fake: { en: "Test page", ar: "صفحة الاختبار" },
};

export const REFUND_METHOD: Record<RefundMethod, LocalisedText> = {
  api: { en: "SkipCash", ar: "SkipCash" },
  manual: { en: "Manual", ar: "يدوي" },
};

export const REFUND_STATUS: Record<RefundStatus, LocalisedText> = {
  requested: { en: "Requested", ar: "مطلوب" },
  processing: { en: "In progress", ar: "قيد التنفيذ" },
  completed: { en: "Completed", ar: "مكتمل" },
  failed: { en: "Failed", ar: "فشل" },
  pending_manual: { en: "Manual, not done yet", ar: "يدوي، لم يُنفذ بعد" },
  cancelled: { en: "Withdrawn", ar: "مسحوب" },
};

export const REFUND_FILTER: Record<FinanceRefundFilter, LocalisedText> = {
  completed: { en: "Completed", ar: "مكتملة" },
  in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  manual_pending: { en: "Manual, not done yet", ar: "يدوية لم تُنفذ بعد" },
  failed: { en: "Failed", ar: "فشلت" },
  cancelled: { en: "Withdrawn", ar: "مسحوبة" },
};

export const PAYMENT_ATTENTION: Record<PaymentAttention, LocalisedText> = {
  paid_after_expiry: { en: "Paid after it expired", ar: "دُفع بعد انتهاء المهلة" },
  paid_after_cancel: { en: "Paid after it was cancelled", ar: "دُفع بعد الإلغاء" },
  duplicate_payment: { en: "Paid twice", ar: "دُفع مرتين" },
  amount_mismatch: { en: "Wrong amount reported", ar: "مبلغ مختلف أُبلغ عنه" },
};

/** Status badge style (the demo page's green, orange and red): done, still open, or stopped. */
export function refundStatusTone(status: RefundStatus): "paid" | "pending" | "refunded" {
  return status === "completed" ? "paid" : status === "failed" || status === "cancelled" ? "refunded" : "pending";
}

export function transactionStatusTone(status: FinanceTransactionStatus): "paid" | "pending" | "refunded" {
  return status === "paid" ? "paid" : status === "refunded" ? "refunded" : "pending";
}

/** The day, Monday-first week or month containing `date`, or a custom range (Qatar dates). */
export function financePeriod(
  date: string,
  period: "today" | "week" | "month" | "custom",
  custom: { from: string; to: string },
): { from: string; to: string } {
  if (period === "custom") return custom;
  if (period === "today") return { from: date, to: date };
  const shift = (value: string, days: number) => {
    const next = new Date(`${value}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  };
  if (period === "week") {
    const start = shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
    return { from: start, to: shift(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: start, to: end.toISOString().slice(0, 10) };
}

/** Days in a range, both included (0 when the range is not valid). */
export function rangeDays(from: string, to: string): number {
  if (!from || !to || from > to) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** A chart bucket's label: a day ("10 Sep"), a week's Monday ("7 Sep") or a month ("Sep 2026"). */
export function bucketLabel(start: string, grouping: "day" | "week" | "month", ar: boolean): string {
  const format: Intl.DateTimeFormatOptions =
    grouping === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-GB", format).format(new Date(`${start}T12:00:00Z`));
}

/** Date and time of an instant in Qatar, for the tables. */
export function financeWhen(iso: string, ar: boolean): { date: string; time: string } {
  const instant = new Date(iso);
  return {
    date: new Intl.DateTimeFormat(ar ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric" }).format(instant),
    time: new Intl.DateTimeFormat(ar ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit", hour12: true }).format(instant),
  };
}
