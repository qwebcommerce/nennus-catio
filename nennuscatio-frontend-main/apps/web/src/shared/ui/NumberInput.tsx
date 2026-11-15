"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { cleanNumber, mayType, type NumberKind } from "@/shared/lib/number-text";

type NumberInputProps = Omit<ComponentProps<"input">, "type" | "inputMode" | "min" | "max" | "step"> & {
  /** whole: digits; decimal: digits and one point (money, kilograms); phone: digits, "+", spaces, "-", brackets. */
  kind?: NumberKind;
  /** The places a decimal field keeps: 2 for money (the default), 3 for kilograms. */
  decimals?: number;
  /** The range the form accepts; a number outside it stops the form, as a browser number field does. */
  min?: number;
  max?: number;
  /**
   * The page reads a comma as a decimal point itself (the pet weight forms: "12,5" kg). Otherwise a decimal
   * field refuses a comma, as a browser's number box did, since "1,250" could mean 1.25 or 1250.
   */
  commas?: boolean;
};

/**
 * Every number field (D230): a text field with the phone's number keyboard that never takes letters.
 * - A typed character its kind does not allow is refused before it lands.
 * - Pasted or dropped text is cleaned (`cleanNumber`), and Arabic keyboards' digits become 0-9, so the
 *   page's own handler only ever sees a clean value.
 * - A decimal field refuses a comma unless the page reads one (`commas`).
 * - Not `type="number"`: that takes "e", "+" and "-" (and letters in some browsers), and refuses the
 *   digits of an Arabic keyboard.
 */
export function NumberInput({ kind = "whole", decimals = 2, min, max, commas = false, value, onChange, onBeforeInput, ref, ...props }: NumberInputProps) {
  const c = useCopy();
  const own = useRef<HTMLInputElement | null>(null);
  // A page that keeps a number (not the text) would turn "45." back into "45" and "" into "0" while staff
  // type. The field shows what was typed while it still means the page's number.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typeof value === "number" ? (typed !== null && Number(typed) === value ? typed : String(value)) : value;
  const commaRefused = kind === "decimal" && !commas;
  // What the field last let through, to go back to when a change is refused (also when the page keeps nothing).
  const accepted = useRef(String(value ?? props.defaultValue ?? ""));

  function checkRange(input: HTMLInputElement) {
    const number = Number(input.value);
    const outside = input.value.trim() !== "" && Number.isFinite(number) && ((min !== undefined && number < min) || (max !== undefined && number > max));
    input.setCustomValidity(
      !outside
        ? ""
        : min !== undefined && max !== undefined
          ? c.text(`Enter a number from ${min} to ${max}.`, `أدخل رقماً من ${min} إلى ${max}.`)
          : min !== undefined
            ? c.text(`Enter ${min} or more.`, `أدخل ${min} أو أكثر.`)
            : c.text(`Enter ${max} or less.`, `أدخل ${max} أو أقل.`),
    );
  }

  // A value set by the page (a reset, a loaded record) is checked too.
  useEffect(() => {
    if (own.current) checkRange(own.current);
  });

  return (
    <input
      {...props}
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={kind === "phone" ? "tel" : "text"}
      inputMode={kind === "whole" ? "numeric" : kind === "decimal" ? "decimal" : "tel"}
      value={shown}
      onBeforeInput={(event) => {
        const inserted = (event as unknown as { data?: string | null }).data;
        if (inserted && (!mayType(inserted, kind) || (commaRefused && /[,،]/.test(inserted)))) event.preventDefault();
        onBeforeInput?.(event);
      }}
      onChange={(event) => {
        const clean = cleanNumber(event.target.value, kind, decimals);
        if (commaRefused && clean.includes(",")) {
          // Refused: the field keeps what it showed, and the page hears nothing.
          event.target.value = value === undefined ? accepted.current : String(shown ?? "");
          return;
        }
        if (clean !== event.target.value) event.target.value = clean;
        accepted.current = clean;
        if (typeof value === "number") setTyped(clean);
        checkRange(event.target);
        onChange?.(event);
      }}
    />
  );
}
