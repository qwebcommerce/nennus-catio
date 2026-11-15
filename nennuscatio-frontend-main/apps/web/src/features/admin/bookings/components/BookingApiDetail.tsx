"use client";

import { type AdminBooking, type AdminBookingHistoryEntry, OPEN_PAYMENT_STATUSES, type PaymentStatus } from "@nennus-catio/contracts";
import { CalendarDays, Home, Mail, MapPin, PawPrint, Phone, Scissors, Store, X } from "lucide-react";
import { type RefObject, useState } from "react";
import { CustomerRecordLink } from "@/features/admin/customers/components/CustomerRecordLink";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { addressLine } from "@/features/admin/orders/components/OrderApiDetail";
import { PaymentsPanel } from "@/features/admin/orders/components/OrderPayments";
import { placedAt } from "@/features/admin/orders/lib/admin-order-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminBookingError, useAdminBooking, useBookingStep } from "@/shared/api/admin-bookings";
import { usePayments } from "@/shared/api/admin-payments";
import { useCopy } from "@/shared/lib/copy";
import { PromotionSummaryRows } from "@/features/admin/orders/components/PromotionSummaryRows";
import { formatMoney } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import { ErrorMessage } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { PinLink } from "@/shared/ui/ShareLocation";
import { ADMIN_BOOKING_STATUS, ADMIN_BOOKING_TONE, BOOKING_ATTENTION, BOOKING_STEP_BUTTON, petAge } from "../lib/booking-labels";
import { CancelBookingDialog, MoveBookingDialog } from "./BookingDialogsApi";

const OPEN_PAYMENT: readonly PaymentStatus[] = OPEN_PAYMENT_STATUSES;

export function BookingStatusBadge({ status }: { status: AdminBooking["status"] }) {
  const c = useCopy();
  return <span className={`status status--${ADMIN_BOOKING_TONE[status]}`}>{c.local(ADMIN_BOOKING_STATUS[status])}</span>;
}

/** "Mon 13 Oct, 10:00–11:00" or a home visit's arrival time. */
export function appointmentText(appointment: AdminBooking["appointment"], locale: "en" | "ar"): string {
  return `${dateLabel(appointment.date, locale)}, ${appointment.end ? `${appointment.start}–${appointment.end}` : appointment.start}`;
}

/**
 * One real booking (9f): customer, appointment, pet, package, payment, cancellation and the full
 * history, with the staff actions the booking allows now. Every action asks first (D128) and sends
 * the booking's version; if someone else changed it in between, the booking reloads and says why.
 */
