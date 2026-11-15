"use client";
import { useState } from "react";
import type { Guest } from "@/mocks/data/business";
import { repo } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { Modal, Field, ErrorMessage } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";

export function CustomerDialog({
  guest,
  notes = false,
  close,
  saved,
}: {
  guest?: Guest;
  notes?: boolean;
  close: () => void;
  saved: (id: string) => void;
}) {
  const c = useCopy(),
    [error, setError] = useState("");
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={
        notes
          ? c.text("Edit customer note", "تعديل ملاحظة العميل")
          : guest
            ? c.text("Edit Customer", "تعديل العميل")
            : c.text("Add Customer", "إضافة عميل")
      }
      description={c.text(
        "Synthetic guest contact only. Changes reset on refresh; no account, email or pet profile is created.",
        "بيانات ضيف تجريبية فقط. التحديث يعيد البيانات؛ لا يتم إنشاء حساب أو إرسال بريد أو حفظ ملف حيوان.",
      )}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            let id = guest?.id ?? "";
            if (notes && guest)
              repo.saveCustomerNote(guest.id, String(data.get("note") ?? ""));
            else
              id = repo.saveCustomer(
                {
                  name: String(data.get("name")),
                  email: String(data.get("email")),
                  phone: String(data.get("phone")),
                },
                guest?.id,
              );
            saved(id);
            close();
          } catch (err) {
            setError(
              c.ar
                ? "تحقق من الحقول. البريد أو الهاتف المطابق لعميل آخر يحتاج إلى مراجعة دون دمج تلقائي."
                : err instanceof Error
                  ? err.message
                  : "Please retry.",
            );
          }
        }}
      >
        {notes ? (
          <Field
            label={c.text("Internal customer note", "ملاحظة داخلية عن العميل")}
          >
            <textarea
              name="note"
              maxLength={2000}
              rows={5}
              defaultValue={guest?.note?.text ?? ""}
            />
          </Field>
        ) : (
          <>
            <Field label={c.text("Customer name", "اسم العميل")}>
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={guest?.name ?? ""}
              />
            </Field>
            <Field label={c.text("Email address", "البريد الإلكتروني")}>
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                dir="ltr"
                defaultValue={guest?.email ?? ""}
              />
            </Field>
            <Field label={c.text("Phone number", "رقم الهاتف")}>
              <NumberInput
                kind="phone"
                name="phone"
                required
                minLength={8}
                maxLength={20}
                dir="ltr"
                defaultValue={guest?.phone ?? ""}
              />
            </Field>
          </>
        )}
        <ErrorMessage message={error} />
        <button className="button button--primary" type="submit">
          {c.text("Save demo changes", "حفظ التغييرات التجريبية")}
        </button>
      </form>
    </Modal>
  );
}
