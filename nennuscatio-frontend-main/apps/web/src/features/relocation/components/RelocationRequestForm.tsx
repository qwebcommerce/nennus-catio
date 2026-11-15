"use client";

import {
  ACCOUNT_LIMITS,
  type CustomerProfile,
  GROOMING_LIMITS,
  type PetType,
  RELOCATION_LIMITS,
  type RelocationOptions,
  type RelocationPetInput,
  type RelocationRequestInput,
  relocationRequestInputSchema,
  type SavedPet,
} from "@nennus-catio/contracts";
import { ArrowRight, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { gramsFromKg } from "@/features/account/components/PetForm";
import { checkoutFieldMessage } from "@/features/checkout/pages/CheckoutApiPage";
import { useRouter } from "@/i18n/navigation";
import { monthsSinceBorn, usePetTypes, useSavedPets } from "@/shared/api/account";
import { ApiError } from "@/shared/api/client";
import {
  handOverDocuments,
  RELOCATION_FILE_ACCEPT,
  relocationErrorMessage,
  relocationFileProblem,
  relocationFileProblemText,
  relocationHref,
  useSubmitRelocation,
} from "@/shared/api/relocation";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
import { type FormDocument, formDocuments, matchChosenFiles } from "../lib/documents";
import { dayText, fileSizeText, petAgeText, qatarToday, weightText } from "../lib/format";

type Text = (en: string, ar: string) => string;

interface PetDraft {
  /** Keeps a pet's fields and files together while pets are added and removed. */
  key: string;
  savedPetId: string | null;
  name: string;
  petType: string;
  breed: string;
  years: string;
  months: string;
  kg: string;
  microchip: string;
  notes: string;
  /** "Save this pet to my account" (a typed pet only). */
  save: boolean;
}

interface JourneyDraft {
  country: string;
  city: string;
  /** One of the owner's destinations, "other", or "" (not chosen yet). */
  destination: string;
  other: string;
  plannedDate: string;
  note: string;
}

const newPet = (): PetDraft => ({
  key: crypto.randomUUID(),
  savedPetId: null,
  name: "",
  petType: "",
  breed: "",
  years: "",
  months: "",
  kg: "",
  microchip: "",
  notes: "",
  save: false,
});

/** A saved pet's details, as the form's own copy: the request keeps what is sent, the saved pet is unchanged. */
function fromSaved(pet: SavedPet, key: string): PetDraft {
  const months = monthsSinceBorn(pet.bornMonth);
  return {
    key,
    savedPetId: pet.id,
    name: pet.name,
    petType: pet.petType?.slug ?? "",
    breed: pet.breed,
    years: months === null ? "" : String(Math.floor(months / 12)),
    months: months === null ? "" : String(months % 12),
    kg: pet.weightGrams === null ? "" : String(pet.weightGrams / 1000),
    microchip: "",
    notes: pet.notes,
    save: false,
  };
}

/** The pets as the request sends them, and the problems to show (paths as the contract names them). */
function readPets(pets: readonly PetDraft[]): { pets: RelocationPetInput[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const read = pets.map((pet, index): RelocationPetInput => {
    const path = `pets.${index}`;
    if (!pet.name.trim()) errors[`${path}.name`] = "missing";
    const years = pet.years.trim();
    const months = pet.months.trim();
    let ageMonths = 0;
    if (years === "" && months === "") errors[`${path}.ageMonths`] = "missing";
    else if (!/^\d{0,2}$/.test(years) || !/^\d{0,2}$/.test(months) || Number(months || 0) > 11) errors[`${path}.ageMonths`] = "format";
    else ageMonths = Number(years || 0) * 12 + Number(months || 0);
    if (ageMonths > GROOMING_LIMITS.maxAgeMonths) errors[`${path}.ageMonths`] = "format";
    const grams = gramsFromKg(pet.kg);
    if (grams === undefined) errors[`${path}.weightGrams`] = "format";
    return {
      savedPetId: pet.savedPetId,
      name: pet.name.trim(),
      petType: pet.petType || null,
      breed: pet.breed.trim(),
      ageMonths,
      weightGrams: grams ?? null,
      microchip: pet.microchip.trim(),
      notes: pet.notes.trim(),
      saveToAccount: pet.savedPetId === null && pet.save,
    };
  });
  return { pets: read, errors };
}

function readJourney(journey: JourneyDraft, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!journey.country.trim()) errors["origin.country"] = "missing";
  if (journey.destination === "") errors["destination.id"] = "missing";
  else if (journey.destination === "other" && !journey.other.trim()) errors["destination.other"] = "missing";
  if (journey.plannedDate && !/^\d{4}-\d{2}-\d{2}$/.test(journey.plannedDate)) errors.plannedDate = "format";
  else if (journey.plannedDate && journey.plannedDate < today) errors.plannedDate = "past";
  return errors;
}

/** Which step holds a field: the pets, the journey, or the details on the last step. */
function stepOf(path: string): number {
  if (path.startsWith("pets")) return 1;
  if (path.startsWith("contact")) return 4;
  return 2;
}

/** The customer's message for one field, from our own checks, the contract or the server. */
function fieldText(path: string, raw: string | undefined, text: Text): string | undefined {
  if (!raw) return undefined;
  if (path.startsWith("contact.")) return checkoutFieldMessage(path, raw, text);
  if (/^pets\.\d+\.name$/.test(path)) return text("Please enter your pet's name.", "يرجى إدخال اسم حيوانك.");
  if (/^pets\.\d+\.ageMonths$/.test(path)) {
    return raw === "missing"
      ? text("Please enter your pet's age.", "يرجى إدخال عمر حيوانك.")
      : text("Use whole years (0–50) and months (0–11).", "استخدم سنوات كاملة (٠–٥٠) وأشهراً (٠–١١).");
  }
  if (/^pets\.\d+\.weightGrams$/.test(path)) return text("Enter the weight in kg, for example 4.5 (up to 200).", "أدخل الوزن بالكيلوغرام، مثلاً 4.5 (حتى 200).");
  if (/^pets\.\d+\.petType$/.test(path)) return text("Choose a pet type from the list.", "اختر نوع الحيوان من القائمة.");
  if (/^pets\.\d+\.savedPetId$/.test(path)) return text("We could not find this saved pet. Please choose it again.", "لم نعثر على هذا الحيوان المحفوظ. يرجى اختياره مرة أخرى.");
  if (path === "pets") return text(`You can add up to ${RELOCATION_LIMITS.maxPets} pets.`, `يمكنك إضافة ${RELOCATION_LIMITS.maxPets} حيوانات كحد أقصى.`);
  if (path === "origin.country") return text("Please enter the country your pet travels from.", "يرجى إدخال البلد الذي يسافر منه حيوانك.");
  if (path === "destination.id") return text("Choose where your pet is going, or type it under Other.", "اختر وجهة حيوانك، أو اكتبها تحت «أخرى».");
  if (path === "destination.other") return text("Type the destination.", "اكتب الوجهة.");
  if (path === "plannedDate") {
    return raw === "past" ? text("Choose today or a later date.", "اختر تاريخ اليوم أو تاريخاً لاحقاً.") : text("Choose a valid date.", "اختر تاريخاً صحيحاً.");
  }
  return text("Please check this field.", "يرجى مراجعة هذا الحقل.");
}

/**
 * The relocation request (15c; plan section 4.1), in four steps: the pets (saved ones or new, each
 * with "Save this pet"), the journey (from, to, when, a note), the documents (each one now or later;
 * nothing is needed to send), and a check with the contact details. Sending creates the request; the
 * files chosen here are then sent from the request page, one at a time.
 */
export function RelocationRequestForm({ customer, options }: { customer: CustomerProfile; options: RelocationOptions }) {
  const c = useCopy();
  const router = useRouter();
  const savedPets = useSavedPets();
  const petTypes = usePetTypes();
  const submit = useSubmitRelocation();
  const [today] = useState(() => qatarToday());
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [pets, setPets] = useState<PetDraft[]>(() => [newPet()]);
  const [journey, setJourney] = useState<JourneyDraft>(() => ({
    country: c.text("Qatar", "قطر"),
    city: "",
    destination: "",
    other: "",
    plannedDate: "",
    note: "",
  }));
  const [contact, setContact] = useState({ name: customer.name ?? "", phone: customer.phone ?? "" });
  const [files, setFiles] = useState<Readonly<Record<string, File>>>({});
  const [fileErrors, setFileErrors] = useState<Readonly<Record<string, string>>>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const myPets = savedPets.data ?? [];
  const documents = formDocuments(options.documentTypes, pets.map((pet) => pet.key));
  const chosen = documents.flatMap((document) => (files[document.key] ? [{ document, file: files[document.key] as File }] : []));
  const destination = options.destinations.find((entry) => entry.id === journey.destination) ?? null;

  const message = (path: string) => fieldText(path, errors[path], c.text);
  const errorLine = (path: string) => {
    const text = message(path);
    return text ? (
      <p className="form-error" id={`relocation-error-${path}`}>
        {text}
      </p>
    ) : null;
  };
  const invalid = (path: string) => ({
    "aria-invalid": Boolean(message(path)),
    "aria-describedby": message(path) ? `relocation-error-${path}` : undefined,
  });

  const go = (next: number) => {
    setStep(next);
    setReached((current) => Math.max(current, next));
  };
  const open = (index: number) => {
    if (index <= reached) setStep(index);
  };
  const updatePet = (key: string, change: Partial<PetDraft>) =>
    setPets((current) => current.map((pet) => (pet.key === key ? { ...pet, ...change } : pet)));
  const updateJourney = (field: keyof JourneyDraft) => (event: { target: { value: string } }) =>
    setJourney((current) => ({ ...current, [field]: event.target.value }));

  function continueFromPets() {
    const problems = readPets(pets).errors;
    setErrors(problems);
    if (Object.keys(problems).length === 0) go(2);
  }

  function continueFromJourney() {
    const problems = readJourney(journey, today);
    setErrors(problems);
    if (Object.keys(problems).length === 0) go(3);
  }

  function choosePet(draft: PetDraft, savedPetId: string) {
    const pet = myPets.find((entry) => entry.id === savedPetId);
    setPets((current) => current.map((entry) => (entry.key === draft.key ? (pet ? fromSaved(pet, draft.key) : { ...newPet(), key: draft.key }) : entry)));
  }

  function removePet(key: string) {
    setPets((current) => current.filter((pet) => pet.key !== key));
    setFiles((current) => Object.fromEntries(Object.entries(current).filter(([documentKey]) => !documentKey.endsWith(`:${key}`))));
    setErrors({});
  }

  function chooseFile(key: string, file: File | undefined) {
    if (!file) return;
    const problem = relocationFileProblem(file);
    if (problem) {
      setFileErrors((current) => ({ ...current, [key]: relocationFileProblemText(problem, c.text) }));
      return;
    }
    setFileErrors((current) => Object.fromEntries(Object.entries(current).filter(([documentKey]) => documentKey !== key)));
    setFiles((current) => ({ ...current, [key]: file }));
  }

  function removeFile(key: string) {
    setFiles((current) => Object.fromEntries(Object.entries(current).filter(([documentKey]) => documentKey !== key)));
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submit.isPending || submit.isSuccess) return;
    const read = readPets(pets);
    const request: Omit<RelocationRequestInput, "idempotencyKey"> = {
      locale: c.locale,
      contact: { name: contact.name.trim(), phone: contact.phone.trim() },
      pets: read.pets,
      origin: { country: journey.country.trim(), city: journey.city.trim() },
      destination: journey.destination === "other" ? { id: null, other: journey.other.trim() } : { id: journey.destination || null, other: "" },
      plannedDate: journey.plannedDate || null,
      note: journey.note.trim(),
    };
    const checked = relocationRequestInputSchema.safeParse({ ...request, idempotencyKey: crypto.randomUUID() });
    const contractProblems = checked.success ? {} : Object.fromEntries(checked.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    const problems = { ...contractProblems, ...read.errors, ...readJourney(journey, today) };
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      setErrors(problems);
      setStep(stepOf(first));
      return;
    }
    setErrors({});
    // One key per exact request: sending the same again (a lost answer) returns the same request.
    const body = JSON.stringify(request);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    submit.mutate(relocationRequestInputSchema.parse({ ...request, idempotencyKey: attempt.current.key }), {
      onSuccess: (result) => {
        const { files: matched, unmatched } = matchChosenFiles(result.request, chosen);
        handOverDocuments(result.request.reference, matched, unmatched);
        router.push(relocationHref(result.request.reference));
      },
      onError: (error) => {
        if (!(error instanceof ApiError) || Object.keys(error.fields).length === 0) return;
        setErrors(error.fields);
        const path = Object.keys(error.fields)[0];
        if (path !== undefined) setStep(stepOf(path));
      },
    });
  }

  const steps = [
    c.text("Pets", "الحيوانات"),
    c.text("Journey", "الرحلة"),
    c.text("Documents", "المستندات"),
    c.text("Send", "الإرسال"),
  ];
  const typeName = (slug: string) => {
    const type = (petTypes.data ?? []).find((entry: PetType) => entry.slug === slug);
    return type ? c.local(type.name) : "";
  };
  const savedCount = myPets.length;

  return (
    <section className="ref-section relocation-form" aria-labelledby="relocation-request-title">
      <div className="ref-section__heading">
        <div>
          <p className="eyebrow">{c.text("PET RELOCATION", "نقل الحيوانات")}</p>
          <h1 id="relocation-request-title">{c.text("Start a relocation request", "ابدأ طلب نقل")}</h1>
          <p>
            {c.text(
              "Tell us about your pets and the journey. Our team reviews every request and sends you a quote; nothing is charged now.",
              "أخبرنا عن حيواناتك والرحلة. يراجع فريقنا كل طلب ويرسل لك عرض سعر؛ لا يُدفع أي مبلغ الآن.",
            )}
          </p>
        </div>
        <nav className="ref-grooming__progress" aria-label={c.text("Request steps", "خطوات الطلب")}>
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => open(index + 1)} disabled={index + 1 > reached} aria-current={step === index + 1 ? "step" : undefined}>
              <span className={step === index + 1 ? "is-active" : ""}>{String(index + 1).padStart(2, "0")}</span>
              <small>{label}</small>
            </button>
          ))}
        </nav>
      </div>

      <div className="ref-steps">
        <Step heading={c.text("Your pets", "حيواناتك")} detail={c.text("Who is travelling", "من سيسافر")} index={1} step={step} reached={reached} onOpen={open}>
          <div className="ref-grooming__form form-stack">
            {pets.map((pet, index) => {
              const path = `pets.${index}`;
              const others = new Set(pets.filter((entry) => entry.key !== pet.key).map((entry) => entry.savedPetId));
              const choices = myPets.filter((entry) => !others.has(entry.id));
              const room = savedCount + pets.filter((entry) => entry.key !== pet.key && entry.savedPetId === null && entry.save).length < ACCOUNT_LIMITS.maxPets;
              return (
                <fieldset key={pet.key} className="relocation-pet">
                  <legend>{c.text(`Pet ${index + 1}`, `الحيوان ${index + 1}`)}</legend>
                  {choices.length > 0 && (
                    <Field label={c.text("Which pet?", "أي حيوان؟")}>
                      <select value={pet.savedPetId ?? ""} onChange={(event) => choosePet(pet, event.target.value)}>
                        <option value="">{c.text("A new pet", "حيوان جديد")}</option>
                        {choices.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label={c.text("Pet's name", "اسم الحيوان")}>
                    <input value={pet.name} onChange={(event) => updatePet(pet.key, { name: event.target.value })} maxLength={60} {...invalid(`${path}.name`)} />
                  </Field>
                  {errorLine(`${path}.name`)}
                  <div className="ref-grooming__pair">
                    <div>
                      <Field label={c.text("Pet type (optional)", "نوع الحيوان (اختياري)")}>
                        <select value={pet.petType} onChange={(event) => updatePet(pet.key, { petType: event.target.value })} {...invalid(`${path}.petType`)}>
                          <option value="">{c.text("Not set", "غير محدد")}</option>
                          {(petTypes.data ?? []).map((type) => (
                            <option key={type.slug} value={type.slug}>
                              {c.local(type.name)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {errorLine(`${path}.petType`)}
                    </div>
                    <Field label={c.text("Breed (optional)", "السلالة (اختياري)")}>
                      <input value={pet.breed} onChange={(event) => updatePet(pet.key, { breed: event.target.value })} maxLength={60} />
                    </Field>
                  </div>
                  <fieldset className="ref-grooming__age">
                    <legend>{c.text("Age", "العمر")}</legend>
                    <div className="ref-grooming__pair">
                      <Field label={c.text("Years", "السنوات")}>
                        <NumberInput dir="ltr" value={pet.years} onChange={(event) => updatePet(pet.key, { years: event.target.value })} maxLength={2} {...invalid(`${path}.ageMonths`)} />
                      </Field>
                      <Field label={c.text("Months", "الأشهر")}>
                        <NumberInput dir="ltr" value={pet.months} onChange={(event) => updatePet(pet.key, { months: event.target.value })} maxLength={2} {...invalid(`${path}.ageMonths`)} />
                      </Field>
                    </div>
                  </fieldset>
                  {errorLine(`${path}.ageMonths`)}
                  <div className="ref-grooming__pair">
                    <div>
                      <Field label={c.text("Weight in kg (optional)", "الوزن بالكيلوغرام (اختياري)")}>
                        <NumberInput
                          kind="decimal"
                          decimals={3}
                          commas
                          dir="ltr"
                          value={pet.kg}
                          onChange={(event) => updatePet(pet.key, { kg: event.target.value })}
                          maxLength={7}
                          {...invalid(`${path}.weightGrams`)}
                        />
                      </Field>
                      {errorLine(`${path}.weightGrams`)}
                    </div>
                    <Field label={c.text("Microchip number (optional)", "رقم الشريحة (اختياري)")}>
                      <input dir="ltr" value={pet.microchip} onChange={(event) => updatePet(pet.key, { microchip: event.target.value })} maxLength={30} />
                    </Field>
                  </div>
                  <Field label={c.text("Health or handling notes (optional)", "ملاحظات صحية أو حول التعامل (اختياري)")}>
                    <textarea value={pet.notes} onChange={(event) => updatePet(pet.key, { notes: event.target.value })} maxLength={500} />
                  </Field>
                  {errorLine(`${path}.savedPetId`)}
                  {pet.savedPetId === null && room && (
                    <label className="row">
                      <input type="checkbox" checked={pet.save} onChange={(event) => updatePet(pet.key, { save: event.target.checked })} />
                      <span>{c.text("Save this pet to my account", "احفظ هذا الحيوان في حسابي")}</span>
                    </label>
                  )}
                  {pets.length > 1 && (
                    <button type="button" className="text-button" onClick={() => removePet(pet.key)}>
                      {c.text(`Remove pet ${index + 1}`, `إزالة الحيوان ${index + 1}`)}
                    </button>
                  )}
                </fieldset>
              );
            })}
            {errorLine("pets")}
            {pets.length < RELOCATION_LIMITS.maxPets ? (
              <button type="button" className="button button--secondary" onClick={() => setPets((current) => [...current, newPet()])}>
                <Plus size={16} /> {c.text("Add another pet", "أضف حيواناً آخر")}
              </button>
            ) : (
              <p className="small muted">
                {c.text(`A request can include up to ${RELOCATION_LIMITS.maxPets} pets.`, `يمكن أن يشمل الطلب ${RELOCATION_LIMITS.maxPets} حيوانات كحد أقصى.`)}
              </p>
            )}
            <button type="button" className="button button--primary" onClick={continueFromPets}>
              {c.text("Continue to the journey", "متابعة إلى الرحلة")} <ArrowRight size={16} className="directional" />
            </button>
          </div>
        </Step>

        <Step heading={c.text("The journey", "الرحلة")} detail={c.text("From, to and when", "من أين وإلى أين ومتى")} index={2} step={step} reached={reached} onOpen={open}>
          <div className="ref-grooming__form form-stack">
            <h3>{c.text("From", "من")}</h3>
            <div className="ref-grooming__pair">
              <div>
                <Field label={c.text("Country", "البلد")}>
                  <input value={journey.country} onChange={updateJourney("country")} maxLength={80} autoComplete="country-name" {...invalid("origin.country")} />
                </Field>
                {errorLine("origin.country")}
              </div>
              <Field label={c.text("City (optional)", "المدينة (اختياري)")}>
                <input value={journey.city} onChange={updateJourney("city")} maxLength={80} />
              </Field>
            </div>

            <fieldset className="saved-choice" aria-describedby={message("destination.id") ? "relocation-error-destination.id" : undefined}>
              <legend>{c.text("To", "إلى")}</legend>
              {options.destinations.map((entry) => (
                <label key={entry.id} className="saved-choice__option">
                  <input type="radio" name="relocation-destination" value={entry.id} checked={journey.destination === entry.id} onChange={updateJourney("destination")} />
                  <span>
                    <strong>{c.local(entry.name)}</strong>
                    {c.local(entry.note) && <span className="small muted">{c.local(entry.note)}</span>}
                  </span>
                </label>
              ))}
              <label className="saved-choice__option">
                <input type="radio" name="relocation-destination" value="other" checked={journey.destination === "other"} onChange={updateJourney("destination")} />
                <span>
                  <strong>{c.text("Other", "أخرى")}</strong>
                  <span className="small muted">{c.text("A destination not in this list", "وجهة غير موجودة في هذه القائمة")}</span>
                </span>
              </label>
            </fieldset>
            {errorLine("destination.id")}
            {journey.destination === "other" && (
              <>
                <Field label={c.text("Destination", "الوجهة")}>
                  <input value={journey.other} onChange={updateJourney("other")} maxLength={80} {...invalid("destination.other")} />
                </Field>
                {errorLine("destination.other")}
              </>
            )}

            <h3>{c.text("When", "متى")}</h3>
            <Field label={c.text("Planned date (approximate, optional)", "التاريخ المخطط (تقريبي، اختياري)")}>
              <input type="date" dir="ltr" min={today} value={journey.plannedDate} onChange={updateJourney("plannedDate")} {...invalid("plannedDate")} />
            </Field>
            <p className="small muted">{c.text("Nothing is booked by this date; it helps us plan.", "لا يُحجز أي شيء بهذا التاريخ؛ إنه يساعدنا على التخطيط.")}</p>
            {errorLine("plannedDate")}
            <Field label={c.text("Anything we should know? (optional)", "هل هناك ما يجب أن نعرفه؟ (اختياري)")}>
              <textarea value={journey.note} onChange={updateJourney("note")} maxLength={RELOCATION_LIMITS.maxNoteChars} />
            </Field>
            <button type="button" className="button button--primary" onClick={continueFromJourney}>
              {c.text("Continue to the documents", "متابعة إلى المستندات")} <ArrowRight size={16} className="directional" />
            </button>
          </div>
        </Step>

        <Step heading={c.text("Documents", "المستندات")} detail={c.text("Upload now or later", "ارفعها الآن أو لاحقاً")} index={3} step={step} reached={reached} onOpen={open}>
          <div className="form-stack">
            {documents.length === 0 ? (
              <p className="ref-step__note">
                {c.text(
                  "No documents are needed to send the request. If we need any, we will ask on your request page.",
                  "لا حاجة إلى مستندات لإرسال الطلب. إذا احتجنا إلى أي منها، فسنطلبها في صفحة طلبك.",
                )}
              </p>
            ) : (
              <>
                <p className="ref-step__note">
                  {c.text(
                    "Upload them now, or later from your request page: nothing here is needed to send the request. PDF, JPG or PNG, up to 10 MB each.",
                    "ارفعها الآن، أو لاحقاً من صفحة طلبك: لا يلزم أي منها لإرسال الطلب. ملفات PDF أو JPG أو PNG، حتى ١٠ ميغابايت لكل ملف.",
                  )}
                </p>
                <ul className="relocation-docs">
                  {documents.map((document) => (
                    <FormDocumentRow
                      key={document.key}
                      document={document}
                      petName={document.petIndex === null ? null : pets[document.petIndex]?.name.trim() || c.text(`Pet ${document.petIndex + 1}`, `الحيوان ${document.petIndex + 1}`)}
                      file={files[document.key] ?? null}
                      error={fileErrors[document.key] ?? null}
                      full={chosen.length >= RELOCATION_LIMITS.maxFilesPerRequest}
                      onChoose={(file) => chooseFile(document.key, file)}
                      onRemove={() => removeFile(document.key)}
                    />
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="button button--primary" onClick={() => go(4)}>
              {c.text("Continue to check and send", "متابعة إلى المراجعة والإرسال")} <ArrowRight size={16} className="directional" />
            </button>
          </div>
        </Step>

        <Step heading={c.text("Check and send", "المراجعة والإرسال")} detail={c.text("Your details and a summary", "بياناتك وملخص الطلب")} index={4} step={step} reached={reached} onOpen={open}>
          <form className="ref-grooming__form form-stack" onSubmit={send} noValidate>
            <h3>{c.text("Your pets", "حيواناتك")}</h3>
            <ul className="relocation-summary">
              {pets.map((pet, index) => {
                const age = readPets([pet]).pets[0]?.ageMonths ?? 0;
                const grams = gramsFromKg(pet.kg);
                return (
                  <li key={pet.key}>
                    <strong>{pet.name.trim() || c.text(`Pet ${index + 1}`, `الحيوان ${index + 1}`)}</strong>
                    <span className="small muted">
                      {[typeName(pet.petType), pet.breed.trim(), petAgeText(age, c.text), grams ? weightText(grams, c.locale) : ""].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <h3>{c.text("The journey", "الرحلة")}</h3>
            <p>
              {c.text("From", "من")} {[journey.city.trim(), journey.country.trim()].filter(Boolean).join(c.text(", ", "، "))} · {c.text("To", "إلى")}{" "}
              {journey.destination === "other" ? journey.other.trim() : destination ? c.local(destination.name) : "—"}
            </p>
            <p className="small muted">
              {journey.plannedDate
                ? c.text(`Planned for about ${dayText(journey.plannedDate, c.locale)}`, `مخطط له في حوالي ${dayText(journey.plannedDate, c.locale)}`)
                : c.text("No date given yet", "لم يُحدَّد تاريخ بعد")}
            </p>
            {journey.note.trim() && <p className="small">{journey.note.trim()}</p>}
            <h3>{c.text("Documents", "المستندات")}</h3>
            <p className="small">
              {chosen.length > 0
                ? c.text(
                    `${chosen.length} file${chosen.length === 1 ? "" : "s"} will be uploaded once the request is sent.`,
                    `سيتم رفع ${chosen.length} ملف بعد إرسال الطلب.`,
                  )
                : c.text("None chosen now: you can upload them later from your request page.", "لم تختر أي ملف الآن: يمكنك رفعها لاحقاً من صفحة طلبك.")}
            </p>

            <h3>{c.text("Your details", "بياناتك")}</h3>
            <Field label={c.text("Name", "الاسم")}>
              <input value={contact.name} onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} autoComplete="name" maxLength={100} {...invalid("contact.name")} />
            </Field>
            {errorLine("contact.name")}
            <Field label={c.text("Email", "البريد الإلكتروني")}>
              <input type="email" dir="ltr" value={customer.email} readOnly autoComplete="email" />
            </Field>
            <Field label={c.text("Phone", "الهاتف")}>
              <NumberInput
                kind="phone"
                dir="ltr"
                value={contact.phone}
                onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                autoComplete="tel"
                maxLength={20}
                {...invalid("contact.phone")}
              />
            </Field>
            {errorLine("contact.phone")}

            {submit.isError && (
              <p className="form-error" role="alert">
                {relocationErrorMessage(submit.error, c.text)}
              </p>
            )}
            <button type="submit" className="button button--primary" disabled={submit.isPending || submit.isSuccess}>
              {submit.isPending || submit.isSuccess ? c.text("Sending…", "جارٍ الإرسال…") : c.text("Send request", "أرسل الطلب")}
            </button>
            <p className="small muted">
              {c.text(
                "We email you the reference. Nothing is charged now: after reviewing your request, our team sends you a quote to pay online.",
                "نرسل لك رقم الطلب بالبريد. لا يُدفع أي مبلغ الآن: بعد مراجعة طلبك يرسل لك فريقنا عرض سعر للدفع عبر الموقع.",
              )}
            </p>
          </form>
        </Step>
      </div>
    </section>
  );
}

/** One document in the form: its name and whom it is for, with "Upload now" or the file chosen. */
function FormDocumentRow({
  document,
  petName,
  file,
  error,
  full,
  onChoose,
  onRemove,
}: {
  document: FormDocument;
  petName: string | null;
  file: File | null;
  error: string | null;
  full: boolean;
  onChoose: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const c = useCopy();
  const name = c.local(document.type.name);
  // Each box is told apart by its spoken name: the document and its pet.
  const spoken =
    petName === null ? c.text(`Upload now: ${name}`, `ارفع الآن: ${name}`) : c.text(`Upload now: ${name} for ${petName}`, `ارفع الآن: ${name} لـ ${petName}`);
  return (
    <li className="relocation-doc">
      <div className="row spread">
        <strong>{name}</strong>
        <span className="small muted">{document.type.required ? c.text("Required", "مطلوب") : c.text("Optional", "اختياري")}</span>
      </div>
      <p className="small muted">{petName === null ? c.text("For the whole request", "للطلب كاملاً") : c.text(`For ${petName}`, `لـ ${petName}`)}</p>
      {file ? (
        <p className="small">
          <bdi>{file.name}</bdi> · {fileSizeText(file.size, c.locale)}{" "}
          <button type="button" className="text-button" onClick={onRemove} aria-label={c.text(`Remove the file for ${name}`, `أزل ملف ${name}`)}>
            {c.text("Remove", "إزالة")}
          </button>
        </p>
      ) : full ? (
        <p className="small muted">
          {c.text(
            `A request holds up to ${RELOCATION_LIMITS.maxFilesPerRequest} files. Upload this one later.`,
            `يحتوي الطلب على ${RELOCATION_LIMITS.maxFilesPerRequest} ملفاً كحد أقصى. ارفع هذا الملف لاحقاً.`,
          )}
        </p>
      ) : (
        <Field label={c.text("Upload now", "ارفع الآن")}>
          <input
            type="file"
            aria-label={spoken}
            accept={RELOCATION_FILE_ACCEPT}
            onChange={(event) => {
              const input = event.currentTarget;
              onChoose(input.files?.[0]);
              input.value = "";
            }}
          />
        </Field>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function Step({
  heading,
  detail,
  index,
  step,
  reached,
  onOpen,
  children,
}: {
  heading: string;
  detail: string;
  index: number;
  step: number;
  reached: number;
  onOpen: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="ref-step">
      <button type="button" className="ref-step__heading" aria-expanded={step === index} disabled={index > reached} onClick={() => onOpen(index)}>
        <span className="ref-step__number">{String(index).padStart(2, "0")}</span>
        <span>
          <strong>{heading}</strong>
          <small>{detail}</small>
        </span>
        <ArrowRight size={18} className="directional" />
      </button>
      {step === index && <div className="ref-step__body">{children}</div>}
    </div>
  );
}