export function BookingApiDetail({
  reference,
  close,
  panelRef,
}: {
  reference: string;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("bookings", "edit");
  const canRefund = access.can("bookings", "refund");
  const query = useAdminBooking(reference);
  // The same request as the Payment section (one fetch): the cancel dialog warns about an open payment (D146).
  const payments = usePayments({ kind: "booking", reference });
  const paymentInProgress = payments.data?.attempts.some((attempt) => OPEN_PAYMENT.includes(attempt.status)) ?? false;
  const step = useBookingStep();
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [cancelling, setCancelling] = useState<AdminBooking | null>(null);
  const [moving, setMoving] = useState<AdminBooking | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const booking = query.data;
  const status = (value: AdminBooking["status"]) => c.local(ADMIN_BOOKING_STATUS[value]);

  function askStep(current: AdminBooking, kind: "next" | "back" | "no_show") {
    const target = kind === "next" ? current.actions.next : kind === "back" ? current.actions.back : "no_show";
    if (!target) return;
    setNotice("");
    setError("");
    setConfirming({
      title:
        kind === "back"
          ? c.text(`Move booking ${current.reference} back to ${status(target)}?`, `إرجاع الحجز ${current.reference} إلى ${status(target)}؟`)
          : kind === "no_show"
            ? c.text(`Mark booking ${current.reference} as a no-show?`, `تعليم الحجز ${current.reference} بعدم الحضور؟`)
            : c.text(`Move booking ${current.reference} to ${status(target)}?`, `نقل الحجز ${current.reference} إلى ${status(target)}؟`),
      message:
        kind === "back"
          ? c.text(
              "Use this to undo a wrong click. It is recorded in the history with your name, and no email is sent.",
              "استخدم هذا للتراجع عن نقرة خاطئة. يُسجَّل في السجل باسمك ولا يُرسل بريد إلكتروني.",
            )
          : kind === "no_show"
            ? c.text(
                "The customer did not come or was not home. The time stays used, nothing is refunded automatically and no email is sent.",
                "لم يحضر العميل أو لم يكن في المنزل. يبقى الموعد مستخدماً، ولا يُسترد شيء تلقائياً، ولا يُرسل بريد.",
              )
            : c.text("It is recorded in the history with your name. No email is sent.", "يُسجَّل في السجل باسمك. لا يُرسل بريد إلكتروني."),
      confirmLabel:
        kind === "back"
          ? c.text(`Move back to ${status(target)}`, `إرجاع إلى ${status(target)}`)
          : kind === "no_show"
            ? c.text("Mark no-show", "تعليم: لم يحضر")
            : c.local(BOOKING_STEP_BUTTON[target] ?? ADMIN_BOOKING_STATUS[target]),
      run: async () => {
        try {
          const saved = await step.mutateAsync({ booking: current, step: kind });
          setNotice(c.text(`Booking ${saved.reference} is now ${status(saved.status)}.`, `الحجز ${saved.reference} الآن ${status(saved.status)}.`));
        } catch (err) {
          setError(describeAdminBookingError(err, c.text));
        }
      },
    });
  }

  const late = booking?.status === "expired";
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail"
      aria-labelledby="booking-detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !confirming && !cancelling && !moving) close();
      }}
    >
      <button type="button" className="icon-button orders-detail-close" aria-label={c.text("Close booking details", "إغلاق تفاصيل الحجز")} onClick={close}>
        <X size={18} />
      </button>
      <h2 id="booking-detail-title">
        {c.text("Booking ", "حجز ")}
        <bdi>{reference}</bdi>
      </h2>
      {query.isPending && (
        <p className="muted" role="status" aria-busy="true">
          {c.text("Loading the booking…", "جارٍ تحميل الحجز…")}
        </p>
      )}
      {query.isError && !booking && (
        <div className="inline-state" role="alert">
          <p>{describeAdminBookingError(query.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void query.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {booking && (
        <>
          <div className="orders-detail-meta">
            <time dateTime={booking.placedAt}>{placedAt(booking.placedAt, c.locale)}</time>
            <BookingStatusBadge status={booking.status} />
          </div>
          {canEdit && (booking.actions.next || booking.actions.back || booking.actions.noShow || booking.actions.move || booking.actions.cancel) && (
            <div className="orders-detail-actions orders-detail-actions--real">
              {booking.actions.next && (
                <button type="button" className="button button--primary" disabled={step.isPending} onClick={() => askStep(booking, "next")}>
                  {c.local(BOOKING_STEP_BUTTON[booking.actions.next] ?? ADMIN_BOOKING_STATUS[booking.actions.next])}
                </button>
              )}
              {booking.actions.move && (
                <button
                  type="button"
                  className={late ? "button button--primary" : "button button--secondary"}
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setMoving(booking);
                  }}
                >
                  {late ? c.text("Move and confirm", "نقل وتأكيد") : c.text("Move to another time", "نقل إلى موعد آخر")}
                </button>
              )}
              {booking.actions.noShow && (
                <button type="button" className="button button--secondary" disabled={step.isPending} onClick={() => askStep(booking, "no_show")}>
                  {c.text("Mark no-show", "تعليم: لم يحضر")}
                </button>
              )}
              {booking.actions.back && (
                <button type="button" className="button button--secondary" disabled={step.isPending} onClick={() => askStep(booking, "back")}>
                  {c.text(`Move back to ${status(booking.actions.back)}`, `إرجاع إلى ${status(booking.actions.back)}`)}
                </button>
              )}
              {booking.actions.cancel && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setCancelling(booking);
                  }}
                >
                  {c.text("Cancel booking", "إلغاء الحجز")}
                </button>
              )}
            </div>
          )}
          <ErrorMessage message={error} />
          <p role="status" className="small">
            {notice}
          </p>
          {booking.status === "awaiting_payment" && (
            <p className="note-box small">
              {c.text(
                "Waiting for the customer to pay. It becomes Confirmed when paid; until then it can only be cancelled.",
                "بانتظار دفع العميل. يصبح مؤكداً عند الدفع؛ وحتى ذلك الحين يمكن إلغاؤه فقط.",
              )}
              {booking.holdExpiresAt &&
                c.text(
                  ` If it is not paid by ${placedAt(booking.holdExpiresAt, "en")}, it expires and the time is given back automatically.`,
                  ` إذا لم يُدفع قبل ${placedAt(booking.holdExpiresAt, "ar")} ينتهي ويُتاح الموعد تلقائياً.`,
                )}
            </p>
          )}
          {booking.attention && (
            <p className="note-box small" role="note">
              <strong>{c.local(BOOKING_ATTENTION[booking.attention].title)} </strong>
              {c.local(BOOKING_ATTENTION[booking.attention].action)}
            </p>
          )}
          {booking.refundNeeded && (
            <p className="note-box small" role="note">
              <strong>{c.text("Refund needed. ", "يحتاج استرداداً. ")}</strong>
              {canRefund
                ? c.text("This booking was paid and then cancelled. Refund it under Payment below.", "دُفع هذا الحجز ثم أُلغي. استرده من قسم الدفع أدناه.")
                : c.text(
                    "This booking was paid and then cancelled. Someone with the Refund permission must refund it under Payment below.",
                    "دُفع هذا الحجز ثم أُلغي. يجب أن يسترده شخص لديه صلاحية الاسترداد من قسم الدفع أدناه.",
                  )}
            </p>
          )}
          <Customer booking={booking} />
          <Appointment booking={booking} />
          <Pet booking={booking} />
          <Package booking={booking} />
          <PaymentsPanel
            payable={{ kind: "booking", reference: booking.reference }}
            module="bookings"
            // The package at what was paid for it after its offers (11e), and the visit fee.
            refundItems={[
              { key: "package", label: c.local(booking.package.name), quantity: 1, paid: booking.price - booking.discount },
              ...(booking.visitFee > 0 ? [{ key: "visit", label: c.text("Home visit fee", "رسوم الزيارة المنزلية"), quantity: 1, paid: booking.visitFee }] : []),
            ]}
          />
          {(booking.status === "cancelled" || booking.status === "expired") && <Cancellation booking={booking} />}
          <History entries={booking.history} />
        </>
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
      <CancelBookingDialog
        booking={cancelling}
        paymentInProgress={paymentInProgress}
        onClose={() => setCancelling(null)}
        onCancelled={(saved) =>
          setNotice(
            saved.refundNeeded
              ? c.text(`Booking ${saved.reference} is cancelled and marked Refund needed.`, `أُلغي الحجز ${saved.reference} وعُلِّم بأنه يحتاج استرداداً.`)
              : c.text(`Booking ${saved.reference} is cancelled.`, `أُلغي الحجز ${saved.reference}.`),
          )
        }
      />
      <MoveBookingDialog
        booking={moving}
        onClose={() => setMoving(null)}
        onMoved={(saved) =>
          setNotice(
            c.text(
              `Booking ${saved.reference} is now ${appointmentText(saved.appointment, "en")}. The customer gets an email.`,
              `الحجز ${saved.reference} الآن ${appointmentText(saved.appointment, "ar")}. سيصل العميل بريد إلكتروني.`,
            ),
          )
        }
      />
    </aside>
  );
}

