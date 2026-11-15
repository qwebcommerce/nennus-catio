"use client";

import type { AdminDeliveryWindow, AdminOrderSummary } from "@nennus-catio/contracts";
import { useState } from "react";
import { orderDayCells, orderDayColumns } from "@/features/admin/orders/components/OrderDayCells";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useDeliveryWindows } from "@/shared/api/admin-delivery";
import { adminOrderSearch, DELIVERY_DAY_LIMIT, deliveryDayFilters, describeAdminOrderError, ordersByWindow, useAdminOrders } from "@/shared/api/admin-orders";
import { useCopy } from "@/shared/lib/copy";
import { Empty } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { DaySchedule, type DayScheduleRow } from "@/shared/ui/DaySchedule";
import { DayStepper } from "@/shared/ui/DayStepper";
import { dateLabel, qatarToday, timeRange } from "../lib/delivery-labels";
import { DeliveryWindowDialog } from "./DeliveryWindowDialog";

interface WindowRow {
  key: string;
  start: string;
  end: string;
  window: AdminDeliveryWindow | null;
  orders: AdminOrderSummary[];
}

/**
 * The owner's "day overview" for deliveries (D255, D257): one day's delivery windows as a table: each
 * window's booked places, whether it is open, full or closed, and its Change dialog. For roles that may see
 * Orders, a window with orders opens on a click to list them, one line each. An order opens on the Orders
 * page; the whole day opens in Orders → Deliveries by day.
 */
export function DeliveryDayOverview() {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("deliverySlots", "edit");
  const canSeeOrders = access.canView("orders");
  const [day, setDay] = useState(qatarToday());
  const [changing, setChanging] = useState<AdminDeliveryWindow | null>(null);
  const windows = useDeliveryWindows();
  const orders = useAdminOrders(adminOrderSearch(deliveryDayFilters(day)), { enabled: canSeeOrders });
  // Another day is loading: the previous answer must never show under the new date.
  const shown = orders.isPlaceholderData ? undefined : orders.data;

  if (windows.isPending || windows.isError) {
    return (
      <section className="panel form-stack" aria-label={c.text("Day overview", "نظرة على اليوم")}>
        <DayStepper day={day} onChange={setDay} />
        <CatalogState status={windows.isPending ? "loading" : "error"} retry={() => void windows.refetch()} />
      </section>
    );
  }

  // The day's windows, each with its orders; orders in a window the list no longer has (a past date) get their own rows.
  const groups = ordersByWindow((shown?.orders ?? []).filter((order) => order.window?.date === day));
  const rows: WindowRow[] = windows.data.windows
    .filter((window) => window.date === day)
    .map((window) => {
      const key = `${window.start}-${window.end}`;
      return { key, start: window.start, end: window.end, window, orders: groups.find((group) => group.key === key)?.orders ?? [] };
    });
  for (const group of groups) {
    if (!rows.some((row) => row.key === group.key)) rows.push({ ...group, window: null });
  }
  rows.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const tableRows: DayScheduleRow[] = rows.map((row) => {
    const window = row.window;
    return {
      key: row.key,
      time: timeRange(row.start, row.end),
      count: window ? c.text(`${window.booked} of ${window.capacity}`, `${window.booked} من ${window.capacity}`) : String(row.orders.length),
      status: window
        ? window.closed
          ? { label: c.text("Closed", "مغلقة"), tone: "closed" as const }
          : window.booked >= window.capacity
            ? { label: c.text("Full", "ممتلئة"), tone: "full" as const }
            : { label: c.text("Open", "مفتوحة"), tone: "open" as const }
        : null,
      details: row.orders.map((order) => ({
        key: order.reference,
        cells: orderDayCells(
          order,
          <Link className="text-link" href={`/admin/orders?search=${encodeURIComponent(order.reference)}`}>
            <bdi>{order.reference}</bdi>
          </Link>,
          c,
        ),
      })),
      action:
        canEdit && window ? (
          <button type="button" className="text-button" aria-label={`${c.text("Change", "تغيير")} ${window.date} ${window.start}`} onClick={() => setChanging(window)}>
            {c.text("Change", "تغيير")}
          </button>
        ) : null,
    };
  });

  return (
    <section className="panel form-stack" aria-label={c.text("Day overview", "نظرة على اليوم")}>
      <DayStepper day={day} onChange={setDay} />
      <div className="row spread">
        <h3 className="delivery-date">{dateLabel(day, c.locale)}</h3>
        {canSeeOrders && (
          <Link className="text-link small" href={`/admin/orders?date=${day}`}>
            {c.text("Open this day in Orders", "افتح هذا اليوم في الطلبات")}
          </Link>
        )}
      </div>
      {orders.isError && (
        <div className="inline-state" role="alert">
          <p>{describeAdminOrderError(orders.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void orders.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {canSeeOrders && (orders.isPending || orders.isPlaceholderData) && !orders.isError && (
        <p className="muted small" role="status" aria-busy="true">
          {c.text("Loading the day's orders…", "جارٍ تحميل طلبات اليوم…")}
        </p>
      )}
      <DaySchedule
        label={c.text("Delivery windows on this day", "نوافذ التوصيل في هذا اليوم")}
        timeHeader={c.text("Window", "النافذة")}
        countHeader={c.text("Booked", "المحجوز")}
        details={canSeeOrders ? { columns: orderDayColumns(c), label: (time) => c.text(`Orders at ${time}`, `طلبات ${time}`) } : null}
        rows={tableRows}
        dayKey={day}
        empty={<Empty>{c.text("No delivery windows on this day.", "لا توجد نوافذ توصيل في هذا اليوم.")}</Empty>}
        withStatus
        withActions={canEdit}
      />
      {shown && shown.total > DELIVERY_DAY_LIMIT && (
        <p className="small muted">
          {c.text(`Showing the first ${DELIVERY_DAY_LIMIT} orders; open the day in Orders for the rest.`, `عرض أول ${DELIVERY_DAY_LIMIT} طلباً؛ افتح اليوم في الطلبات للباقي.`)}
        </p>
      )}
      {canSeeOrders && (
        <p className="small muted">
          {c.text("Pickups, and cancelled or expired orders, are not shown.", "لا تظهر طلبات الاستلام ولا الطلبات الملغاة أو المنتهية.")}
        </p>
      )}
      <DeliveryWindowDialog target={changing} onClose={() => setChanging(null)} />
    </section>
  );
}
