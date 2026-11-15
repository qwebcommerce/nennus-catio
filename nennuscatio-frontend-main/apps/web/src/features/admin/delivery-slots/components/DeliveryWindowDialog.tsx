"use client";

import type { AdminDeliveryWindow } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { describeDeliveryError, useUpdateWindow } from "@/shared/api/admin-delivery";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";
import { dateLabel, timeRange } from "../lib/delivery-labels";

/**
 * Changing one dated delivery window (D120): how many deliveries it takes, never below the orders it
 * already has, and closed or open for new orders. Closing asks first (D128). Shared by the Upcoming
 * windows list and the Day overview (D255).
 */
export function DeliveryWindowDialog({ target, onClose }: { target: AdminDeliveryWindow | null; onClose: () => void }) {
  return target ? <WindowForm key={`${target.id}-${target.version}`} target={target} onClose={onClose} /> : null;
}

function WindowForm({ target, onClose }: { target: AdminDeliveryWindow; onClose: () => void }) {
  const c = useCopy();
  const update = useUpdateWindow();
  const [capacity, setCapacity] = useState(target.capacity);
  const [closed, setClosed] = useState(target.closed);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  async function save() {
    try {
      await update.mutateAsync({ window: target, request: { capacity, closed } });
      onClose();
    } catch (err) {
      setError(describeDeliveryError(err, c.text));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (closed && !target.closed) {
      const when = `${timeRange(target.start, target.end)}, ${dateLabel(target.date, c.locale)}`;
      setConfirming({
        title: c.text(`Close ${when} to new orders?`, `إغلاق ${when} أمام الطلبات الجديدة؟`),
        message:
          target.booked > 0
            ? c.text(
                `Customers will no longer be able to book this time. The ${target.booked} orders already booked stay. You can reopen it later.`,
                `لن يتمكن العملاء من حجز هذا الوقت. تبقى الطلبات المحجوزة (${target.booked}). يمكنك إعادة فتحها لاحقاً.`,
              )
            : c.text("Customers will no longer be able to book this time. You can reopen it later.", "لن يتمكن العملاء من حجز هذا الوقت. يمكنك إعادة فتحها لاحقاً."),
        confirmLabel: c.text("Close window", "إغلاق النافذة"),
        run: save,
      });
      return;
    }
    void save();
  }

  return (
    <>
      <Modal
        open
        onOpenChange={(value) => !value && onClose()}
        title={c.text(
          `Change ${timeRange(target.start, target.end)}, ${dateLabel(target.date, "en")}`,
          `تغيير ${timeRange(target.start, target.end)}، ${dateLabel(target.date, "ar")}`,
        )}
        description={c.text("This changes this date only; the weekly schedule stays as it is.", "يغيّر هذا التاريخ فقط؛ ويبقى الجدول الأسبوعي كما هو.")}
      >
        <form className="form-stack" onSubmit={submit}>
          <Field label={c.text("Deliveries in this window", "عدد التوصيلات في هذه النافذة")}>
            <NumberInput required min={target.booked} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </Field>
          {target.booked > 0 && (
            <p className="small muted">
              {c.text(
                `${target.booked} already booked: the capacity cannot go lower, and closing keeps those orders.`,
                `${target.booked} محجوزة بالفعل: لا يمكن خفض السعة أقل من ذلك، والإغلاق يُبقي تلك الطلبات.`,
              )}
            </p>
          )}
          <label className="row">
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
            {c.text("Closed for new orders on this date", "مغلقة أمام الطلبات الجديدة في هذا التاريخ")}
          </label>
          <ErrorMessage message={error} />
          <div className="row">
            <button type="button" className="button button--secondary" onClick={onClose}>
              {c.text("Cancel", "إلغاء")}
            </button>
            <button type="submit" className="button button--primary" disabled={update.isPending}>
              {c.text("Save change", "احفظ التغيير")}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </>
  );
}
