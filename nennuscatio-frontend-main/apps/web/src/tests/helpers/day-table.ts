import { screen, within } from "@testing-library/react";

/**
 * The staff day table (D255, D257) in tests: its own rows, one per time or window, without the lists
 * opened under them; a row as text; and the lines of an opened list.
 */
export function timeRows(table: HTMLElement): HTMLElement[] {
  return [...table.querySelectorAll<HTMLElement>(":scope > tbody > tr")].filter((row) => row.querySelector(":scope > th"));
}

/** A time row's time, then each of its cells, as text. */
export function rowText(row: HTMLElement): string[] {
  return [within(row).getByRole("rowheader").textContent ?? "", ...[...row.querySelectorAll(":scope > td")].map((cell) => cell.textContent ?? "")];
}

/** The lines of the list opened under a time ("Orders at 09:00–12:00"), each as its cells' text; null while it is closed. */
export function listLines(name: string): string[][] | null {
  const list = screen.queryByRole("table", { name });
  if (!list) return null;
  return within(list)
    .getAllByRole("row")
    .slice(1)
    .map((row) => [...row.querySelectorAll("td")].map((cell) => (cell.textContent ?? "").trim()));
}

/** The references in the list opened under a time; null while it is closed. */
export function listReferences(name: string): string[] | null {
  return listLines(name)?.map((line) => line[0] ?? "") ?? null;
}
