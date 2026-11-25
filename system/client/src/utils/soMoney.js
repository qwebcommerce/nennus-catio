/** Sales-order money on screen, in whole dirhams (same rounding as the server). */
import { divRound, lineDirhams } from "./money.js";

export { lineDirhams };

/** Dirhams → "12.50". */
export function money2(dirhams) {
  const n = Math.trunc(Number(dirhams) || 0);
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** percent (e.g. "33.333") of a dirham total, half away from zero (thousandths of a percent). */
export function percentDirhams(total, percent) {
  const p = Math.round(Number(percent || 0) * 1000);
  return divRound(total * p, 100000);
}
