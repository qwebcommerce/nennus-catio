"use client";

import type { FakeGatewayState } from "@nennus-catio/contracts";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/shared/api/client";
import { type FakePaymentAction, paymentNavigation, returnPath, useFakePayment, usePressFakePayment } from "@/shared/api/payments";
import { useCopy } from "@/shared/lib/copy";
import { Empty } from "@/shared/ui/BusinessUI";

const SETTLED: Readonly<Record<Exclude<FakeGatewayState, "open">, { en: string; ar: string }>> = {
  succeeded: { en: "This test payment is already paid.", ar: "هذه الدفعة التجريبية مدفوعة بالفعل." },
  failed: { en: "This test payment has already failed.", ar: "هذه الدفعة التجريبية فشلت بالفعل." },
  cancelled: { en: "This test payment was already cancelled.", ar: "هذه الدفعة التجريبية أُلغيت بالفعل." },
};

/**
 * The fake payment company's page (8b; development only, never in production builds): it stands
 * in for SkipCash's page until 8c. Its buttons settle the payment at the fake company, which then
 * notifies our webhook (except "notification lost", which the lookup job finds), and send the
 * customer back to the order page as a real provider would.
 */
export function FakePaymentPage({ id }: { id: string }) {
  const c = useCopy();
  const payment = useFakePayment(id);
  const press = usePressFakePayment(id);
  const [leaving, setLeaving] = useState(false);

  function goBack(returnUrl: string) {
    const path = returnPath(returnUrl);
    if (!path) return;
    setLeaving(true);
    paymentNavigation.go(path);
  }

  function choose(action: FakePaymentAction) {
    press.mutate(action, { onSuccess: (settled) => goBack(settled.returnUrl) });
  }

  if (payment.isPending) {
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading the test payment…", "جارٍ تحميل الدفعة التجريبية…")}
        </p>
      </div>
    );
  }
  if (payment.isError) {
    const missing = payment.error instanceof ApiError && payment.error.code === "NOT_FOUND";
    return (
      <Empty>
        {missing
          ? c.text(
              "This test payment does not exist. Test payments live in the API's memory, so they disappear when it restarts: go back to the order and press Pay again.",
              "هذه الدفعة التجريبية غير موجودة. تُحفظ الدفعات التجريبية في ذاكرة الخادم فتختفي عند إعادة تشغيله: ارجع إلى الطلب واضغط ادفع مرة أخرى.",
            )
          : c.text("The test payment could not be loaded. Please try again.", "تعذّر تحميل الدفعة التجريبية. يرجى المحاولة مرة أخرى.")}
        {!missing && (
          <button type="button" className="button button--secondary" onClick={() => void payment.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        )}
      </Empty>
    );
  }

  const data = payment.data;
  const busy = press.isPending || leaving;
  const amount = c.money(data.amount);
  return (
    <div className="customer-page">
      <section className="confirmation panel order-page" aria-labelledby="fake-payment-title">
        <CreditCard size={40} />
        <p className="small muted">{c.text("Test payment page", "صفحة دفع تجريبية")}</p>
        <h1 id="fake-payment-title">{c.text(`Pay ${amount}`, `ادفع ${amount}`)}</h1>
        <p className="reference">
          <bdi>{data.reference}</bdi>
        </p>
        <p className="note-box">
          {c.text(
            "Development only. This page stands in for SkipCash until it is connected: no card is asked for and no money moves.",
            "للتطوير فقط. تحل هذه الصفحة محل SkipCash حتى يتم ربطه: لا تُطلب بطاقة ولا تُنقل أي أموال.",
          )}
        </p>
        {data.state === "open" ? (
          <div className="form-stack">
            <button type="button" className="button button--primary" disabled={busy} onClick={() => choose("pay")}>
              {c.text(`Pay ${amount}`, `ادفع ${amount}`)}
            </button>
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => choose("fail")}>
              {c.text("Payment fails", "فشل الدفع")}
            </button>
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => choose("pay-without-webhook")}>
              {c.text("Pay, but the notification is lost", "ادفع مع فقدان الإشعار")}
            </button>
            <p className="small muted">
              {c.text(
                "Tests the lookup job: the shop is not told, so it asks the payment company itself and confirms the order within about 3 minutes.",
                "لاختبار مهمة التحقق: لا يصل إشعار للمتجر، فيسأل شركة الدفع بنفسه ويؤكد الطلب خلال ٣ دقائق تقريباً.",
              )}
            </p>
            <button type="button" className="text-button" disabled={busy} onClick={() => choose("cancel")}>
              {c.text("Cancel and go back", "إلغاء والعودة")}
            </button>
          </div>
        ) : (
          <div className="form-stack">
            <p>{c.local(SETTLED[data.state])}</p>
            <button type="button" className="button button--secondary" disabled={leaving} onClick={() => goBack(data.returnUrl)}>
              {c.text("Back to the order", "العودة إلى الطلب")}
            </button>
          </div>
        )}
        {press.isError && (
          <p className="form-error" role="alert">
            {press.error instanceof ApiError && press.error.code === "CONFLICT"
              ? c.text("This test payment was already settled. Reload the page.", "سبق إنهاء هذه الدفعة التجريبية. أعد تحميل الصفحة.")
              : c.text("That did not work. Please try again.", "لم تنجح العملية. يرجى المحاولة مرة أخرى.")}
          </p>
        )}
      </section>
    </div>
  );
}
