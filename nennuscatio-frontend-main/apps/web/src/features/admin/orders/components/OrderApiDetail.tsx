"use client";

import { type AdminOrder, type AdminOrderHistoryEntry, OPEN_PAYMENT_STATUSES, type PaymentStatus } from "@nennus-catio/contracts";
import { CalendarDays, House, Mail, MapPin, Phone, ShoppingBag, Truck, X } from "lucide-react";
import { Fragment, type RefObject, useState } from "react";
import { CustomerRecordLink } from "@/features/admin/customers/components/CustomerRecordLink";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { describeAdminOrderError, useAdminOrder, useOrderStep } from "@/shared/api/admin-orders";
import { useOrderPayments } from "@/shared/api/admin-payments";
import { useCopy } from "@/shared/lib/copy";
import { formatDiscount, formatMoney } from "@/shared/lib/format";
import { ErrorMessage } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { PinLink } from "@/shared/ui/ShareLocation";
import { ADMIN_ORDER_STATUS, ADMIN_ORDER_TONE, NEXT_STEP_BUTTON, NEXT_STEP_EFFECT, placedAt } from "../lib/admin-order-labels";
import { ATTENTION } from "../lib/payment-labels";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { ChangeDeliveryTimeDialog } from "./ChangeDeliveryTimeDialog";
import { OrderPayments } from "./OrderPayments";
import { PromotionSummaryRows } from "./PromotionSummaryRows";

const OPEN_PAYMENT: readonly PaymentStatus[] = OPEN_PAYMENT_STATUSES;

/**
 * An amount in the items table that may wrap after "QAR" (or before "ر.ق.") when its column is too narrow,
 * as from about QAR 1,000 in the side panel, instead of running into the next column. The money format
 * joins them with a no-break space; only that one may break, so a minus sign stays with its amount.
 */
const wrappable = (amount: string) => amount.replace(/QAR\u00a0/g, "QAR ").replace(/\u00a0(?=ر\.ق\.)/g, " ");

export function OrderStatusBadge({ status }: { status: AdminOrder["status"] }) {
  const c = useCopy();
  return <span className={`status status--${ADMIN_ORDER_TONE[status]}`}>{c.local(ADMIN_ORDER_STATUS[status])}</span>;
}

/**
 * One real order (7c-2, 8b): customer, delivery, items, totals, payment, cancellation and the full
 * history, with the staff actions the order allows now. Every action asks first (D128) and sends the
 * order's version; if someone else changed it in between, the order reloads and the reason is shown.
 */
