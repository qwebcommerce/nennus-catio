"use client";

import type { AdminOrder, RefundMethod } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { describeAdminOrderError, useOrderDeliveryWindows } from "@/shared/api/admin-orders";
import { type Payable, useConfirmLatePayment, useRefund } from "@/shared/api/admin-payments";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { parseQar, qarInput } from "../lib/payment-labels";
import { NumberInput } from "@/shared/ui/NumberInput";
import { SlotPicker, windowsByDay } from "@/shared/ui/SlotPicker";

/**
 * The staff payment dialogs (8b). Each one is the "Are you sure?" (D128): it says what will happen
 * and sends nothing until its red button, like the staff cancel dialog.
 */

export interface RefundTarget {
  paymentReference: string;
  maxAmount: number;
}

/**
 * An item and what was paid for it after its offers (11e, answer 9A), so staff can refund an item at
 * its discounted price, never its full price. `quantity` above 1 also offers one of them.
 */
export interface RefundItem {
  key: string;
  label: string;
  quantity: number;
  paid: number;
}

/** Refund part or all of a payment (D137, D139): through the payment company, or recorded for its dashboard (D76). */
export function RefundDialog({
  payable,
  target,
  refundsBy,
  items = [],
  onClose,
  onDone,
}: {
  payable: Payable;
  target: RefundTarget | null;
  refundsBy: RefundMethod;
  /** The order's items or the booking's package, with what was paid for each (11e). */
  items?: readonly RefundItem[];
  onClose: () => void;
  /** What happened, for the panel; `problem` when the payment company refused or did not answer. */
  onDone: (message: string, problem: boolean) => void;
}) {
  return target ? (
    <RefundForm key={target.paymentReference} payable={payable} target={target} refundsBy={refundsBy} items={items} onClose={onClose} onDone={onDone} />
  ) : null;
}

