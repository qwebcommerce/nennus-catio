"use client";

import type { AdminCustomer } from "@nennus-catio/contracts";
import { CalendarDays, Cat, House, Mail, MapPin, PawPrint, Phone, Plane, ShoppingBag, Wallet, X } from "lucide-react";
import { type FormEvent, type RefObject, useState } from "react";
import { plateLine } from "@/features/account/components/SavedAddressChoice";
import { BookingStatusBadge } from "@/features/admin/bookings/components/BookingApiDetail";
import { petAge } from "@/features/admin/bookings/lib/booking-labels";
import { dateLabel } from "@/features/admin/delivery-slots/lib/delivery-labels";
import { OrderStatusBadge } from "@/features/admin/orders/components/OrderApiDetail";
import { placedAt } from "@/features/admin/orders/lib/admin-order-labels";
import { RelocationStatusBadge } from "@/features/admin/relocation/components/RelocationApiDetail";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { ageFromBornMonth } from "@/shared/api/account";
import { describeAdminCustomerError, useAddCustomerNote, useAdminCustomer, useDeleteCustomerNote } from "@/shared/api/admin-customers";
import { useCopy } from "@/shared/lib/copy";
import { formatMoney } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import { ErrorMessage, Field } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { PinLink } from "@/shared/ui/ShareLocation";
import { ACCOUNT_STATUS, customerInitials, customerLabel, dayLabel } from "../lib/customer-labels";
import { CustomerTagsDialog, TagChip } from "./CustomerTags";

type Tab = "overview" | "pets" | "orders" | "bookings" | "relocation" | "notes";
type Text = (en: string, ar: string) => string;

