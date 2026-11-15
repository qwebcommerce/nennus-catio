"use client";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  Ellipsis,
  Home,
  Mail,
  MapPin,
  Phone,
  Plus,
  Scissors,
  Store,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { useState, type RefObject } from "react";
import type { Booking } from "@/mocks/data/business";
import { petCategories } from "@/mocks/data/business";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { Link } from "@/i18n/navigation";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { BookingEditDialog } from "./BookingDialogs";
import { bookingDate } from "./booking-list";

export function BookingStatus({ booking }: { booking: Booking }) {
  const c = useCopy();
  return booking.status === "processing" ? (
    <span className="status booking-status-progress">
      {c.text("In Progress", "قيد التنفيذ")}
    </span>
  ) : (
    <StatusBadge value={booking.status} />
  );
}
export function BookingDetailPanel({
  booking: b,
  close,
  panelRef,
}: {
  booking: Booking;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy(),
    d = useBusiness(),
    guest = d.guests.find((g) => g.id === b.customerId),
    slot = d.slots.find((s) => s.id === b.slotId),
    pkg = d.packages.find((p) => p.id === b.packageId);
  const [mode, setMode] = useState<"notes" | "reschedule" | null>(null),
    [cancel, setCancel] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const closed = ["completed", "cancelled"].includes(b.status),
    LocationIcon = b.location === "home" ? Home : Store;
  function change(status: Booking["status"]) {
    try {
      repo.status("bookings", b.id, status);
      setCancel(false);
      setError("");
      setNotice(
        c.text("Demo booking status updated.", "تم تحديث حالة الحجز التجريبي."),
      );
    } catch (err) {
      setError(
        c.ar
          ? "تعذر التحديث. تحقق من الدفع وحالة الحجز."
          : err instanceof Error
            ? err.message
            : "Please retry.",
      );
    }
  }
  const petCategory = petCategories.find((p) => p.id === pkg?.petCategory);
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail bookings-detail"
      aria-labelledby="booking-detail-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !mode && !cancel) close();
      }}
    >
      <button
        className="icon-button orders-detail-close"
        type="button"
        aria-label={c.text("Close booking details", "إغلاق تفاصيل الحجز")}
        onClick={close}
      >
        <X size={18} />
      </button>
      <h2 id="booking-detail-title">
        {c.text("Booking #", "الحجز #")}
        <bdi>{b.id}</bdi>
      </h2>
      <div className="orders-detail-meta">
        <time dateTime={b.date}>{bookingDate(b.date, c.locale, true)}</time>
        <BookingStatus booking={b} />
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
              disabled={closed || b.payment !== "paid"}
              onClick={() =>
                change(b.status === "processing" ? "completed" : "processing")
              }
            >
              {b.status === "processing"
                ? c.text("Mark completed", "حدد كمكتمل")
                : c.text("Start grooming", "ابدأ العناية")}
            </button>
            <button
              type="button"
              disabled={closed}
              onClick={() => setCancel(true)}
            >
              {c.text("Cancel demo booking", "إلغاء الحجز التجريبي")}
            </button>
          </div>
        </details>
        <button
          type="button"
          className="button button--secondary"
          disabled={closed}
          onClick={() => setMode("reschedule")}
        >
          <CalendarDays size={14} />
          {c.text("Reschedule", "تغيير الموعد")}
        </button>
        <details>
          <summary
            className="icon-button"
            aria-label={c.text("More booking actions", "إجراءات إضافية للحجز")}
          >
            <Ellipsis size={18} />
          </summary>
          <div className="orders-action-menu">
            <button type="button" onClick={() => setMode("notes")}>
              {c.text("Edit notes", "تعديل الملاحظات")}
            </button>
          </div>
        </details>
      </div>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Customer", "العميل")}</h3>
          <Link
            href={`/admin/customers?search=${encodeURIComponent(guest?.email ?? "")}`}
          >
            {c.text("View Customer →", "عرض العميل ←")}
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
            <strong>{guest?.name ?? c.text("Unavailable", "غير متوفر")}</strong>
            <p>
              <Phone size={13} />
              <bdi>{guest?.phone}</bdi>
            </p>
            <p>
              <Mail size={13} />
              <bdi>{guest?.email}</bdi>
            </p>
            {b.address && (
              <p>
                <MapPin size={13} />
                {b.address}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Pet", "الحيوان")}</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("notes")}
          >
            {c.text("View Pet Details →", "تفاصيل الحيوان ←")}
          </button>
        </div>
        <div className="booking-pet">
          <Photo
            src={pkg?.image ?? ""}
            alt={c.text(
              "Illustrative pet image, not a customer photo",
              "صورة توضيحية وليست صورة لحيوان العميل",
            )}
            sizes="60px"
          />
          <div>
            <strong>{b.petName}</strong>
            <p>
              {petCategory
                ? c.local(petCategory.name)
                : c.text("Type not recorded", "النوع غير مسجل")}
            </p>
            <p>
              <strong>{c.text("Notes: ", "ملاحظات: ")}</strong>
              {b.petNotes || c.text("None recorded", "لا توجد ملاحظات")}
            </p>
          </div>
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>
            <Scissors size={17} />
            {c.text("Grooming Details", "تفاصيل العناية")}
          </h3>
          <button
            type="button"
            className="text-button"
            disabled={closed}
            onClick={() => setMode("reschedule")}
          >
            {c.text("Edit", "تعديل")}
          </button>
        </div>
        <p className="booking-package-name">
          <Scissors size={16} />
          {c.local(b.packageName)}
        </p>
        <span className="booking-location-badge">
          <LocationIcon size={13} />
          {b.location === "home"
            ? c.text("Home Service", "خدمة منزلية")
            : c.text("In-Store", "في المتجر")}
        </span>
        <dl className="booking-facts">
          <div>
            <CalendarDays size={18} />
            <span>
              <dt>
                {slot
                  ? bookingDate(slot.date, c.locale)
                  : c.text("Slot unavailable", "الموعد غير متوفر")}
              </dt>
              <dd>
                <bdi>{slot?.time}</bdi> {c.text("(Qatar)", "(قطر)")}
              </dd>
            </span>
          </div>
          <div>
            <Clock3 size={18} />
            <span>
              <dt>{c.text("Duration", "المدة")}</dt>
              <dd>
                {b.duration} {c.text("minutes", "دقيقة")}
              </dd>
            </span>
          </div>
          <div>
            <UserRound size={18} />
            <span>
              <dt>{c.text("Assigned to", "الموظف المسؤول")}</dt>
              <dd>{c.text("Unassigned", "غير معيّن")}</dd>
            </span>
          </div>
          <div>
            <Tag size={18} />
            <span>
              <dt>{c.text("Price", "السعر")}</dt>
              <dd>
                <bdi>{c.money(b.price)}</bdi>
              </dd>
            </span>
          </div>
          <div className="booking-facts-payment">
            <CreditCard size={18} />
            <dt>{c.text("Payment", "الدفع")}</dt>
            <dd>
              <StatusBadge value={b.payment} />
            </dd>
          </div>
        </dl>
        <div className="booking-inclusions">
          <h3>{c.text("Package Includes", "تشمل الباقة")}</h3>
          {pkg?.inclusions.length ? (
            <ul>
              {pkg.inclusions.map((text) => (
                <li key={text.en}>
                  <Check size={15} />
                  {c.local(text)}
                </li>
              ))}
            </ul>
          ) : (
            <p>{c.text("No inclusions recorded", "لا توجد تفاصيل مسجلة")}</p>
          )}
        </div>
      </section>
      <section className="orders-detail-card">
        <div className="orders-detail-heading">
          <h3>{c.text("Notes", "الملاحظات")}</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("notes")}
          >
            {c.text("Edit", "تعديل")}
          </button>
        </div>
        <div className="booking-note">
          <strong>{c.text("Customer Note", "ملاحظة العميل")}</strong>
          <p>
            {b.petNotes ||
              c.text("No customer note recorded.", "لا توجد ملاحظة للعميل.")}
          </p>
        </div>
        <div className="booking-note booking-note--internal">
          <strong>{c.text("Internal Note", "ملاحظة داخلية")}</strong>
          <p>
            {b.internalNotes ||
              c.text("No internal note recorded.", "لا توجد ملاحظة داخلية.")}
          </p>
        </div>
        <button
          type="button"
          className="booking-add-note"
          onClick={() => setMode("notes")}
        >
          <Plus size={13} />
          {c.text("Add Internal Note", "إضافة ملاحظة داخلية")}
        </button>
      </section>
      <section className="booking-activity">
        <h3>{c.text("Activity", "النشاط")}</h3>
        <ol>
          {[...(b.activity ?? [])]
            .reverse()
            .concat([
              {
                id: `${b.id}-created`,
                at: b.date,
                text: { en: "Booking created", ar: "تم إنشاء الحجز" },
              },
            ])
            .map((event) => (
              <li key={event.id}>
                <time dateTime={event.at}>
                  {bookingDate(event.at, c.locale, true)}
                </time>
                <span>{c.local(event.text)}</span>
              </li>
            ))}
        </ol>
      </section>
      <p className="orders-detail-disclaimer">
        {c.text(
          "Local demo. Images are illustrative; staff assignments and saved pet accounts are not connected. Only recorded actions appear above. No messages or refunds are processed.",
          "معاينة محلية. الصور توضيحية ولا يوجد ربط لتعيين الموظفين أو حسابات الحيوانات. تُعرض الإجراءات المسجلة فقط دون رسائل أو استرداد.",
        )}
      </p>
      <ErrorMessage message={error} />
      <p role="status">{notice}</p>
      {mode && (
        <BookingEditDialog
          key={`${b.id}-${mode}`}
          booking={b}
          mode={mode}
          close={() => setMode(null)}
        />
      )}
      <Modal
        open={cancel}
        onOpenChange={setCancel}
        title={c.text("Cancel this demo booking?", "إلغاء هذا الحجز التجريبي؟")}
      >
        <p>
          {c.text(
            "Cancellation releases mock capacity. No refund or customer message is sent.",
            "يحرر الإلغاء السعة التجريبية دون استرداد أو إرسال رسالة للعميل.",
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
