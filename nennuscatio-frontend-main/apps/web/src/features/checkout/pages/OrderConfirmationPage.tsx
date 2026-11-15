"use client";
import { CheckCircle2 } from "lucide-react";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { ActionLink } from "@/shared/ui/ActionLink";
import { StatusBadge, Empty } from "@/shared/ui/BusinessUI";
export function OrderConfirmationPage({ id }: { id: string }) {
  const c = useCopy(),
    d = useBusiness(),
    order = d.orders.find((o) => o.id === id);
  if (!order)
    return (
      <Empty>
        {c.text(
          "Demo order not found. A full refresh resets demo records.",
          "لم يُعثر على الطلب. التحديث يعيد البيانات التجريبية.",
        )}
        <ActionLink href="/shop">{c.text("Shop", "المتجر")}</ActionLink>
      </Empty>
    );
  const slot = d.slots.find((s) => s.id === order.slotId);
  return (
    <div className="confirmation panel">
      <CheckCircle2 size={42} />
      <h1>
        {c.text(
          order.payment === "paid"
            ? "Thank you. Your demo order is received."
            : "Your demo order is awaiting payment.",
          order.payment === "paid"
            ? "شكراً. تم استلام طلبك التجريبي."
            : "طلبك التجريبي بانتظار الدفع.",
        )}
      </h1>
      <p className="reference">
        <bdi>{order.id}</bdi>
      </p>
      <StatusBadge value={order.payment} />
      {order.items.map((l) => (
        <div className="row spread" key={l.variantId}>
          <span>
            {c.local(l.name)} · {c.local(l.label)} × {l.quantity}
          </span>
          <strong>{c.money(l.price * l.quantity)}</strong>
        </div>
      ))}
      <strong>{c.money(order.total)}</strong>
      <p>
        {slot
          ? `${slot.date} · ${slot.time} · Qatar`
          : c.text(
              "Pickup · present your name and order reference",
              "استلام · قدم الاسم ورقم الطلب",
            )}
      </p>
      <p className="muted small">
        {c.text(
          "Simulation only. No payment was collected and no email was sent.",
          "محاكاة فقط. لم يتم تحصيل مبلغ أو إرسال بريد.",
        )}
      </p>
      <ActionLink href="/shop">
        {c.text("Keep exploring", "تابع التسوق")}
      </ActionLink>
    </div>
  );
}
