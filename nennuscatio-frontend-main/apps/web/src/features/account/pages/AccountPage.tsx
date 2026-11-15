"use client";

import { type CustomerProfile, okResponseSchema, profileUpdateSchema } from "@nennus-catio/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "@/i18n/navigation";
import { accountErrorMessage, useUpdateProfile } from "@/shared/api/account";
import { BOOKING_STATUS_LABELS, useMyBookings } from "@/shared/api/bookings";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { ORDER_STATUS_LABELS, useMyOrders } from "@/shared/api/orders";
import { customerSessionKey, errorMessage, useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/BusinessUI";
import { AuthCard } from "../components/AuthForm";
import { NumberInput } from "@/shared/ui/NumberInput";

/**
 * "My account" (#4; 10a, 10b): email and status, the profile (name and phone, used to fill checkout and
 * booking), recent activity, and links to My orders, My bookings, My relocation requests (15c), Saved
 * addresses and Saved pets.
 */
export function AccountPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  const session = useCustomerSession();
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout", {}, okResponseSchema),
    onSuccess: () => queryClient.setQueryData(customerSessionKey, null),
  });

  if (session.isPending) {
    return (
      <AuthCard title={c.text("My account", "حسابي")}>
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading…", "جارٍ التحميل…")}
        </p>
      </AuthCard>
    );
  }
  if (session.isError) {
    return (
      <AuthCard title={c.text("My account", "حسابي")}>
        <div className="form-error" role="alert">
          <p>{errorMessage(session.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void session.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      </AuthCard>
    );
  }
  const customer = session.data;
  if (!customer) {
    return (
      <AuthCard
        title={c.text("My account", "حسابي")}
        intro={c.text("Log in to see your account, or create one with your email.", "سجّل الدخول لعرض حسابك، أو أنشئ حساباً ببريدك.")}
      >
        <div className="form-stack">
          <Link href="/account/login" className="button button--primary">
            {c.text("Log in", "تسجيل الدخول")}
          </Link>
          <Link href="/account/register" className="button button--secondary">
            {c.text("Create an account", "أنشئ حساباً")}
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={c.text("My account", "حسابي")}>
      <div className="auth-account-row">
        <span className="muted">{c.text("Email", "البريد الإلكتروني")}</span>
        <bdi dir="ltr">{customer.email}</bdi>
      </div>
      <div className="auth-account-row">
        <span className="muted">{c.text("Status", "الحالة")}</span>
        <span>{customer.emailVerified ? c.text("Email confirmed", "البريد مؤكد") : c.text("Awaiting confirmation", "بانتظار التأكيد")}</span>
      </div>
      <ProfileForm customer={customer} />
      <RecentActivity />
      <Link href="/account/orders" className="button button--secondary">
        {c.text("My orders", "طلباتي")}
      </Link>
      <Link href="/account/bookings" className="button button--secondary">
        {c.text("My bookings", "حجوزاتي")}
      </Link>
      <Link href="/account/relocation" className="button button--secondary">
        {c.text("My relocation requests", "طلبات النقل")}
      </Link>
      <Link href="/account/addresses" className="button button--secondary">
        {c.text("Saved addresses", "العناوين المحفوظة")}
      </Link>
      <Link href="/account/pets" className="button button--secondary">
        {c.text("Saved pets", "الحيوانات المحفوظة")}
      </Link>
      {logout.isError && (
        <p className="form-error" role="alert">
          {errorMessage(logout.error, c.text)}
        </p>
      )}
      <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {c.text("Log out", "تسجيل الخروج")}
      </Button>
    </AuthCard>
  );
}

/**
 * Recent activity (10b; plan section 4): the last 5 orders and grooming bookings together, newest first,
 * each linking to its page. Guest ones placed with this email are here too once they joined the account.
 */
function RecentActivity() {
  const c = useCopy();
  const orders = useMyOrders(true);
  const bookings = useMyBookings(true);
  const title = c.text("Recent activity", "آخر النشاطات");
  const day = new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qatar" });

  let body: ReactNode;
  if (orders.isPending || bookings.isPending) {
    body = (
      <p role="status" aria-busy="true" className="muted">
        {c.text("Loading…", "جارٍ التحميل…")}
      </p>
    );
  } else if (orders.isError || bookings.isError) {
    body = (
      <div className="form-error" role="alert">
        <p>{errorMessage(orders.error ?? bookings.error, c.text)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void orders.refetch();
            void bookings.refetch();
          }}
        >
          {c.text("Retry", "أعد المحاولة")}
        </Button>
      </div>
    );
  } else {
    const items = [
      ...orders.data.map((order) => ({
        reference: order.reference,
        kind: order.hasHouse ? c.text("Pet House order", "طلب بيت حيوان") : c.text("Order", "طلب"),
        placedAt: order.placedAt,
        status: order.status,
        label: c.local(ORDER_STATUS_LABELS[order.status]),
        total: order.total,
        href: `/orders/${order.reference}`,
      })),
      ...bookings.data.map((booking) => ({
        reference: booking.reference,
        kind: c.text("Grooming", "عناية"),
        placedAt: booking.placedAt,
        status: booking.status,
        label: c.local(BOOKING_STATUS_LABELS[booking.status]),
        total: booking.total,
        href: `/bookings/${booking.reference}`,
      })),
    ]
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .slice(0, 5);
    body =
      items.length === 0 ? (
        <p className="muted">{c.text("No orders or bookings yet.", "لا توجد طلبات أو حجوزات بعد.")}</p>
      ) : (
        <ul className="my-orders" aria-label={title}>
          {items.map((item) => (
            <li key={item.reference}>
              <Link href={item.href} className="my-orders__row">
                <span>
                  <strong>
                    <bdi>{item.reference}</bdi>
                  </strong>
                  <span className="small muted">
                    {item.kind} · {day.format(new Date(item.placedAt))}
                  </span>
                </span>
                <span className={`status status--${item.status}`}>{item.label}</span>
                <strong>{c.money(item.total)}</strong>
              </Link>
            </li>
          ))}
        </ul>
      );
  }
  return (
    <section className="form-stack recent-activity" aria-label={title}>
      <h2 className="saved-heading">{title}</h2>
      {body}
    </section>
  );
}

/** Name and phone (10a): optional; an empty field clears it. The phone follows checkout's rule (8c). */
function ProfileForm({ customer }: { customer: CustomerProfile }) {
  const c = useCopy();
  const update = useUpdateProfile();
  const [name, setName] = useState(customer.name ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [phoneError, setPhoneError] = useState("");
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = profileUpdateSchema.safeParse({ name, phone });
    if (!parsed.success) {
      setPhoneError(
        c.text("Use a Qatari number, or add your country code with + (for example +63 912 345 6789).", "استخدم رقماً قطرياً، أو أضف رمز الدولة مع + (مثلاً ‎+63 912 345 6789)."),
      );
      setSaved(false);
      return;
    }
    setPhoneError("");
    update.mutate(parsed.data, { onSuccess: () => setSaved(true), onError: () => setSaved(false) });
  }

  return (
    <form className="form-stack saved-form" onSubmit={submit} noValidate aria-label={c.text("Your details", "بياناتك")}>
      <h2 className="saved-heading">{c.text("Your details", "بياناتك")}</h2>
      <p className="small muted">{c.text("Used to fill in your orders and bookings.", "تُستخدم لملء طلباتك وحجوزاتك.")}</p>
      <Field label={c.text("Name", "الاسم")}>
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} />
      </Field>
      <Field label={c.text("Phone", "الهاتف")}>
        <NumberInput
          kind="phone"
          dir="ltr"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          maxLength={20}
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? "profile-phone-error" : undefined}
        />
      </Field>
      {phoneError && (
        <p className="form-error" id="profile-phone-error">
          {phoneError}
        </p>
      )}
      {update.isError && (
        <p className="form-error" role="alert">
          {accountErrorMessage(update.error, c.text)}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={update.isPending}>
        {update.isPending ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save my details", "احفظ بياناتي")}
      </Button>
      <p role="status" className="small">
        {saved ? c.text("Your details were saved.", "تم حفظ بياناتك.") : ""}
      </p>
    </form>
  );
}
