"use client";

import type { AdminOrder, AdminPaymentAttempt, AdminRefund } from "@nennus-catio/contracts";
import { type ReactNode, useId, useState } from "react";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminOrderError } from "@/shared/api/admin-orders";
import {
  type Payable,
  type PaymentPanel,
  useCloseMismatch,
  useCompleteRefund,
  useOrderPayments,
  usePayments,
  useReleaseRefund,
  useWithdrawRefund,
} from "@/shared/api/admin-payments";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { ErrorMessage } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { placedAt } from "../lib/admin-order-labels";
import { PAYMENT_STATUS, PAYMENT_TONE, REFUND_STATUS, REFUND_TONE, REFUND_UNCONFIRMED } from "../lib/payment-labels";
import { ConfirmLateDialog, RefundDialog, type ReferenceRequest, ReferenceDialog, type RefundItem, type RefundTarget } from "./PaymentDialogs";

/** A reported amount: QAR as money; another currency as the provider gave it. */
function reportedAmount(amount: number, currency: string, locale: "en" | "ar"): string {
  return currency === "QAR" ? formatMoney(amount, locale) : `${currency} ${(amount / 100).toFixed(2)}`;
}

/**
 * The order's money for staff (8b, plan section 8): the shared payment panel, plus Orders → Edit's
 * "Confirm with a new delivery time" for a late payment.
 */
export function OrderPayments({ order }: { order: AdminOrder }) {
  const c = useCopy();
  const canEdit = useAdminAccess().can("orders", "edit");
  const panel = useOrderPayments(order.reference).data;
  const [confirmingLate, setConfirmingLate] = useState<AdminOrder | null>(null);
  // Each item at what was paid for it after its offers (11e), and the delivery fee.
  const refundItems: RefundItem[] = [
    ...order.lines.map((line) => ({
      key: `${line.product}/${line.variant}`,
      label: `${c.local(line.name)} · ${c.local(line.label)}`,
      quantity: line.quantity,
      paid: line.lineTotal,
    })),
    ...(order.deliveryFee > 0 ? [{ key: "delivery", label: c.text("Delivery fee", "رسوم التوصيل"), quantity: 1, paid: order.deliveryFee }] : []),
  ];
  return (
    <PaymentsPanel
      payable={{ kind: "order", reference: order.reference }}
      module="orders"
      refundItems={refundItems}
      extra={(report) => (
        <>
          {canEdit && panel?.actions.canConfirmLate && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                report("");
                setConfirmingLate(order);
              }}
            >
              {order.fulfilment === "delivery"
                ? c.text("Confirm with a new delivery time", "تأكيد بموعد توصيل جديد")
                : c.text("Confirm the order", "تأكيد الطلب")}
            </button>
          )}
          <ConfirmLateDialog order={confirmingLate} onClose={() => setConfirmingLate(null)} onDone={(message) => report(message)} />
        </>
      )}
    />
  );
}

/**
 * An order's, a booking's or a relocation request's money for staff (8b; bookings 9f; relocation 15d): every payment attempt, every refund,
 * and the actions the panel allows now. The module's Refund permission refunds, completes or
 * withdraws a manual refund, releases an API refund the payment company never answered (8c) and
 * closes a wrong-amount payment. Each action asks first (D128). `extra` adds the caller's own actions.
 */
