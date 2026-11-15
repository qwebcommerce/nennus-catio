"use client";
import {
  CalendarDays,
  ChevronDown,
  Circle,
  Download,
  Ellipsis,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { type RefObject, useState } from "react";
import { dashboardItemCount } from "@/features/admin/dashboard/lib/dashboard";
import { Link } from "@/i18n/navigation";
import type { Order } from "@/mocks/data/business";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { orderCsv, orderMoney } from "./order-list";
export function OrderDetailPanel({
  order,
  close,
  panelRef,
}: {
  order: Order;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy(),
    d = useBusiness(),
    guest = d.guests.find((g) => g.id === order.customerId),
    slot = d.slots.find((s) => s.id === order.slotId);
  const [error, setError] = useState(""),
    [cancelOpen, setCancelOpen] = useState(false),
    [notice, setNotice] = useState("");
  const closed = ["completed", "cancelled"].includes(order.status);
  const next: Order["status"] =
    order.status === "processing"
      ? "ready"
      : order.status === "ready"
        ? "completed"
        : "processing";
  function change(status: Order["status"]) {
    try {
      repo.status("orders", order.id, status);
      setError("");
      setCancelOpen(false);
      setNotice(
        c.text("Demo order status updated.", "تم تحديث حالة الطلب التجريبي."),
      );
    } catch (err) {
      setError(
        c.ar
          ? "تعذر التحديث. تحقق من الدفع وحالة الطلب."
          : err instanceof Error
            ? err.message
            : "Please retry.",
      );
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", orderCsv(order)], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `demo-order-${order.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      c.text(
        "Demo order CSV downloaded. Not a tax invoice or receipt.",
        "تم تنزيل CSV للطلب التجريبي. ليس فاتورة ضريبية أو إيصالاً.",
      ),
    );
  }
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail"
      aria-labelledby="order-detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !cancelOpen) close();
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
        <bdi>{order.id}</bdi>
      </h2>
      <div className="orders-detail-meta">
        <time dateTime={order.date}>
          {new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", {
            timeZone: "Asia/Qatar",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(order.date))}
        </time>
        <StatusBadge value={order.status} />
      </div>
      <div className="orders-detail-actions">
        <details>
          <summary className="button button--primary">
            {c.text("Update Status", "تحديث الحالة")}
            <ChevronDown size={12} />
          </summary>
          <div className="orders-action-menu">
            <button
              type="button"
              disabled={closed || order.payment !== "paid"}
              onClick={() => change(next)}
            >
              {c.text(
                next === "ready"
                  ? "Mark ready"
                  : next === "completed"
                    ? "Mark completed"
                    : "Start fulfilment",
                next === "ready"
                  ? "حدد كجاهز"
                  : next === "completed"
                    ? "حدد كمكتمل"
                    : "ابدأ التجهيز",
              )}
            </button>
            <button
              type="button"
              disabled={closed}
              onClick={() => setCancelOpen(true)}
            >
              {c.text("Cancel demo order", "إلغاء الطلب التجريبي")}
            </button>
          </div>
        </details>
        <button
          type="button"
          className="button button--secondary"
          onClick={download}
        >
          <Download size={14} />
          {c.text("Download CSV", "تنزيل CSV")}
        </button>
        <details>
          <summary
            className="icon-button"
            aria-label={c.text("More order actions", "إجراءات إضافية للطلب")}
          >
            <Ellipsis size={18} />
          </summary>
          <div className="orders-action-menu">
            <Link
              href={`/admin/customers?search=${encodeURIComponent(guest?.email ?? "")}`}
            >
              {c.text("View customer", "عرض العميل")}
            </Link>
          </div>
        </details>
      </div>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Customer", "العميل")}</h3>
          <Link
            href={`/admin/customers?search=${encodeURIComponent(guest?.email ?? "")}`}
          >
            {c.text("View", "عرض")}
          </Link>
        </div>
        <div className="orders-customer">
          <span className="avatar">
            {guest?.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <strong>
              {guest?.name ??
                c.text("Customer unavailable", "العميل غير متوفر")}
            </strong>
            <p>
              <Phone size={13} />
              <bdi>{guest?.phone}</bdi>
            </p>
            <p>
              <Mail size={13} />
              <bdi>{guest?.email}</bdi>
            </p>
            {order.address && (
              <p>
                <MapPin size={13} />
                {order.address}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Order Items", "عناصر الطلب")}</h3>
          <small>
            {dashboardItemCount(
              order.items.reduce((sum, item) => sum + item.quantity, 0),
              c.locale,
            )}
          </small>
        </div>
        <div className="orders-item-scroll">
          <table>
            <thead>
              <tr>
                {[
                  c.text("Item", "العنصر"),
                  "SKU",
                  c.text("Qty", "العدد"),
                  c.text("Unit Price", "سعر الوحدة"),
                  c.text("Total", "الإجمالي"),
                ].map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.variantId}>
                  <td>
                    <div className="orders-detail-item">
                      <Photo
                        src={
                          d.products.find((p) => p.id === item.productId)
                            ?.image ?? ""
                        }
                        alt=""
                        sizes="32px"
                      />
                      <span>
                        {c.local(item.name)}
                        <small>{c.local(item.label)}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <bdi>{item.sku}</bdi>
                  </td>
                  <td>{item.quantity}</td>
                  <td>
                    <bdi>{orderMoney(item.price, c.locale)}</bdi>
                  </td>
                  <td>
                    <bdi>
                      {orderMoney(item.quantity * item.price, c.locale)}
                    </bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="orders-detail-card orders-summary">
        <h3>{c.text("Order Summary", "ملخص الطلب")}</h3>
        <dl>
          <div>
            <dt>{c.text("Subtotal", "المجموع الفرعي")}</dt>
            <dd>
              <bdi>
                {orderMoney(
                  order.items.reduce(
                    (sum, item) => sum + item.quantity * item.price,
                    0,
                  ),
                  c.locale,
                )}
              </bdi>
            </dd>
          </div>
          <div>
            <dt>{c.text("Delivery Fee", "رسوم التوصيل")}</dt>
            <dd>
              <bdi>{orderMoney(order.fee, c.locale)}</bdi>
            </dd>
          </div>
          <div className="orders-summary-total">
            <dt>{c.text("Total", "الإجمالي")}</dt>
            <dd>
              <bdi>{orderMoney(order.total, c.locale)}</bdi>
            </dd>
          </div>
        </dl>
        <p className="orders-promotion-note">
          <Tag size={19} />
          {c.text(
            "No promotion recorded for this demo order.",
            "لا يوجد عرض مسجل لهذا الطلب التجريبي.",
          )}
        </p>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Fulfilment", "التسليم")}</h3>
          <Link href="/admin/delivery-slots">
            {c.text("View slots", "عرض المواعيد")}
          </Link>
        </div>
        <div className="orders-fulfilment">
          {order.fulfilment === "delivery" ? (
            <Truck size={22} />
          ) : (
            <ShoppingBag size={22} />
          )}
          <div>
            <strong>
              {c.text(
                order.fulfilment === "delivery" ? "Delivery" : "Pickup",
                order.fulfilment === "delivery" ? "التوصيل" : "الاستلام",
              )}
            </strong>
            <p>
              {order.address ||
                c.text("Collection at the shop", "الاستلام من المتجر")}
            </p>
            {slot && (
              <p>
                <CalendarDays size={13} />
                <bdi>
                  {slot.date} · {slot.time}
                </bdi>{" "}
                {c.text("(Qatar)", "(قطر)")}
              </p>
            )}
          </div>
        </div>
        {order.fulfilment === "delivery" && (
          <div className="orders-fleet">
            <h3>{c.text("Fleet Status", "حالة الأسطول")}</h3>
            <ol>
              {[
                [c.text("Not Sent", "لم يُرسل")],
                [c.text("Sent to Fleet", "أُرسل للأسطول")],
                [c.text("Driver Assigned", "تعيين السائق")],
                [c.text("Out for Delivery", "خرج للتوصيل")],
                [c.text("Delivered", "تم التسليم")],
              ].map(([label]) => (
                <li key={label}>
                  <Circle size={15} />
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <p>
              {c.text(
                "FleetWiz is not connected. No live fleet events are available.",
                "FleetWiz غير متصل. لا توجد أحداث أسطول مباشرة.",
              )}
            </p>
          </div>
        )}
      </section>
      <p className="orders-detail-disclaimer">
        {c.text(
          "Synthetic records only. Status changes do not send messages or process refunds. Cancellation restores mock stock and slot capacity.",
          "سجلات تجريبية فقط. لا ترسل تغييرات الحالة رسائل ولا تنفذ استرداداً. يعيد الإلغاء المخزون وسعة المواعيد التجريبية.",
        )}
      </p>
      <ErrorMessage message={error} />
      <p role="status">{notice}</p>
      <Modal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={c.text("Cancel this demo order?", "إلغاء هذا الطلب التجريبي؟")}
      >
        <p>
          {c.text(
            "This restores reserved demo stock and delivery capacity. No refund is issued.",
            "يعيد المخزون وسعة التوصيل التجريبية المحجوزة. لا يُنفذ استرداد.",
          )}
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => change("cancelled")}
        >
          {c.text("Confirm cancellation", "تأكيد الإلغاء")}
        </button>
      </Modal>
    </aside>
  );
}
