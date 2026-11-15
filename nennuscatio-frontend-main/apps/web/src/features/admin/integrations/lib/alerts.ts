import type { AdminPosAlert } from "@nennus-catio/contracts";
import { isolate } from "@/shared/lib/format";

type Text = (en: string, ar: string) => string;

/**
 * What an open POS alert means, in a sentence (#16 part 2c; plan section 7): on the Integrations
 * page and in the bell. `when` formats an instant as staff pages do (24-hour clock).
 */
export function alertLine(alert: AdminPosAlert, text: Text, when: (iso: string) => string): string {
  if (alert.kind === "items_silent") {
    return text(
      `Stock updates from the POS have stopped: the last came at ${alert.lastItemsAt ? when(alert.lastItemsAt) : "—"}. The website keeps selling with the last counts.`,
      `توقفت تحديثات المخزون من نظام نقطة البيع: وصل آخرها ${alert.lastItemsAt ? when(alert.lastItemsAt) : "—"}. يواصل الموقع البيع بآخر الكميات.`,
    );
  }
  const keys = alert.keys.map((key) => text(`“${key.name}”: ${key.waiting} waiting since ${when(key.oldestAt)}`, `«${isolate(key.name)}»: ${key.waiting} بالانتظار منذ ${when(key.oldestAt)}`)).join("; ");
  return text(
    `The POS is not collecting the website's orders and bookings (${keys}). The store's stock does not count these online sales yet.`,
    `لا يستلم نظام نقطة البيع طلبات الموقع وحجوزاته (${keys}). لا يحسب مخزون المتجر هذه المبيعات عبر الموقع بعد.`,
  );
}
