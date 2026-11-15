"use client";

import type { AdminGroomingSlot } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { describeGroomingError } from "@/shared/api/grooming";
import { useUpdateGroomingSlot } from "@/shared/api/grooming-calendar";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

/**
 * Changing one grooming time on its date (9b): its sections or buses, never below the bookings it
 * already has, and closed or open for new bookings. Closing asks first (D128). Shared by the Times
 * list and the Day overview (D255).
 */
export function GroomingSlotDialog({ slot, onClose }: { slot: AdminGroomingSlot | null; onClose: () => void }) {
  return slot ? <SlotForm key={`${slot.id}-${slot.version}`} slot={slot} onClose={onClose} /> : null;
}

function SlotForm({ slot, onClose }: { slot: AdminGroomingSlot; onClose: () => void }) {
  const c = useCopy();
  const update = useUpdateGroomingSlot();
  const [capacity, setCapacity] = useState(slot.capacity);
  const [closed, setClosed] = useState(slot.closed);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  async function save() {
    try {
      await update.mutateAsync({ slot, request: { capacity, closed } });
      onClose();
    } catch (err) {
      setError(describeGroomingError(err, c.text));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (closed && !slot.closed) {
      const when = `${slot.start}, ${dateLabel(slot.date, c.locale)}`;
      setConfirming({
        title: c.text(`Close ${when} to new bookings?`, `إغلاق ${when} أمام الحجوزات الجديدة؟`),
        message: c.text(
          slot.booked > 0
            ? `Customers will no longer be able to book this time. The ${slot.booked} bookings already made stay. You can reopen it later.`
            : "Customers will no longer be able to book this time. You can reopen it later.",
          slot.booked > 0
            ? `لن يتمكن العملاء من حجز هذا الموعد. تبقى الحجوزات القائمة (${slot.booked}). يمكنك إعادة فتحه لاحقاً.`
            : "لن يتمكن العملاء من حجز هذا الموعد. يمكنك إعادة فتحه لاحقاً.",
        ),
        confirmLabel: c.text("Close time", "إغلاق الموعد"),
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
        title={c.text(`Change ${slot.start}, ${dateLabel(slot.date, "en")}`, `تغيير ${slot.start}، ${dateLabel(slot.date, "ar")}`)}
        description={c.text("This changes this date only; the weekly schedule stays as it is.", "يغيّر هذا التاريخ فقط؛ ويبقى الجدول الأسبوعي كما هو.")}
      >
        <form className="form-stack" onSubmit={submit}>
          <Field label={slot.location === "shop" ? c.text("Grooming sections", "أقسام العناية") : c.text("Buses", "الحافلات")}>
            <NumberInput required min={slot.booked} max={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </Field>
          {slot.booked > 0 && (
            <p className="small muted">
              {c.text(
                `${slot.booked} already booked: it cannot go lower, and closing keeps those bookings.`,
                `${slot.booked} محجوز بالفعل: لا يمكن الخفض أقل من ذلك، والإغلاق يُبقي تلك الحجوزات.`,
              )}
            </p>
          )}
          <label className="row">
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
            {c.text("Closed for new bookings on this date", "مغلق أمام الحجوزات الجديدة في هذا التاريخ")}
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
