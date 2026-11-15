import type { AccountStatus, AdminCustomerSort, CrmTagColour } from "@nennus-catio/contracts";

type Text = { en: string; ar: string };

/** Whether the email has an account (10c): only confirmed accounts can log in. */
export const ACCOUNT_STATUS: Readonly<Record<AccountStatus, Text>> = {
  none: { en: "Guest", ar: "زائر" },
  awaiting_confirmation: { en: "Account, not confirmed", ar: "حساب غير مؤكد" },
  confirmed: { en: "Account", ar: "حساب" },
};

export const TAG_COLOURS: Readonly<Record<CrmTagColour, Text>> = {
  grey: { en: "Grey", ar: "رمادي" },
  blue: { en: "Blue", ar: "أزرق" },
  green: { en: "Green", ar: "أخضر" },
  amber: { en: "Amber", ar: "كهرماني" },
  red: { en: "Red", ar: "أحمر" },
  purple: { en: "Purple", ar: "بنفسجي" },
};

export const CUSTOMER_SORTS: readonly { value: AdminCustomerSort; en: string; ar: string }[] = [
  { value: "activity", en: "Latest activity", ar: "آخر نشاط" },
  { value: "name", en: "Name", ar: "الاسم" },
  { value: "orders", en: "Most orders", ar: "الأكثر طلبات" },
  { value: "bookings", en: "Most bookings", ar: "الأكثر حجوزات" },
  { value: "spend", en: "Highest spend", ar: "الأعلى إنفاقاً" },
];

/** "13 Oct 2026": the Qatar date of an instant. */
export function dayLabel(iso: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/** A record is named by its name, or by its email when no name was ever given. */
export function customerLabel(customer: { name: string | null; email: string }): string {
  return customer.name ?? customer.email;
}

/** "M" or "MT": the avatar's letters. */
export function customerInitials(label: string): string {
  const words = label.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}` : (words[0]?.slice(0, 2) ?? "?")).toUpperCase();
}
