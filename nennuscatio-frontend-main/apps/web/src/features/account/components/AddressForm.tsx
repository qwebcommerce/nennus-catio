"use client";

import { type AccountArea, type AddressPin, type SavedAddress, type SavedAddressInput, savedAddressInputSchema } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { areasByCity } from "@/shared/lib/delivery-areas";
import { Field } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
import { ShareLocation } from "@/shared/ui/ShareLocation";

type Text = (en: string, ar: string) => string;

const EMPTY = { label: "", areaId: "", zone: "", street: "", building: "", floor: "", flat: "", landmark: "", note: "", pin: null as AddressPin | null, makeDefault: false };
type Form = typeof EMPTY;

function formFrom(address: SavedAddress | null): Form {
  if (!address) return EMPTY;
  return { label: address.label, areaId: address.area?.id ?? "", ...address.address, makeDefault: false };
}

/** A field's message in the customer's words (the contract and the server describe it for developers). */
function addressFieldMessage(path: string, text: Text): string {
  if (path === "label") return text("Give the address a name, for example Home.", "سمِّ العنوان، مثلاً المنزل.");
  if (path === "areaId") return text("Choose an area we deliver to or visit.", "اختر منطقة نوصّل إليها أو نزورها.");
  if (/^address\.(zone|street|building)$/.test(path)) return text("Numbers only.", "أرقام فقط.");
  return text("Please check this field.", "يرجى مراجعة هذا الحقل.");
}

/** Which services an area has: shown next to its name so the customer knows what the address is good for. */
export function areaServices(area: Pick<AccountArea, "delivery" | "homeVisits">, text: Text): string {
  if (area.delivery && area.homeVisits) return "";
  return area.delivery ? text(" · delivery only", " · توصيل فقط") : text(" · home visits only", " · زيارات منزلية فقط");
}

/**
 * The saved-address form (10a): a name for it, the area under its city heading (D135), the Qatar plate
 * (D122) and "use as my default". Checked against the contract before sending; the server's own
 * refusals come back as field messages. Reused by checkout and booking in 10b.
 */
export function AddressForm({
  address,
  areas,
  busy,
  serverError,
  onSave,
  onCancel,
}: {
  address: SavedAddress | null;
  areas: readonly AccountArea[];
  busy: boolean;
  serverError: unknown;
  onSave: (input: SavedAddressInput) => void;
  onCancel: () => void;
}) {
  const c = useCopy();
  const [form, setForm] = useState<Form>(() => formFrom(address));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const server = serverError instanceof ApiError ? serverError : null;
  const message = (path: string) => errors[path] ?? (server?.fields[path] ? addressFieldMessage(path, c.text) : undefined);
  const update = (field: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const errorLine = (path: string) => {
    const text = message(path);
    return text ? (
      <p className="form-error" id={`address-error-${path}`}>
        {text}
      </p>
    ) : null;
  };
  const invalid = (path: string) => ({ "aria-invalid": Boolean(message(path)), "aria-describedby": message(path) ? `address-error-${path}` : undefined });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = savedAddressInputSchema.safeParse({
      label: form.label,
      areaId: form.areaId,
      address: { zone: form.zone, street: form.street, building: form.building, floor: form.floor, flat: form.flat, landmark: form.landmark, note: form.note, pin: form.pin },
      makeDefault: form.makeDefault,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), addressFieldMessage(issue.path.join("."), c.text)])));
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  // An area switched off since the address was saved is kept in the list, marked, so the form shows it.
  const current = address?.area && !areas.some((area) => area.id === address.area?.id) ? address.area : null;

  return (
    <form className="form-stack saved-form" onSubmit={submit} noValidate>
      <Field label={c.text("Name for this address (for example Home)", "اسم لهذا العنوان (مثلاً المنزل)")}>
        <input value={form.label} onChange={update("label")} maxLength={30} {...invalid("label")} />
      </Field>
      {errorLine("label")}
      <Field label={c.text("Area", "المنطقة")}>
        <select value={form.areaId} onChange={update("areaId")} {...invalid("areaId")}>
          <option value="" disabled>
            {c.text("Choose your area", "اختر منطقتك")}
          </option>
          {current && (
            <option value={current.id} disabled>
              {c.local(current.name)} · {c.text("no longer served", "لم تعد مخدومة")}
            </option>
          )}
          {/* Neighbourhoods under their city headings (D135); a city alone cannot be chosen. */}
          {areasByCity(areas).map((city) => (
            <optgroup key={city.cityId} label={c.local(city.city)}>
              {city.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {c.local(area.name)}
                  {areaServices(area, c.text)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {errorLine("areaId")}
      <div className="checkout-address">
        {(
          [
            ["zone", c.text("Zone", "المنطقة (رقم)"), 3],
            ["street", c.text("Street", "الشارع"), 4],
            ["building", c.text("Building", "المبنى"), 4],
          ] as const
        ).map(([key, label, max]) => (
          <div key={key}>
            <Field label={label}>
              <NumberInput dir="ltr" value={form[key]} onChange={update(key)} maxLength={max} {...invalid(`address.${key}`)} />
            </Field>
            {errorLine(`address.${key}`)}
          </div>
        ))}
      </div>
      <div className="checkout-address">
        <Field label={c.text("Floor (optional)", "الطابق (اختياري)")}>
          <input value={form.floor} onChange={update("floor")} maxLength={20} />
        </Field>
        <Field label={c.text("Flat (optional)", "الشقة (اختياري)")}>
          <input value={form.flat} onChange={update("flat")} maxLength={20} />
        </Field>
      </div>
      <Field label={c.text("Landmark (optional)", "علامة مميزة (اختياري)")}>
        <input value={form.landmark} onChange={update("landmark")} maxLength={120} />
      </Field>
      <Field label={c.text("Note for the driver or groomer (optional)", "ملاحظة للسائق أو لمقدم العناية (اختياري)")}>
        <textarea value={form.note} onChange={update("note")} maxLength={300} />
      </Field>
      <ShareLocation value={form.pin} onChange={(pin) => setForm((current) => ({ ...current, pin }))} purpose="saved" />
      {!address?.isDefault && (
        <label className="row">
          <input type="checkbox" checked={form.makeDefault} onChange={(event) => setForm((current) => ({ ...current, makeDefault: event.target.checked }))} />
          {c.text("Use as my default address", "استخدمه كعنواني الافتراضي")}
        </label>
      )}
      <div className="row">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save address", "احفظ العنوان")}
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={onCancel}>
          {c.text("Cancel", "إلغاء")}
        </button>
      </div>
    </form>
  );
}
