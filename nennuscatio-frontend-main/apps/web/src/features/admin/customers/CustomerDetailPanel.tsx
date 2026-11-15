"use client";
import { useState, type RefObject } from "react";
import {
  ArrowRight,
  CalendarDays,
  Cat,
  ChevronRight,
  FileText,
  Home,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Scissors,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import type { Guest } from "@/mocks/data/business";
import { petCategories } from "@/mocks/data/business";
import { useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { Link } from "@/i18n/navigation";
import { Empty, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { bookingDate } from "@/features/admin/bookings/booking-list";
import { CustomerDialog } from "./CustomerDialogs";
import {
  contactNeedsReview,
  customerAddresses,
  customerHistory,
  customerInitials,
  customerPets,
} from "./customer-list";

export function CustomerDetailPanel({
  guest,
  close,
  panelRef,
  initialTab = "overview",
}: {
  guest: Guest;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
  initialTab?: string;
}) {
  const c = useCopy(),
    d = useBusiness(),
    pets = customerPets(d, guest.id),
    history = customerHistory(d, guest.id),
    addresses = customerAddresses(d, guest.id);
  const [tab, setTab] = useState(initialTab),
    [mode, setMode] = useState<"edit" | "notes" | null>(null),
    [full, setFull] = useState(false),
    [notice, setNotice] = useState("");
  const orderCount = history.filter((e) => e.kind === "order").length,
    bookingCount = history.filter((e) => e.kind === "booking").length;
  function activityList(kind?: "order" | "booking", limit?: number) {
    const rows = history
      .filter((event) => !kind || event.kind === kind)
      .slice(0, limit);
    return rows.length ? (
      <ul className="customers-activity-list">
        {rows.map((event) => {
          const isOrder = event.kind === "order",
            Icon = isOrder ? Package : Scissors;
          return (
            <li key={event.id}>
              <Link
                href={`/admin/${isOrder ? "orders" : "bookings"}?search=${encodeURIComponent(event.id)}`}
              >
                <Icon size={22} />
                <span>
                  <strong>
                    {event.kind === "order"
                      ? c.text(`Order #${event.id}`, `طلب #${event.id}`)
                      : c.text(
                          `Grooming · ${event.booking.petName}`,
                          `العناية · ${event.booking.petName}`,
                        )}
                  </strong>
                  <small>
                    {event.kind === "order"
                      ? `${event.order.items.reduce((sum, line) => sum + line.quantity, 0)} ${c.text("items", "عناصر")} · ${c.money(event.order.total)}`
                      : `${c.local(event.booking.packageName)} · ${event.booking.location === "home" ? c.text("Home Service", "خدمة منزلية") : c.text("In-Store", "في المتجر")}`}
                  </small>
                  {kind && (
                    <StatusBadge
                      value={
                        event.kind === "order"
                          ? event.order.status
                          : event.booking.status
                      }
                    />
                  )}
                </span>
                <time dateTime={event.at}>
                  {bookingDate(event.at, c.locale, true)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      <Empty>{c.text("No recorded history.", "لا يوجد سجل مسجل.")}</Empty>
    );
  }
  function petList() {
    return (
      <>
        <div className="customers-pet-grid">
          {pets.map((pet) => (
            <button
              type="button"
              className="customers-pet-card"
              key={pet.key}
              onClick={() => setTab("bookings")}
            >
              <Photo
                src={pet.image}
                alt={c.text("Illustrative pet image", "صورة توضيحية للحيوان")}
                sizes="48px"
              />
              <span>
                <strong>{pet.name}</strong>
                <small>
                  {c.local(
                    petCategories.find((p) => p.id === pet.category)?.name ?? {
                      en: "Type not recorded",
                      ar: "النوع غير مسجل",
                    },
                  )}
                </small>
                <small>
                  {pet.bookings[0]?.petNotes ||
                    c.text("No notes recorded", "لا توجد ملاحظات")}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
        {!pets.length && (
          <p className="small muted">
            {c.text(
              "No pet details submitted in bookings.",
              "لا توجد بيانات حيوان مسجلة في الحجوزات.",
            )}
          </p>
        )}
        <Link className="customers-add-row" href="/admin/bookings">
          <Plus size={17} />
          {c.text("Add Pet via Booking", "إضافة حيوان من خلال الحجز")}
        </Link>
        <p className="customers-caption">
          {c.text(
            "Grouped booking details, not saved pet profiles. Names/types do not prove pet identity.",
            "بيانات مجمعة من الحجوزات وليست ملفات محفوظة. الاسم والنوع لا يثبتان هوية الحيوان.",
          )}
        </p>
      </>
    );
  }
  function note() {
    return (
      <section className="customers-section">
        <div className="orders-detail-heading">
          <h3>{c.text("Important Note", "ملاحظة مهمة")}</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("notes")}
          >
            {c.text("Edit", "تعديل")}
          </button>
        </div>
        <div className="customers-note">
          <FileText size={21} />
          <div>
            <p>
              {guest.note?.text ||
                c.text(
                  "No customer note recorded.",
                  "لا توجد ملاحظة عن العميل.",
                )}
            </p>
            {guest.note && (
              <small>
                {c.text("Updated", "تم التحديث")}{" "}
                {bookingDate(guest.note.at, c.locale, true)}
              </small>
            )}
          </div>
        </div>
        {tab === "notes" && (
          <button
            type="button"
            className="customers-add-row"
            onClick={() => setMode("notes")}
          >
            <Plus size={17} />
            {c.text("Edit Internal Note", "تعديل الملاحظة الداخلية")}
          </button>
        )}
      </section>
    );
  }
  const tabs = [
    { value: "overview", label: c.text("Overview", "نظرة عامة") },
    { value: "pets", label: c.text("Pets", "الحيوانات") },
    { value: "orders", label: c.text("Orders", "الطلبات") },
    { value: "bookings", label: c.text("Bookings", "الحجوزات") },
    { value: "notes", label: c.text("Notes", "الملاحظات") },
  ];
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail customers-detail"
      aria-labelledby="customer-detail-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !mode && !full) close();
      }}
    >
      <button
        type="button"
        className="icon-button orders-detail-close"
        onClick={close}
        aria-label={c.text("Close customer details", "إغلاق تفاصيل العميل")}
      >
        <X size={19} />
      </button>
      <div className="customers-detail-title">
        <h2 id="customer-detail-title">{guest.name}</h2>
        <span className="customers-guest-badge">{c.text("Guest", "ضيف")}</span>
      </div>
      <div className="customers-profile">
        <span className="avatar">{customerInitials(guest.name)}</span>
        <div className="customers-profile-contact">
          <p>
            <Phone size={15} />
            <bdi>{guest.phone}</bdi>
          </p>
          <p>
            <Mail size={15} />
            <bdi>{guest.email}</bdi>
          </p>
          {addresses[0] && (
            <p>
              <MapPin size={15} />
              {addresses[0].text}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setMode("edit")}
        >
          {c.text("Edit Customer", "تعديل العميل")}
        </button>
      </div>
      {contactNeedsReview(d, guest) && (
        <p className="customers-review-note">
          {c.text(
            "Contact overlap: review shared email/phone. Histories remain separate.",
            "تداخل في بيانات الاتصال: راجع البريد أو الهاتف المشترك. السجلات تبقى منفصلة.",
          )}
        </p>
      )}
      <div className="customers-mini-metrics">
        {[
          {
            icon: ShoppingBag,
            count: orderCount,
            label: c.text("Orders", "الطلبات"),
            tab: "orders",
          },
          {
            icon: CalendarDays,
            count: bookingCount,
            label: c.text("Bookings", "الحجوزات"),
            tab: "bookings",
          },
          {
            icon: Cat,
            count: pets.length,
            label: c.text("Pets", "الحيوانات"),
            tab: "pets",
          },
        ].map((metric) => (
          <button
            type="button"
            key={metric.tab}
            onClick={() => setTab(metric.tab)}
          >
            <metric.icon size={22} />
            <span>
              <strong>{metric.count}</strong>
              <small>{metric.label}</small>
            </span>
          </button>
        ))}
      </div>
      <div
        role="tablist"
        aria-label={c.text("Customer detail tabs", "تبويبات تفاصيل العميل")}
        className="customers-detail-tabs"
      >
        {tabs.map(({ value, label }, i) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            aria-controls="customer-tab-content"
            id={`customer-tab-${value}`}
            onClick={() => setTab(value)}
            onKeyDown={(e) => {
              const delta =
                e.key === "ArrowRight"
                  ? c.ar
                    ? -1
                    : 1
                  : e.key === "ArrowLeft"
                    ? c.ar
                      ? 1
                      : -1
                    : 0;
              if (delta || e.key === "Home" || e.key === "End") {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + delta + tabs.length) % tabs.length;
                setTab(tabs[next].value);
                const controls =
                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    "button",
                  );
                controls?.[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="customer-tab-content"
        role="tabpanel"
        aria-labelledby={`customer-tab-${tab}`}
      >
        {(tab === "overview" || tab === "pets") && (
          <section className="customers-section">
            <h3>{c.text("Pets", "الحيوانات")}</h3>
            {petList()}
          </section>
        )}
        {tab === "overview" && (
          <section className="customers-section">
            <h3>{c.text("Addresses", "العناوين")}</h3>
            <div className="customers-address-grid">
              {addresses.map((address) => {
                const Icon = address.kind === "booking" ? Home : Truck;
                return (
                  <Link
                    key={address.text}
                    className="customers-address-card"
                    href={`/admin/${address.kind === "order" ? "orders" : "bookings"}?search=${encodeURIComponent(address.source)}`}
                  >
                    <Icon size={25} />
                    <span>
                      <strong>
                        {address.kind === "booking"
                          ? c.text("Home Service", "خدمة منزلية")
                          : c.text("Delivery", "التوصيل")}
                      </strong>
                      <small>{address.text}</small>
                    </span>
                  </Link>
                );
              })}
            </div>
            {!addresses.length && (
              <p className="small muted">
                {c.text("No submitted address.", "لا يوجد عنوان مسجل.")}
              </p>
            )}
            <button type="button" disabled className="customers-add-row">
              <Plus size={17} />
              {c.text("Add Address", "إضافة عنوان")}
            </button>
            <p className="customers-caption">
              {c.text(
                "Addresses come from orders and home bookings. Saved address management is not enabled.",
                "تأتي العناوين من الطلبات والحجوزات المنزلية. إدارة العناوين المحفوظة غير مفعلة.",
              )}
            </p>
          </section>
        )}
        {(tab === "overview" || tab === "notes") && note()}
        {tab === "overview" && (
          <section className="customers-section">
            <h3>{c.text("Recent Activity", "النشاط الأخير")}</h3>
            {activityList(undefined, 4)}
            <button
              className="customers-add-row customers-full-history"
              type="button"
              onClick={() => setFull(true)}
            >
              {c.text("View Full History", "عرض السجل الكامل")}
              <ArrowRight size={17} />
            </button>
          </section>
        )}
        {tab === "orders" && (
          <section className="customers-section">
            <h3>{c.text("Order History", "سجل الطلبات")}</h3>
            {activityList("order")}
          </section>
        )}
        {tab === "bookings" && (
          <section className="customers-section">
            <h3>{c.text("Booking History", "سجل الحجوزات")}</h3>
            {activityList("booking")}
          </section>
        )}
      </div>
      <p className="orders-detail-disclaimer">
        {c.text(
          "Synthetic guest records only. No customer login, saved pet account or real customer photographs. Activity dates are record creation times, not appointment times.",
          "سجلات ضيوف تجريبية فقط. لا حسابات دخول أو ملفات حيوانات أو صور عملاء حقيقية. تواريخ النشاط هي أوقات إنشاء السجلات وليست مواعيد الخدمة.",
        )}
      </p>
      <p role="status" className="small">
        {notice}
      </p>
      {mode && (
        <CustomerDialog
          key={`${guest.id}-${mode}`}
          guest={guest}
          notes={mode === "notes"}
          close={() => setMode(null)}
          saved={() =>
            setNotice(
              c.text("Demo customer updated.", "تم تحديث العميل التجريبي."),
            )
          }
        />
      )}
      <Modal
        open={full}
        onOpenChange={setFull}
        title={c.text("Full Customer History", "سجل العميل الكامل")}
      >
        <div className="customers-history-modal">{activityList()}</div>
      </Modal>
    </aside>
  );
}