const kilograms = (grams: number, text: Text) => `${grams / 1000} ${text("kg", "كغ")}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * One customer record (10d): contact, account status and tags, then Overview (the account and its
 * saved addresses), Pets (saved and seen in bookings), Orders, Bookings, Relocation (15d) and Notes. Staff never edit the
 * customer's own details (D186). Tags are changed in an edit form; deleting a note asks first (D128).
 * Links lead to the Orders, Bookings and Relocation pages only for roles that may open them (D105).
 */
export function CustomerApiDetail({
  id,
  label: listLabel,
  close,
  panelRef,
}: {
  id: string;
  /** The list's name for the record, shown until the record arrives. */
  label: string;
  close: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy();
  const canEdit = useAdminAccess().can("customers", "edit");
  const query = useAdminCustomer(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [editingTags, setEditingTags] = useState(false);
  const [notice, setNotice] = useState("");
  const customer = query.data;
  const label = customer ? customerLabel(customer) : listLabel;
  const tabs: readonly { value: Tab; label: string }[] = [
    { value: "overview", label: c.text("Overview", "نظرة عامة") },
    { value: "pets", label: c.text("Pets", "الحيوانات") },
    { value: "orders", label: c.text("Orders", "الطلبات") },
    { value: "bookings", label: c.text("Bookings", "الحجوزات") },
    { value: "relocation", label: c.text("Relocation", "النقل") },
    { value: "notes", label: c.text("Notes", "الملاحظات") },
  ];

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="panel orders-detail customers-detail"
      aria-labelledby="customer-detail-title"
      onKeyDown={(event) => {
        // Escape in a dialog (tags, "Delete this note?") reaches here through React too: it closes only the dialog.
        if (event.key === "Escape" && event.currentTarget.contains(event.target as Node)) close();
      }}
    >
      <button type="button" className="icon-button orders-detail-close" aria-label={c.text("Close customer details", "إغلاق تفاصيل العميل")} onClick={close}>
        <X size={18} />
      </button>
      <div className="customers-detail-title">
        <h2 id="customer-detail-title">
          <bdi>{label}</bdi>
        </h2>
        {customer && <span className="customers-guest-badge">{c.local(ACCOUNT_STATUS[customer.account])}</span>}
      </div>
      {query.isPending && (
        <p className="muted" role="status" aria-busy="true">
          {c.text("Loading the customer…", "جارٍ تحميل العميل…")}
        </p>
      )}
      {query.isError && !customer && (
        <div className="inline-state" role="alert">
          <p>{describeAdminCustomerError(query.error, c.text)}</p>
          <button type="button" className="button button--secondary" onClick={() => void query.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      )}
      {customer && (
        <>
          <div className="customers-profile customers-profile--plain">
            <span className="avatar" aria-hidden="true">
              {customerInitials(label)}
            </span>
            <div className="customers-profile-contact">
              <p>
                <Phone size={15} aria-hidden="true" />
                {customer.phone ? <bdi>{customer.phone}</bdi> : <span>{c.text("No phone given", "لم يُذكر هاتف")}</span>}
              </p>
              <p>
                <Mail size={15} aria-hidden="true" />
                <bdi>{customer.email}</bdi>
              </p>
            </div>
          </div>
          <div className="customers-tags-row">
            {customer.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
            {customer.tags.length === 0 && <small className="muted">{c.text("No tags", "لا وسوم")}</small>}
            {canEdit && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setNotice("");
                  setEditingTags(true);
                }}
              >
                {c.text("Edit tags", "تعديل الوسوم")}
              </button>
            )}
          </div>
          <p role="status" className="small">
            {notice}
          </p>
          <div className="customers-mini-metrics">
            {[
              { icon: ShoppingBag, value: String(customer.orders), label: c.text("Orders", "الطلبات"), tab: "orders" as const },
              { icon: CalendarDays, value: String(customer.bookings), label: c.text("Bookings", "الحجوزات"), tab: "bookings" as const },
              {
                icon: Wallet,
                // The amount alone (the currency is in the label), so it fits the card.
                value: new Intl.NumberFormat(c.locale === "ar" ? "ar-QA" : "en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(customer.totalPaid / 100),
                label: c.text("Total paid, QAR", "إجمالي المدفوع، ر.ق"),
                tab: "orders" as const,
                money: true,
              },
              { icon: Plane, value: String(customer.relocations), label: c.text("Relocation requests", "طلبات النقل"), tab: "relocation" as const },
            ].map((metric) => (
              <button type="button" key={metric.label} className={metric.money ? "customers-money" : undefined} onClick={() => setTab(metric.tab)}>
                <metric.icon size={22} aria-hidden="true" />
                <span>
                  <strong>
                    <bdi>{metric.value}</bdi>
                  </strong>
                  <small>{metric.label}</small>
                </span>
              </button>
            ))}
          </div>
          <div role="tablist" aria-label={c.text("Customer details", "تفاصيل العميل")} className="customers-detail-tabs">
            {tabs.map(({ value, label: name }, index) => (
              <button
                type="button"
                key={value}
                role="tab"
                id={`customer-tab-${value}`}
                aria-selected={tab === value}
                aria-controls="customer-tab-content"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" ? (c.ar ? -1 : 1) : event.key === "ArrowLeft" ? (c.ar ? 1 : -1) : 0;
                  if (!step && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
                  setTab(tabs[next]?.value ?? "overview");
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div id="customer-tab-content" role="tabpanel" aria-labelledby={`customer-tab-${tab}`}>
            {tab === "overview" && <Overview customer={customer} />}
            {tab === "pets" && <Pets customer={customer} />}
            {tab === "orders" && <Orders customer={customer} />}
            {tab === "bookings" && <Bookings customer={customer} />}
            {tab === "relocation" && <Relocation customer={customer} />}
            {tab === "notes" && <Notes customer={customer} />}
          </div>
          <CustomerTagsDialog customer={editingTags ? customer : null} onClose={() => setEditingTags(false)} onSaved={setNotice} />
        </>
      )}
    </aside>
  );
}

function Overview({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  const account = customer.accountDetails;
  const never = c.text("Never", "أبداً");
  return (
    <>
      <section className="customers-section">
        <h3>{c.text("Account", "الحساب")}</h3>
        {account ? (
          <dl className="customers-facts">
            <div>
              <dt>{c.text("Registered", "التسجيل")}</dt>
              <dd>{placedAt(account.registeredAt, c.locale)}</dd>
            </div>
            <div>
              <dt>{c.text("Email confirmed", "تأكيد البريد")}</dt>
              <dd>{account.confirmedAt ? placedAt(account.confirmedAt, c.locale) : c.text("Not yet: the account cannot log in", "ليس بعد: لا يمكن للحساب تسجيل الدخول")}</dd>
            </div>
            <div>
              <dt>{c.text("Last login", "آخر دخول")}</dt>
              <dd>{account.lastLoginAt ? placedAt(account.lastLoginAt, c.locale) : never}</dd>
            </div>
            <div>
              <dt>{c.text("Name on the account", "الاسم في الحساب")}</dt>
              <dd>{account.profile.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{c.text("Phone on the account", "الهاتف في الحساب")}</dt>
              <dd>{account.profile.phone ? <bdi>{account.profile.phone}</bdi> : "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="small muted">
            {c.text(
              "No account: a guest who ordered or booked with this email. If they register with it and confirm the email, these orders and bookings join the account.",
              "لا يوجد حساب: زائر طلب أو حجز بهذا البريد. إذا سجّل به وأكّد البريد، تنضم هذه الطلبات والحجوزات إلى الحساب.",
            )}
          </p>
        )}
      </section>
      <section className="customers-section">
        <h3>{c.text("Activity", "النشاط")}</h3>
        <dl className="customers-facts">
          <div>
            <dt>{c.text("First seen", "أول ظهور")}</dt>
            <dd>{placedAt(customer.firstSeenAt, c.locale)}</dd>
          </div>
          <div>
            <dt>{c.text("Last activity", "آخر نشاط")}</dt>
            <dd>{placedAt(customer.lastActivityAt, c.locale)}</dd>
          </div>
        </dl>
      </section>
      {account && (
        <section className="customers-section">
          <h3>{c.text("Saved addresses", "العناوين المحفوظة")}</h3>
          {customer.savedAddresses.length === 0 ? (
            <p className="small muted">{c.text("No saved addresses.", "لا توجد عناوين محفوظة.")}</p>
          ) : (
            <div className="customers-address-grid">
              {customer.savedAddresses.map((address) => (
                <div key={address.id} className="customers-address-card">
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <strong>{address.label}</strong>
                    {address.isDefault && <small>{c.text("Default address", "العنوان الافتراضي")}</small>}
                    <small>{plateLine(address.address, c.text)}</small>
                    <small>
                      {address.area
                        ? `${c.local(address.area.name)}, ${c.local(address.area.city)}`
                        : c.text("Its area was removed: the customer chooses another next time.", "أُزيلت منطقته: يختار العميل منطقة أخرى في المرة القادمة.")}
                    </small>
                    {address.address.landmark && <small>{address.address.landmark}</small>}
                    {address.address.pin && (
                      <small>
                        <PinLink pin={address.address.pin}>
                          {c.text(`Open in Google Maps (± ${address.address.pin.accuracy} m)`, `افتح في خرائط Google (± ${address.address.pin.accuracy} م)`)}
                        </PinLink>
                      </small>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Pets({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  return (
    <>
      {customer.accountDetails && (
        <section className="customers-section">
          <h3>{c.text("Saved pets", "الحيوانات المحفوظة")}</h3>
          {customer.savedPets.length === 0 ? (
            <p className="small muted">{c.text("No saved pets.", "لا توجد حيوانات محفوظة.")}</p>
          ) : (
            <div className="customers-pet-grid">
              {customer.savedPets.map((pet) => (
                <div key={pet.id} className="customers-address-card">
                  <Cat size={18} aria-hidden="true" />
                  <span>
                    <strong>{pet.name}</strong>
                    <small>
                      {[
                        pet.petType ? c.local(pet.petType.name) : "",
                        pet.breed,
                        ageFromBornMonth(pet.bornMonth, c.text) ?? "",
                        pet.weightGrams ? kilograms(pet.weightGrams, c.text) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {pet.notes && <small>{pet.notes}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="customers-section">
        <h3>{c.text("Pets seen in bookings", "الحيوانات في الحجوزات")}</h3>
        {customer.petsSeen.length === 0 ? (
          <p className="small muted">{c.text("No pets in bookings yet.", "لا توجد حيوانات في الحجوزات بعد.")}</p>
        ) : (
          <div className="customers-pet-grid">
            {customer.petsSeen.map((pet) => (
              // The API groups pets by group and breed, the breed ignoring case (D246), so this key is unique.
              <div key={`${pet.pet.group.en}|${pet.pet.breed.toLocaleLowerCase()}`} className="customers-address-card">
                <PawPrint size={18} aria-hidden="true" />
                <span>
                  <strong>{petLabel(pet.pet, c.local)}</strong>
                  <small>{petAge(pet.ageMonths, c.text)}</small>
                  <small>
                    {c.text(
                      `${plural(pet.bookings, "booking", "bookings")} · latest ${dayLabel(pet.lastAppointmentAt, "en")}`,
                      `${pet.bookings} حجز · الأحدث ${dayLabel(pet.lastAppointmentAt, "ar")}`,
                    )}
                  </small>
                  {pet.savedPetId && <small className="customers-saved-mark">{c.text("Saved pet", "حيوان محفوظ")}</small>}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="customers-caption">
          {c.text(
            "Each booking keeps the pet's details as given then; the latest are shown.",
            "يحتفظ كل حجز ببيانات الحيوان كما أُدخلت حينها؛ تظهر أحدثها.",
          )}
        </p>
      </section>
    </>
  );
}

function Orders({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  const canOpen = useAdminAccess().canView("orders");
  return (
    <section className="customers-section">
      <h3>{c.text("Orders", "الطلبات")}</h3>
      {customer.recentOrders.length === 0 ? (
        <p className="small muted">{c.text("No orders yet.", "لا توجد طلبات بعد.")}</p>
      ) : (
        <ul className="customers-activity-list">
          {customer.recentOrders.map((order) => (
            <li key={order.reference}>
              <div>
                <span className="customers-activity-info">
                  <strong>
                    {canOpen ? (
                      <Link href={`/admin/orders?search=${encodeURIComponent(order.reference)}`}>
                        <bdi>{order.reference}</bdi>
                      </Link>
                    ) : (
                      <bdi>{order.reference}</bdi>
                    )}
                  </strong>
                  <small>
                    {placedAt(order.placedAt, c.locale)} ·{" "}
                    {order.fulfilment === "pickup" ? c.text("Pickup", "استلام") : order.area ? c.local(order.area) : c.text("Delivery", "توصيل")} ·{" "}
                    {c.text(plural(order.itemCount, "item", "items"), `${order.itemCount} قطعة`)}
                  </small>
                  {/* A Pet House order, as the Orders page marks it (#14). */}
                  {order.hasHouse && (
                    <small className="orders-house-mark">
                      <House size={12} aria-hidden="true" />
                      {c.text("Pet House", "بيت حيوان")}
                    </small>
                  )}
                </span>
                <OrderStatusBadge status={order.status} />
                <bdi>{formatMoney(order.total, c.locale)}</bdi>
              </div>
            </li>
          ))}
        </ul>
      )}
      {customer.orders > customer.recentOrders.length && (
        <p className="customers-caption">
          {c.text(
            `Showing the newest ${customer.recentOrders.length} of ${customer.orders}. Search the Orders page for the rest.`,
            `عرض أحدث ${customer.recentOrders.length} من ${customer.orders}. ابحث في صفحة الطلبات عن الباقي.`,
          )}
        </p>
      )}
    </section>
  );
}

function Bookings({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  const canOpen = useAdminAccess().canView("bookings");
  return (
    <section className="customers-section">
      <h3>{c.text("Bookings", "الحجوزات")}</h3>
      {customer.recentBookings.length === 0 ? (
        <p className="small muted">{c.text("No bookings yet.", "لا توجد حجوزات بعد.")}</p>
      ) : (
        <ul className="customers-activity-list">
          {customer.recentBookings.map((booking) => (
            <li key={booking.reference}>
              <div>
                <span className="customers-activity-info">
                  <strong>
                    {canOpen ? (
                      <Link href={`/admin/bookings?search=${encodeURIComponent(booking.reference)}`}>
                        <bdi>{booking.reference}</bdi>
                      </Link>
                    ) : (
                      <bdi>{booking.reference}</bdi>
                    )}
                  </strong>
                  <small>
                    {petLabel(booking.pet, c.local)} · {c.local(booking.package.name)}
                  </small>
                  <small>
                    {dateLabel(booking.appointment.date, c.locale)}, <bdi dir="ltr">{booking.appointment.start}</bdi> ·{" "}
                    {booking.location === "home" ? c.text("Home visit", "زيارة منزلية") : c.text("Shop", "المتجر")}
                  </small>
                </span>
                <BookingStatusBadge status={booking.status} />
                <bdi>{formatMoney(booking.total, c.locale)}</bdi>
              </div>
            </li>
          ))}
        </ul>
      )}
      {customer.bookings > customer.recentBookings.length && (
        <p className="customers-caption">
          {c.text(
            `Showing the newest ${customer.recentBookings.length} of ${customer.bookings}. Search the Bookings page for the rest.`,
            `عرض أحدث ${customer.recentBookings.length} من ${customer.bookings}. ابحث في صفحة الحجوزات عن الباقي.`,
          )}
        </p>
      )}
    </section>
  );
}

/** The customer's relocation requests (15d), placed with this email, as the Relocation page lists them. */
function Relocation({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  const canOpen = useAdminAccess().canView("relocation");
  return (
    <section className="customers-section">
      <h3>{c.text("Relocation requests", "طلبات النقل")}</h3>
      {customer.recentRelocations.length === 0 ? (
        <p className="small muted">{c.text("No relocation requests yet.", "لا توجد طلبات نقل بعد.")}</p>
      ) : (
        <ul className="customers-activity-list">
          {customer.recentRelocations.map((request) => (
            <li key={request.reference}>
              <div>
                <span className="customers-activity-info">
                  <strong>
                    {canOpen ? (
                      <Link href={`/admin/relocation?search=${encodeURIComponent(request.reference)}`}>
                        <bdi>{request.reference}</bdi>
                      </Link>
                    ) : (
                      <bdi>{request.reference}</bdi>
                    )}
                  </strong>
                  <small>
                    {placedAt(request.placedAt, c.locale)} · {request.pets.join(c.text(", ", "، "))}
                  </small>
                  <small>
                    {c.text("To ", "إلى ")}
                    {c.local(request.destination)}
                  </small>
                </span>
                <RelocationStatusBadge status={request.status} />
                {request.quote === null ? <small>–</small> : <bdi>{formatMoney(request.quote, c.locale)}</bdi>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {customer.relocations > customer.recentRelocations.length && (
        <p className="customers-caption">
          {c.text(
            `Showing the newest ${customer.recentRelocations.length} of ${customer.relocations}. Search the Relocation page for the rest.`,
            `عرض أحدث ${customer.recentRelocations.length} من ${customer.relocations}. ابحث في صفحة النقل عن الباقي.`,
          )}
        </p>
      )}
    </section>
  );
}

/** Notes are added and deleted, never edited (D186 question 7); staff only. */
function Notes({ customer }: { customer: AdminCustomer }) {
  const c = useCopy();
  const access = useAdminAccess();
  const canEdit = access.can("customers", "edit");
  const canDelete = access.can("customers", "delete");
  const add = useAddCustomerNote();
  const remove = useDeleteCustomerNote();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setError(c.text("Please write the note.", "يرجى كتابة الملاحظة."));
      return;
    }
    setError("");
    setNotice("");
    try {
      await add.mutateAsync({ id: customer.id, text: value });
      setText("");
      setNotice(c.text("Note added.", "أُضيفت الملاحظة."));
    } catch (err) {
      setError(describeAdminCustomerError(err, c.text));
    }
  }

  function askDelete(note: AdminCustomer["notes"][number]) {
    setError("");
    setNotice("");
    setConfirming({
      title: c.text("Delete this note?", "حذف هذه الملاحظة؟"),
      message: c.text(
        `The note by ${note.staffName} is removed for everyone and cannot be brought back.`,
        `تُحذف ملاحظة ${note.staffName} للجميع ولا يمكن استرجاعها.`,
      ),
      confirmLabel: c.text("Delete note", "حذف الملاحظة"),
      run: async () => {
        try {
          await remove.mutateAsync({ id: customer.id, noteId: note.id });
          setNotice(c.text("Note deleted.", "حُذفت الملاحظة."));
        } catch (err) {
          setError(describeAdminCustomerError(err, c.text));
        }
      },
    });
  }

  return (
    <section className="customers-section">
      <h3>{c.text("Notes", "الملاحظات")}</h3>
      <p className="customers-caption">{c.text("For staff only: the customer never sees notes.", "للموظفين فقط: لا يرى العميل الملاحظات.")}</p>
      {canEdit && (
        <form className="form-stack customers-note-form" onSubmit={submit}>
          <Field label={c.text("New note", "ملاحظة جديدة")}>
            <textarea maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="row">
            <button type="submit" className="button button--primary" disabled={add.isPending}>
              {c.text("Add note", "إضافة الملاحظة")}
            </button>
          </div>
        </form>
      )}
      <ErrorMessage message={error} />
      <p role="status" className="small">
        {notice}
      </p>
      {customer.notes.length === 0 ? (
        <p className="small muted">{c.text("No notes yet.", "لا توجد ملاحظات بعد.")}</p>
      ) : (
        <ul className="customers-notes">
          {customer.notes.map((note) => (
            <li key={note.id} className="customers-note">
              <div>
                <p>{note.text}</p>
                <small>
                  {note.staffName} · {placedAt(note.createdAt, c.locale)}
                </small>
              </div>
              {canDelete && (
                <button
                  type="button"
                  className="text-button"
                  disabled={remove.isPending}
                  aria-label={c.text(
                    `Delete note by ${note.staffName}, ${placedAt(note.createdAt, "en")}`,
                    `حذف ملاحظة ${note.staffName}، ${placedAt(note.createdAt, "ar")}`,
                  )}
                  onClick={() => askDelete(note)}
                >
                  {c.text("Delete", "حذف")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
