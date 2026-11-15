/**
 * What number fields keep from what is typed or pasted (D230), so letters never land in them.
 * - Arabic keyboards type Arabic-Indic digits (٠-٩, or ۰-۹ on a Persian layout): they become the digits
 *   the server reads; "٫" is the Arabic decimal point and "٬" its thousands mark.
 * - A decimal field keeps one point and at most `decimals` places. A comma is never guessed at ("12,5" is
 *   12.5 but "1,250" is 1250): it stays for the page's own check, as before, unless a point shows it is a
 *   thousands comma ("1,250.50").
 * - A whole-number field stops at a point, so a pasted "12.00" is 12, never 1200.
 * - A phone field also keeps "+", spaces, "-" and brackets.
 */
export type NumberKind = "whole" | "decimal" | "phone";

const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;

/** Arabic-Indic and Persian digits as 0-9. */
export function latinDigits(value: string): string {
  return value
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function cleanNumber(value: string, kind: NumberKind, decimals = 2): string {
  const text = latinDigits(value);
  // A pasted "12.00" is 12, never 1200: a whole number stops at its point.
  if (kind === "whole") return (text.split(/[.٫]/)[0] ?? "").replace(/\D/g, "");
  if (kind === "phone") return text.replace(/[^\d+\-() ]/g, "");
  const kept = text
    .replace(/٫/g, ".")
    .replace(/،/g, ",")
    .replace(/[^\d.,]/g, "");
  const point = kept.indexOf(".");
  if (point === -1) return kept;
  // With a point, a comma before it is a thousands comma, and nothing after it is.
  const whole = kept.slice(0, point).replace(/,/g, "");
  const places = kept
    .slice(point + 1)
    .replace(/[.,]/g, "")
    .slice(0, decimals);
  return `${whole}.${places}`;
}

const DIGIT = "\\d\\u0660-\\u0669\\u06F0-\\u06F9";
const TYPED: Readonly<Record<NumberKind, RegExp>> = {
  whole: new RegExp(`^[${DIGIT}]*$`),
  decimal: new RegExp(`^[${DIGIT}.,\\u066B\\u060C]*$`),
  phone: new RegExp(`^[${DIGIT}+\\-() ]*$`),
};

/** Whether typed characters may go into a field of this kind (pasted text is cleaned instead). */
export function mayType(typed: string, kind: NumberKind): boolean {
  return TYPED[kind].test(typed);
}