function Customer({ booking }: { booking: AdminBooking }) {
  const c = useCopy();
  return (
    <section className="orders-detail-card">
      <div className="orders-detail-heading">
        <h3>{c.text("Customer", "العميل")}</h3>
        <small>{booking.hasAccount ? c.text("Has an account", "لديه حساب") : c.text("Guest", "زائر")}</small>
      </div>
      <div className="orders-customer">
        <div>
          <strong>{booking.contact.name}</strong>
          <p>
            <Phone size={13} />
            <bdi>{booking.contact.phone}</bdi>
          </p>
          <p>
            <Mail size={13} />
            <bdi>{booking.contact.email}</bdi>
          </p>
          <CustomerRecordLink email={booking.contact.email} />
        </div>
      </div>
    </section>
  );
}

function Appointment({ booking }: { booking: AdminBooking }) {
  const c = useCopy();
  const home = booking.location === "home";
  return (
    <section className="orders-detail-card">
      <div className="orders-detail-heading">
        <h3>{c.text("Appointment", "الموعد")}</h3>
      </div>
      <div className="orders-fulfilment">
        {home ? <Home size={22} /> : <Store size={22} />}
        <div>
          <strong>{home ? `${c.text("Home visit", "زيارة منزلية")}${booking.area ? ` · ${c.local(booking.area)}` : ""}` : c.text("At the shop", "في المتجر")}</strong>
          <p>
            <CalendarDays size={13} />
            {dateLabel(booking.appointment.date, c.locale)},{" "}
            <bdi dir="ltr">{booking.appointment.end ? `${booking.appointment.start}–${booking.appointment.end}` : booking.appointment.start}</bdi>{" "}
            {home ? c.text("(arrival, Qatar)", "(وصول، قطر)") : c.text("(Qatar)", "(قطر)")}
          </p>
          {booking.address && (
            <p>
              <MapPin size={13} />
              <bdi>{addressLine(booking.address, c.text)}</bdi>
            </p>
          )}
          {booking.address?.landmark && (
            <p>
              {c.text("Landmark: ", "علامة مميزة: ")}
              {booking.address.landmark}
            </p>
          )}
          {booking.address?.note && (
            <p>
              {c.text("Note: ", "ملاحظة: ")}
              {booking.address.note}
            </p>
          )}
          {booking.address?.pin && (
            <p>
              <PinLink pin={booking.address.pin}>
                {c.text(`Open in Google Maps (± ${booking.address.pin.accuracy} m)`, `افتح في خرائط Google (± ${booking.address.pin.accuracy} م)`)}
              </PinLink>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Pet({ booking }: { booking: AdminBooking }) {
  const c = useCopy();
  const pet = booking.petDetails;
  return (
    <section className="orders-detail-card">
      <div className="orders-detail-heading">
        <h3>{c.text("Pet", "الحيوان")}</h3>
      </div>
      <div className="orders-fulfilment">
        <PawPrint size={22} />
        <div>
          {/* The pet as its group and breed, then its age (D246: no name or weight). */}
          <strong>{petLabel(booking.pet, c.local)}</strong>
          <p>{petAge(pet.ageMonths, c.text)}</p>
          {pet.notes && (
            <p>
              {c.text("Notes: ", "ملاحظات: ")}
              {pet.notes}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Package({ booking }: { booking: AdminBooking }) {
  const c = useCopy();
  const included = c.ar ? booking.included.ar : booking.included.en;
  return (
    <section className="orders-detail-card orders-summary">
      <div className="orders-detail-heading">
        <h3>
          <Scissors size={15} /> {c.local(booking.package.group)} · {c.local(booking.package.name)}
        </h3>
        <small>{c.text(`${booking.durationMinutes} min`, `${booking.durationMinutes} دقيقة`)}</small>
      </div>
      {included.length > 0 && (
        <ul className="small">
          {included.map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
      )}
      <dl>
        <div>
          <dt>{c.text("Package", "الباقة")}</dt>
          <dd>
            <bdi>{formatMoney(booking.price, c.locale)}</bdi>
          </dd>
        </div>
        <PromotionSummaryRows promotions={booking.promotions} />
        {booking.discount > 0 && (
          <div>
            {/* What was paid for the package, and the most a refund for it should be (11e). */}
            <dt>{c.text("Package after offers", "الباقة بعد العروض")}</dt>
            <dd>
              <bdi>{formatMoney(booking.price - booking.discount, c.locale)}</bdi>
            </dd>
          </div>
        )}
        {booking.location === "home" && (
          <div>
            <dt>{c.text("Home visit fee", "رسوم الزيارة المنزلية")}</dt>
            <dd>
              <bdi>{formatMoney(booking.visitFee, c.locale)}</bdi>
            </dd>
          </div>
        )}
        <div className="orders-summary-total">
          <dt>{c.text("Total", "الإجمالي")}</dt>
          <dd>
            <bdi>{formatMoney(booking.total, c.locale)}</bdi>
          </dd>
        </div>
      </dl>
    </section>
  );
}

const ACTOR: Readonly<Record<AdminBookingHistoryEntry["actor"], { en: string; ar: string }>> = {
  customer: { en: "Customer", ar: "العميل" },
  guest: { en: "Guest customer", ar: "عميل زائر" },
  staff: { en: "Staff", ar: "الموظفون" },
  system: { en: "System", ar: "النظام" },
};

function Cancellation({ booking }: { booking: AdminBooking }) {
  const c = useCopy();
  const when = booking.cancelledAt ?? booking.expiredAt;
  return (
    <section className="orders-detail-card">
      <h3>{booking.status === "expired" ? c.text("Expired", "منتهي") : c.text("Cancellation", "الإلغاء")}</h3>
      <dl className="orders-facts">
        {when && (
          <div>
            <dt>{c.text("When", "متى")}</dt>
            <dd>{placedAt(when, c.locale)}</dd>
          </div>
        )}
        {booking.cancelledBy && (
          <div>
            <dt>{c.text("By", "بواسطة")}</dt>
            <dd>{c.local(ACTOR[booking.cancelledBy])}</dd>
          </div>
        )}
        {booking.cancelReason && (
          <div>
            <dt>{c.text("Reason", "السبب")}</dt>
            <dd>{booking.cancelReason}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function History({ entries }: { entries: readonly AdminBookingHistoryEntry[] }) {
  const c = useCopy();
  return (
    <section className="orders-detail-card">
      <h3>{c.text("History", "السجل")}</h3>
      <ol className="orders-history">
        {entries.map((entry) => (
          <li key={`${entry.at}-${entry.to}-${entry.reason ?? ""}`}>
            <strong>
              {entry.from && entry.from !== entry.to ? `${c.local(ADMIN_BOOKING_STATUS[entry.from])} → ` : ""}
              {c.local(ADMIN_BOOKING_STATUS[entry.to])}
            </strong>
            <span className="small muted">
              {" · "}
              {entry.staffName ?? c.local(ACTOR[entry.actor])}
              {" · "}
              <time dateTime={entry.at}>{placedAt(entry.at, c.locale)}</time>
            </span>
            {entry.reason && <p className="small">{entry.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
