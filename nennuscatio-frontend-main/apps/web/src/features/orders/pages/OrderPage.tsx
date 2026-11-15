"use client";

import type { CustomerOrder, PaymentAttention } from "@nennus-catio/contracts";
import { CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { DiscountRows } from "@/features/checkout/components/DiscountRows";
import { OfferPrice } from "@/features/shop/components/OfferPrice";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/client";
import {
  ORDER_STATUS_LABELS,
  orderErrorMessage,
  readGuestKey,
  useDeliveryOptions,
  useOrder,
  useOrderAction,
} from "@/shared/api/orders";
import { usePayNow } from "@/shared/api/payments";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { formatClockRange, formatQatarDay } from "@/shared/lib/format";
import {
  CHECK_FAST_MS,
  CHECK_PATIENCE_MS,
  CHECK_SLOW_MS,
  checkingPayment,
  DID_NOT_GO_THROUGH,
  minutesLeft,
  OPEN_PAYMENT as OPEN,
} from "@/shared/lib/payment-check";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Empty } from "@/shared/ui/BusinessUI";
import { PinLink } from "@/shared/ui/ShareLocation";

/** What happens next when staff must handle a payment we received (D136, D146, D152). */
const ATTENTION_MESSAGE: Readonly<Record<PaymentAttention, { en: string; ar: string }>> = {
  paid_after_expiry: {
    en: "We received your payment, but your items or delivery time were no longer free. We will contact you to arrange another time or refund you.",
    ar: "استلمنا دفعتك، لكن المنتجات أو موعد التوصيل لم تعد متاحة. سنتواصل معك لترتيب موعد آخر أو لإعادة المبلغ.",
  },
  paid_after_cancel: {
    en: "We received your payment after this order was cancelled. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعتك بعد إلغاء هذا الطلب. سنعيد المبلغ ونخبرك عند إتمام ذلك.",
  },
  duplicate_payment: {
    en: "We received more than one payment for this order. We will refund the extra payment and let you know when it is done.",
    ar: "استلمنا أكثر من دفعة لهذا الطلب. سنعيد الدفعة الزائدة ونخبرك عند إتمام ذلك.",
  },
  amount_mismatch: {
    en: "We received a payment for this order with a different amount than expected. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعة لهذا الطلب بمبلغ مختلف عن المتوقع. سنعيدها ونخبرك عند إتمام ذلك.",
  },
};

/**
 * One order (7b-2, 8b): `/orders/<reference>` for the logged-in owner, `…#k=<key>` for guests (the
 * link in the order emails). Shows status, items, totals and delivery details; unpaid orders count
 * down and offer Pay now, Continue to payment or Pay again (D138, D147); back from the payment page
 * (`?payment=`) it checks the payment until our side knows the result; cancellation until preparing
 * starts (D119), saying a payment already made is refunded (D146).
 */
