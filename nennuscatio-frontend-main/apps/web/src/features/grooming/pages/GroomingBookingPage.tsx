"use client";

import type { CustomerBooking, Locale, PaymentAttention } from "@nennus-catio/contracts";
import { CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { DiscountRows } from "@/features/checkout/components/DiscountRows";
import { Link } from "@/i18n/navigation";
import {
  BOOKING_STATUS_LABELS,
  bookingErrorMessage,
  readBookingKey,
  useBooking,
  useCancelBooking,
} from "@/shared/api/bookings";
import { ApiError } from "@/shared/api/client";
import { useBookingPayNow } from "@/shared/api/payments";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { formatClock, formatClockRange, formatQatarDay, qatarClock } from "@/shared/lib/format";
import {
  CHECK_FAST_MS,
  CHECK_PATIENCE_MS,
  CHECK_SLOW_MS,
  checkingPayment,
  DID_NOT_GO_THROUGH,
  minutesLeft,
  OPEN_PAYMENT,
} from "@/shared/lib/payment-check";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Empty } from "@/shared/ui/BusinessUI";
import { PinLink } from "@/shared/ui/ShareLocation";

/** What happens next when staff must handle a payment we received (D136, D146 for bookings). */
const ATTENTION_MESSAGE: Readonly<Record<PaymentAttention, { en: string; ar: string }>> = {
  paid_after_expiry: {
    en: "We received your payment, but the appointment time was no longer free. We will contact you to arrange another time or refund you.",
    ar: "استلمنا دفعتك، لكن الموعد لم يعد متاحاً. سنتواصل معك لترتيب موعد آخر أو لإعادة المبلغ.",
  },
  paid_after_cancel: {
    en: "We received your payment after this booking was cancelled. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعتك بعد إلغاء هذا الحجز. سنعيد المبلغ ونخبرك عند إتمام ذلك.",
  },
  duplicate_payment: {
    en: "We received more than one payment for this booking. We will refund the extra payment and let you know when it is done.",
    ar: "استلمنا أكثر من دفعة لهذا الحجز. سنعيد الدفعة الزائدة ونخبرك عند إتمام ذلك.",
  },
  amount_mismatch: {
    en: "We received a payment for this booking with a different amount than expected. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعة لهذا الحجز بمبلغ مختلف عن المتوقع. سنعيدها ونخبرك عند إتمام ذلك.",
  },
};

/** "Sat 17 Oct, 03:00 PM": customers read 12-hour times (D249). */
function deadlineText(iso: string, locale: Locale): string {
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(iso));
  return `${day}${locale === "ar" ? "،" : ","} ${formatClock(qatarClock(iso), locale)}`;
}

/**
 * One grooming booking (9e): `/bookings/<reference>` for the logged-in owner, `…#k=<key>` for guests
 * (the link in the booking emails). Shows the appointment, pet, package and total; an unpaid booking
 * counts down and offers Pay now, Continue to payment or Pay again (D138, D147); back from the
 * payment page (`?payment=`) it checks the payment until our side knows the result; cancellation
 * until the deadline (D158), saying a payment already made is refunded (D146).
 */
