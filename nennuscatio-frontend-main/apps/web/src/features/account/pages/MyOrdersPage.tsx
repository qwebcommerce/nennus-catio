"use client";

import { Link } from "@/i18n/navigation";
import { ORDER_STATUS_LABELS, orderErrorMessage, useMyOrders } from "@/shared/api/orders";
import { errorMessage, useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { Button } from "@/shared/ui/Button";
import { AuthCard } from "../components/AuthForm";

/**
 * "My orders" (7b-2, D121): the account's orders, and since 10b the guest orders placed with its email
 * (joined once the email is confirmed, D186 question 2).
 */
export function MyOrdersPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const orders = useMyOrders(Boolean(customer));
  const title = c.text("My orders", "طلباتي");

  if (session.isPending || (customer && orders.isPending)) {
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
      <AuthCard title={title} intro={c.text("Log in to see the orders you placed with your account.", "سجّل الدخول لعرض الطلبات التي أرسلتها بحسابك.")}>
        <Link href={customerLoginHref("/account/orders")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
      </AuthCard>
    );
  }
  if (orders.isError) {
    return (
      <AuthCard title={title}>
        <div className="form-error" role="alert">
          <p>{orderErrorMessage(orders.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void orders.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      </AuthCard>
    );
  }
  const list = orders.data ?? [];
  const date = new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Qatar",
  });
  return (
    <AuthCard title={title}>
      {list.length === 0 ? (
        <p className="muted">{c.text("You have no orders yet.", "لا توجد لديك طلبات بعد.")}</p>
      ) : (
        <ul className="my-orders">
          {list.map((order) => (
            <li key={order.reference}>
              <Link href={`/orders/${order.reference}`} className="my-orders__row">
                <span>
                  <strong>
                    <bdi>{order.reference}</bdi>
                  </strong>
                  <span className="small muted"> · {date.format(new Date(order.placedAt))}</span>
                  {order.hasHouse && <span className="small muted"> · {c.text("Pet House", "بيت حيوان")}</span>}
                </span>
                <span className={`status status--${order.status}`}>{c.local(ORDER_STATUS_LABELS[order.status])}</span>
                <span className="my-orders__total">
                  <strong>{c.money(order.total)}</strong>
                  {order.discount > 0 && (
                    <span className="saved-note">{c.text(`Saved ${c.money(order.discount)}`, `وفّرت ${c.money(order.discount)}`)}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">
        {c.text(
          "Orders you placed as a guest with this email are here too, and still open with the link in their email.",
          "الطلبات التي أرسلتها كضيف بهذا البريد تظهر هنا أيضاً، وما زالت تُفتح بالرابط في بريدها.",
        )}
      </p>
    </AuthCard>
  );
}
