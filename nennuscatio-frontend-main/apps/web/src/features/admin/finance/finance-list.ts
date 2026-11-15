import type { DemoState, Order, Booking } from "@/mocks/data/business";
import { financeEvidence, type FinanceMethod } from "@/mocks/data/finance";
import { qatarDay, shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import { csvCell } from "@/mocks/adapters/business-repository";
export type FinanceKind = "product" | "house" | "grooming";
export type FinanceStatus = "paid" | "pending" | "refunded";
export type FinancePeriod = "today" | "week" | "month" | "custom";
export type FinanceTab = "transactions" | "payments" | "refunds";
export type FinanceSort = "date" | "reference" | "customer" | "type" | "amount" | "method" | "status";
export interface FinanceTransaction {
  id: string;
  reference: string;
  date: string;
  customerId: string;
  customerName: string;
  kind: FinanceKind;
  amount: number;
  refunded: number;
  refundDate?: string;
  refundReference?: string;
  status: FinanceStatus;
  method?: FinanceMethod;
  paymentReference?: string;
  order?: Order;
  booking?: Booking;
}
export interface FinanceFilters {
  search: string;
  kind: string;
  status: string;
  method: string;
  from: string;
  to: string;
  minimum: string;
  maximum: string;
}
export const financeDefaults: FinanceFilters = {
  search: "", kind: "", status: "", method: "", from: "", to: "", minimum: "", maximum: "",
};
export function financeRange(date: string, period: FinancePeriod, from = "", to = "") {
  if (period === "custom") return { from, to };
  if (period === "today") return { from: date, to: date };
  if (period === "week") {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const start = shiftDay(date, -((weekday + 6) % 7));
    return { from: start, to: shiftDay(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: start, to: end.toISOString().slice(0, 10) };
}
export function financeTransactions(state: DemoState): FinanceTransaction[] {
  return [
    ...state.orders.map((order) => ({
      id: `TX-${order.id}`, reference: order.id, date: order.date,
      customerId: order.customerId, amount: order.total, payment: order.payment,
      cancelled: order.status === "cancelled", order,
      kind: (order.items.some((line) => state.products.find((p) => p.id === line.productId)?.house) ? "house" : "product") as FinanceKind,
    })),
    ...state.bookings.map((booking) => ({
      id: `TX-${booking.id}`, reference: booking.id, date: booking.date,
      customerId: booking.customerId, amount: booking.price, payment: booking.payment,
      cancelled: booking.status === "cancelled", booking, kind: "grooming" as FinanceKind,
    })),
  ].flatMap((record) => {
    const evidence = financeEvidence[record.reference];
    const refund = record.payment === "paid" && evidence?.refund &&
      evidence.refund.amount > 0 && evidence.refund.amount <= record.amount ? evidence.refund : undefined;
    if (record.cancelled && !refund) return [];
    const refundDate = refund
      ? new Date(new Date(record.date).getTime() + refund.hoursAfterPayment * 3600000).toISOString()
      : undefined;
    return [{
      ...record, customerName: state.guests.find((g) => g.id === record.customerId)?.name ?? "",
      status: refund ? "refunded" : record.payment, method: evidence?.method,
      paymentReference: record.payment === "paid" ? evidence?.paymentReference : undefined,
      refunded: refund?.amount ?? 0, refundDate, refundReference: refund?.reference,
    } as FinanceTransaction];
  });
}
export function financeRows(records: FinanceTransaction[], filters: FinanceFilters, tab: FinanceTab = "transactions", sort: FinanceSort = "date", descending = true) {
  if ((filters.from && filters.to && filters.from > filters.to) ||
    (filters.minimum && filters.maximum && Number(filters.minimum) > Number(filters.maximum))) return [];
  const search = filters.search.trim().toLowerCase();
  return records.filter((r) => {
    const day = qatarDay(tab === "refunds" ? r.refundDate ?? r.date : r.date);
    const amount = tab === "refunds" ? r.refunded : r.amount;
    return (tab === "transactions" || (tab === "refunds" ? r.refunded > 0 : r.status !== "pending")) &&
      (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to) &&
      (!filters.kind || filters.kind === r.kind) &&
      (!filters.status || filters.status === r.status) &&
      (!filters.method || filters.method === (r.method ?? "unknown")) &&
      (!filters.minimum || amount >= Number(filters.minimum) * 100) &&
      (!filters.maximum || amount <= Number(filters.maximum) * 100) &&
      [r.id, r.reference, r.customerName, r.paymentReference, r.refundReference].join(" ").toLowerCase().includes(search);
  }).sort((a, b) => {
    const value = (r: FinanceTransaction): string | number => sort === "amount"
      ? (tab === "refunds" ? r.refunded : r.amount)
      : sort === "customer" ? r.customerName : sort === "type" ? r.kind
      : sort === "date" ? (tab === "refunds" ? r.refundDate ?? r.date : r.date)
      : r[sort] ?? "";
    const x = value(a), y = value(b);
    return ((typeof x === "number" && typeof y === "number") ? x - y : String(x).localeCompare(String(y))) * (descending ? -1 : 1) || a.id.localeCompare(b.id);
  });
}
export function financeMetrics(records: FinanceTransaction[], from: string, to: string) {
  const within = (iso: string) => (!from || qatarDay(iso) >= from) && (!to || qatarDay(iso) <= to);
  const invalid = !!from && !!to && from > to;
  const paid = invalid ? 0 : records.filter((r) => r.status !== "pending" && within(r.date)).reduce((n, r) => n + r.amount, 0);
  const pending = invalid ? 0 : records.filter((r) => r.status === "pending" && within(r.date)).reduce((n, r) => n + r.amount, 0);
  const refunded = invalid ? 0 : records.filter((r) => r.refundDate && within(r.refundDate)).reduce((n, r) => n + r.refunded, 0);
  return { paid, pending, refunded, revenue: paid - refunded };
}
export function financeCsvExport(rows: FinanceTransaction[], tab: FinanceTab) {
  const body = [
    ["Transaction", "Source reference", "Date (ISO)", "Type", "Status", "Method", "Amount QAR", "Refunded QAR"],
    ...rows.map((r) => [r.id, r.reference, tab === "refunds" ? r.refundDate ?? r.date : r.date, r.kind, r.status, r.method ?? "unknown", ((tab === "refunds" ? r.refunded : r.amount) / 100).toFixed(2), (r.refunded / 100).toFixed(2)]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `\ufeff${body}`;
}
export function financeDate(iso: string, locale: "en" | "ar", includeTime = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(new Date(iso));
}

/** Refunds in a later period can make net revenue negative. */
export function financeMoney(amount: number, locale: "en" | "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-QA" : "en-QA", { style: "currency", currency: "QAR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
}
