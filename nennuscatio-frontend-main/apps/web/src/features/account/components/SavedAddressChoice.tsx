"use client";

import type { QatarAddress, SavedAddress } from "@nennus-catio/contracts";
import { useId } from "react";
import { useCopy } from "@/shared/lib/copy";

type Text = (en: string, ar: string) => string;

/** "Zone 66, Street 850, Building 12 · Floor 2 · Flat 5": the plate on one line. */
export function plateLine(address: QatarAddress, text: Text): string {
  return [
    text(`Zone ${address.zone}, Street ${address.street}, Building ${address.building}`, `المنطقة ${address.zone}، الشارع ${address.street}، المبنى ${address.building}`),
    address.floor && `${text("Floor", "الطابق")} ${address.floor}`,
    address.flat && `${text("Flat", "الشقة")} ${address.flat}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The address fields of an order or booking, filled from a saved address (its own copy, 10b). */
export function fieldsFromSaved(address: SavedAddress) {
  return { areaId: address.area?.id ?? "", ...address.address };
}

/**
 * Checkout's "Deliver to" and a home visit's address (10b; plan BRANCH_10 section 4): the customer's saved
 * addresses or a new one. An address this service does not reach now (its area switched off or not served
 * for it) stays listed but cannot be chosen, with the reason. Choosing one fills the order's or booking's
 * own copy of the address.
 */
export function SavedAddressChoice({
  legend,
  addresses,
  usable,
  unusableNote,
  chosenId,
  newLabel,
  onChoose,
}: {
  legend: string;
  addresses: readonly SavedAddress[];
  usable: (address: SavedAddress) => boolean;
  unusableNote: string;
  /** The chosen saved address, or null for a new one. */
  chosenId: string | null;
  newLabel: string;
  onChoose: (address: SavedAddress | null) => void;
}) {
  const c = useCopy();
  const name = useId();
  return (
    <fieldset className="saved-choice">
      <legend>{legend}</legend>
      {addresses.map((address) => {
        const ok = usable(address);
        return (
          <label key={address.id} className={ok ? "saved-choice__option" : "saved-choice__option is-disabled"}>
            <input type="radio" name={name} checked={chosenId === address.id} disabled={!ok} onChange={() => onChoose(address)} />
            <span>
              <span>
                <strong>{address.label}</strong>
                {address.isDefault && <span className="small muted"> · {c.text("Default", "الافتراضي")}</span>}
              </span>
              <span className="small">
                {address.area ? `${c.local(address.area.name)}${c.text(", ", "، ")}${c.local(address.area.city)}` : c.text("Area no longer served", "المنطقة لم تعد مخدومة")}
              </span>
              <bdi className="small muted">{plateLine(address.address, c.text)}</bdi>
              {!ok && <span className="small form-error">{unusableNote}</span>}
            </span>
          </label>
        );
      })}
      <label className="saved-choice__option">
        <input type="radio" name={name} checked={chosenId === null} onChange={() => onChoose(null)} />
        <span>
          <strong>{newLabel}</strong>
        </span>
      </label>
    </fieldset>
  );
}
