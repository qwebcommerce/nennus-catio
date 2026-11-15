"use client";

import type { AdminBooking } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { describeAdminBookingError, useBookingMoveTimes, useMoveBooking, useStaffCancelBooking } from "@/shared/api/admin-bookings";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { SlotPicker } from "@/shared/ui/SlotPicker";

/**
 * The staff booking dialogs (9f). Each one is the "Are you sure?" (D128): it says what will happen and
 * sends nothing until its button, like the staff order dialogs.
 */

/** Staff cancel with a reason. The times are given back; a paid booking is marked Refund needed. */
export function CancelBookingDialog({
  booking,
  paymentInProgress = false,
  onClose,
  onCancelled,
}: {
  booking: AdminBooking | null;
  paymentInProgress?: boolean;
  onClose: () => void;
  onCancelled: (booking: AdminBooking) => void;
}) {
  return booking ? (
    <CancelForm key={`${booking.reference}-${booking.version}`} booking={booking} paymentInProgress={paymentInProgress} onClose={onClose} onCancelled={onCancelled} />
  ) : null;
}

function CancelForm({
  booking,
  paymentInProgress,
  onClose,
  onCancelled,
}: {
  booking: AdminBooking;
  paymentInProgress: boolean;
  onClose: () => void;
  onCancelled: (booking: AdminBooking) => void;
}) {
  const c = useCopy();
  const cancel = useStaffCancelBooking();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const paid = booking.status !== "awaiting_payment";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError(c.text("Please give a reason (at least 3 characters).", "يرجى كتابة السبب (٣ أحرف على الأقل)."));
      return;
    }
    try {
      onCancelled(await cancel.mutateAsync({ booking, reason: reason.trim() }));
      onClose();
    } catch (err) {
      setError(describeAdminBookingError(err, c.text));
    }
  }

  const effects = [
    c.text("The appointment time is freed for other customers.", "يُتاح الموعد لعملاء آخرين."),
    paid
      ? c.text(
          "This booking was paid, so it will be marked Refund needed: refund it under Payment.",
          "هذا الحجز مدفوع، لذا سيُعلَّم بأنه يحتاج استرداداً: استرده من قسم الدفع.",
        )
      : paymentInProgress
        ? c.text(
            "The customer has started paying: the payment company is asked to stop the payment. If the customer has already paid, the booking is marked Refund needed.",
            "بدأ العميل الدفع: يُطلب من شركة الدفع إيقاف الدفعة. إذا كان العميل قد دفع بالفعل، يُعلَّم الحجز بأنه يحتاج استرداداً.",
          )
        : null,
    c.text("The customer gets a cancellation email.", "سيصل العميل بريد إلكتروني بالإلغاء."),
  ].filter(Boolean);

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !cancel.isPending && onClose()}
      title={c.text(`Cancel booking ${booking.reference}?`, `إلغاء الحجز ${booking.reference}؟`)}
      description={effects.join(" ")}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Reason (staff only; the customer does not see it)", "السبب (للموظفين فقط؛ لا يراه العميل)")}>
          <textarea aria-required="true" maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={cancel.isPending} onClick={onClose}>
            {c.text("Keep booking", "الإبقاء على الحجز")}
          </button>
          <button type="submit" className="button button--danger" disabled={cancel.isPending}>
            {c.text("Cancel booking", "إلغاء الحجز")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Move to another free time: the old time is given back and the new one taken in one step, never
 * overbooked. A booking paid after its time was given away is confirmed by the move.
 */
export function MoveBookingDialog({
  booking,
  onClose,
  onMoved,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  onMoved: (booking: AdminBooking) => void;
}) {
  return booking ? <MoveForm key={`${booking.reference}-${booking.version}`} booking={booking} onClose={onClose} onMoved={onMoved} /> : null;
}

function MoveForm({ booking, onClose, onMoved }: { booking: AdminBooking; onClose: () => void; onMoved: (booking: AdminBooking) => void }) {
  const c = useCopy();
  const times = useBookingMoveTimes(booking.reference);
  const move = useMoveBooking();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [error, setError] = useState("");
  const late = booking.status === "expired";
  const days = times.data?.days ?? [];
  const day = days.find((entry) => entry.date === date) ?? days[0] ?? null;
  const time = day?.times.find((entry) => entry.start === start) ?? null;
  const current = booking.appointment;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!day || !time) {
      setError(c.text("Choose a new time.", "اختر موعداً جديداً."));
      return;
    }
    try {
      onMoved(await move.mutateAsync({ booking, date: day.date, start: time.start }));
      onClose();
    } catch (err) {
      setError(describeAdminBookingError(err, c.text));
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        setStart("");
        void times.refetch();
      }
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !move.isPending && onClose()}
      title={late ? c.text(`Move and confirm booking ${booking.reference}?`, `نقل وتأكيد الحجز ${booking.reference}؟`) : c.text(`Move booking ${booking.reference}?`, `نقل الحجز ${booking.reference}؟`)}
      description={
        late
          ? c.text(
              "The payment arrived after the time was given away. Choose a free time: the booking is confirmed at that time and the customer gets a confirmation email.",
              "وصلت الدفعة بعد إتاحة الموعد لغيره. اختر موعداً متاحاً: يُؤكَّد الحجز في ذلك الموعد ويصل العميل بريد تأكيد.",
            )
          : c.text(
              "Choose a free time. The old time is given back and the new one taken in one step, and the customer gets an email with the new time.",
              "اختر موعداً متاحاً. يُعاد الموعد القديم ويُحجز الجديد في خطوة واحدة، ويصل العميل بريد بالموعد الجديد.",
            )
      }
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="small muted">
          {c.text("Now: ", "الآن: ")}
          {dateLabel(current.date, c.locale)}, <bdi dir="ltr">{current.end ? `${current.start}–${current.end}` : current.start}</bdi>
        </p>
        {times.isPending && (
          <p className="muted small" role="status" aria-busy="true">
            {c.text("Loading free times…", "جارٍ تحميل الأوقات المتاحة…")}
          </p>
        )}
        {times.isError && (
          <p className="form-error" role="alert">
            {describeAdminBookingError(times.error, c.text)}
          </p>
        )}
        {times.isSuccess && days.length === 0 && (
          <p className="note-box small">{c.text("There are no free times for this booking in the booking range.", "لا توجد أوقات متاحة لهذا الحجز ضمن فترة الحجز.")}</p>
        )}
        {times.data && days.length > 0 && (
          // The shared date and time picker (D249), opening on the booking's own day; staff keep 24-hour times.
          <SlotPicker
            days={days.map((entry) => ({ date: entry.date, slots: entry.times.map((free) => ({ id: free.start, start: free.start, end: free.end })) }))}
            from={times.data.from}
            to={times.data.to}
            value={day && time ? { date: day.date, slotId: time.start } : null}
            startDate={date || current.date}
            onChange={(picked) => {
              if (picked) setDate(picked.date);
              setStart(picked?.slot.start ?? "");
              setError("");
            }}
            clock="24h"
            show="range"
            summaryLabel={c.text("New time (Qatar)", "الموعد الجديد (قطر)")}
            arrivalNote={c.text("(arrival)", "(وقت الوصول)")}
          />
        )}
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={move.isPending} onClick={onClose}>
            {late ? c.text("Not now", "ليس الآن") : c.text("Keep the current time", "الإبقاء على الموعد الحالي")}
          </button>
          <button type="submit" className="button button--primary" disabled={move.isPending || !time}>
            {late ? c.text("Move and confirm", "نقل وتأكيد") : c.text("Move booking", "نقل الحجز")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