export function OrderApiDetail({
  reference,
  close,
  panelRef,
}: {
  reference: string;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("orders", "edit");
  const canRefund = access.can("orders", "refund");
  const query = useAdminOrder(reference);
  // The same request as the Payment section (one fetch): the cancel dialog warns about an open payment (D146).
  const payments = useOrderPayments(reference);
  const paymentInProgress = payments.data?.attempts.some((attempt) => OPEN_PAYMENT.includes(attempt.status)) ?? false;
  const step = useOrderStep();
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [cancelling, setCancelling] = useState<AdminOrder | null>(null);
  const [changingTime, setChangingTime] = useState<AdminOrder | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const order = query.data;
  const status = (value: AdminOrder["status"]) => c.local(ADMIN_ORDER_STATUS[value]);

  function askStep(current: AdminOrder, direction: "next" | "back") {
    const target = direction === "next" ? current.actions.next : current.actions.back;
    if (!target) return;
    const forward = direction === "next";
    const button = NEXT_STEP_BUTTON[target];
    const effect = NEXT_STEP_EFFECT[target];
    setConfirming({
      title: forward
        ? c.text(`Move order ${current.reference} to ${status(target)}?`, `نقل الطلب ${current.reference} إلى ${status(target)}؟`)
        : c.text(`Move order ${current.reference} back to ${status(target)}?`, `إرجاع الطلب ${current.reference} إلى ${status(target)}؟`),
      message: forward
        ? effect
          ? c.local(effect)
          : ""
        : c.text(
            `Use this to undo a wrong click. It is recorded in the history with your name, and no email is sent.${target === "confirmed" ? " The customer can cancel the order online again." : ""}`,
            `استخدم هذا للتراجع عن نقرة خاطئة. يُسجَّل في السجل باسمك ولا يُرسل بريد إلكتروني.${target === "confirmed" ? " يمكن للعميل إلغاء الطلب عبر الموقع مرة أخرى." : ""}`,
          ),
      confirmLabel: forward && button ? c.local(button) : c.text(`Move back to ${status(target)}`, `إرجاع إلى ${status(target)}`),
      run: async () => {
        try {
          const saved = await step.mutateAsync({ order: current, direction });
          setError("");
          setNotice(c.text(`Order ${saved.reference} is now ${status(saved.status)}.`, `الطلب ${saved.reference} الآن ${status(saved.status)}.`));
        } catch (err) {
          setNotice("");
          setError(describeAdminOrderError(err, c.text));
        }
      },
    });
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail"
      aria-labelledby="order-detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !confirming && !cancelling && !changingTime) close();
      }}
    >
      <button
        type="button"
        className="icon-button orders-detail-close"
        aria-label={c.text("Close order details", "إغلاق تفاصيل الطلب")}
        onClick={close}
      >
        <X size={18} />
      </button>
      <h2 id="order-detail-title">
        {c.text("Order ", "طلب ")}
        <bdi>{reference}</bdi>
      </h2>
      {query.isPending && (
        <p className="muted" role="status" aria-busy="true">
          {c.text("Loading the order…", "جارٍ تحميل الطلب…")}
        </p>
      )}
      {query.isError && !order && (
        <div className="inline-state" role="alert">
          <p>{describeAdminOrderError(query.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void query.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {order && (
        <>
          <div className="orders-detail-meta">
            <time dateTime={order.placedAt}>{placedAt(order.placedAt, c.locale)}</time>
            <OrderStatusBadge status={order.status} />
          </div>
          {canEdit && (order.actions.next || order.actions.back || order.actions.changeTime || order.actions.cancel) && (
            <div className="orders-detail-actions orders-detail-actions--real">
              {order.actions.next && (
                <button type="button" className="button button--primary" disabled={step.isPending} onClick={() => askStep(order, "next")}>
                  {c.local(NEXT_STEP_BUTTON[order.actions.next] ?? ADMIN_ORDER_STATUS[order.actions.next])}
                </button>
              )}
              {order.actions.back && (
                <button type="button" className="button button--secondary" disabled={step.isPending} onClick={() => askStep(order, "back")}>
                  {c.text(`Move back to ${status(order.actions.back)}`, `إرجاع إلى ${status(order.actions.back)}`)}
                </button>
              )}
              {order.actions.changeTime && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setChangingTime(order);
                  }}
                >
                  {c.text("Change delivery time", "تغيير موعد التوصيل")}
                </button>
              )}
              {order.actions.cancel && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setCancelling(order);
                  }}
                >
                  {c.text("Cancel order", "إلغاء الطلب")}
                </button>
              )}
            </div>
          )}
          <ErrorMessage message={error} />
          <p role="status" className="small">
            {notice}
          </p>
          {order.status === "awaiting_payment" && (
            <p className="note-box small">
              {c.text(
                "Waiting for the customer to pay. It becomes Confirmed when paid; until then it can only be cancelled.",
                "بانتظار دفع العميل. يصبح مؤكداً عند الدفع؛ وحتى ذلك الحين يمكن إلغاؤه فقط.",
              )}
              {order.holdExpiresAt &&
                c.text(
                  ` If it is not paid by ${placedAt(order.holdExpiresAt, "en")}, it expires and the items go back in stock automatically.`,
                  ` إذا لم يُدفع قبل ${placedAt(order.holdExpiresAt, "ar")} ينتهي وتعود المنتجات إلى المخزون تلقائياً.`,
                )}
            </p>
          )}
          {order.attention && (
            <p className="note-box small" role="note">
              <strong>{c.local(ATTENTION[order.attention].title)} </strong>
              {c.local(ATTENTION[order.attention].action)}
            </p>
          )}
          {order.refundNeeded && (
            <p className="note-box small" role="note">
              <strong>{c.text("Refund needed. ", "يحتاج استرداداً. ")}</strong>
              {canRefund
                ? c.text("This order was paid and then cancelled. Refund it under Payment below.", "دُفع هذا الطلب ثم أُلغي. استرده من قسم الدفع أدناه.")
                : c.text(
                    "This order was paid and then cancelled. Someone with the Refund permission must refund it under Payment below.",
                    "دُفع هذا الطلب ثم أُلغي. يجب أن يسترده شخص لديه صلاحية الاسترداد من قسم الدفع أدناه.",
                  )}
            </p>
          )}
          <Customer order={order} />
          <Fulfilment order={order} />
          <Items order={order} />
          <OrderPayments order={order} />
          {(order.status === "cancelled" || order.status === "expired") && <Cancellation order={order} />}
          <History entries={order.history} />
        </>
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
      {changingTime && (
        <ChangeDeliveryTimeDialog
          order={changingTime}
          onClose={() => setChangingTime(null)}
          onDone={(message) => {
            setError("");
            setNotice(message);
          }}
        />
      )}
      <CancelOrderDialog
        order={cancelling}
        paymentInProgress={paymentInProgress}
        onClose={() => setCancelling(null)}
        onCancelled={(saved) =>
          setNotice(
            saved.refundNeeded
              ? c.text(`Order ${saved.reference} is cancelled and marked Refund needed.`, `أُلغي الطلب ${saved.reference} وعُلِّم بأنه يحتاج استرداداً.`)
              : c.text(`Order ${saved.reference} is cancelled.`, `أُلغي الطلب ${saved.reference}.`),
          )
        }
      />
    </aside>
  );
}

