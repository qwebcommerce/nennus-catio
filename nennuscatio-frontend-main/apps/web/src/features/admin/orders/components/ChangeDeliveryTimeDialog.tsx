"use client";

import type { AdminOrder } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { describeAdminOrderError, useChangeDeliveryTime, useOrderDeliveryWindows } from "@/shared/api/admin-orders";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { SlotPicker, windowsByDay } from "@/shared/ui/SlotPicker";

type Locale = "en" | "ar";

/** "Wednesday 28 Oct, 10:00–12:00": a delivery time as staff read it (24-hour clock). */
function timeLabel(window: { date: string; start: string; end: string }, locale: Locale): string {
  return `${dateLabel(window.date, locale)}, ${window.start}–${window.end}`;
}

/**
 * "Change delivery time" (#14, D268): staff pick the new time with the shared picker (D249, 24-hour
 * clock), then confirm it (D128). The seat moves to the new window and the customer gets an email. An
 * order with a Pet House can go further ahead, up to the furthest day its house can be delivered.
 */
export function ChangeDeliveryTimeDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const c = useCopy();
  const windows = useOrderDeliveryWindows(order.reference);
  const change = useChangeDeliveryTime();
  const [windowId, setWindowId] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const slots = windowsByDay(windows.data ?? [], (window) => c.text(`${window.seatsLeft} left`, `المتبقي ${window.seatsLeft}`));
  const chosen = windows.data?.find((window) => window.id === windowId) ?? null;
  const hasHouse = order.lines.some((line) => line.house !== null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) {
      setError(c.text("Choose the new delivery time.", "اختر موعد التوصيل الجديد."));
      return;
    }
    const from = order.window;
    setConfirming({
      title: c.text(
        `Move order ${order.reference} to ${timeLabel(chosen, "en")}?`,
        `نقل الطلب ${order.reference} إلى ${timeLabel(chosen, "ar")}؟`,
      ),
      message: c.text(
        `${from ? `It is now due ${timeLabel(from, "en")}. ` : ""}The customer gets an email with the new time, and the old time's place is freed for other orders.`,
        `${from ? `موعده الحالي ${timeLabel(from, "ar")}. ` : ""}يصل العميل بريد إلكتروني بالموعد الجديد، ويُتاح مكان الموعد القديم لطلبات أخرى.`,
      ),
      confirmLabel: c.text("Change delivery time", "تغيير موعد التوصيل"),
      run: async () => {
        try {
          const saved = await change.mutateAsync({ order, windowId: chosen.id });
          onDone(
            saved.window
              ? c.text(
                  `Order ${saved.reference} is now due ${timeLabel(saved.window, "en")}. The customer gets an email.`,
                  `موعد الطلب ${saved.reference} الآن ${timeLabel(saved.window, "ar")}. سيصل العميل بريد إلكتروني.`,
                )
              : c.text(`Order ${saved.reference} has a new delivery time.`, `للطلب ${saved.reference} موعد توصيل جديد.`),
          );
          onClose();
        } catch (err) {
          setError(
            err instanceof ApiError && err.code === "SLOT_UNAVAILABLE"
              ? c.text("That delivery time has just filled up or closed. Choose another.", "امتلأ موعد التوصيل هذا أو أُغلق للتو. اختر موعداً آخر.")
              : describeAdminOrderError(err, c.text),
          );
          // The times reload with every admin list (the change's onSettled), so a taken time is gone.
          setWindowId("");
        }
      },
    });
  }

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => !open && !change.isPending && onClose()}
        title={c.text(`Change the delivery time of order ${order.reference}`, `تغيير موعد توصيل الطلب ${order.reference}`)}
        description={
          hasHouse
            ? c.text(
                "This order has a Pet House, so times further ahead are offered too: choose the day the house will be ready. The customer gets an email with the new time.",
                "يضم هذا الطلب بيت حيوان، لذا تُعرض مواعيد أبعد أيضاً: اختر اليوم الذي سيكون فيه البيت جاهزاً. يصل العميل بريد إلكتروني بالموعد الجديد.",
              )
            : c.text("Choose the new time. The customer gets an email with it.", "اختر الموعد الجديد. يصل العميل بريد إلكتروني به.")
        }
      >
        <form className="form-stack" onSubmit={submit}>
          {order.window && (
            <p className="small">
              {c.text("Now: ", "الآن: ")}
              <strong>
                <bdi>{timeLabel(order.window, c.locale)}</bdi>
              </strong>{" "}
              {c.text("(Qatar)", "(قطر)")}
            </p>
          )}
          {/* The shared date and time picker (D249); staff keep 24-hour times. */}
          <div className="slot-field">
            <h3>{c.text("New delivery time (Qatar)", "موعد التوصيل الجديد (قطر)")}</h3>
            {windows.isPending && (
              <p className="small muted" role="status">
                {c.text("Loading times…", "جارٍ تحميل المواعيد…")}
              </p>
            )}
            {windows.isError && (
              <div className="inline-state" role="alert">
                <p>{describeAdminOrderError(windows.error, c.text)}</p>
                <button type="button" className="button button--secondary" onClick={() => void windows.refetch()}>
                  {c.text("Retry", "أعد المحاولة")}
                </button>
              </div>
            )}
            {slots && (
              <SlotPicker
                days={slots.days}
                from={slots.from}
                to={slots.to}
                value={chosen ? { date: chosen.date, slotId: chosen.id } : null}
                onChange={(picked) => {
                  setWindowId(picked?.slot.id ?? "");
                  setError("");
                }}
                clock="24h"
                show="range"
                summaryLabel={c.text("New delivery time", "موعد التوصيل الجديد")}
              />
            )}
          </div>
          {windows.isSuccess && windows.data.length === 0 && (
            <p className="small muted">
              {c.text(
                "There are no other delivery times open now. Add one under Delivery, then try again.",
                "لا توجد مواعيد توصيل أخرى متاحة الآن. أضف موعداً من التوصيل ثم حاول مرة أخرى.",
              )}
            </p>
          )}
          <ErrorMessage message={error} />
          <div className="row confirm-actions">
            <button type="button" className="button button--secondary" disabled={change.isPending} onClick={onClose}>
              {c.text("Cancel", "إلغاء")}
            </button>
            <button type="submit" className="button button--primary" disabled={change.isPending}>
              {c.text("Change delivery time", "تغيير موعد التوصيل")}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </>
  );
}
