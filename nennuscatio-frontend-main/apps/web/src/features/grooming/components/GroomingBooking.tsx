"use client";

import {
  ACCOUNT_LIMITS,
  type AddressPin,
  type BookingQuote,
  type BookingQuoteRequest,
  type BookingRequest,
  bookingRequestSchema,
  type GroomingLocation,
  type GroomingRange,
  type Locale,
  type PublicGroomingGroup,
  type SavedAddress,
  savedAddressInputSchema,
  type SavedPet,
} from "@nennus-catio/contracts";
import { ArrowRight, Check, Circle, CircleDot, Home, Scissors, Store } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { fieldsFromSaved, plateLine, SavedAddressChoice } from "@/features/account/components/SavedAddressChoice";
import { PromoCodeBox } from "@/features/checkout/components/PromoCodeBox";
import { checkoutFieldMessage } from "@/features/checkout/pages/CheckoutApiPage";
import { Link, useRouter } from "@/i18n/navigation";
import { assets } from "@/mocks/data/assets";
import { accountErrorMessage, monthsSinceBorn, useSaveAddress, useSavedAddresses, useSavedPets } from "@/shared/api/account";
import {
  bookingErrorMessage,
  bookingHref,
  rememberBookingKey,
  useBookingQuote,
  useGroomingAvailability,
  useHomeVisitAreas,
  usePlaceBooking,
  useTryBookingCode,
} from "@/shared/api/bookings";
import { ApiError } from "@/shared/api/client";
import { useGroomingGroups } from "@/shared/api/grooming";
import { useBookingPayNow } from "@/shared/api/payments";
import { useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { formatClock, formatClockRange } from "@/shared/lib/format";
import { offerKey } from "@/shared/lib/offers";
import { areasByCity } from "@/shared/lib/delivery-areas";
import { Field } from "@/shared/ui/BusinessUI";
import { Photo } from "@/shared/ui/Photo";
import { NumberInput } from "@/shared/ui/NumberInput";
import { ShareLocation } from "@/shared/ui/ShareLocation";
import { SlotPicker } from "@/shared/ui/SlotPicker";

type Text = (en: string, ar: string) => string;
/** A booking's price, from the free times or the booking quote (11e). */
type BookingPrice = Pick<BookingQuote, "price" | "visitFee" | "discount" | "total" | "promotions">;

const EMPTY_DETAILS = {
  years: "",
  months: "",
  breed: "",
  notes: "",
  name: "",
  email: "",
  phone: "",
  zone: "",
  street: "",
  building: "",
  floor: "",
  flat: "",
  landmark: "",
  note: "",
  pin: null as AddressPin | null,
};
type Details = typeof EMPTY_DETAILS;
/** The pet's details asked (D246): its age, breed and health or handling notes; no name or weight. */
const EMPTY_PET = { years: "", months: "", breed: "", notes: "" };
const EMPTY_PLATE = { zone: "", street: "", building: "", floor: "", flat: "", landmark: "", note: "", pin: null };

/** A saved pet's details in the form: the age from its born month, its breed and notes (10b, D246). */
function petFields(pet: SavedPet): typeof EMPTY_PET {
  const months = monthsSinceBorn(pet.bornMonth);
  return {
    years: months === null ? "" : String(Math.floor(months / 12)),
    months: months === null ? "" : String(months % 12),
    breed: pet.breed,
    notes: pet.notes,
  };
}

const fits = (range: GroomingRange, value: number) => (range.min === null || value >= range.min) && (range.max === null || value <= range.max);

function ageText(months: number, text: Text): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return text(`${years} year${years === 1 ? "" : "s"}`, `${years} سنة`);
  }
  return text(`${months} months`, `${months} شهراً`);
}

/**
 * "aged 1 year or older": who a pet group is for by age, from its optional range (D159). The weight
 * is no longer asked or shown (D246); a group's stored weight limits are unused.
 */
function ageRangeText(range: GroomingRange, text: Text): string {
  const show = (value: number) => ageText(value, text);
  if (range.min !== null && range.max !== null) {
    return text(`aged ${show(range.min)} to ${show(range.max)}`, `بعمر ${show(range.min)} إلى ${show(range.max)}`);
  }
  if (range.min !== null) return text(`aged ${show(range.min)} or older`, `بعمر ${show(range.min)} أو أكثر`);
  if (range.max !== null) return text(`up to ${show(range.max)} old`, `حتى عمر ${show(range.max)}`);
  return "";
}

/** The pet's age in months from the form, or what is wrong with it. */
function readPet(details: Details): { ageMonths: number | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let ageMonths: number | null = null;
  const years = details.years.trim();
  const months = details.months.trim();
  if (years === "" && months === "") errors["pet.ageMonths"] = "missing";
  else if (!/^\d{0,2}$/.test(years) || !/^\d{0,2}$/.test(months) || Number(years || 0) > 50 || Number(months || 0) > 11) {
    errors["pet.ageMonths"] = "format";
  } else ageMonths = Number(years || 0) * 12 + Number(months || 0);
  return { ageMonths, errors };
}

