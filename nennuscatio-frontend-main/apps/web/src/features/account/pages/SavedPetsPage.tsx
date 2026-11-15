"use client";

import { ACCOUNT_LIMITS, type BookingSummary, type SavedPet } from "@nennus-catio/contracts";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { accountErrorMessage, ageFromBornMonth, useDeletePet, usePetTypes, useSavedPets, useSavePet } from "@/shared/api/account";
import { BOOKING_STATUS_LABELS, useMyBookings } from "@/shared/api/bookings";
import { useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { AuthCard } from "../components/AuthForm";
import { PetForm } from "../components/PetForm";

const SHOWN_BOOKINGS = 3;

/**
 * A saved pet's grooming bookings (10b), the newest first: those booked with it chosen under "Which pet?".
 * Nothing is shown while My bookings is loading or could not be read.
 */
function PetBookings({ pet, bookings }: { pet: SavedPet; bookings: readonly BookingSummary[] | null }) {
  const c = useCopy();
  if (!bookings) return null;
  const mine = bookings.filter((booking) => booking.savedPetId === pet.id);
  if (mine.length === 0) return <p className="small muted">{c.text("No grooming booked yet.", "لا توجد عناية محجوزة بعد.")}</p>;
  const day = new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qatar" });
  return (
    <>
      <ul className="saved-pet-bookings small" aria-label={c.text(`${pet.name}'s bookings`, `حجوزات ${pet.name}`)}>
        {mine.slice(0, SHOWN_BOOKINGS).map((booking) => (
          <li key={booking.reference}>
            <Link href={`/bookings/${booking.reference}`} className="text-link">
              <bdi>{booking.reference}</bdi>
            </Link>{" "}
            · {day.format(new Date(`${booking.appointment.date}T12:00:00+03:00`))} · {c.local(BOOKING_STATUS_LABELS[booking.status])}
          </li>
        ))}
      </ul>
      {mine.length > SHOWN_BOOKINGS && (
        <Link href="/account/bookings" className="text-link small">
          {c.text(`All ${mine.length} bookings in My bookings`, `كل الحجوزات (${mine.length}) في حجوزاتي`)}
        </Link>
      )}
    </>
  );
}

/** "Saved pets" (10a, D186 question 3): up to 10, offered when booking grooming; each shows its bookings (10b). */
export function SavedPetsPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const pets = useSavedPets(Boolean(customer));
  const bookings = useMyBookings(Boolean(customer));
  const types = usePetTypes();
  const save = useSavePet();
  const remove = useDeletePet();
  const [editing, setEditing] = useState<SavedPet | "new" | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const title = c.text("Saved pets", "الحيوانات المحفوظة");

  if (session.isPending || (customer && pets.isPending)) {
    return (
      <AuthCard title={title}>
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading…", "جارٍ التحميل…")}
        </p>
      </AuthCard>
    );
  }
  if (!customer) {
    return (
      <AuthCard title={title} intro={c.text("Log in to see and change your saved pets.", "سجّل الدخول لعرض حيواناتك المحفوظة وتغييرها.")}>
        <Link href={customerLoginHref("/account/pets")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
      </AuthCard>
    );
  }
  if (pets.isError) {
    return (
      <AuthCard title={title}>
        <div className="form-error" role="alert">
          <p>{accountErrorMessage(pets.error, c.text, "pet")}</p>
          <button type="button" className="button button--secondary" onClick={() => void pets.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      </AuthCard>
    );
  }

  const list = pets.data ?? [];
  const full = list.length >= ACCOUNT_LIMITS.maxPets;
  const petTypes = types.data ?? [];

  function report(message: string, problem = false) {
    setNotice(problem ? "" : message);
    setError(problem ? message : "");
  }

  function askDelete(pet: SavedPet) {
    report("");
    setConfirming({
      title: c.text(`Delete ${pet.name} from your saved pets?`, `حذف ${pet.name} من حيواناتك المحفوظة؟`),
      message: c.text("Bookings already made for this pet stay as they are.", "تبقى الحجوزات السابقة لهذا الحيوان كما هي."),
      confirmLabel: c.text("Delete pet", "احذف الحيوان"),
      run: async () => {
        try {
          await remove.mutateAsync(pet);
          report(c.text(`${pet.name} was deleted.`, `تم حذف ${pet.name}.`));
        } catch (err) {
          report(accountErrorMessage(err, c.text, "pet"), true);
        }
      },
    });
  }

  const form = (pet: SavedPet | null) => (
    <PetForm
      pet={pet}
      petTypes={petTypes}
      busy={save.isPending}
      serverError={save.error}
      onCancel={() => setEditing(null)}
      onSave={(input) =>
        save.mutate(
          { pet, input },
          {
            onSuccess: () => {
              setEditing(null);
              report(c.text(`${input.name} was saved.`, `تم حفظ ${input.name}.`));
            },
            onError: (err) => report(accountErrorMessage(err, c.text, "pet"), true),
          },
        )
      }
    />
  );

  return (
    <AuthCard title={title} intro={c.text("Saved pets are offered when you book grooming.", "تُعرض الحيوانات المحفوظة عند حجز العناية.")}>
      {list.length === 0 && editing === null && <p className="muted">{c.text("You have no saved pets yet.", "لا توجد لديك حيوانات محفوظة بعد.")}</p>}
      <ul className="saved-list" aria-label={title}>
        {list.map((pet) => {
          const age = ageFromBornMonth(pet.bornMonth, c.text);
          const details = [
            pet.petType ? c.local(pet.petType.name) : "",
            pet.breed,
            age ?? "",
            pet.weightGrams === null ? "" : `${pet.weightGrams / 1000} ${c.text("kg", "كغ")}`,
          ].filter(Boolean);
          return editing !== "new" && editing?.id === pet.id ? (
            <li key={pet.id}>{form(pet)}</li>
          ) : (
            <li key={pet.id}>
              <div className="saved-item">
                <strong>{pet.name}</strong>
                {details.length > 0 && <p className="small">{details.join(" · ")}</p>}
                {pet.notes && <p className="small muted">{pet.notes}</p>}
                <PetBookings pet={pet} bookings={bookings.data ?? null} />
                <div className="row">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={c.text(`Edit ${pet.name}`, `تعديل ${pet.name}`)}
                    onClick={() => {
                      report("");
                      save.reset();
                      setEditing(pet);
                    }}
                  >
                    {c.text("Edit", "تعديل")}
                  </button>
                  <button type="button" className="text-button" aria-label={c.text(`Delete ${pet.name}`, `حذف ${pet.name}`)} onClick={() => askDelete(pet)}>
                    {c.text("Delete", "حذف")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {editing === "new"
        ? form(null)
        : editing === null && (
            <button
              type="button"
              className="button button--secondary"
              disabled={full}
              onClick={() => {
                report("");
                save.reset();
                setEditing("new");
              }}
            >
              {c.text("Add a pet", "أضف حيواناً")}
            </button>
          )}
      {full && editing === null && (
        <p className="small muted">{c.text(`You have ${ACCOUNT_LIMITS.maxPets} pets, the most you can save.`, `لديك ${ACCOUNT_LIMITS.maxPets} حيوانات، وهو الحد الأقصى.`)}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p role="status" className="small">
        {notice}
      </p>
      <Link href="/account" className="text-link">
        {c.text("Back to My account", "العودة إلى حسابي")}
      </Link>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </AuthCard>
  );
}