export function GroomingBookingPage({ reference }: { reference: string }) {
  const c = useCopy();
  // undefined until the address has been read in the browser (the key never reaches the server).
  const [guestKey, setGuestKey] = useState<string | null | undefined>(undefined);
  const [watching, setWatching] = useState<string | null>(null);
  const [checkingSince, setCheckingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setGuestKey(readBookingKey(reference));
    setWatching(new URLSearchParams(window.location.search).get("payment"));
  }, [reference]);
  const patient = checkingSince !== null && now - checkingSince >= CHECK_PATIENCE_MS;
  const booking = useBooking(reference, guestKey ?? null, guestKey !== undefined, (current) =>
    current && checkingPayment(current, watching) ? (patient ? CHECK_SLOW_MS : CHECK_FAST_MS) : false,
  );
  const cancel = useCancelBooking(reference, guestKey ?? null);
  const pay = useBookingPayNow();
  const [confirming, setConfirming] = useState(false);
  const waiting = booking.data?.status === "awaiting_payment";
  const checking = booking.data ? checkingPayment(booking.data, watching) : false;
  const timeLeft = booking.data ? minutesLeft(booking.data.holdExpiresAt, Math.max(now, booking.dataUpdatedAt)) : 0;
  const ranOut = waiting && timeLeft <= 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [waiting]);
  useEffect(() => {
    setCheckingSince((since) => (checking ? (since ?? Date.now()) : null));
  }, [checking]);
  const { refetch } = booking;
  useEffect(() => {
    // Ask again once the time is up instead of waiting for the server's next expiry run.
    if (ranOut) void refetch();
  }, [ranOut, refetch]);

  if (guestKey === undefined || booking.isPending) {
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading your booking…", "جارٍ تحميل حجزك…")}
        </p>
      </div>
    );
  }
  if (booking.isError) {
    const error = booking.error;
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      return (
        <Empty>
          {c.text("Log in to see this booking.", "سجّل الدخول لعرض هذا الحجز.")}
          <ActionLink href={customerLoginHref(`/bookings/${reference}`)}>{c.text("Log in", "تسجيل الدخول")}</ActionLink>
        </Empty>
      );
    }
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return (
        <Empty>
          {c.text(
            "We could not find this booking. Please open the link in your booking email, or log in if you booked with your account.",
            "لم نعثر على هذا الحجز. افتح الرابط في بريد الحجز، أو سجّل الدخول إذا حجزت بحسابك.",
          )}
          <ActionLink href="/account/bookings">{c.text("My bookings", "حجوزاتي")}</ActionLink>
        </Empty>
      );
    }
    return (
      <Empty>
        {bookingErrorMessage(error, c.text)}
        <button type="button" className="button button--secondary" onClick={() => void booking.refetch()}>
          {c.text("Retry", "أعد المحاولة")}
        </button>
      </Empty>
    );
  }

  const data = booking.data;
  const { latest, attention } = data.payment;
  const paymentOpen = latest !== null && OPEN_PAYMENT.includes(latest.status);
  const paid = latest?.status === "succeeded";
  const didNotGoThrough = waiting && latest !== null && DID_NOT_GO_THROUGH.includes(latest.status);
  const actionError = cancel.error ?? pay.error;
  const heading = (() => {
    switch (data.status) {
      case "awaiting_payment":
        return checking ? c.text("Checking your payment", "نتحقق من دفعتك") : c.text("Your booking is waiting for payment", "حجزك بانتظار الدفع");
      case "cancelled":
        return c.text("This booking is cancelled", "تم إلغاء هذا الحجز");
      case "expired":
        return attention === "paid_after_expiry"
          ? c.text("We received your payment", "استلمنا دفعتك")
          : c.text("This booking was not paid in time", "لم يُدفع هذا الحجز في الوقت المحدد");
      case "in_progress":
        return c.text("Your pet is being groomed", "يتم الآن الاعتناء بحيوانك");
      case "completed":
        return c.text("Grooming completed", "اكتملت العناية");
      case "no_show":
        return c.text("We missed you at this appointment", "لم نلتقِ في هذا الموعد");
      default:
        return c.text("Thank you, your booking is confirmed", "شكراً، تم تأكيد حجزك");
    }
  })();

  function startPayment() {
    pay.mutate(
      { reference, guestKey: guestKey ?? null },
      {
        onError: (error) => {
          // Paid at the provider already, or the booking changed meanwhile: show what the server knows now.
          if (error instanceof ApiError && error.code === "PAYMENT_IN_PROGRESS" && latest) setWatching(latest.reference);
          void booking.refetch();
        },
      },
    );
  }

  // A cancelled booking shows the refund; otherwise a payment staff must handle says what happens next.
  const refundLine =
    data.status === "cancelled" && data.refundNeeded
      ? attention === "paid_after_cancel"
        ? c.local(ATTENTION_MESSAGE.paid_after_cancel)
        : c.text("We will refund your payment and let you know when it is done.", "سنعيد المبلغ المدفوع ونخبرك عند إتمام ذلك.")
      : null;
  const attentionLine = refundLine === null && attention ? c.local(ATTENTION_MESSAGE[attention]) : null;
  const { appointment } = data;
  const ageYears = Math.floor(data.pet.ageMonths / 12);
  const ageMonths = data.pet.ageMonths % 12;
  const age = [
    ageYears > 0 ? c.text(`${ageYears} year${ageYears === 1 ? "" : "s"}`, `${ageYears} سنة`) : "",
    ageMonths > 0 || ageYears === 0 ? c.text(`${ageMonths} month${ageMonths === 1 ? "" : "s"}`, `${ageMonths} شهراً`) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="customer-page">
      <section className="confirmation panel order-page">
        {data.status === "awaiting_payment" ? <Clock size={40} /> : <CheckCircle2 size={40} />}
        <h1>{heading}</h1>
        <p className="reference">
          <bdi>{data.reference}</bdi>
        </p>
        <p className={`status status--${data.status}`}>{c.local(BOOKING_STATUS_LABELS[data.status])}</p>

        {checking && (
          <div className="note-box" role="status" aria-busy="true">
            {patient
              ? c.text(
                  "We have not heard back from the payment company yet. If you paid, your booking is confirmed within a few minutes and we email you. You can leave this page.",
                  "لم يصلنا رد شركة الدفع بعد. إذا دفعت، يُؤكَّد حجزك خلال دقائق ونرسل لك بريداً. يمكنك مغادرة هذه الصفحة.",
                )
              : c.text("Checking your payment… This takes a few seconds.", "نتحقق من دفعتك… يستغرق ذلك بضع ثوانٍ.")}
          </div>
        )}
        {waiting && !checking && (
          <div className="note-box" role="status">
            {ranOut
              ? c.text(
                  "The time to pay has run out, so the appointment time was released. Please book again.",
                  "انتهى وقت الدفع، فأُلغي حجز الموعد. يرجى الحجز مرة أخرى.",
                )
              : c.text(
                  `Please pay within ${timeLeft} minute${timeLeft === 1 ? "" : "s"}. Until then your appointment time is held for you.`,
                  `يرجى الدفع خلال ${timeLeft} دقيقة. حتى ذلك الحين نحجز لك الموعد.`,
                )}
          </div>
        )}
        {didNotGoThrough && !ranOut && (
          <p className="note-box" role="alert">
            {c.text("Your payment did not go through.", "لم تكتمل عملية الدفع.")}
            {data.payment.canPay &&
              data.payment.attemptsLeft > 0 &&
              c.text(
                ` You can try again (${data.payment.attemptsLeft} attempt${data.payment.attemptsLeft === 1 ? "" : "s"} left).`,
                ` يمكنك المحاولة مرة أخرى (المحاولات المتبقية: ${data.payment.attemptsLeft}).`,
              )}
          </p>
        )}
        {waiting && !ranOut && (!checking || patient) && (
          <PayActions booking={data} open={paymentOpen} retry={didNotGoThrough} busy={pay.isPending || pay.isSuccess} onPay={startPayment} />
        )}
        {(refundLine ?? attentionLine) && <p className="note-box">{refundLine ?? attentionLine}</p>}

        <div className="order-details">
          <h2>{c.text("Appointment", "الموعد")}</h2>
          <p>
            {formatQatarDay(appointment.date, c.locale)} · <bdi>{formatClockRange(appointment.start, appointment.end, c.locale)}</bdi>{" "}
            {data.home ? c.text("(arrival, Qatar time)", "(وقت الوصول، بتوقيت قطر)") : c.text("(Qatar time)", "(بتوقيت قطر)")}
          </p>
          {data.home ? (
            <>
              <p>
                {c.text("Home visit", "زيارة منزلية")} · {c.local(data.home.area)} ·{" "}
                {c.text(
                  `Zone ${data.home.address.zone}, Street ${data.home.address.street}, Building ${data.home.address.building}`,
                  `المنطقة ${data.home.address.zone}، الشارع ${data.home.address.street}، المبنى ${data.home.address.building}`,
                )}
                {data.home.address.floor && ` · ${c.text("Floor", "الطابق")} ${data.home.address.floor}`}
                {data.home.address.flat && ` · ${c.text("Flat", "الشقة")} ${data.home.address.flat}`}
              </p>
              {data.home.address.landmark && <p>{data.home.address.landmark}</p>}
              {data.home.address.pin && (
                <p className="small">
                  <PinLink pin={data.home.address.pin}>{c.text("Location shared · View on Google Maps", "تمت مشاركة الموقع · اعرضه على خرائط Google")}</PinLink>
                </p>
              )}
            </>
          ) : (
            <p>{c.text("At the shop", "في المتجر")}</p>
          )}
        </div>

        <div className="order-details">
          <h2>{c.text("Your pet", "حيوانك")}</h2>
          {/* As asked when booking (D246): the age, the breed and the health or handling notes. */}
          <p>
            {age}
            {data.pet.breed && ` · ${data.pet.breed}`}
          </p>
          {data.pet.notes && <p>{data.pet.notes}</p>}
        </div>

        <div className="order-lines">
          <div className="row spread">
            <span>
              {c.local(data.package.group)} · {c.local(data.package.name)} · {data.package.durationMinutes} {c.text("min", "دقيقة")}
            </span>
            <strong>{c.money(data.price)}</strong>
          </div>
          {data.home && (
            <div className="row spread">
              <span>{c.text("Home visit fee", "رسوم الزيارة المنزلية")}</span>
              <strong>{data.visitFee === 0 ? c.text("None", "لا يوجد") : c.money(data.visitFee)}</strong>
            </div>
          )}
          {/* The booking's own copy of its promotions (D203), as "− QAR 6.35" (11e). */}
          <DiscountRows promotions={data.promotions} />
          <div className="row spread order-total">
            <span>{c.text("Total", "الإجمالي")}</span>
            <strong>{c.money(data.total)}</strong>
          </div>
        </div>
        {(c.ar ? data.package.included.ar : data.package.included.en).length > 0 && (
          <ul className="small muted">
            {(c.ar ? data.package.included.ar : data.package.included.en).map((part) => (
              <li key={part}>{part}</li>
            ))}
          </ul>
        )}

        {actionError && (
          <p className="form-error" role="alert">
            {bookingErrorMessage(actionError, c.text)}
          </p>
        )}
        {data.canCancel && !ranOut && paid && (
          <p className="small muted">
            {c.text(
              `You can cancel online until ${deadlineText(data.cancelDeadline, c.locale)} (Qatar time).`,
              `يمكنك الإلغاء عبر الموقع حتى ${deadlineText(data.cancelDeadline, c.locale)} (بتوقيت قطر).`,
            )}
          </p>
        )}
        {!data.canCancel && data.status === "confirmed" && (
          <p className="note-box">
            {c.text(
              "This appointment is too close to cancel online. Please contact us to change or cancel it.",
              "هذا الموعد قريب جداً لإلغائه عبر الموقع. يرجى التواصل معنا لتغييره أو إلغائه.",
            )}
          </p>
        )}
        {data.canCancel &&
          !ranOut &&
          (confirming ? (
            <div className="form-stack">
              <p>
                {c.text("Cancel this booking?", "هل تريد إلغاء هذا الحجز؟")}
                {paid
                  ? c.text(" We will refund your payment.", " سنعيد لك المبلغ المدفوع.")
                  : paymentOpen && c.text(" If you already paid, we will refund you.", " إذا كنت قد دفعت بالفعل، فسنعيد لك المبلغ.")}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
                >
                  {c.text("Yes, cancel the booking", "نعم، ألغِ الحجز")}
                </button>
                <button type="button" className="text-button" onClick={() => setConfirming(false)}>
                  {c.text("Keep the booking", "أبقِ الحجز")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirming(true)}>
              {c.text("Cancel booking", "إلغاء الحجز")}
            </button>
          ))}

        <p className="small muted">
          {guestKey
            ? c.text(
                "Keep the link from your booking email: it is the only way to open this booking without an account.",
                "احتفظ بالرابط في بريد الحجز: هو الطريقة الوحيدة لفتح هذا الحجز بدون حساب.",
              )
            : c.text("You can find this booking any time under My bookings.", "يمكنك العثور على هذا الحجز في أي وقت في حجوزاتي.")}
        </p>
        {!guestKey && (
          <Link href="/account/bookings" className="text-link">
            {c.text("My bookings", "حجوزاتي")}
          </Link>
        )}
        <ActionLink href="/grooming">{c.text("Back to grooming", "العودة إلى العناية")}</ActionLink>
      </section>
    </div>
  );
}