export function OrderPage({ reference }: { reference: string }) {
  const c = useCopy();
  // undefined until the address has been read in the browser (the key never reaches the server).
  const [guestKey, setGuestKey] = useState<string | null | undefined>(undefined);
  // The payment being checked: from `?payment=` on the way back, or when Pay now says it is in progress.
  const [watching, setWatching] = useState<string | null>(null);
  const [checkingSince, setCheckingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setGuestKey(readGuestKey(reference));
    setWatching(new URLSearchParams(window.location.search).get("payment"));
  }, [reference]);
  const patient = checkingSince !== null && now - checkingSince >= CHECK_PATIENCE_MS;
  const order = useOrder(reference, guestKey ?? null, guestKey !== undefined, (current) =>
    current && checkingPayment(current, watching) ? (patient ? CHECK_SLOW_MS : CHECK_FAST_MS) : false,
  );
  const options = useDeliveryOptions();
  const cancel = useOrderAction(reference, guestKey ?? null, "cancel");
  const pay = usePayNow(reference, guestKey ?? null);
  const [confirming, setConfirming] = useState(false);
  const waiting = order.data?.status === "awaiting_payment";
  const checking = order.data ? checkingPayment(order.data, watching) : false;
  // Counted from the later of the last tick and the moment the order arrived, never from before it.
  const timeLeft = order.data ? minutesLeft(order.data.holdExpiresAt, Math.max(now, order.dataUpdatedAt)) : 0;
  const ranOut = waiting && timeLeft <= 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [waiting]);
  useEffect(() => {
    setCheckingSince((since) => (checking ? (since ?? Date.now()) : null));
  }, [checking]);
  const { refetch } = order;
  useEffect(() => {
    // Ask again once the time is up instead of waiting for the server's next expiry run.
    if (ranOut) void refetch();
  }, [ranOut, refetch]);

  if (guestKey === undefined || order.isPending) {
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading your order…", "جارٍ تحميل طلبك…")}
        </p>
      </div>
    );
  }
  if (order.isError) {
    const error = order.error;
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      return (
        <Empty>
          {c.text("Log in to see this order.", "سجّل الدخول لعرض هذا الطلب.")}
          <ActionLink href={customerLoginHref(`/orders/${reference}`)}>{c.text("Log in", "تسجيل الدخول")}</ActionLink>
        </Empty>
      );
    }
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return (
        <Empty>
          {c.text(
            "We could not find this order. Please open the link in your order email, or log in if you ordered with your account.",
            "لم نعثر على هذا الطلب. افتح الرابط في بريد الطلب، أو سجّل الدخول إذا طلبت بحسابك.",
          )}
          <ActionLink href="/account/orders">{c.text("My orders", "طلباتي")}</ActionLink>
        </Empty>
      );
    }
    return (
      <Empty>
        {orderErrorMessage(error, c.text)}
        <button type="button" className="button button--secondary" onClick={() => void order.refetch()}>
          {c.text("Retry", "أعد المحاولة")}
        </button>
      </Empty>
    );
  }

  const data = order.data;
  const status = ORDER_STATUS_LABELS[data.status];
  const { latest, attention } = data.payment;
  const paymentOpen = latest !== null && OPEN.includes(latest.status);
  const didNotGoThrough = waiting && latest !== null && DID_NOT_GO_THROUGH.includes(latest.status);
  const actionError = cancel.error ?? pay.error;
  const heading =
    data.status === "awaiting_payment"
      ? checking
        ? c.text("Checking your payment", "نتحقق من دفعتك")
        : c.text("Your order is waiting for payment", "طلبك بانتظار الدفع")
      : data.status === "cancelled"
        ? c.text("This order is cancelled", "تم إلغاء هذا الطلب")
        : data.status === "expired"
          ? attention === "paid_after_expiry"
            ? c.text("We received your payment", "استلمنا دفعتك")
            : c.text("This order was not paid in time", "لم يُدفع هذا الطلب في الوقت المحدد")
          : c.text("Thank you, your order is confirmed", "شكراً، تم تأكيد طلبك");

  function startPayment() {
    pay.mutate(undefined, {
      onError: (error) => {
        // Paid at the provider already, or the order changed meanwhile: show what the server knows now.
        if (error instanceof ApiError && error.code === "PAYMENT_IN_PROGRESS" && latest) setWatching(latest.reference);
        void order.refetch();
      },
    });
  }

  // A cancelled order shows the refund; otherwise a payment staff must handle says what happens next.
  const refundLine =
    data.status === "cancelled" && data.refundNeeded
      ? attention === "paid_after_cancel"
        ? c.local(ATTENTION_MESSAGE.paid_after_cancel)
        : c.text("We will refund your payment and let you know when it is done.", "سنعيد المبلغ المدفوع ونخبرك عند إتمام ذلك.")
      : null;
  const attentionLine = refundLine === null && attention ? c.local(ATTENTION_MESSAGE[attention]) : null;

  return (
    <div className="customer-page">
      <section className="confirmation panel order-page">
        {data.status === "awaiting_payment" ? <Clock size={40} /> : <CheckCircle2 size={40} />}
        <h1>{heading}</h1>
        <p className="reference">
          <bdi>{data.reference}</bdi>
        </p>
        <p className={`status status--${data.status}`}>{c.local(status)}</p>

        {checking && (
          <div className="note-box" role="status" aria-busy="true">
            {patient
              ? c.text(
                  "We have not heard back from the payment company yet. If you paid, your order is confirmed within a few minutes and we email you. You can leave this page.",
                  "لم يصلنا رد شركة الدفع بعد. إذا دفعت، يُؤكَّد طلبك خلال دقائق ونرسل لك بريداً. يمكنك مغادرة هذه الصفحة.",
                )
              : c.text("Checking your payment… This takes a few seconds.", "نتحقق من دفعتك… يستغرق ذلك بضع ثوانٍ.")}
          </div>
        )}
        {waiting && !checking && (
          <div className="note-box" role="status">
            {ranOut
              ? c.text(
                  "The time to pay has run out, so the items and delivery time were released. Please place the order again.",
                  "انتهى وقت الدفع، فأُعيدت المنتجات وموعد التوصيل. يرجى إرسال الطلب مرة أخرى.",
                )
              : c.text(
                  `Please pay within ${timeLeft} minute${timeLeft === 1 ? "" : "s"}. Until then your items and delivery time are held for you.`,
                  `يرجى الدفع خلال ${timeLeft} دقيقة. حتى ذلك الحين نحجز لك المنتجات وموعد التوصيل.`,
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
          <PayActions
            order={data}
            open={paymentOpen}
            retry={didNotGoThrough}
            busy={pay.isPending || pay.isSuccess}
            onPay={startPayment}
          />
        )}
        {(refundLine ?? attentionLine) && <p className="note-box">{refundLine ?? attentionLine}</p>}

        {/* A made-to-order Pet House (#14): while staff prepare the order, it is being made. */}
        {data.status === "preparing" && data.lines.some((line) => line.house?.madeToOrder) && (
          <p className="note-box">{c.text("Your Pet House is being made.", "يجري صنع بيت الحيوان الخاص بك.")}</p>
        )}

        <div className="order-lines">
          {data.lines.map((line) => (
            <div className="row spread" key={`${line.product}/${line.variant}`}>
              <span>
                {c.local(line.name)} · {c.local(line.label)} × {line.quantity}
                {/* The order's own copy of the house's estimate (#14). */}
                {line.house && (
                  <span className="house-line-note">
                    {line.house.madeToOrder
                      ? c.text(
                          `Pet House · made to order, ready in about ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} days`,
                          `بيت حيوان · يُصنع عند الطلب، جاهز خلال ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} يوماً تقريباً`,
                        )
                      : c.text(
                          `Pet House · ready in about ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} days`,
                          `بيت حيوان · جاهز خلال ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} يوماً تقريباً`,
                        )}
                  </span>
                )}
              </span>
              <OfferPrice price={line.unitPrice * line.quantity} salePrice={line.lineTotal} />
            </div>
          ))}
          <div className="row spread">
            <span>{c.text("Subtotal", "المجموع الفرعي")}</span>
            <strong>{c.money(data.subtotal)}</strong>
          </div>
          {/* The order's own copy of its promotions (D203): later edits never change it. */}
          <DiscountRows promotions={data.promotions} />
          <div className="row spread">
            <span>{c.text("Delivery", "التوصيل")}</span>
            <strong>
              {data.deliveryFee - data.houseDeliveryFee === 0 ? c.text("Free", "مجاني") : c.money(data.deliveryFee - data.houseDeliveryFee)}
            </strong>
          </div>
          {data.houseDeliveryFee > 0 && (
            <div className="row spread">
              <span>{c.text("Pet House delivery", "توصيل بيوت الحيوانات")}</span>
              <strong>{c.money(data.houseDeliveryFee)}</strong>
            </div>
          )}
          <div className="row spread order-total">
            <span>{c.text("Total", "الإجمالي")}</span>
            <strong>{c.money(data.total)}</strong>
          </div>
        </div>

        {data.delivery ? (
          <div className="order-details">
            <h2>{c.text("Delivery", "التوصيل")}</h2>
            <p>
              {formatQatarDay(data.delivery.window.date, c.locale)} ·{" "}
              <bdi>{formatClockRange(data.delivery.window.start, data.delivery.window.end, c.locale)}</bdi>{" "}
              {c.text("(Qatar time)", "(بتوقيت قطر)")}
            </p>
            <p>
              {c.local(data.delivery.area)} ·{" "}
              {c.text(
                `Zone ${data.delivery.address.zone}, Street ${data.delivery.address.street}, Building ${data.delivery.address.building}`,
                `المنطقة ${data.delivery.address.zone}، الشارع ${data.delivery.address.street}، المبنى ${data.delivery.address.building}`,
              )}
              {data.delivery.address.floor && ` · ${c.text("Floor", "الطابق")} ${data.delivery.address.floor}`}
              {data.delivery.address.flat && ` · ${c.text("Flat", "الشقة")} ${data.delivery.address.flat}`}
            </p>
            {data.delivery.address.landmark && <p>{data.delivery.address.landmark}</p>}
            {data.delivery.address.note && (
              <p className="small muted">
                {c.text("Note for the driver:", "ملاحظة للسائق:")} {data.delivery.address.note}
              </p>
            )}
            {data.delivery.address.pin && (
              <p className="small">
                <PinLink pin={data.delivery.address.pin}>{c.text("Location shared · View on Google Maps", "تمت مشاركة الموقع · اعرضه على خرائط Google")}</PinLink>
              </p>
            )}
          </div>
        ) : (
          <div className="order-details">
            <h2>{c.text("Pick up from the shop", "الاستلام من المتجر")}</h2>
            <p>
              {(options.data && c.local(options.data.pickup.instructions)) ||
                c.text("We will email you when your order is ready.", "سنرسل لك بريداً عندما يصبح طلبك جاهزاً.")}
            </p>
          </div>
        )}

        {actionError && (
          <p className="form-error" role="alert">
            {orderErrorMessage(actionError, c.text)}
          </p>
        )}
        {data.canCancel &&
          !ranOut &&
          (confirming ? (
            <div className="form-stack">
              <p>
                {c.text("Cancel this order?", "هل تريد إلغاء هذا الطلب؟")}
                {paymentOpen && c.text(" If you already paid, we will refund you.", " إذا كنت قد دفعت بالفعل، فسنعيد لك المبلغ.")}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
                >
                  {c.text("Yes, cancel the order", "نعم، ألغِ الطلب")}
                </button>
                <button type="button" className="text-button" onClick={() => setConfirming(false)}>
                  {c.text("Keep the order", "أبقِ الطلب")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirming(true)}>
              {c.text("Cancel order", "إلغاء الطلب")}
            </button>
          ))}

        <p className="small muted">
          {guestKey
            ? c.text(
                "Keep the link from your order email: it is the only way to open this order without an account.",
                "احتفظ بالرابط في بريد الطلب: هو الطريقة الوحيدة لفتح هذا الطلب بدون حساب.",
              )
            : c.text("You can find this order any time under My orders.", "يمكنك العثور على هذا الطلب في أي وقت في طلباتي.")}
        </p>
        {!guestKey && (
          <Link href="/account/orders" className="text-link">
            {c.text("My orders", "طلباتي")}
          </Link>
        )}
        <ActionLink href="/shop">{c.text("Keep exploring", "تابع التسوق")}</ActionLink>
      </section>
    </div>
  );
}

/** Pay now, Continue to payment (an open attempt) or Pay again (D138); or why paying is not possible. */
function PayActions({
  order,
  open,
  retry,
  busy,
  onPay,
}: {
  order: CustomerOrder;
  open: boolean;
  retry: boolean;
  busy: boolean;
  onPay: () => void;
}) {
  const c = useCopy();
  if (!order.payment.canPay) {
    return (
      <p className="note-box">
        {!open && order.payment.attemptsLeft === 0
          ? c.text(
              "This order has reached the limit of 3 payment attempts. Please place the order again.",
              "وصل هذا الطلب إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى إرسال الطلب مرة أخرى.",
            )
          : c.text(
              "Online payment is not available at the moment. Please contact us to complete your order.",
              "الدفع الإلكتروني غير متاح حالياً. يرجى التواصل معنا لإتمام طلبك.",
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
            : c.text(`Pay ${c.money(order.total)} now`, `ادفع ${c.money(order.total)} الآن`)}
      </button>
      <p className="small muted">
        {open
          ? c.text(
              "You have started paying for this order. Continue to finish the same payment.",
              "لقد بدأت دفع هذا الطلب. تابع لإكمال الدفعة نفسها.",
            )
          : c.text(
              "You pay on the payment company's secure page, then come back here.",
              "تدفع في صفحة شركة الدفع الآمنة، ثم تعود إلى هنا.",
            )}
      </p>
    </div>
  );
}
