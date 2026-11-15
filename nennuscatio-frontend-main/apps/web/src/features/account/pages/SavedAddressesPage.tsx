"use client";

import { ACCOUNT_LIMITS, type SavedAddress } from "@nennus-catio/contracts";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  accountErrorMessage,
  useAccountAreas,
  useDeleteAddress,
  useMakeDefaultAddress,
  useSaveAddress,
  useSavedAddresses,
} from "@/shared/api/account";
import { useCustomerSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { PinLink } from "@/shared/ui/ShareLocation";
import { AddressForm, areaServices } from "../components/AddressForm";
import { AuthCard } from "../components/AuthForm";

/** "Saved addresses" (10a, D186): up to 5, one the default; offered at checkout and for home visits in 10b. */
export function SavedAddressesPage() {
  const c = useCopy();
  const session = useCustomerSession();
  const customer = session.data ?? null;
  const addresses = useSavedAddresses(Boolean(customer));
  const areas = useAccountAreas(Boolean(customer));
  const save = useSaveAddress();
  const makeDefault = useMakeDefaultAddress();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const title = c.text("Saved addresses", "العناوين المحفوظة");

  if (session.isPending || (customer && (addresses.isPending || areas.isPending))) {
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
      <AuthCard title={title} intro={c.text("Log in to see and change your saved addresses.", "سجّل الدخول لعرض عناوينك المحفوظة وتغييرها.")}>
        <Link href={customerLoginHref("/account/addresses")} className="button button--primary">
          {c.text("Log in", "تسجيل الدخول")}
        </Link>
      </AuthCard>
    );
  }
  if (addresses.isError || areas.isError) {
    return (
      <AuthCard title={title}>
        <div className="form-error" role="alert">
          <p>{accountErrorMessage(addresses.error ?? areas.error, c.text, "address")}</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              void addresses.refetch();
              void areas.refetch();
            }}
          >
            {c.text("Retry", "أعد المحاولة")}
          </button>
        </div>
      </AuthCard>
    );
  }

  const list = addresses.data ?? [];
  const full = list.length >= ACCOUNT_LIMITS.maxAddresses;

  function report(message: string, problem = false) {
    setNotice(problem ? "" : message);
    setError(problem ? message : "");
  }

  function askDelete(address: SavedAddress) {
    report("");
    setConfirming({
      title: c.text(`Delete the address "${address.label}"?`, `حذف العنوان "${address.label}"؟`),
      message: address.isDefault
        ? c.text("It is your default address: your oldest other address becomes the default.", "إنه عنوانك الافتراضي: يصبح أقدم عنوان آخر لديك هو الافتراضي.")
        : c.text("Orders already placed keep their own address.", "تحتفظ الطلبات السابقة بعنوانها الخاص."),
      confirmLabel: c.text("Delete address", "احذف العنوان"),
      run: async () => {
        try {
          await remove.mutateAsync(address);
          report(c.text("The address was deleted.", "تم حذف العنوان."));
        } catch (err) {
          report(accountErrorMessage(err, c.text, "address"), true);
        }
      },
    });
  }

  return (
    <AuthCard title={title} intro={c.text("Saved addresses are offered when you order and when you book a home visit.", "تُعرض العناوين المحفوظة عند الطلب وعند حجز زيارة منزلية.")}>
      {list.length === 0 && editing === null && <p className="muted">{c.text("You have no saved addresses yet.", "لا توجد لديك عناوين محفوظة بعد.")}</p>}
      <ul className="saved-list" aria-label={title}>
        {list.map((address) =>
          editing !== "new" && editing?.id === address.id ? (
            <li key={address.id}>
              <AddressForm
                address={address}
                areas={areas.data ?? []}
                busy={save.isPending}
                serverError={save.error}
                onCancel={() => setEditing(null)}
                onSave={(input) =>
                  save.mutate(
                    { address, input },
                    {
                      onSuccess: () => {
                        setEditing(null);
                        report(c.text("The address was saved.", "تم حفظ العنوان."));
                      },
                      onError: (err) => report(accountErrorMessage(err, c.text, "address"), true),
                    },
                  )
                }
              />
            </li>
          ) : (
            <li key={address.id}>
              <div className="saved-item">
                <strong>{address.label}</strong>
                {address.isDefault && <span className="status status--confirmed">{c.text("Default", "الافتراضي")}</span>}
                <p className="small">
                  {address.area ? `${c.local(address.area.name)}${c.text(", ", "، ")}${c.local(address.area.city)}` : c.text("Area no longer served", "المنطقة لم تعد مخدومة")}
                  {address.area && !address.delivery && !address.homeVisits && ` · ${c.text("no longer served", "لم تعد مخدومة")}`}
                  {address.area && (address.delivery || address.homeVisits) && areaServices(address, c.text)}
                </p>
                <p className="small muted">
                  <bdi>
                    {c.text(
                      `Zone ${address.address.zone}, Street ${address.address.street}, Building ${address.address.building}`,
                      `المنطقة ${address.address.zone}، الشارع ${address.address.street}، المبنى ${address.address.building}`,
                    )}
                    {address.address.floor && ` · ${c.text("Floor", "الطابق")} ${address.address.floor}`}
                    {address.address.flat && ` · ${c.text("Flat", "الشقة")} ${address.address.flat}`}
                  </bdi>
                </p>
                {address.address.pin && (
                  <p className="small">
                    <PinLink pin={address.address.pin}>{c.text("Location saved · View on Google Maps", "الموقع محفوظ · اعرضه على خرائط Google")}</PinLink>
                  </p>
                )}
                {(!address.area || (!address.delivery && !address.homeVisits)) && (
                  <p className="small form-error">{c.text("Choose another area before using this address.", "اختر منطقة أخرى قبل استخدام هذا العنوان.")}</p>
                )}
                <div className="row">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={c.text(`Edit the address ${address.label}`, `تعديل العنوان ${address.label}`)}
                    onClick={() => {
                      report("");
                      save.reset();
                      setEditing(address);
                    }}
                  >
                    {c.text("Edit", "تعديل")}
                  </button>
                  {!address.isDefault && (
                    <button
                      type="button"
                      className="text-button"
                      aria-label={c.text(`Make ${address.label} the default`, `اجعل ${address.label} الافتراضي`)}
                      disabled={makeDefault.isPending}
                      onClick={() =>
                        makeDefault.mutate(address, {
                          onSuccess: () => report(c.text(`"${address.label}" is now your default address.`, `"${address.label}" هو عنوانك الافتراضي الآن.`)),
                          onError: (err) => report(accountErrorMessage(err, c.text, "address"), true),
                        })
                      }
                    >
                      {c.text("Make default", "اجعله الافتراضي")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    aria-label={c.text(`Delete the address ${address.label}`, `حذف العنوان ${address.label}`)}
                    onClick={() => askDelete(address)}
                  >
                    {c.text("Delete", "حذف")}
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <AddressForm
          address={null}
          areas={areas.data ?? []}
          busy={save.isPending}
          serverError={save.error}
          onCancel={() => setEditing(null)}
          onSave={(input) =>
            save.mutate(
              { address: null, input },
              {
                onSuccess: () => {
                  setEditing(null);
                  report(c.text("The address was saved.", "تم حفظ العنوان."));
                },
                onError: (err) => report(accountErrorMessage(err, c.text, "address"), true),
              },
            )
          }
        />
      ) : (
        editing === null && (
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
            {c.text("Add an address", "أضف عنواناً")}
          </button>
        )
      )}
      {full && editing === null && (
        <p className="small muted">
          {c.text(`You have ${ACCOUNT_LIMITS.maxAddresses} addresses, the most you can save.`, `لديك ${ACCOUNT_LIMITS.maxAddresses} عناوين، وهو الحد الأقصى.`)}
        </p>
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
