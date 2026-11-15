"use client";

import { Link } from "@/i18n/navigation";
import { BOOKING_STATUS_LABELS, bookingErrorMessage, useMyBookings } from "@/shared/api/bookings";
import { errorMessage, useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { formatClock } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { AuthCard } from "../components/AuthForm";

/**
 * "My bookings" (9e): the account's grooming bookings, and since 10b the guest bookings made with its
 * email (joined once the email is confirmed, D186 question 2).
 */
export function MyBookingsPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const bookings = useMyBookings(Boolean(customer));
  const title = c.text("My bookings", "حجوزاتي");

  if (session.isPending || (customer && bookings.isPending)) {
    return (
      <AuthCard title={title}>
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading…", "جارٍ التحميل…")}
        </p>
      </AuthCard>
    );
  }
  if (session.isError) {
    return (
      <AuthCard title={title}>
        <p className="form-error" role="alert">
          {errorMessage(session.error, c.text)}
        </p>
      </AuthCard>
    );
  }
  if (!customer) {
    return (
      <AuthCard title={title} intro={c.text("Log in to see the grooming you booked with your account.", "سجّل الدخول لعرض العناية التي حجزتها بحسابك.")}>
        <Link href={customerLoginHref("/account/bookings")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
      </AuthCard>
    );
  }
  if (bookings.isError) {
    return (
      <AuthCard title={title}>
        <div className="form-error" role="alert">
          <p>{bookingErrorMessage(bookings.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void bookings.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      </AuthCard>
    );
  }
  const list = bookings.data ?? [];
  const day = new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Qatar",
  });
  return (
    <AuthCard title={title}>
      {list.length === 0 ? (
        <p className="muted">{c.text("You have no bookings yet.", "لا توجد لديك حجوزات بعد.")}</p>
      ) : (
        <ul className="my-orders">
          {list.map((booking) => (
            <li key={booking.reference}>
              <Link href={`/bookings/${booking.reference}`} className="my-orders__row">
                <span>
                  <strong>
                    <bdi>{booking.reference}</bdi>
                  </strong>
                  <span className="small muted">
                    {" "}
                    · {day.format(new Date(`${booking.appointment.date}T12:00:00+03:00`))}{" "}
                    <bdi>{formatClock(booking.appointment.start, c.locale)}</bdi>
                  </span>
                  <span className="small muted">
                    {" "}
                    · {c.local(booking.package)}
                    {/* The group is in the package line already; the breed, when given (D246). */}
                    {booking.pet.breed && <> · {booking.pet.breed}</>}
                  </span>
                </span>
                <span className={`status status--${booking.status}`}>{c.local(BOOKING_STATUS_LABELS[booking.status])}</span>
                <span className="my-orders__total">
                  <strong>{c.money(booking.total)}</strong>
                  {booking.discount > 0 && (
                    <span className="saved-note">{c.text(`Saved ${c.money(booking.discount)}`, `وفّرت ${c.money(booking.discount)}`)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        {c.text(
          "Bookings you made as a guest with this email are here too, and still open with the link in their email.",
          "الحجوزات التي أجريتها كضيف بهذا البريد تظهر هنا أيضاً، وما زالت تُفتح بالرابط في بريدها.",
        )}
      </p>
    </AuthCard>
  );
}