function Customer({ order }: { order: AdminOrder }) {
  const c = useCopy();
  return (
    <section className="orders-detail-card">
      <div className="orders-detail-heading">
        <h3>{c.text("Customer", "العميل")}</h3>
        <small>{order.hasAccount ? c.text("Has an account", "لديه حساب") : c.text("Guest", "زائر")}</small>
      </div>
      <div className="orders-customer">
        <div>
          <strong>{order.contact.name}</strong>
          <p>
            <Phone size={13} />
            <bdi>{order.contact.phone}</bdi>
          </p>
          <p>
            <Mail size={13} />
            <bdi>{order.contact.email}</bdi>
          </p>
          <CustomerRecordLink email={order.contact.email} />
        </div>
      </div>
    </section>
  );
}

export function addressLine(address: NonNullable<AdminOrder["address"]>, text: (en: string, ar: string) => string): string {
  return [
    `${text("Zone", "منطقة")} ${address.zone}`,
    `${text("Street", "شارع")} ${address.street}`,
    `${text("Building", "مبنى")} ${address.building}`,
    address.floor && `${text("Floor", "طابق")} ${address.floor}`,
    address.flat && `${text("Flat", "شقة")} ${address.flat}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function Fulfilment({ order }: { order: AdminOrder }) {
  const c = useCopy();
  const delivery = order.fulfilment === "delivery";
  return (
    <section className="orders-detail-card">
      <div className="orders-detail-heading">
        <h3>{delivery ? c.text("Delivery", "التوصيل") : c.text("Pickup", "الاستلام")}</h3>
      </div>
      <div className="orders-fulfilment">
        {delivery ? <Truck size={22} /> : <ShoppingBag size={22} />}
        <div>
          {delivery && order.area && <strong>{c.local(order.area)}</strong>}
          {!delivery && <strong>{c.text("Collection at the shop", "الاستلام من المتجر")}</strong>}
          {order.address && (
            <p>
              <MapPin size={13} />
              <bdi>{addressLine(order.address, c.text)}</bdi>
            </p>
          )}
          {order.address?.landmark && (
            <p>
              {c.text("Landmark: ", "علامة مميزة: ")}
              {order.address.landmark}
            </p>
          )}
          {order.address?.note && (
            <p>
              {c.text("Driver note: ", "ملاحظة للسائق: ")}
              {order.address.note}
            </p>
          )}
          {order.address?.pin && (
            <p>
              <PinLink pin={order.address.pin}>
                {c.text(`Open in Google Maps (± ${order.address.pin.accuracy} m)`, `افتح في خرائط Google (± ${order.address.pin.accuracy} م)`)}
              </PinLink>
            </p>
          )}
          {order.window && (
            <p>
              <CalendarDays size={13} />
              {dateLabel(order.window.date, c.locale)}, <bdi dir="ltr">{`${order.window.start}–${order.window.end}`}</bdi>{" "}
              {c.text("(Qatar)", "(قطر)")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Items({ order }: { order: AdminOrder }) {
  const c = useCopy();
  // Each item's share of the promotions (11e), under what was paid for it: the most a refund for it should be.
  // The side panel is narrow, so the discount shares the last column instead of adding one.
  const discounted = order.lines.some((line) => line.discount > 0);
  return (
    <>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Order items", "عناصر الطلب")}</h3>
          <small>{c.text(`${order.itemCount} items`, `${order.itemCount} عنصر`)}</small>
        </div>
        <div className="orders-item-scroll">
          <table>
            <thead>
              <tr>
                <th>{c.text("Item", "العنصر")}</th>
                <th>SKU</th>
                <th>{c.text("Qty", "العدد")}</th>
                <th>{c.text("Unit price", "سعر الوحدة")}</th>
                <th>{discounted ? c.text("Paid", "المدفوع") : c.text("Total", "الإجمالي")}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <Fragment key={`${line.product}-${line.variant}`}>
                  <tr className={line.house ? "orders-house-item" : undefined}>
                    <td>
                      <span>
                        {c.local(line.name)}
                        <small> · {c.local(line.label)}</small>
                      </span>
                    </td>
                    <td>
                      <bdi>{line.sku}</bdi>
                    </td>
                    <td>{line.quantity}</td>
                    <td>
                      <bdi>{wrappable(formatMoney(line.unitPrice, c.locale))}</bdi>
                    </td>
                    <td>
                      <bdi>{wrappable(formatMoney(line.lineTotal, c.locale))}</bdi>
                      {line.discount > 0 && (
                        <small className="orders-line-discount">
                          <bdi>{wrappable(formatDiscount(line.discount, c.locale))}</bdi>
                        </small>
                      )}
                    </td>
                  </tr>
                  {/* A Pet House line keeps its estimate as it was ordered (#14), on its own row: the side panel is narrow. */}
                  {line.house && (
                    <tr className="orders-house-row">
                      <td colSpan={5}>
                        <small className="house-line-note orders-house-line">
                          <House size={12} aria-hidden="true" />
                          {line.house.madeToOrder
                            ? c.text(
                                `Pet House · made to order · ready in about ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} days`,
                                `بيت حيوان · يُصنع عند الطلب · جاهز خلال ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} يوماً تقريباً`,
                              )
                            : c.text(
                                `Pet House · in stock · ready in about ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} days`,
                                `بيت حيوان · متوفر · جاهز خلال ${line.house.leadTime.minDays}–${line.house.leadTime.maxDays} يوماً تقريباً`,
                              )}
                        </small>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="orders-detail-card orders-summary">
        <h3>{c.text("Order summary", "ملخص الطلب")}</h3>
        <dl>
          <div>
            <dt>{c.text("Subtotal", "المجموع الفرعي")}</dt>
            <dd>
              <bdi>{formatMoney(order.subtotal, c.locale)}</bdi>
            </dd>
          </div>
          <PromotionSummaryRows promotions={order.promotions} />
          {/* The area's fee and the Pet Houses' own charge on separate lines, as the customer saw them (#14). */}
          <div>
            <dt>{order.houseDeliveryFee > 0 ? c.text("Delivery", "التوصيل") : c.text("Delivery fee", "رسوم التوصيل")}</dt>
            <dd>
              <bdi>{formatMoney(order.deliveryFee - order.houseDeliveryFee, c.locale)}</bdi>
            </dd>
          </div>
          {order.houseDeliveryFee > 0 && (
            <div>
              <dt>{c.text("Pet House delivery", "توصيل بيت الحيوان")}</dt>
              <dd>
                <bdi>{formatMoney(order.houseDeliveryFee, c.locale)}</bdi>
              </dd>
            </div>
          )}
          <div className="orders-summary-total">
            <dt>{c.text("Total", "الإجمالي")}</dt>
            <dd>
              <bdi>{formatMoney(order.total, c.locale)}</bdi>
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

const ACTOR: Readonly<Record<AdminOrderHistoryEntry["actor"], { en: string; ar: string }>> = {
  customer: { en: "Customer", ar: "العميل" },
  guest: { en: "Guest customer", ar: "عميل زائر" },
  staff: { en: "Staff", ar: "الموظفون" },
  system: { en: "System", ar: "النظام" },
};

function Cancellation({ order }: { order: AdminOrder }) {
  const c = useCopy();
  const when = order.cancelledAt ?? order.expiredAt;
  return (
    <section className="orders-detail-card">
      <h3>{order.status === "expired" ? c.text("Expired", "منتهي") : c.text("Cancellation", "الإلغاء")}</h3>
      <dl className="orders-facts">
        {when && (
          <div>
            <dt>{c.text("When", "متى")}</dt>
            <dd>{placedAt(when, c.locale)}</dd>
          </div>
        )}
        {order.cancelledBy && (
          <div>
            <dt>{c.text("By", "بواسطة")}</dt>
            <dd>{c.local(ACTOR[order.cancelledBy])}</dd>
          </div>
        )}
        {order.cancelReason && (
          <div>
            <dt>{c.text("Reason", "السبب")}</dt>
            <dd>{order.cancelReason}</dd>
          </div>
        )}
        {order.stockReturned !== null && (
          <div>
            <dt>{c.text("Items back in stock", "إرجاع المنتجات إلى المخزون")}</dt>
            <dd>{order.stockReturned ? c.text("Yes", "نعم") : c.text("No, kept out of stock", "لا، بقيت خارج المخزون")}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function History({ entries }: { entries: readonly AdminOrderHistoryEntry[] }) {
  const c = useCopy();
  return (
    <section className="orders-detail-card">
      <h3>{c.text("History", "السجل")}</h3>
      <ol className="orders-history">
        {entries.map((entry) => (
          <li key={`${entry.at}-${entry.to}`}>
            <strong>
              {entry.from ? `${c.local(ADMIN_ORDER_STATUS[entry.from])} → ` : ""}
              {c.local(ADMIN_ORDER_STATUS[entry.to])}
            </strong>
            <span className="small muted">
              {" · "}
              {entry.staffName ?? c.local(ACTOR[entry.actor])}
              {" · "}
              <time dateTime={entry.at}>{placedAt(entry.at, c.locale)}</time>
            </span>
            {entry.reason && <p className="small">{entry.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