/** The customer's message for one field, from our own checks, the contract or the server. */
function fieldText(path: string, raw: string | undefined, text: Text): string | undefined {
  if (!raw) return undefined;
  if (path.startsWith("contact.")) return checkoutFieldMessage(path, raw, text);
  if (path === "pet.ageMonths") {
    if (raw === "missing") return text("Please enter your pet's age.", "يرجى إدخال عمر حيوانك.");
    if (raw === "format") return text("Use whole years (0–50) and months (0–11).", "استخدم سنوات كاملة (٠–٥٠) وأشهراً (٠–١١).");
    // Our own range message (already in the customer's words), or the server's refusal.
    if (raw.startsWith("§")) return raw.slice(1);
    return text(
      "This pet is outside this group's limits. Please choose the group for your pet.",
      "هذا الحيوان خارج حدود هذه الفئة. يرجى اختيار الفئة المناسبة لحيوانك.",
    );
  }
  if (path === "home.areaId") {
    return /do not offer/.test(raw)
      ? text("We do not offer home visits in this area any more. Please choose another.", "لم نعد نقدم الزيارات المنزلية في هذه المنطقة. اختر منطقة أخرى.")
      : text("Choose your area.", "اختر منطقتك.");
  }
  if (/^home\.address\.(zone|street|building)$/.test(path)) return text("Numbers only.", "أرقام فقط.");
  if (path === "date") return text("Choose a date inside the booking range.", "اختر تاريخاً ضمن فترة الحجز.");
  return raw;
}

function dayLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

/**
 * Booking grooming on `/grooming` (9e; plan BRANCH_9 section 5): where (the shop, or home with the
 * area under its city), the pet group, the package, a date and time from the real availability, then
 * the pet's details (checked against the group, D159) and contact, and Book and pay, which places the
 * booking and goes straight to the payment page. The server re-checks everything; one idempotency key
 * per exact request (a retry of the same request reuses it).
 */
