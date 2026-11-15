"use client";

import { ACCOUNT_LIMITS, type PetType, type SavedPet, type SavedPetInput, savedPetInputSchema } from "@nennus-catio/contracts";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/shared/api/client";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";

type Text = (en: string, ar: string) => string;

const EMPTY = { name: "", petType: "", breed: "", bornMonth: "", kg: "", notes: "" };
type Form = typeof EMPTY;

function formFrom(pet: SavedPet | null): Form {
  if (!pet) return EMPTY;
  return {
    name: pet.name,
    petType: pet.petType?.slug ?? "",
    breed: pet.breed,
    bornMonth: pet.bornMonth ?? "",
    kg: pet.weightGrams === null ? "" : String(pet.weightGrams / 1000),
    notes: pet.notes,
  };
}

/** Kilograms typed by the customer ("4", "4.2", "4,25") as grams; null when empty; undefined when not a weight. */
export function gramsFromKg(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^(\d{1,3})(?:[.,](\d{1,3}))?$/.exec(trimmed);
  if (!match) return undefined;
  const grams = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  return grams >= 1 && grams <= ACCOUNT_LIMITS.maxWeightGrams ? grams : undefined;
}

function petFieldMessage(path: string, text: Text, raw?: string): string {
  if (path === "name") return text("Please enter your pet's name.", "يرجى إدخال اسم حيوانك.");
  if (path === "weightGrams") return text("Enter the weight in kg, for example 4.5 (up to 200).", "أدخل الوزن بالكيلوغرام، مثلاً 4.5 (حتى 200).");
  if (path === "bornMonth") {
    if (raw && /future/.test(raw)) return text("The born month cannot be in the future.", "لا يمكن أن يكون شهر الولادة في المستقبل.");
    if (raw && /years ago/.test(raw)) return text(`The born month can be at most ${ACCOUNT_LIMITS.oldestPetYears} years ago.`, `يمكن أن يكون شهر الولادة قبل ${ACCOUNT_LIMITS.oldestPetYears} سنة كحد أقصى.`);
    return text("Choose the month and year.", "اختر الشهر والسنة.");
  }
  if (path === "petType") return text("Choose a pet type from the list.", "اختر نوع الحيوان من القائمة.");
  return text("Please check this field.", "يرجى مراجعة هذا الحقل.");
}

/**
 * The saved-pet form (10a; D186 question 3): name, the shop's pet type, breed, born month (the age at a
 * booking is worked out from it), weight in kg and health or handling notes. Reused by booking in 10b.
 */
export function PetForm({
  pet,
  petTypes,
  busy,
  serverError,
  onSave,
  onCancel,
}: {
  pet: SavedPet | null;
  petTypes: readonly PetType[];
  busy: boolean;
  serverError: unknown;
  onSave: (input: SavedPetInput) => void;
  onCancel: () => void;
}) {
  const c = useCopy();
  const [form, setForm] = useState<Form>(() => formFrom(pet));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const server = serverError instanceof ApiError ? serverError : null;
  const message = (path: string) => errors[path] ?? (server?.fields[path] ? petFieldMessage(path, c.text, server.fields[path]) : undefined);
  const update = (field: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const errorLine = (path: string) => {
    const text = message(path);
    return text ? (
      <p className="form-error" id={`pet-error-${path}`}>
        {text}
      </p>
    ) : null;
  };
  const invalid = (path: string) => ({ "aria-invalid": Boolean(message(path)), "aria-describedby": message(path) ? `pet-error-${path}` : undefined });

  function submit(event: FormEvent) {
    event.preventDefault();
    const grams = gramsFromKg(form.kg);
    const parsed = savedPetInputSchema.safeParse({
      name: form.name,
      petType: form.petType || null,
      breed: form.breed,
      bornMonth: form.bornMonth || null,
      weightGrams: grams === undefined ? -1 : grams,
      notes: form.notes,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), petFieldMessage(issue.path.join("."), c.text)])));
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  return (
    <form className="form-stack saved-form" onSubmit={submit} noValidate>
      <Field label={c.text("Pet's name", "اسم الحيوان")}>
        <input value={form.name} onChange={update("name")} maxLength={60} {...invalid("name")} />
      </Field>
      {errorLine("name")}
      <Field label={c.text("Pet type (optional)", "نوع الحيوان (اختياري)")}>
        <select value={form.petType} onChange={update("petType")} {...invalid("petType")}>
          <option value="">{c.text("Not set", "غير محدد")}</option>
          {petTypes.map((type) => (
            <option key={type.slug} value={type.slug}>
              {c.local(type.name)}
            </option>
          ))}
        </select>
      </Field>
      {errorLine("petType")}
      <Field label={c.text("Breed (optional)", "السلالة (اختياري)")}>
        <input value={form.breed} onChange={update("breed")} maxLength={60} />
      </Field>
      <div className="checkout-address">
        <div>
          <Field label={c.text("Born (month and year, optional)", "تاريخ الولادة (الشهر والسنة، اختياري)")}>
            <input type="month" dir="ltr" value={form.bornMonth} onChange={update("bornMonth")} {...invalid("bornMonth")} />
          </Field>
          {errorLine("bornMonth")}
        </div>
        <div>
          <Field label={c.text("Weight in kg (optional)", "الوزن بالكيلوغرام (اختياري)")}>
            <NumberInput kind="decimal" decimals={3} commas dir="ltr" value={form.kg} onChange={update("kg")} maxLength={7} {...invalid("weightGrams")} />
          </Field>
          {errorLine("weightGrams")}
        </div>
      </div>
      <Field label={c.text("Health or handling notes (optional)", "ملاحظات صحية أو حول التعامل (اختياري)")}>
        <textarea value={form.notes} onChange={update("notes")} maxLength={500} />
      </Field>
      <div className="row">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? c.text("Saving…", "جارٍ الحفظ…") : c.text("Save pet", "احفظ الحيوان")}
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={onCancel}>
          {c.text("Cancel", "إلغاء")}
        </button>
      </div>
    </form>
  );
}
