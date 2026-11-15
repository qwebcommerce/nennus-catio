import type { AdminOrderSummary } from "@nennus-catio/contracts";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import type { useCopy } from "@/shared/lib/copy";
import type { DayScheduleColumn } from "@/shared/ui/DaySchedule";
import { OrderStatusBadge } from "./OrderApiDetail";

type Copy = ReturnType<typeof useCopy>;

/** The columns of a delivery window's orders in the day tables (D257): the Delivery page's Day overview and Orders' "Deliveries by day". */
export function orderDayColumns(c: Copy): DayScheduleColumn[] {
  return [
    { key: "order", header: c.text("Order", "الطلب") },
    { key: "customer", header: c.text("Customer", "العميل") },
    { key: "phone", header: c.text("Phone", "الهاتف") },
    { key: "area", header: c.text("Area", "المنطقة") },
    { key: "items", header: c.text("Items", "العناصر") },
    { key: "total", header: c.text("Total", "الإجمالي") },
    { key: "status", header: c.text("Status", "الحالة") },
  ];
}

/** One order's cells; `reference` is how its page opens it (a link, or the Orders page's panel button). */
export function orderDayCells(order: AdminOrderSummary, reference: ReactNode, c: Copy): Record<string, ReactNode> {
  return {
    order: reference,
    customer: order.contactName,
    phone: <bdi dir="ltr">{order.contactPhone}</bdi>,
    area: order.area ? c.local(order.area) : "—",
    // A Pet House is a big item: the delivery team sees it coming (#14).
    items: order.hasHouse ? (
      <>
        {order.itemCount}
        <small className="orders-house-mark">
          <House size={12} aria-hidden="true" />
          {c.text("Pet House", "بيت حيوان")}
        </small>
      </>
    ) : (
      order.itemCount
    ),
    total: <bdi>{c.money(order.total)}</bdi>,
    status: (
      <>
        <OrderStatusBadge status={order.status} />
        {order.refundNeeded && <small className="orders-refund">{c.text("Refund needed", "يحتاج استرداداً")}</small>}
        {order.attention && <small className="orders-refund">{c.text("Payment to check", "دفعة تحتاج مراجعة")}</small>}
      </>
    ),
  };
}