export function GroomingBooking() {
  const c = useCopy();
  const router = useRouter();
  const groupsQuery = useGroomingGroups();
  const areasQuery = useHomeVisitAreas();
  const session = useCustomerSession();
  const savedAddresses = useSavedAddresses(Boolean(session.data));
  const savedPets = useSavedPets(Boolean(session.data));
  const saveAddress = useSaveAddress();
  const place = usePlaceBooking();
  const pay = useBookingPayNow();
  const [step, setStep] = useState(1);
  /**
   * The saved address visited and the saved pet booked for, or null for ones typed here (10b). A pet
   * is no longer saved from here (D246): the form does not ask its name; the account's pets page does.
   */
  const [addressId, setAddressId] = useState<string | null>(null);
  const [petId, setPetId] = useState<string | null>(null);
  /** "Save this address": null until the customer changes it (then ticked only when none is saved yet). */
  const [saveAddressChoice, setSaveAddressChoice] = useState<boolean | null>(null);
  const [addressLabel, setAddressLabel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  /** The customer whose profile filled the contact details (once, on the way to the last step). */
  const [filledFor, setFilledFor] = useState<string | null>(null);
  /** Whether a home visit was started at the default saved address (once). */
  const [homeFilled, setHomeFilled] = useState(false);
  const [location, setLocation] = useState<GroomingLocation>("shop");
  const [areaId, setAreaId] = useState("");
  const [areaMissing, setAreaMissing] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [timeNotice, setTimeNotice] = useState<string | null>(null);
  /** The applied promo code (11e), and why a typed code was not kept (a code we do not know). */
  const [code, setCode] = useState<string | null>(null);
  const [codeNote, setCodeNote] = useState<BookingQuote["code"]>(null);
  /** "Price changed": the server's price for this booking, confirmed by booking again (D207). */
  const [confirmed, setConfirmed] = useState<{ key: string; quote: BookingQuote } | null>(null);
  const tryCode = useTryBookingCode();
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const groups = groupsQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const homeOffered = areas.length > 0;
  const group = groups.find((entry) => entry.id === groupId) ?? groups[0] ?? null;
  const item = group?.packages.find((entry) => entry.id === packageId) ?? group?.packages[0] ?? null;
  const area = location === "home" ? (areas.find((entry) => entry.id === areaId) ?? null) : null;
  const placeReady = location === "shop" || area !== null;
  const times = useGroomingAvailability(step >= 4 && item && placeReady ? { packageId: item.id, location, areaId: area?.id ?? null } : null);
  const days = times.data?.days ?? [];
  const day = days.find((entry) => entry.date === date) ?? days[0] ?? null;
  const time = day?.times.find((entry) => entry.start === start) ?? null;
  const fee = area?.fee ?? 0;
  const customer = session.data ?? null;

  // The price (11e). Without a code, the free times carry it with the automatic offers (read without
  // caching, so it is the freshest the page has); with a code, the booking quote. "Price changed" gives
  // the price for this booking with the customer's email, which booking again confirms (D207).
  const quoteFor = (withCode: string | null): BookingQuoteRequest | null =>
    item && placeReady ? { packageId: item.id, location, home: location === "home" && area ? { areaId: area.id } : null, code: withCode } : null;
  const codeQuote = useBookingQuote(code ? quoteFor(code) : null);
  const email = customer ? customer.email : details.email.trim().toLowerCase();
  const priceKey = quoteFor(code) ? `${JSON.stringify(quoteFor(code))}|${email}` : null;
  const confirmedQuote = confirmed && confirmed.key === priceKey ? confirmed.quote : null;
  const freePrice: BookingPrice | null = times.data
    ? { price: times.data.price, visitFee: times.data.fee, discount: times.data.discount, total: times.data.total, promotions: times.data.promotions }
    : null;
  /** The price for exactly what is chosen, or null while it is being asked for. */
  const current: BookingPrice | null = confirmedQuote ?? (code ? (codeQuote.isPlaceholderData ? null : (codeQuote.data ?? null)) : freePrice);
  /** What the summary shows: the current price, or the last one while the new one loads. */
  const shown: BookingPrice | null = confirmedQuote ?? (code ? (codeQuote.data ?? null) : freePrice);
  const total = shown?.total ?? (item?.price ?? 0) + fee;

  function applyCode(typed: string) {
    const request = quoteFor(typed);
    if (!request) return;
    setCodeNote(null);
    tryCode.mutate(request, {
      onSuccess: (result) => {
        // A code we do not know is not kept, so later quotes do not count it as another guess (D207).
        if (result.code?.status === "unknown") {
          setCodeNote(result.code);
          return;
        }
        setCode(typed);
        place.reset();
      },
    });
  }
  function removeCode() {
    setCode(null);
    setCodeNote(null);
    tryCode.reset();
    place.reset();
  }
  const busy = place.isPending || pay.isPending || pay.isSuccess || saveAddress.isPending;
  const minutes = (value: number) => `${value} ${c.text("min", "دقيقة")}`;

  // Saved addresses and pets (10b); failing to read them only leaves them out.
  const myAddresses = customer ? (savedAddresses.data ?? []) : [];
  const myPets = customer ? (savedPets.data ?? []) : [];
  const visitable = (address: SavedAddress) => address.homeVisits && areas.some((entry) => entry.id === address.area?.id);
  const chosenAddress = myAddresses.find((address) => address.id === addressId) ?? null;
  // Saving is offered only once the saved lists were read: otherwise it is unknown whether there is room.
  const offerSaveAddress =
    customer !== null && savedAddresses.isSuccess && location === "home" && addressId === null && myAddresses.length < ACCOUNT_LIMITS.maxAddresses;
  const saveAddressChecked = offerSaveAddress && (saveAddressChoice ?? myAddresses.length === 0);
  const label = addressLabel ?? (myAddresses.length === 0 ? c.text("Home", "المنزل") : "");

  /** On the way to the last step: the profile's name and phone, once. */
  const fillContact = () => {
    if (!customer || filledFor === customer.id) return;
    setFilledFor(customer.id);
    setDetails((current) => ({ ...current, name: current.name || (customer.name ?? ""), phone: current.phone || (customer.phone ?? "") }));
  };
  const canOpen = (index: number) =>
    index <= 1 || (index === 2 && placeReady) || (index === 3 && placeReady && group !== null) || (index === 4 && placeReady && item !== null) || (index === 5 && time !== null);
  const open = (index: number) => {
    if (!canOpen(index)) return;
    if (index === 5) fillContact();
    setStep(index);
  };
  /** Anything that changes the free times clears the chosen time. */
  const clearTime = () => {
    setDate("");
    setStart("");
  };
  /** A saved address fills the area (here) and the plate (the last step); "another address" clears them. */
  const chooseAddress = (address: SavedAddress | null) => {
    const { areaId: nextArea, ...plate } = address ? fieldsFromSaved(address) : { areaId: "", ...EMPTY_PLATE };
    setAddressId(address?.id ?? null);
    setSaveError("");
    setAreaMissing(false);
    if (nextArea !== areaId) clearTime();
    setAreaId(nextArea);
    setDetails((current) => ({ ...current, ...plate }));
  };
  const choosePet = (pet: SavedPet | null) => {
    setPetId(pet?.id ?? null);
    setSaveError("");
    setDetails((current) => ({ ...current, ...(pet ? petFields(pet) : EMPTY_PET) }));
  };
  // A home visit starts at the default saved address we visit (once, whichever comes first: the saved
  // addresses or the customer choosing a home visit), unless an area was already chosen.
  if (!homeFilled && customer && location === "home" && savedAddresses.isSuccess) {
    setHomeFilled(true);
    const first = myAddresses.find((address) => address.isDefault && visitable(address)) ?? myAddresses.find(visitable);
    if (first && addressId === null && !areaId) chooseAddress(first);
  }
  const update = (field: keyof Details) => (event: { target: { value: string } }) => setDetails((current) => ({ ...current, [field]: event.target.value }));
  const sharePin = (pin: AddressPin | null) => setDetails((current) => ({ ...current, pin }));

  const serverError = place.error instanceof ApiError ? place.error : null;
  const codeRefused = serverError?.code === "PROMO_CODE_INVALID" ? serverError : null;
  const message = (path: string) => fieldText(path, localErrors[path] ?? serverError?.fields[path], c.text);
  const errorLine = (path: string) => {
    const text = message(path);
    return text ? (
      <p className="form-error" id={`booking-error-${path}`}>
        {text}
      </p>
    ) : null;
  };
  const invalid = (path: string) => ({
    "aria-invalid": Boolean(message(path)),
    "aria-describedby": message(path) ? `booking-error-${path}` : undefined,
  });

  /** The section with its heading and the step bar; the steps open only once what they need is chosen. */
  const frame = (content: ReactNode) => (
    <section id="grooming-steps" className="ref-section ref-grooming__section" aria-labelledby="grooming-title">
      <div className="ref-section__heading">
        <div>
          <p className="eyebrow">{c.text("BOOK THEIR GROOMING", "احجز عناية حيوانك")}</p>
          <h2 id="grooming-title">{c.text("Book their grooming", "احجز العناية")}</h2>
          <p>{c.text("A few simple steps to schedule your pet's grooming.", "خطوات بسيطة لجدولة عناية حيوانك.")}</p>
        </div>
        <nav className="ref-grooming__progress" aria-label={c.text("Booking steps", "خطوات الحجز")}>
          {[
            c.text("Location", "الموقع"),
            c.text("Pet", "الحيوان"),
            c.text("Package", "الباقة"),
            c.text("Date & time", "التاريخ والوقت"),
            c.text("Details", "البيانات"),
          ].map((label, index) => (
            <button key={label} type="button" onClick={() => open(index + 1)} disabled={!canOpen(index + 1)} aria-current={step === index + 1 ? "step" : undefined}>
              <span className={step === index + 1 ? "is-active" : ""}>{String(index + 1).padStart(2, "0")}</span>
              <small>{label}</small>
            </button>
          ))}
        </nav>
      </div>
      {content}
    </section>
  );

  if (groupsQuery.isPending) {
    return frame(
      <p className="ref-step__note" role="status">
        {c.text("Loading grooming packages…", "جارٍ تحميل باقات العناية…")}
      </p>,
    );
  }
  if (groupsQuery.isError) {
    return frame(
      <p className="ref-step__note" role="alert">
        {c.text("The grooming packages could not be loaded.", "تعذّر تحميل باقات العناية.")}{" "}
        <button type="button" className="text-button" onClick={() => void groupsQuery.refetch()}>
          {c.text("Try again", "أعد المحاولة")}
        </button>
      </p>,
    );
  }
  if (groups.length === 0 || !group) {
    return frame(<p className="ref-step__note">{c.text("Grooming packages are not available at the moment.", "باقات العناية غير متاحة حالياً.")}</p>);
  }

  /** The pet's age must fit the chosen group (D159; the weight no longer, D246); the message names a group that fits. */
  function rangeProblems(selected: PublicGroomingGroup, ageMonths: number): Record<string, string> {
    const problems: Record<string, string> = {};
    if (fits(selected.ageMonths, ageMonths)) return problems;
    const better = groups.find((entry) => entry.id !== selected.id && entry.packages.length > 0 && fits(entry.ageMonths, ageMonths));
    const hint = better
      ? c.text(` For your pet, choose “${better.name.en}”.`, ` لحيوانك، اختر «${better.name.ar}».`)
      : c.text(" Please contact us to find the right package.", " يرجى التواصل معنا لاختيار الباقة المناسبة.");
    problems["pet.ageMonths"] = `§${c.text(`This group is for pets ${ageRangeText(selected.ageMonths, c.text)}.`, `هذه الفئة للحيوانات ${ageRangeText(selected.ageMonths, c.text)}.`)}${hint}`;
    return problems;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !group || !item || !day || !time) return;
    const pet = readPet(details);
    const problems = { ...pet.errors, ...(pet.ageMonths !== null ? rangeProblems(group, pet.ageMonths) : {}) };
    if (saveAddressChecked && !label.trim()) problems.saveLabel = c.text("Give the address a name, for example Home.", "سمِّ العنوان، مثلاً المنزل.");
    const requestFor = (savedPetId: string | null): Omit<BookingRequest, "idempotencyKey"> => ({
      locale: c.locale,
      contact: { name: details.name, email: customer ? customer.email : details.email, phone: details.phone },
      packageId: item.id,
      location,
      date: day.date,
      start: time.start,
      home:
        location === "home"
          ? {
              areaId,
              address: {
                zone: details.zone,
                street: details.street,
                building: details.building,
                floor: details.floor,
                flat: details.flat,
                landmark: details.landmark,
                note: details.note,
                pin: details.pin,
              },
            }
          : null,
      pet: { ageMonths: pet.ageMonths ?? 0, breed: details.breed, notes: details.notes },
      savedPetId,
      code,
      // The server's price for what is chosen (11e); a different total stops the booking (PRICE_CHANGED).
      expectedTotal: current?.total ?? total,
    });
    const checked = bookingRequestSchema.safeParse({ ...requestFor(petId), idempotencyKey: crypto.randomUUID() });
    const contractProblems = checked.success ? {} : Object.fromEntries(checked.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    const all = { ...contractProblems, ...problems };
    if (!checked.success || Object.keys(all).length > 0) {
      setLocalErrors(all);
      place.reset();
      return;
    }
    // Only a price for exactly this booking is sent; a code that gives nothing is removed first.
    if (!current) {
      setLocalErrors({ price: "pending" });
      place.reset();
      return;
    }
    if (code && codeQuote.data?.code && codeQuote.data.code.status !== "applied" && !confirmedQuote) {
      setLocalErrors({ code: "refused" });
      place.reset();
      return;
    }
    const sentKey = priceKey;
    setLocalErrors({});
    setSaveError("");

    // A new address is saved first, through the account (plan section 4); if the booking then fails,
    // it stays saved. From then on it is a saved one, so trying again does not save it twice. A pet is
    // no longer saved from here (D246): a chosen saved pet is linked as it is.
    try {
      const home = checked.data.home;
      if (saveAddressChecked && home) {
        const before = new Set(myAddresses.map((address) => address.id));
        const input = savedAddressInputSchema.parse({ label, areaId: home.areaId, address: home.address, makeDefault: false });
        const list = await saveAddress.mutateAsync({ address: null, input });
        setAddressId(list.find((address) => !before.has(address.id))?.id ?? null);
        setSaveAddressChoice(false);
      }
    } catch (error) {
      setSaveError(accountErrorMessage(error, c.text, "address"));
      return;
    }

    const request = requestFor(petId);
    const body = JSON.stringify(request);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    const parsed = bookingRequestSchema.parse({ ...request, idempotencyKey: attempt.current.key });
    place.mutate(parsed, {
      onSuccess: (result) => {
        const reference = result.booking.reference;
        if (result.guestKey) rememberBookingKey(reference, result.guestKey);
        // Straight to the payment page; if it cannot be opened, the booking page offers Pay now.
        pay.mutate({ reference, guestKey: result.guestKey }, { onError: () => router.push(bookingHref(reference, result.guestKey)) });
      },
      onError: (error) => {
        if (!(error instanceof ApiError)) return;
        if (error.code === "SLOT_UNAVAILABLE") {
          setStart("");
          setTimeNotice(bookingErrorMessage(error, c.text));
          setStep(4);
          void times.refetch();
        }
        // The price for this booking, worked out with the customer's email: shown, and confirmed by booking
        // again. Never asked for again without the email, or a returning guest would loop (D207).
        if (error.code === "PRICE_CHANGED" && error.bookingQuote && sentKey) setConfirmed({ key: sentKey, quote: error.bookingQuote });
        if (error.code === "PRICE_CHANGED" || error.code === "ITEM_UNAVAILABLE") {
          void groupsQuery.refetch();
          void areasQuery.refetch();
          void times.refetch();
        }
      },
    });
  }

  const placeLabel =
    location === "home"
      ? `${c.text("Home grooming", "العناية المنزلية")}${area ? ` · ${c.local(area.name)}` : ""}`
      : c.text("In-store grooming", "العناية في المتجر");

  return frame(
    <div className="ref-grooming__grid">
      <div className="ref-steps">
        <Step
          heading={c.text("Where would you like them groomed?", "أين تود أن يحصل حيوانك على العناية؟")}
          detail={placeLabel}
          index={1}
          step={step}
          onOpen={open}
        >
          <p className="ref-step__intro">{c.text("Choose the experience that works best for you and your pet.", "اختر التجربة الأنسب لك ولحيوانك.")}</p>
          <div className="ref-options ref-options--location">
            <LocationCard
              active={location === "shop"}
              image={assets.groomingHero}
              icon={Store}
              title={c.text("In-Store Grooming", "العناية في المتجر")}
              description={c.text("Visit Nennus Catio for professional grooming in our dedicated care space.", "قم بزيارة Nennus Catio للعناية الاحترافية في مساحة مخصصة.")}
              onClick={() => {
                setLocation("shop");
                setAreaMissing(false);
                clearTime();
              }}
            />
            <LocationCard
              active={location === "home"}
              disabled={!homeOffered}
              image={assets.homeGrooming}
              icon={Home}
              title={c.text("Home Grooming", "العناية المنزلية")}
              description={c.text("We come to you for a convenient grooming experience at home.", "نأتي إليك لتجربة عناية مريحة في المنزل.")}
              onClick={() => {
                setLocation("home");
                clearTime();
              }}
            />
          </div>
          {areasQuery.isSuccess && !homeOffered && (
            <p className="ref-step__note">{c.text("Home visits are not available at the moment.", "الزيارات المنزلية غير متاحة حالياً.")}</p>
          )}
          {location === "home" && (
            <div className="ref-home-address">
              {myAddresses.length > 0 && (
                <SavedAddressChoice
                  legend={c.text("Where we visit", "عنوان الزيارة")}
                  addresses={myAddresses}
                  usable={visitable}
                  unusableNote={c.text("We do not offer home visits in this area at the moment.", "لا نقدم زيارات منزلية في هذه المنطقة حالياً.")}
                  chosenId={addressId}
                  newLabel={c.text("Another address", "عنوان آخر")}
                  onChoose={chooseAddress}
                />
              )}
              {addressId === null && (
                <>
                  <Field label={c.text("Your area", "منطقتك")}>
                    <select
                      value={areaId}
                      aria-invalid={areaMissing || undefined}
                      onChange={(event) => {
                        setAreaId(event.target.value);
                        setAreaMissing(false);
                        clearTime();
                      }}
                    >
                      <option value="" disabled>
                        {c.text("Choose your area", "اختر منطقتك")}
                      </option>
                      {/* Neighbourhoods under their city headings (D135); a city alone cannot be chosen. */}
                      {areasByCity(areas).map((city) => (
                        <optgroup key={city.cityId} label={c.local(city.city)}>
                          {city.areas.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {c.local(entry.name)} ·{" "}
                              {entry.fee === 0 ? c.text("no visit fee", "بدون رسوم زيارة") : `${c.text("visit fee", "رسوم الزيارة")} ${c.money(entry.fee)}`}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <small>{c.text("You enter your address in the last step.", "تُدخل عنوانك في الخطوة الأخيرة.")}</small>
                </>
              )}
              {areaMissing && <b>{c.text("Choose your area to continue.", "اختر منطقتك للمتابعة.")}</b>}
            </div>
          )}
          <button
            className="button button--primary ref-pill-button"
            type="button"
            onClick={() => {
              if (!placeReady) {
                setAreaMissing(true);
                return;
              }
              setStep(2);
            }}
          >
            {c.text("Continue to pet", "متابعة إلى الحيوان")} <ArrowRight size={16} className="directional" />
          </button>
        </Step>

        <Step heading={c.text("What type of pet is it?", "ما نوع حيوانك؟")} detail={c.local(group.name)} index={2} step={step} onOpen={open}>
          <div className="ref-grooming__pets">
            {groups.map((entry) => (
              <button
                type="button"
                className={group.id === entry.id ? "is-selected" : ""}
                aria-pressed={group.id === entry.id}
                key={entry.id}
                onClick={() => {
                  setGroupId(entry.id);
                  setPackageId("");
                  clearTime();
                }}
              >
                {c.local(entry.name)}
              </button>
            ))}
          </div>
          {c.local(group.audience) && <p className="ref-step__note">{c.local(group.audience)}</p>}
          <GroupLimits group={group} />
          <button className="button button--primary ref-pill-button" type="button" onClick={() => setStep(3)}>
            {c.text("Continue to package", "متابعة إلى الباقة")} <ArrowRight size={16} className="directional" />
          </button>
        </Step>

        <Step
          heading={c.text("Choose a grooming package", "اختر باقة العناية")}
          detail={item ? c.local(item.name) : c.text("Choose a package", "اختر الباقة")}
          index={3}
          step={step}
          onOpen={open}
        >
          <div className="ref-options">
            {group.packages.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={`ref-option ${item?.id === entry.id ? "is-selected" : ""}`}
                aria-pressed={item?.id === entry.id}
                onClick={() => {
                  setPackageId(entry.id);
                  clearTime();
                }}
              >
                <Scissors size={20} />
                <strong>{c.local(entry.name)}</strong>
                <small>{`${c.money(entry.price)} · ${minutes(entry.durationMinutes)}`}</small>
              </button>
            ))}
          </div>
          {item && (
            <ul className="ref-package-inclusions">
              {(c.ar ? item.included.ar : item.included.en).map((part) => (
                <li key={part}>
                  <Check size={16} />
                  {part}
                </li>
              ))}
            </ul>
          )}
          <button className="button button--primary ref-pill-button" type="button" onClick={() => setStep(4)} disabled={!item}>
            {c.text("Choose a date", "اختر التاريخ")} <ArrowRight size={16} className="directional" />
          </button>
        </Step>

        <Step
          heading={c.text("Select a date & time", "اختر التاريخ والوقت")}
          detail={
            day && time
              ? `${dayLabel(day.date, c.locale)} · ${formatClock(time.start, c.locale)}`
              : c.text("Choose an available appointment. Qatar time.", "اختر موعداً متاحاً. بتوقيت قطر.")
          }
          index={4}
          step={step}
          onOpen={open}
        >
          {timeNotice && (
            <p className="form-error" role="alert">
              {timeNotice}
            </p>
          )}
          {times.isPending ? (
            <p className="ref-step__note" role="status">
              {c.text("Loading free times…", "جارٍ تحميل الأوقات المتاحة…")}
            </p>
          ) : times.isError ? (
            <p className="ref-step__note" role="alert">
              {c.text("The free times could not be loaded.", "تعذّر تحميل الأوقات المتاحة.")}{" "}
              <button type="button" className="text-button" onClick={() => void times.refetch()}>
                {c.text("Try again", "أعد المحاولة")}
              </button>
            </p>
          ) : days.length === 0 ? (
            <p className="ref-step__note" role="status">
              {c.text(
                "No free times in the next days for this choice. Please check again later, or contact us.",
                "لا توجد أوقات متاحة في الأيام القادمة لهذا الاختيار. يرجى المحاولة لاحقاً أو التواصل معنا.",
              )}
            </p>
          ) : (
            <>
              {/* The owner's picture (D249): the week, the day's times, then the chosen appointment. */}
              <SlotPicker
                days={days.map((entry) => ({ date: entry.date, slots: entry.times.map((free) => ({ id: free.start, start: free.start, end: free.end })) }))}
                from={times.data.from}
                to={times.data.to}
                value={day && time ? { date: day.date, slotId: time.start } : null}
                startDate={date || null}
                onChange={(picked) => {
                  if (picked) setDate(picked.date);
                  setStart(picked?.slot.start ?? "");
                  setTimeNotice(null);
                }}
                clock="12h"
                show="start"
                summaryLabel={c.text("Selected appointment", "الموعد المختار")}
                arrivalNote={c.text("(arrival)", "(وقت الوصول)")}
              />
              <p className="ref-step__note">
                {location === "home"
                  ? c.text("The time is when we arrive. All times are Qatar time.", "الوقت هو موعد وصولنا. جميع الأوقات بتوقيت قطر.")
                  : c.text("All times are Qatar time.", "جميع الأوقات بتوقيت قطر.")}
              </p>
              <button
                className="button button--primary ref-pill-button"
                type="button"
                disabled={!time}
                onClick={() => {
                  fillContact();
                  setStep(5);
                }}
              >
                {c.text("Continue to your details", "متابعة إلى بياناتك")} <ArrowRight size={16} className="directional" />
              </button>
            </>
          )}
        </Step>

        <Step
          heading={c.text("Your pet and your details", "بيانات حيوانك وبياناتك")}
          detail={c.text("Then pay to confirm your booking.", "ثم ادفع لتأكيد حجزك.")}
          index={5}
          step={step}
          onOpen={open}
        >
          <form className="ref-grooming__form form-stack" onSubmit={(event) => void submit(event)} noValidate>
            <h3>{c.text("Your pet", "حيوانك")}</h3>
            {myPets.length > 0 && (
              <Field label={c.text("Which pet?", "أي حيوان؟")}>
                <select value={petId ?? ""} onChange={(event) => choosePet(myPets.find((pet) => pet.id === event.target.value) ?? null)}>
                  <option value="">{c.text("A new pet", "حيوان جديد")}</option>
                  {myPets.map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {pet.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {/* The owner's choice (D246): the age, the breed and health or handling notes; no name or weight. */}
            <fieldset className="ref-grooming__age">
              <legend>{c.text("Age", "العمر")}</legend>
              <div className="ref-grooming__pair">
                <Field label={c.text("Years", "السنوات")}>
                  <NumberInput dir="ltr" value={details.years} onChange={update("years")} maxLength={2} {...invalid("pet.ageMonths")} />
                </Field>
                <Field label={c.text("Months", "الأشهر")}>
                  <NumberInput dir="ltr" value={details.months} onChange={update("months")} maxLength={2} {...invalid("pet.ageMonths")} />
                </Field>
              </div>
            </fieldset>
            {errorLine("pet.ageMonths")}
            <Field label={c.text("Breed (optional)", "السلالة (اختياري)")}>
              <input value={details.breed} onChange={update("breed")} maxLength={60} />
            </Field>
            <Field label={c.text("Health or handling notes (optional)", "ملاحظات صحية أو حول التعامل (اختياري)")}>
              <textarea value={details.notes} onChange={update("notes")} maxLength={500} />
            </Field>

            <h3>{c.text("Your details", "بياناتك")}</h3>
            <Field label={c.text("Name", "الاسم")}>
              <input value={details.name} onChange={update("name")} autoComplete="name" maxLength={100} {...invalid("contact.name")} />
            </Field>
            {errorLine("contact.name")}
            <Field label={c.text("Email", "البريد الإلكتروني")}>
              <input
                type="email"
                dir="ltr"
                value={customer ? customer.email : details.email}
                onChange={update("email")}
                readOnly={Boolean(customer)}
                autoComplete="email"
                maxLength={254}
                {...invalid("contact.email")}
              />
            </Field>
            {errorLine("contact.email")}
            <Field label={c.text("Phone", "الهاتف")}>
              <NumberInput kind="phone" dir="ltr" value={details.phone} onChange={update("phone")} autoComplete="tel" maxLength={20} {...invalid("contact.phone")} />
            </Field>
            {errorLine("contact.phone")}

            {location === "home" && chosenAddress && (
              <>
                <h3>{c.text("Where we visit", "عنوان الزيارة")}</h3>
                {errorLine("home.areaId")}
                <div className="saved-chosen">
                  <strong>{chosenAddress.label}</strong>
                  {chosenAddress.area && (
                    <span className="small">{`${c.local(chosenAddress.area.name)}${c.text(", ", "، ")}${c.local(chosenAddress.area.city)}`}</span>
                  )}
                  <bdi className="small muted">{plateLine(chosenAddress.address, c.text)}</bdi>
                  <button type="button" className="text-button" onClick={() => open(1)}>
                    {c.text("Change the address", "غيّر العنوان")}
                  </button>
                </div>
                {/* A saved address brings its own point (D263); a change is for this visit only. */}
                <ShareLocation value={details.pin} onChange={sharePin} purpose="visit" />
              </>
            )}
            {location === "home" && !chosenAddress && (
              <>
                <h3>{c.text("Where we visit", "عنوان الزيارة")}</h3>
                {errorLine("home.areaId")}
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
                        <NumberInput dir="ltr" value={details[key]} onChange={update(key)} maxLength={max} {...invalid(`home.address.${key}`)} />
                      </Field>
                      {errorLine(`home.address.${key}`)}
                    </div>
                  ))}
                </div>
                <div className="checkout-address">
                  <Field label={c.text("Floor (optional)", "الطابق (اختياري)")}>
                    <input value={details.floor} onChange={update("floor")} maxLength={20} />
                  </Field>
                  <Field label={c.text("Flat (optional)", "الشقة (اختياري)")}>
                    <input value={details.flat} onChange={update("flat")} maxLength={20} />
                  </Field>
                </div>
                <Field label={c.text("Landmark (optional)", "علامة مميزة (اختياري)")}>
                  <input value={details.landmark} onChange={update("landmark")} maxLength={120} />
                </Field>
                <Field label={c.text("Note for the groomer (optional)", "ملاحظة لمقدم العناية (اختياري)")}>
                  <textarea value={details.note} onChange={update("note")} maxLength={300} />
                </Field>
                <ShareLocation value={details.pin} onChange={sharePin} purpose="visit" />
                {offerSaveAddress && (
                  <label className="row">
                    <input type="checkbox" checked={saveAddressChecked} onChange={(event) => setSaveAddressChoice(event.target.checked)} />
                    {c.text("Save this address for next time", "احفظ هذا العنوان للمرة القادمة")}
                  </label>
                )}
                {saveAddressChecked && (
                  <>
                    <Field label={c.text("Name for this address (for example Home)", "اسم لهذا العنوان (مثلاً المنزل)")}>
                      <input value={label} onChange={(event) => setAddressLabel(event.target.value)} maxLength={30} {...invalid("saveLabel")} />
                    </Field>
                    {errorLine("saveLabel")}
                  </>
                )}
              </>
            )}

            <p className="small muted">
              {c.text(
                "Your time is held for a few minutes while you pay on the payment company's secure page.",
                "نحجز لك الموعد لبضع دقائق أثناء الدفع في صفحة شركة الدفع الآمنة.",
              )}
            </p>
            <PromoCodeBox
              id="booking-promo-code"
              code={code}
              answer={
                codeRefused?.codeStatus
                  ? { status: codeRefused.codeStatus, message: codeRefused.message }
                  : code
                    ? (codeQuote.data?.code ?? null)
                    : codeNote
              }
              discount={shown?.discount}
              what="booking"
              pending={tryCode.isPending}
              problem={tryCode.isError ? bookingErrorMessage(tryCode.error, c.text) : codeQuote.isError ? bookingErrorMessage(codeQuote.error, c.text) : undefined}
              onApply={applyCode}
              onRemove={removeCode}
            />
            {(place.isError || Object.keys(localErrors).length > 0) && (
              <p className="form-error" role="alert">
                {codeRefused || localErrors.code
                  ? c.text(
                      "Your promo code cannot be used for this booking (see the message at the code). Remove it to book without it.",
                      "لا يمكن استخدام رمزك الترويجي لهذا الحجز (راجع الرسالة عند الرمز). أزله للحجز بدونه.",
                    )
                  : place.isError
                    ? bookingErrorMessage(place.error, c.text)
                    : localErrors.price
                      ? c.text("We are still checking the price. Please try again in a moment.", "ما زلنا نتحقق من السعر. حاول مرة أخرى بعد لحظة.")
                      : c.text("Please check the highlighted fields.", "يرجى مراجعة الحقول المحددة.")}
              </p>
            )}
            {saveError && (
              <p className="form-error" role="alert">
                {c.text("This could not be saved, so nothing was booked: ", "تعذّر الحفظ، فلم يتم الحجز: ")}
                {saveError}
              </p>
            )}
            <button type="submit" className="button button--primary ref-pill-button" disabled={busy}>
              {place.isPending || saveAddress.isPending
                ? c.text("Booking…", "جارٍ الحجز…")
                : pay.isPending || pay.isSuccess
                  ? c.text("Opening the payment page…", "جارٍ فتح صفحة الدفع…")
                  : c.text(`Book and pay ${c.money(total)}`, `احجز وادفع ${c.money(total)}`)}
            </button>
            {!customer && (
              <p className="small muted">
                {c.text("Have an account? ", "لديك حساب؟ ")}
                <Link href={customerLoginHref("/grooming")} className="text-link">
                  {c.text("Log in", "سجّل الدخول")}
                </Link>
                {c.text(" to see this booking under My bookings.", " لترى هذا الحجز في حجوزاتي.")}
              </p>
            )}
          </form>
        </Step>
      </div>

      <aside className="ref-grooming__aside">
        <Photo
          src={location === "home" ? assets.homeGrooming : assets.groomingHero}
          alt={c.text("Gentle cat grooming", "عناية لطيفة للقطط")}
          sizes="(max-width: 800px) 100vw, 30vw"
        />
        <div>
          <p className="eyebrow">{c.text("YOUR SELECTION", "اختيارك")}</p>
          <h3>{c.local(group.name)}</h3>
          <p>{placeLabel}</p>
          <p>{item ? `${c.local(item.name)} · ${minutes(item.durationMinutes)}` : c.text("Choose a package", "اختر الباقة")}</p>
          {day && time && (
            <p>
              {dayLabel(day.date, c.locale)} · <bdi>{formatClockRange(time.start, time.end, c.locale)}</bdi>
            </p>
          )}
          {item && (
            <dl className="ref-grooming__total">
              <div>
                <dt>{c.text("Package", "الباقة")}</dt>
                <dd>{c.money(shown?.price ?? item.price)}</dd>
              </div>
              {location === "home" && (
                <div>
                  <dt>{c.text("Home visit fee", "رسوم الزيارة المنزلية")}</dt>
                  <dd>{area ? ((shown?.visitFee ?? fee) === 0 ? c.text("None", "لا يوجد") : c.money(shown?.visitFee ?? fee)) : "—"}</dd>
                </div>
              )}
              {/* The offers that take something off the package (11e), with their codes. */}
              {shown?.promotions
                .filter((promotion) => promotion.discount > 0)
                .map((promotion) => (
                  <div key={offerKey(promotion)} className="discount-row">
                    <dt>
                      {c.local(promotion.name)}
                      {promotion.code && (
                        <>
                          {" · "}
                          <bdi>{promotion.code}</bdi>
                        </>
                      )}
                    </dt>
                    <dd>{c.discount(promotion.discount)}</dd>
                  </div>
                ))}
              <div>
                <dt>{c.text("Total", "الإجمالي")}</dt>
                <dd>
                  <strong>{c.money(total)}</strong>
                </dd>
              </div>
            </dl>
          )}
        </div>
      </aside>
    </div>,
  );
}

/** Who the group is for by age, when the owner set limits (D159); the weight is no longer shown (D246). */
function GroupLimits({ group }: { group: PublicGroomingGroup }) {
  const c = useCopy();
  const age = ageRangeText(group.ageMonths, c.text);
  if (!age) return null;
  return <p className="ref-step__note">{c.text(`For pets ${age}.`, `للحيوانات ${age}.`)}</p>;
}

function LocationCard({
  active,
  disabled = false,
  image,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  image: string;
  icon: typeof Home;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ref-location-card ${active ? "is-selected" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Photo src={image} alt="" sizes="(max-width: 650px) 90vw, 26vw" />
      <span className="ref-location-card__selection" aria-hidden="true">
        {active ? <CircleDot size={22} /> : <Circle size={22} />}
      </span>
      <span className="ref-location-card__copy">
        <Icon size={24} />
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function Step({
  heading,
  detail,
  index,
  step,
  onOpen,
  children,
}: {
  heading: string;
  detail: string;
  index: number;
  step: number;
  onOpen: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="ref-step">
      <button type="button" className="ref-step__heading" aria-expanded={step === index} onClick={() => onOpen(index)}>
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