function RefundForm({
  payable,
  target,
  refundsBy,
  items,
  onClose,
  onDone,
}: {
  payable: Payable;
  target: RefundTarget;
  refundsBy: RefundMethod;
  items: readonly RefundItem[];
  onClose: () => void;
  onDone: (message: string, problem: boolean) => void;
}) {
  const c = useCopy();
  const refund = useRefund(payable);
  const [amountText, setAmountText] = useState(qarInput(target.maxAmount));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const amount = parseQar(amountText);
  const fits = amount !== null && amount > 0 && amount <= target.maxAmount;
  // One of several: the line's paid amount shared evenly, rounded down, so it is never above what was paid.
  const fills = items.flatMap((item) => [
    ...(item.quantity > 1
      ? [{ key: `${item.key}-one`, label: c.text(`One ${item.label}`, `واحد من ${item.label}`), paid: Math.floor(item.paid / item.quantity) }]
      : []),
    { key: item.key, label: item.quantity > 1 ? `${item.label} × ${item.quantity}` : item.label, paid: item.paid },
  ]);
  const fill = (paid: number) => {
    setAmountText(qarInput(Math.min(paid, target.maxAmount)));
    setError("");
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === null || amount <= 0) {
      setError(c.text("Enter an amount such as 25.00.", "أدخل مبلغاً مثل 25.00."));
      return;
    }
    if (amount > target.maxAmount) {
      setError(c.text(`At most ${c.money(target.maxAmount)} of this payment can still be refunded.`, `يمكن استرداد ${c.money(target.maxAmount)} كحد أقصى من هذه الدفعة.`));
      return;
    }
    if (!reason.trim()) {
      setError(c.text("Please give a reason.", "يرجى كتابة السبب."));
      return;
    }
    try {
      await refund.mutateAsync({ paymentReference: target.paymentReference, amount, reason: reason.trim() });
      onDone(
        refundsBy === "api"
          ? c.text(`Refund of ${c.money(amount)} sent to the payment company. Its status is shown below.`, `أُرسل استرداد ${c.money(amount)} إلى شركة الدفع. تظهر حالته أدناه.`)
          : c.text(
              `Refund of ${c.money(amount)} recorded. Refund it in the SkipCash dashboard, then mark it refunded here.`,
              `سُجّل استرداد ${c.money(amount)}. استرده من لوحة SkipCash، ثم علّمه كمسترد هنا.`,
            ),
        false,
      );
      onClose();
    } catch (err) {
      // Refused (nothing refunded) or no answer (kept processing): the panel shows which.
      if (err instanceof ApiError && err.code === "REFUND_FAILED") {
        onDone(describeAdminOrderError(err, c.text), true);
        onClose();
        return;
      }
      setError(describeAdminOrderError(err, c.text));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !refund.isPending && onClose()}
      title={c.text(`Refund payment ${target.paymentReference}?`, `استرداد الدفعة ${target.paymentReference}؟`)}
      description={
        refundsBy === "api"
          ? c.text(
              "The money goes back to the customer through the payment company, and the customer gets an email when it is done. This cannot be undone.",
              "يعود المبلغ إلى العميل عبر شركة الدفع، ويصله بريد إلكتروني عند إتمام ذلك. لا يمكن التراجع عن ذلك.",
            )
          : c.text(
              "The payment company refunds only in its dashboard. This records the refund and holds the amount: refund it in the SkipCash dashboard, then mark it refunded here with the dashboard's reference.",
              "تسترد شركة الدفع المبالغ من لوحتها فقط. يسجّل هذا الاسترداد ويحجز المبلغ: استرده من لوحة SkipCash، ثم علّمه كمسترد هنا بمرجع اللوحة.",
            )
      }
    >
      <form className="form-stack" onSubmit={submit}>
        {fills.length > 0 && (
          <fieldset className="refund-fill">
            <legend>{c.text("Fill in what was paid for (after offers)", "املأ المبلغ المدفوع (بعد العروض)")}</legend>
            <div>
              {fills.map((entry) => (
                <button type="button" key={entry.key} className="button button--secondary" disabled={entry.paid <= 0} onClick={() => fill(entry.paid)}>
                  {entry.label} · {c.money(entry.paid)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label={c.text(`Amount in QAR (up to ${qarInput(target.maxAmount)})`, `المبلغ بالريال (حتى ${qarInput(target.maxAmount)})`)}>
          <NumberInput kind="decimal" autoComplete="off" aria-required="true" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label={c.text("Reason (staff only; the customer does not see it)", "السبب (للموظفين فقط؛ لا يراه العميل)")}>
          <textarea aria-required="true" maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={refund.isPending} onClick={onClose}>
            {c.text("Cancel", "إلغاء")}
          </button>
          <button type="submit" className="button button--danger" disabled={refund.isPending}>
            {fits
              ? refundsBy === "api"
                ? c.text(`Refund ${c.money(amount)}`, `استرداد ${c.money(amount)}`)
                : c.text(`Record refund of ${c.money(amount)}`, `تسجيل استرداد ${c.money(amount)}`)
              : c.text("Refund", "استرداد")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** What a reference dialog asks for, and what it does with the answer (it throws to show an error). */
export interface ReferenceRequest {
  title: string;
  message: string;
  confirmLabel: string;
  submit: (manualReference: string) => Promise<void>;
}

/** Marking a refund done in the dashboard, or closing a wrong-amount payment: both need the dashboard's reference. */
export function ReferenceDialog({ request, onClose }: { request: ReferenceRequest | null; onClose: () => void }) {
  return request ? <ReferenceForm key={request.title} request={request} onClose={onClose} /> : null;
}

function ReferenceForm({ request, onClose }: { request: ReferenceRequest; onClose: () => void }) {
  const c = useCopy();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setError(c.text("Enter the reference from the SkipCash dashboard.", "أدخل المرجع من لوحة SkipCash."));
      return;
    }
    setPending(true);
    try {
      await request.submit(value.trim());
      onClose();
    } catch (err) {
      setError(describeAdminOrderError(err, c.text));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => !open && !pending && onClose()} title={request.title} description={request.message}>
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("SkipCash dashboard reference", "مرجع لوحة SkipCash")}>
          <input autoComplete="off" aria-required="true" maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={pending} onClick={onClose}>
            {c.text("Cancel", "إلغاء")}
          </button>
          <button type="submit" className="button button--danger" disabled={pending}>
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * "Confirm with a new delivery time" (plan section 13; D136, D153): a delivery order needs a new
 * window, a pickup order stays pickup. Items gone means refund instead.
 */
export function ConfirmLateDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return order ? <ConfirmLateForm key={`${order.reference}-${order.version}`} order={order} onClose={onClose} onDone={onDone} /> : null;
}

function ConfirmLateForm({ order, onClose, onDone }: { order: AdminOrder; onClose: () => void; onDone: (message: string) => void }) {
  const c = useCopy();
  const delivery = order.fulfilment === "delivery";
  // The staff list for this order (#14): further ahead when it has a Pet House, its old time again if free.
  const windows = useOrderDeliveryWindows(order.reference, delivery);
  const confirm = useConfirmLatePayment();
  const [windowId, setWindowId] = useState("");
  const [error, setError] = useState("");
  const slots = windowsByDay(windows.data ?? [], (window) => c.text(`${window.seatsLeft} left`, `المتبقي ${window.seatsLeft}`));
  const chosen = windows.data?.find((window) => window.id === windowId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (delivery && !windowId) {
      setError(c.text("Choose a new delivery time.", "اختر موعد توصيل جديداً."));
      return;
    }
    try {
      const saved = await confirm.mutateAsync({ order, windowId: delivery ? windowId : null });
      onDone(c.text(`Order ${saved.reference} is confirmed. The customer gets an email.`, `تم تأكيد الطلب ${saved.reference}. سيصل العميل بريد إلكتروني.`));
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "SLOT_UNAVAILABLE"
          ? c.text("That delivery time has just filled up or closed. Choose another.", "امتلأ موعد التوصيل هذا أو أُغلق للتو. اختر موعداً آخر.")
          : describeAdminOrderError(err, c.text),
      );
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !confirm.isPending && onClose()}
      title={c.text(`Confirm order ${order.reference}?`, `تأكيد الطلب ${order.reference}؟`)}
      description={
        delivery
          ? c.text(
              "The items are taken from stock again and the order becomes Confirmed with the new delivery time. The customer gets an \"order confirmed\" email. If an item is no longer available, refund the payment instead.",
              "تُؤخذ المنتجات من المخزون مرة أخرى ويصبح الطلب مؤكداً بموعد التوصيل الجديد. يصل العميل بريد \"تم تأكيد الطلب\". إذا لم يعد منتج متوفراً، استرد الدفعة بدلاً من ذلك.",
            )
          : c.text(
              "The items are taken from stock again and the order becomes Confirmed for pickup. The customer gets an \"order confirmed\" email. If an item is no longer available, refund the payment instead.",
              "تُؤخذ المنتجات من المخزون مرة أخرى ويصبح الطلب مؤكداً للاستلام. يصل العميل بريد \"تم تأكيد الطلب\". إذا لم يعد منتج متوفراً، استرد الدفعة بدلاً من ذلك.",
            )
      }
    >
      <form className="form-stack" onSubmit={submit}>
        {delivery && (
          // The shared date and time picker (D249); staff keep 24-hour times.
          <div className="slot-field">
            <h3>{c.text("New delivery time (Qatar)", "موعد التوصيل الجديد (قطر)")}</h3>
            {windows.isPending && (
              <p className="small muted" role="status">
                {c.text("Loading times…", "جارٍ تحميل المواعيد…")}
              </p>
            )}
            {slots && (
              <SlotPicker
                days={slots.days}
                from={slots.from}
                to={slots.to}
                value={chosen ? { date: chosen.date, slotId: chosen.id } : null}
                onChange={(picked) => {
                  setWindowId(picked?.slot.id ?? "");
                  setError("");
                }}
                clock="24h"
                show="range"
                summaryLabel={c.text("New delivery time", "موعد التوصيل الجديد")}
              />
            )}
          </div>
        )}
        {delivery && windows.isSuccess && windows.data.length === 0 && (
          <p className="small muted">
            {c.text("There are no delivery times open now. Add one under Delivery, or refund the payment.", "لا توجد مواعيد توصيل متاحة الآن. أضف موعداً من التوصيل، أو استرد الدفعة.")}
          </p>
        )}
        <ErrorMessage message={error} />
        <div className="row confirm-actions">
          <button type="button" className="button button--secondary" disabled={confirm.isPending} onClick={onClose}>
            {c.text("Cancel", "إلغاء")}
          </button>
          <button type="submit" className="button button--danger" disabled={confirm.isPending}>
            {c.text("Confirm the order", "تأكيد الطلب")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
