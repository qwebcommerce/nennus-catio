"use client";

import { relocationIsOpen } from "@nennus-catio/contracts";
import { Link } from "@/i18n/navigation";
import {
  RELOCATION_STATUS_LABELS,
  RELOCATION_STATUS_TONE,
  relocationErrorMessage,
  relocationHref,
  useMyRelocationRequests,
} from "@/shared/api/relocation";
import { errorMessage, useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { formatQatarDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { AuthCard } from "../components/AuthForm";

/** "My relocation requests" (15c): the account's requests, newest first, with the status and the quote. */
export function MyRelocationPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const requests = useMyRelocationRequests(Boolean(customer));
  const title = c.text("My relocation requests", "طلبات النقل");

  if (session.isPending || (customer && requests.isPending)) {
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
      <AuthCard title={title} intro={c.text("Log in to see your relocation requests.", "سجّل الدخول لعرض طلبات النقل الخاصة بك.")}>
        <Link href={customerLoginHref("/account/relocation")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
      </AuthCard>
    );
  }
  if (requests.isError) {
    return (
      <AuthCard title={title}>
        <div className="form-error" role="alert">
          <p>{relocationErrorMessage(requests.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void requests.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      </AuthCard>
    );
  }
  const list = requests.data ?? [];
  return (
    <AuthCard title={title}>
      {list.length === 0 ? (
        <p className="muted">{c.text("You have no relocation requests yet.", "لا توجد لديك طلبات نقل بعد.")}</p>
      ) : (
        <ul className="my-orders">
          {list.map((request) => (
            <li key={request.reference}>
              <Link href={relocationHref(request.reference)} className="my-orders__row">
                <span>
                  <strong>
                    <bdi>{request.reference}</bdi>
                  </strong>
                  <span className="small muted"> · {formatQatarDate(request.placedAt, c.locale)}</span>
                  <span className="small muted">
                    {" "}
                    · {request.pets.join(c.text(", ", "، "))} · {c.text("to", "إلى")} {c.local(request.destination)}
                  </span>
                </span>
                <span className={`status status--${RELOCATION_STATUS_TONE[request.status]}`}>{c.local(RELOCATION_STATUS_LABELS[request.status])}</span>
                <span className="my-orders__total">
                  {request.quote !== null ? (
                    <strong>{c.money(request.quote)}</strong>
                  ) : (
                    relocationIsOpen(request.status) && <span className="small muted">{c.text("Quote to come", "عرض السعر لاحقاً")}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="form-stack">
        <Link href="/relocation/request" className="button button--secondary">
          {c.text("Start a relocation request", "ابدأ طلب نقل")}
        </Link>
      </div>
    </AuthCard>
  );
}