export function PaymentsPanel({
  payable,
  module,
  refundItems,
  extra,
}: {
  payable: Payable;
  module: "orders" | "bookings" | "relocation";
  /** What was paid for each item (11e): the refund dialog can fill an amount from it. */
  refundItems?: readonly RefundItem[];
  extra?: (report: (message: string, problem?: boolean) => void, panel: PaymentPanel | undefined) => ReactNode;
}) {
  const c = useCopy();
  const canRefund = useAdminAccess().can(module, "refund");
  const headingId = useId();
  const query = usePayments(payable);
  const complete = useCompleteRefund(payable);
  const withdraw = useWithdrawRefund(payable);
  const release = useReleaseRefund(payable);
  const closeMismatch = useCloseMismatch(payable);
  const [refunding, setRefunding] = useState<RefundTarget | null>(null);
  const [asking, setAsking] = useState<ReferenceRequest | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const panel = query.data;
  const time = (iso: string) => placedAt(iso, c.locale);

  function report(message: string, problem = false) {
    setNotice(problem ? "" : message);
    setError(problem ? message : "");
  }

  function askComplete(refund: AdminRefund) {
    report("");
    setAsking({
      title: c.text(`Mark the refund of ${c.money(refund.amount)} as refunded?`, `تعليم استرداد ${c.money(refund.amount)} كمسترد؟`),
      message:
        refund.status === "processing"
          ? c.text(
              "The payment company did not confirm this refund. Check the SkipCash dashboard first: only if the refund is there, enter its reference. The customer gets a \"refund completed\" email.",
              "لم تؤكد شركة الدفع هذا الاسترداد. راجع لوحة SkipCash أولاً: أدخل المرجع فقط إذا كان الاسترداد موجوداً. يصل العميل بريد \"تم الاسترداد\".",
            )
          : c.text(
              "Only after you have refunded it in the SkipCash dashboard. Enter the dashboard's reference; the customer gets a \"refund completed\" email.",
              "فقط بعد استرداده من لوحة SkipCash. أدخل مرجع اللوحة؛ يصل العميل بريد \"تم الاسترداد\".",
            ),
      confirmLabel: c.text("Mark refunded", "تعليم كمسترد"),
      submit: async (manualReference) => {
        await complete.mutateAsync({ refundId: refund.id, manualReference });
        report(c.text(`The refund of ${c.money(refund.amount)} is recorded as done. The customer gets an email.`, `سُجّل استرداد ${c.money(refund.amount)} كمكتمل. سيصل العميل بريد إلكتروني.`));
      },
    });
  }

  function askWithdraw(refund: AdminRefund) {
    report("");
    setConfirming({
      title: c.text(`Withdraw the refund of ${c.money(refund.amount)}?`, `سحب استرداد ${c.money(refund.amount)}؟`),
      message: c.text(
        "Withdraw only if you have not refunded this in the SkipCash dashboard. The amount can then be refunded again; the customer is not emailed.",
        "اسحب فقط إذا لم تسترد هذا المبلغ من لوحة SkipCash. يمكن بعدها استرداد المبلغ من جديد؛ ولا يُرسل بريد للعميل.",
      ),
      confirmLabel: c.text("Withdraw refund", "سحب الاسترداد"),
      run: async () => {
        try {
          await withdraw.mutateAsync({ refundId: refund.id });
          report(c.text("The refund was withdrawn.", "تم سحب الاسترداد."));
        } catch (err) {
          report(describeAdminOrderError(err, c.text), true);
        }
      },
    });
  }

  function askRelease(refund: AdminRefund) {
    report("");
    setConfirming({
      title: c.text(`Release the refund of ${c.money(refund.amount)}?`, `تحرير استرداد ${c.money(refund.amount)}؟`),
      message: c.text(
        "The payment company never answered this refund. Release it only if it is not in the SkipCash dashboard: it is marked as not refunded and the amount can be refunded again. The customer is not emailed.",
        "لم تُجب شركة الدفع على هذا الاسترداد. حرّره فقط إذا لم يكن في لوحة SkipCash: يُسجَّل كغير مسترد ويمكن استرداد المبلغ من جديد. لا يُرسل بريد للعميل.",
      ),
      confirmLabel: c.text("Release refund", "تحرير الاسترداد"),
      run: async () => {
        try {
          await release.mutateAsync({ refundId: refund.id });
          report(c.text("The refund was released. The amount can be refunded again.", "تم تحرير الاسترداد. يمكن استرداد المبلغ من جديد."));
        } catch (err) {
          report(describeAdminOrderError(err, c.text), true);
        }
      },
    });
  }

  function askClose(attempt: AdminPaymentAttempt) {
    report("");
    const paid = attempt.reported ? reportedAmount(attempt.reported.amount, attempt.reported.currency, c.locale) : c.money(attempt.amount);
    setAsking({
      title: c.text(`Close the wrong-amount payment ${attempt.reference}?`, `إغلاق الدفعة ذات المبلغ الخاطئ ${attempt.reference}؟`),
      message: c.text(
        `First refund the ${paid} the customer actually paid in the SkipCash dashboard, then enter its reference. The payment is closed here and the customer gets a "refund completed" email for ${paid}.`,
        `استرد أولاً مبلغ ${paid} الذي دفعه العميل فعلاً من لوحة SkipCash، ثم أدخل مرجعه. تُغلق الدفعة هنا ويصل العميل بريد "تم الاسترداد" بمبلغ ${paid}.`,
      ),
      confirmLabel: c.text("Close payment", "إغلاق الدفعة"),
      submit: async (manualReference) => {
        await closeMismatch.mutateAsync({ paymentReference: attempt.reference, manualReference });
        report(c.text(`Payment ${attempt.reference} is closed. The customer gets an email.`, `أُغلقت الدفعة ${attempt.reference}. سيصل العميل بريد إلكتروني.`));
      },
    });
  }

  return (
    <section className="orders-detail-card" aria-labelledby={headingId}>
      <div className="orders-detail-heading">
        <h3 id={headingId}>{c.text("Payment", "الدفع")}</h3>
        {panel && (
          <small>
            {panel.actions.refundsBy === "api"
              ? c.text("Refunds go through the payment company", "يتم الاسترداد عبر شركة الدفع")
              : c.text("Refunds are made in the SkipCash dashboard", "يتم الاسترداد من لوحة SkipCash")}
          </small>
        )}
      </div>
      {query.isPending && (
        <p className="muted small" role="status" aria-busy="true">
          {c.text("Loading payments…", "جارٍ تحميل المدفوعات…")}
        </p>
      )}
      {query.isError && !panel && (
        <div className="inline-state" role="alert">
          <p>{describeAdminOrderError(query.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void query.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {panel && (
        <>
          {panel.attempts.length === 0 ? (
            <p className="small muted">{c.text("No payment attempts yet.", "لا توجد محاولات دفع بعد.")}</p>
          ) : (
            <ul className="orders-history" aria-label={c.text("Payment attempts", "محاولات الدفع")}>
              {panel.attempts.map((attempt) => {
                // SkipCash takes one refund at a time per payment: the next waits for this one (8c).
                const refundInProgress =
                  panel.actions.refundsBy === "api" &&
                  panel.refunds.some(
                    (refund) =>
                      refund.paymentReference === attempt.reference &&
                      refund.method === "api" &&
                      (refund.status === "requested" || refund.status === "processing"),
                  );
                const left = panel.actions.refundable.find((entry) => entry.paymentReference === attempt.reference);
                const refundable = refundInProgress ? undefined : left;
                const closable = panel.actions.closableMismatches.includes(attempt.reference);
                return (
                  <li key={attempt.reference}>
                    <strong>
                      <bdi>{attempt.reference}</bdi>
                    </strong>{" "}
                    <span className={`status status--${PAYMENT_TONE[attempt.status]}`}>{c.local(PAYMENT_STATUS[attempt.status])}</span>
                    <p className="small">
                      <bdi>{c.money(attempt.amount)}</bdi>
                      {" · "}
                      <time dateTime={attempt.succeededAt ?? attempt.createdAt}>{time(attempt.succeededAt ?? attempt.createdAt)}</time>
                      {attempt.refunded > 0 &&
                        c.text(` · Refunded or being refunded: ${c.money(attempt.refunded)}`, ` · مسترد أو قيد الاسترداد: ${c.money(attempt.refunded)}`)}
                    </p>
                    {attempt.reported && !attempt.mismatchClosed && (
                      <p className="small form-error">
                        {c.text(
                          `The payment company reported ${reportedAmount(attempt.reported.amount, attempt.reported.currency, c.locale)} (${attempt.reported.state}) instead of ${c.money(attempt.amount)}.`,
                          `أبلغت شركة الدفع عن ${reportedAmount(attempt.reported.amount, attempt.reported.currency, c.locale)} (${attempt.reported.state}) بدلاً من ${c.money(attempt.amount)}.`,
                        )}
                      </p>
                    )}
                    {attempt.mismatchClosed && (
                      <p className="small muted">
                        {c.text("Wrong amount refunded in the dashboard and closed: reference ", "استُرد المبلغ الخاطئ من اللوحة وأُغلق: المرجع ")}
                        <bdi>{attempt.mismatchClosed.reference}</bdi>
                        {attempt.mismatchClosed.by && ` · ${attempt.mismatchClosed.by}`} · {time(attempt.mismatchClosed.at)}
                      </p>
                    )}
                    {canRefund && refundInProgress && left && (
                      <p className="small muted">
                        {c.text(
                          "Refund the rest after the refund in progress finishes (usually within a day).",
                          "استرد الباقي بعد انتهاء الاسترداد الجاري (عادةً خلال يوم).",
                        )}
                      </p>
                    )}
                    {canRefund && (refundable || closable) && (
                      <div className="row">
                        {refundable && (
                          <button
                            type="button"
                            className="button button--secondary"
                            aria-label={c.text(`Refund payment ${attempt.reference}`, `استرداد الدفعة ${attempt.reference}`)}
                            onClick={() => {
                              report("");
                              setRefunding(refundable);
                            }}
                          >
                            {c.text("Refund", "استرداد")}
                          </button>
                        )}
                        {closable && (
                          <button type="button" className="button button--secondary" onClick={() => askClose(attempt)}>
                            {c.text("Close wrong amount", "إغلاق المبلغ الخاطئ")}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {panel.refunds.length > 0 && (
            <>
              <h4>{c.text("Refunds", "المبالغ المستردة")}</h4>
              <ul className="orders-history" aria-label={c.text("Refunds", "المبالغ المستردة")}>
                {panel.refunds.map((refund) => (
                  <li key={refund.id}>
                    <strong>
                      <bdi>{c.money(refund.amount)}</bdi>
                    </strong>{" "}
                    <span className={`status status--${REFUND_TONE[refund.status]}`}>
                      {c.local(refund.status === "processing" && !refund.providerRefundId ? REFUND_UNCONFIRMED : REFUND_STATUS[refund.status])}
                    </span>
                    <p className="small">{refund.reason}</p>
                    <p className="small muted">
                      <bdi>{refund.paymentReference}</bdi>
                      {" · "}
                      {refund.method === "api" ? c.text("Through the payment company", "عبر شركة الدفع") : c.text("In the dashboard", "من اللوحة")}
                      {" · "}
                      {c.text(`Asked by ${refund.requestedBy ?? "staff"}`, `طلبه ${refund.requestedBy ?? "الموظفون"}`)}, {time(refund.createdAt)}
                      {refund.completedAt &&
                        c.text(
                          ` · Done${refund.completedBy ? ` by ${refund.completedBy}` : ""}, ${time(refund.completedAt)}`,
                          ` · اكتمل${refund.completedBy ? ` بواسطة ${refund.completedBy}` : ""}، ${time(refund.completedAt)}`,
                        )}
                      {(refund.manualReference ?? refund.providerRefundId) && (
                        <>
                          {c.text(" · Reference ", " · المرجع ")}
                          <bdi>{refund.manualReference ?? refund.providerRefundId}</bdi>
                        </>
                      )}
                    </p>
                    {refund.method === "api" && refund.status === "processing" && refund.providerRefundId && (
                      <p className="small muted">
                        {c.text(
                          "The payment company is finishing this refund. SkipCash usually completes refunds within a day; this updates by itself.",
                          "تُنهي شركة الدفع هذا الاسترداد. عادةً ما تُكمل SkipCash الاسترداد خلال يوم؛ ويتحدّث هذا تلقائياً.",
                        )}
                      </p>
                    )}
                    {canRefund && (refund.status === "pending_manual" || refund.status === "processing") && (
                      <div className="row">
                        <button type="button" className="button button--secondary" onClick={() => askComplete(refund)}>
                          {c.text("Mark refunded", "تعليم كمسترد")}
                        </button>
                        {refund.status === "pending_manual" && (
                          <button type="button" className="text-button" onClick={() => askWithdraw(refund)}>
                            {c.text("Withdraw", "سحب")}
                          </button>
                        )}
                        {refund.method === "api" && refund.status === "processing" && !refund.providerRefundId && (
                          <button type="button" className="text-button" onClick={() => askRelease(refund)}>
                            {c.text("Not refunded — release", "غير مسترد — تحرير")}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {extra?.(report, panel)}
      <ErrorMessage message={error} />
      <p role="status" className="small">
        {notice}
      </p>
      {panel && (
        <RefundDialog
          payable={payable}
          target={refunding}
          refundsBy={panel.actions.refundsBy}
          items={refundItems}
          onClose={() => setRefunding(null)}
          onDone={report}
        />
      )}
      <ReferenceDialog request={asking} onClose={() => setAsking(null)} />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
