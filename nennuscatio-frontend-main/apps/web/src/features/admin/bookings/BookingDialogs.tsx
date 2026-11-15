"use client";
import { useState } from "react";
import type { Booking, GroomingLocation } from "@/mocks/data/business";
import { remaining } from "@/mocks/adapters/business-repository";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { Modal, Field, ErrorMessage } from "@/shared/ui/BusinessUI";
import { bookingDate } from "./booking-list";

export function BookingEditDialog({
  booking,
  mode,
  close,
}: {
  booking: Booking;
  mode: "reschedule" | "notes";
  close: () => void;
}) {
  const c = useCopy(),
    d = useBusiness();
  const [slotId, setSlotId] = useState(booking.slotId),
    [petNotes, setPetNotes] = useState(booking.petNotes),
    [internalNotes, setInternalNotes] = useState(booking.internalNotes ?? ""),
    [error, setError] = useState("");
  const slots = d.slots.filter(
    (s) =>
      s.kind === "grooming" && (s.id === booking.slotId || remaining(d, s) > 0),
  );
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={
        mode === "notes"
          ? c.text("Edit Booking Notes", "تعديل ملاحظات الحجز")
          : c.text("Reschedule Demo Booking", "تغيير الموعد التجريبي")
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (mode === "notes")
              repo.saveBookingNotes(booking.id, { petNotes, internalNotes });
            else repo.rescheduleBooking(booking.id, slotId);
            close();
          } catch (err) {
            setError(
              c.ar
                ? "تعذر الحفظ. تحقق من توفر الموعد وحالة الحجز."
                : err instanceof Error
                  ? err.message
                  : "Please retry.",
            );
          }
        }}
      >
        <p className="small muted">
          {c.text(
            "Local demo only. No messages or payments are sent. Availability is checked again when saving.",
            "معاينة محلية فقط. لا تُرسل رسائل أو مدفوعات. يُفحص توفر الموعد عند الحفظ.",
          )}
        </p>
        {mode === "notes" ? (
          <>
            <Field label={c.text("Customer Note", "ملاحظة العميل")}>
              <textarea
                maxLength={2000}
                value={petNotes}
                onChange={(e) => setPetNotes(e.target.value)}
              />
            </Field>
            <Field label={c.text("Internal Note", "ملاحظة داخلية")}>
              <textarea
                maxLength={2000}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label={c.text("Grooming Slot (Qatar)", "موعد العناية (قطر)")}>
            <select
              required
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
            >
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {bookingDate(s.date, c.locale)} · {s.time}
                  {s.id === booking.slotId
                    ? c.text(" · Current", " · الحالي")
                    : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ErrorMessage message={error} />
        <button
          className="button button--primary"
          type="submit"
          disabled={mode === "reschedule" && slotId === booking.slotId}
        >
          {c.text("Save Changes", "حفظ التغييرات")}
        </button>
      </form>
    </Modal>
  );
}

export function NewBookingDialog({
  close,
  onCreated,
}: {
  close: () => void;
  onCreated: (id: string) => void;
}) {
  const c = useCopy(),
    d = useBusiness();
  const [customerId, setCustomerId] = useState(""),
    [packageId, setPackageId] = useState(""),
    [slotId, setSlotId] = useState(""),
    [petName, setPetName] = useState(""),
    [petNotes, setPetNotes] = useState(""),
    [location, setLocation] = useState<GroomingLocation>("in-store"),
    [address, setAddress] = useState(""),
    [payment, setPayment] = useState<"pending" | "success">("pending"),
    [error, setError] = useState("");
  const slots = d.slots.filter(
    (s) => s.kind === "grooming" && remaining(d, s) > 0,
  );
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={c.text("New Demo Booking", "حجز تجريبي جديد")}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const guest = d.guests.find((g) => g.id === customerId),
            holdId = crypto.randomUUID();
          if (!guest) {
            setError(c.text("Choose a demo customer.", "اختر عميلاً تجريبياً."));
            return;
          }
          try {
            repo.hold(slotId, holdId);
            const id = repo.book({
              key: crypto.randomUUID(),
              holdId,
              packageId,
              slotId,
              guest,
              petName,
              petNotes,
              location,
              address,
              outcome: payment,
            });
            onCreated(id);
            close();
          } catch (err) {
            repo.release(holdId);
            setError(
              c.ar
                ? "تعذر إنشاء الحجز. تحقق من الباقة والعنوان وتوفر الموعد."
                : err instanceof Error
                  ? err.message
                  : "Please retry.",
            );
          }
        }}
      >
        <p className="small muted">
          {c.text(
            "Synthetic customers and simulated payment only. This reserves mock capacity; no real booking, payment or message is sent.",
            "عملاء ودفع تجريبيون فقط. يحجز سعة تجريبية دون حجز فعلي أو دفع أو إرسال رسائل.",
          )}
        </p>
        <Field label={c.text("Customer", "العميل")}>
          <select
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">{c.text("Choose customer", "اختر عميلاً")}</option>
            {d.guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Pet Name", "اسم الحيوان")}>
          <input
            required
            maxLength={80}
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
          />
        </Field>
        <Field label={c.text("Package", "الباقة")}>
          <select
            required
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            <option value="">{c.text("Choose package", "اختر باقة")}</option>
            {d.packages
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {c.local(p.name)} · {c.money(p.price)}
                </option>
              ))}
          </select>
        </Field>
        <Field label={c.text("Location", "الموقع")}>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value as GroomingLocation)}
          >
            <option value="in-store">{c.text("In-Store", "في المتجر")}</option>
            <option value="home">
              {c.text("Home Service", "خدمة منزلية")}
            </option>
          </select>
        </Field>
        {location === "home" && (
          <Field label={c.text("Home Address", "عنوان المنزل")}>
            <input
              required
              minLength={8}
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        )}
        <Field label={c.text("Grooming Slot (Qatar)", "موعد العناية (قطر)")}>
          <select
            required
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
          >
            <option value="">
              {c.text("Choose available slot", "اختر موعداً متوفراً")}
            </option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {bookingDate(s.date, c.locale)} · {s.time}
              </option>
            ))}
          </select>
        </Field>
        {!slots.length && (
          <p role="status">
            {c.text(
              "No available grooming slots. Add availability in Manage Availability.",
              "لا توجد مواعيد متاحة. أضف مواعيد من إدارة التوفر.",
            )}
          </p>
        )}
        <Field label={c.text("Customer Note", "ملاحظة العميل")}>
          <textarea
            maxLength={2000}
            value={petNotes}
            onChange={(e) => setPetNotes(e.target.value)}
          />
        </Field>
        <Field label={c.text("Simulated Payment", "الدفع التجريبي")}>
          <select
            value={payment}
            onChange={(e) =>
              setPayment(e.target.value as "pending" | "success")
            }
          >
            <option value="pending">{c.text("Pending", "قيد الانتظار")}</option>
            <option value="success">
              {c.text("Paid (demo only)", "مدفوع (تجريبي فقط)")}
            </option>
          </select>
        </Field>
        <ErrorMessage message={error} />
        <button
          type="submit"
          className="button button--primary"
          disabled={!slots.length}
        >
          {c.text("Create demo booking", "إنشاء حجز تجريبي")}
        </button>
      </form>
    </Modal>
  );
}
