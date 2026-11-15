"use client";

import { RELOCATION_LIMITS, relocationIsOpen } from "@nennus-catio/contracts";
import type { ReactNode } from "react";
import { AuthCard } from "@/features/account/components/AuthForm";
import { Link } from "@/i18n/navigation";
import { relocationErrorMessage, useMyRelocationRequests, useRelocationOptions } from "@/shared/api/relocation";
import { errorMessage, useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { Button } from "@/shared/ui/Button";
import { RelocationRequestForm } from "../components/RelocationRequestForm";

/**
 * `/relocation/request` (15c): the relocation form for a logged-in customer (an account is required,
 * D279 answer 1). A visitor is asked to log in and comes back here; a customer with the most open
 * requests (3) is told so before filling anything in.
 */
export function RelocationRequestPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const options = useRelocationOptions(Boolean(customer));
  const mine = useMyRelocationRequests(Boolean(customer));
  const title = c.text("Start a relocation request", "ابدأ طلب نقل");

  const card = (children: ReactNode, intro?: string) => (
    <AuthCard title={title} intro={intro}>
      {children}
    </AuthCard>
  );

  const loading = card(
    <p role="status" aria-busy="true" className="muted">
      {c.text("Loading…", "جارٍ التحميل…")}
    </p>,
  );
  if (session.isPending) return loading;
  if (session.isError) {
    return card(
      <div className="form-error" role="alert">
        <p>{errorMessage(session.error, c.text)}</p>
        <Button variant="secondary" onClick={() => void session.refetch()}>
          {c.text("Retry", "أعد المحاولة")}
        </Button>
      </div>,
    );
  }
  if (!customer) {
    return card(
      <div className="form-stack">
        <Link href={customerLoginHref("/relocation/request")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
        <Link href="/account/register" className="button button--secondary">
          {c.text("Create an account", "أنشئ حساباً")}
        </Link>
      </div>,
      c.text(
        "Relocation requests and their documents stay private to your account. Log in, or create an account with your email.",
        "تبقى طلبات النقل ومستنداتها خاصة بحسابك. سجّل الدخول، أو أنشئ حساباً ببريدك.",
      ),
    );
  }
  if (options.isError || mine.isError) {
    return card(
      <div className="form-error" role="alert">
        <p>{relocationErrorMessage(options.error ?? mine.error, c.text)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void options.refetch();
            void mine.refetch();
          }}
        >
          {c.text("Retry", "أعد المحاولة")}
        </Button>
      </div>,
    );
  }
  if (!options.data || !mine.data) return loading;
  const open = mine.data.filter((request) => relocationIsOpen(request.status)).length;
  if (open >= RELOCATION_LIMITS.maxOpenPerCustomer) {
    return card(
      <div className="form-stack">
        <p className="note-box">
          {c.text(
            `You already have ${RELOCATION_LIMITS.maxOpenPerCustomer} open relocation requests. Cancel one, or wait until one is completed, to start another.`,
            `لديك بالفعل ${RELOCATION_LIMITS.maxOpenPerCustomer} طلبات نقل مفتوحة. ألغِ أحدها، أو انتظر حتى يكتمل أحدها، لبدء طلب آخر.`,
          )}
        </p>
        <Link href="/account/relocation" className="button button--primary">
          {c.text("My relocation requests", "طلبات النقل")}
        </Link>
      </div>,
    );
  }
  return (
    <div className="ref-relocation relocation-request">
      <RelocationRequestForm customer={customer} options={options.data} />
    </div>
  );
}
