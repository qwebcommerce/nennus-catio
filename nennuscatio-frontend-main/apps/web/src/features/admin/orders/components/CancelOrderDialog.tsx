"use client";

import type { AdminOrder } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { describeAdminOrderError, useStaffCancelOrder } from "@/shared/api/admin-orders";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";

/**
 * Staff cancel (D131) with "Are you sure?" built in (D128): nothing is sent until the red button.
 * A reason is always needed. From Preparing on, staff choose whether the items go back in stock
 * (ticked by default); earlier they always do. The delivery seat is always freed. While the customer
 * is paying, the question says a payment already made is refunded (D146).
 */
export function CancelOrderDialog({
  order,
  paymentInProgress = false,
  onClose,
  onCancelled,
}: {
  order: AdminOrder | null;
  paymentInProgress?: boolean;
  onClose: () => void;
  onCancelled: (order: AdminOrder) => void;
}) {
  return order ? (
    <CancelForm
      key={`${order.reference}-${order.version}`}
      order={order}
      paymentInProgress={paymentInProgress}
      onClose={onClose}
      onCancelled={onCancelled}
    />
  ) : null;
}

function CancelForm({
  order,
  paymentInProgress,
  onClose,
  onCancelled,
}: {
  order: AdminOrder;
  paymentInProgress: boolean;
  onClose: () => void;
  onCancelled: (order: AdminOrder) => void;
}) {
  const c = useCopy();
  const cancel = useStaffCancelOrder();
  const [reason, setReason] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  const [error, setError] = useState("");
  const paid = order.status !== "awaiting_payment";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError(c.text("Please give a reason (at least 3 characters).", "يرجى كتابة السبب (٣ أحرف على الأقل)."));
      return;
    }
    try {
      const cancelled = await cancel.mutateAsync({
        order,
        reason: reason.trim(),
        returnStock: order.actions.asksAboutStock ? returnStock : true,
      });
      onCancelled(cancelled);
      onClose();
    } catch (err) {
      setError(describeAdminOrderError(err, c.text));
    }
  }

  const effects = [
    order.fulfilment === "delivery"
      ? c.text("The delivery time is freed for other customers.", "يُتاح موعد التوصيل لعملاء آخرين.")
      : null,
    order.actions.asksAboutStock ? null : c.text("The items go back in stock.", "تعود المنتجات إلى المخزون."),
    paid
      ? c.text(
          "This order was paid, so it will be marked Refund needed: refund it under Payment.",
          "هذا الطلب مدفوع، لذا سيُعلَّم بأنه يحتاج استرداداً: استرده من قسم الدفع.",
        )
      : paymentInProgress
        ? c.text(
            "The customer has started paying: the payment company is asked to stop the payment. If the customer has already paid, the order is marked Refund needed and the customer is refunded.",
            "بدأ العميل الدفع: يُطلب من شركة الدفع إيقاف الدفعة. إذا كان العميل قد دفع بالفعل، يُعلَّم الطلب بأنه يحتاج استرداداً ويُعاد المبلغ للعميل.",
          )
        : null,
    c.text("The customer gets a cancellation email.", "سيصل العميل بريد إلكتروني بالإلغاء."),
  ].filter(Boolean);

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !cancel.isPending && onClose()}
      title={c.text(`Cancel order ${order.reference}?`, `إلغاء الطلب ${order.reference}؟`)}
      description={effects.join(" ")}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Reason (staff only; the customer does not see it)", "السبب (للموظفين فقط؛ لا يراه العميل)")}>
          <textarea aria-required="true" maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {order.actions.asksAboutStock && (
          <div>
            <label className="row">
              <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} />
              {c.text("Put the items back in stock", "إرجاع المنتجات إلى المخزون")}
            </label>
            <p className="small muted">
              {c.text(
                "Untick this if the items were packed, opened or damaged and cannot be sold again.",
                "أزل العلامة إذا كانت المنتجات مغلفة أو مفتوحة أو تالفة ولا يمكن بيعها مرة أخرى.",
              )}
            </p>
          </div>
        )}
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={cancel.isPending} onClick={onClose}>
            {c.text("Keep order", "الإبقاء على الطلب")}
          </button>
          <button type="submit" className="button button--danger" disabled={cancel.isPending}>
            {c.text("Cancel order", "إلغاء الطلب")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
