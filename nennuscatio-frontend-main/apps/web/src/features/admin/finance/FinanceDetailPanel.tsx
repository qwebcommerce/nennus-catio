"use client";
import type { RefObject } from "react";
import { ArrowRight, ChevronRight, CreditCard, House, Mail, MapPin, Package, Phone, Scissors, X } from "lucide-react";
import type { FinanceTransaction } from "./finance-list";
import { financeDate, financeMoney } from "./finance-list";
import { useCopy } from "@/shared/lib/copy";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useDemoIdentity } from "@/layouts/global/GlobalProviders";
import { Photo } from "@/shared/ui/Photo";
import { Link } from "@/i18n/navigation";
export function FinanceStatusBadge({ status }: { status: FinanceTransaction["status"] }) {
  const c = useCopy();
  return <span className={`finance-status finance-status--${status}`}><i aria-hidden="true" />
    {status === "paid" ? c.text("Paid", "مدفوع") : status === "pending" ? c.text("Pending", "قيد الانتظار") : c.text("Refunded", "مسترد")}</span>;
}
export function financeMethodLabel(method: FinanceTransaction["method"], ar: boolean) {
  if (!method) return ar ? "غير مسجل" : "Not recorded";
  return ar ? ({ card: "بطاقة", "bank-transfer": "تحويل بنكي", cod: "الدفع عند التوصيل", cash: "نقداً" }[method] ?? "غير مسجل")
    : method === "card" ? "Card" : method === "bank-transfer" ? "Bank Transfer" : method === "cod" ? "COD" : method === "cash" ? "Cash" : "Not recorded";
}
export function FinanceDetailPanel({ transaction: r, close, panelRef }: {
  transaction: FinanceTransaction; close: () => void; panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy(), d = useBusiness(), { role } = useDemoIdentity();
  const guest = d.guests.find((g) => g.id === r.customerId);
  const firstItem = r.order?.items[0], product = d.products.find((p) => p.id === firstItem?.productId);
  const pkg = d.packages.find((p) => p.id === r.booking?.packageId);
  const image = product?.image ?? pkg?.image;
  const sourceHref = `/admin/${r.booking ? "bookings" : "orders"}?search=${encodeURIComponent(r.reference)}`;
  const type = r.kind === "grooming" ? c.text("Grooming", "العناية") : r.kind === "house" ? c.text("Pet House", "بيت للحيوان") : c.text("Product Order", "طلب منتج");
  const Icon = r.kind === "grooming" ? Scissors : r.kind === "house" ? House : Package;
  return <aside className="finance-card finance-detail" tabIndex={-1} ref={panelRef}
    aria-label={c.text(`Transaction ${r.id}`, `المعاملة ${r.id}`)}
    onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
    <div className="finance-detail-title"><h2>{c.text("Transaction", "المعاملة")} <bdi>#{r.id}</bdi></h2>
      <FinanceStatusBadge status={r.status} />
      <button type="button" className="finance-icon-button" onClick={close} aria-label={c.text("Close transaction details", "إغلاق تفاصيل المعاملة")}><X size={17} /></button></div>
    <time dateTime={r.date}>{financeDate(r.date, c.locale, true)}</time>
    <section className="finance-detail-section"><h3>{c.text("Source", "المصدر")}</h3>
      <div className="finance-detail-source">
        {image ? <Photo src={image} alt="" sizes="48px" /> : <Icon size={30} />}
        <div><strong><bdi>{r.reference}</bdi></strong><small>{r.booking ? c.local(r.booking.packageName) : type}</small></div>
        {role !== "finance" && <Link href={sourceHref} aria-label={c.text("View source", "عرض المصدر")}><ChevronRight size={18} /></Link>}
      </div></section>
    <section className="finance-detail-section"><div className="finance-section-title"><h3>{c.text("Customer", "العميل")}</h3>
      {role !== "finance" && guest && <Link href={`/admin/customers?search=${encodeURIComponent(guest.name)}`}>{c.text("View Customer", "عرض العميل")} <ArrowRight size={12} /></Link>}</div>
      <div className="finance-detail-customer"><span className="finance-avatar">{r.customerName.split(" ").map((n) => n[0]).slice(0, 2).join("") || "?"}</span>
        <div><strong>{r.customerName || c.text("Not recorded", "غير مسجل")}</strong>
          {role !== "finance" && guest ? <><small><Phone size={12} /><bdi>{guest.phone}</bdi></small><small><Mail size={12} /><bdi>{guest.email}</bdi></small>
            {(r.order?.address || r.booking?.address) && <small><MapPin size={12} />{r.order?.address || r.booking?.address}</small>}</>
            : <small>{c.text("Customer contact details are restricted.", "بيانات التواصل مع العميل مقيدة.")}</small>}</div></div>
    </section>
    <section className="finance-detail-section"><h3>{c.text("Payment Details", "تفاصيل الدفع")}</h3>
      <dl className="finance-breakdown"><div><dt>{c.text("Subtotal", "المجموع الفرعي")}</dt><dd>{financeMoney(r.order ? r.order.items.reduce((n, l) => n + l.price * l.quantity, 0) : r.amount, c.locale)}</dd></div>
        {r.order && <div><dt>{c.text("Delivery Fee", "رسوم التوصيل")}</dt><dd>{financeMoney(r.order.fee, c.locale)}</dd></div>}
        <div className="finance-total"><dt>{c.text("Total", "الإجمالي")}</dt><dd>{financeMoney(r.amount, c.locale)}</dd></div>
      </dl>
      <h3>{c.text("Payment Method", "طريقة الدفع")}</h3>
      <p className="finance-method"><CreditCard size={16} />{financeMethodLabel(r.method, c.ar)}</p>
      <dl className="finance-breakdown"><div><dt>{c.text("Payment Status", "حالة الدفع")}</dt><dd><FinanceStatusBadge status={r.status} /></dd></div>
        <div><dt>{r.status === "pending" ? c.text("Created", "تاريخ الإنشاء") : c.text("Payment Date", "تاريخ الدفع")}</dt><dd>{financeDate(r.date, c.locale, true)}</dd></div>
        <div><dt>{c.text("Payment Reference", "مرجع الدفع")}</dt><dd><bdi>{r.paymentReference ?? c.text("Not recorded", "غير مسجل")}</bdi></dd></div></dl>
      {r.refunded > 0 && <div className="finance-refund-info"><h3>{c.text("Recorded Refund", "الاسترداد المسجل")}</h3><strong>{financeMoney(r.refunded, c.locale)}</strong>
        <small>{r.refundDate && financeDate(r.refundDate, c.locale, true)}</small><small><bdi>{r.refundReference}</bdi></small></div>}
    </section>
    <section className="finance-detail-section"><h3>{r.order ? c.text(`Items (${r.order.items.reduce((n, i) => n + i.quantity, 0)})`, `القطع (${r.order.items.reduce((n, i) => n + i.quantity, 0)})`) : c.text("Grooming Service", "خدمة العناية")}</h3>
      <ul className="finance-items">{r.order ? r.order.items.map((item) => <li key={item.variantId}>
        <Photo src={d.products.find((p) => p.id === item.productId)?.image ?? ""} alt="" sizes="40px" />
        <div><strong>{c.local(item.name)}</strong><small><bdi>SKU: {item.sku}</bdi></small><small>{c.local(item.label)}</small></div>
        <span>×{item.quantity}</span><bdi>{financeMoney(item.price * item.quantity, c.locale)}</bdi>
      </li>) : <li>{image && <Photo src={image} alt="" sizes="40px" />}<div><strong>{r.booking && c.local(r.booking.packageName)}</strong><small>{r.booking?.duration} {c.text("minutes", "دقيقة")}</small></div><bdi>{financeMoney(r.amount, c.locale)}</bdi></li>}</ul>
    </section>
    {role !== "finance" && <Link className="finance-view-source" href={sourceHref}>{r.booking ? c.text("View Booking", "عرض الحجز") : c.text("View Order", "عرض الطلب")} <ArrowRight size={15} /></Link>}
    <p className="finance-detail-note">{c.text("Read-only synthetic financial record. Payment and refund details are examples.", "سجل مالي تجريبي للقراءة فقط. تفاصيل الدفع والاسترداد أمثلة.")}</p>
  </aside>;
}