/** Pay now, Continue to payment (an open attempt) or Pay again (D138); or why paying is not possible. */
function PayActions({
  booking,
  open,
  retry,
  busy,
  onPay,
}: {
  booking: CustomerBooking;
  open: boolean;
  retry: boolean;
  busy: boolean;
  onPay: () => void;
}) {
  const c = useCopy();
  if (!booking.payment.canPay) {
    return (
      <p className="note-box">
        {!open && booking.payment.attemptsLeft === 0
          ? c.text(
              "This booking has reached the limit of 3 payment attempts. Please book again.",
              "وصل هذا الحجز إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى الحجز مرة أخرى.",
            )
          : c.text(
              "Online payment is not available at the moment. Please contact us to complete your booking.",
              "الدفع الإلكتروني غير متاح حالياً. يرجى التواصل معنا لإتمام حجزك.",
            )}
      </p>
    );
  }
  return (
    <div className="form-stack">
      <button type="button" className="button button--primary" disabled={busy} onClick={onPay}>
        {open
          ? c.text("Continue to payment", "متابعة الدفع")
          : retry
            ? c.text("Pay again", "ادفع مرة أخرى")
            : c.text(`Pay ${c.money(booking.total)} now`, `ادفع ${c.money(booking.total)} الآن`)}
      </button>
      <p className="small muted">
        {open
          ? c.text("You have started paying for this booking. Continue to finish the same payment.", "لقد بدأت دفع هذا الحجز. تابع لإكمال الدفعة نفسها.")
          : c.text("You pay on the payment company's secure page, then come back here.", "تدفع في صفحة شركة الدفع الآمنة، ثم تعود إلى هنا.")}
      </p>
    </div>
  );
}
