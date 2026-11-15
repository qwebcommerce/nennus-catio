// Number fields never take letters (D230): one shared field keeps only what its kind allows, turns Arabic
// keyboards' digits into the digits the server reads, and still refuses numbers out of range on submit.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanNumber, latinDigits } from "@/shared/lib/number-text";
import { NumberInput } from "@/shared/ui/NumberInput";
import { SettingsProviders } from "./helpers/settings";

afterEach(cleanup);

describe("what a number field keeps", () => {
  it("whole numbers: digits only", () => {
    expect(cleanNumber("12a3", "whole")).toBe("123");
    expect(cleanNumber("-5", "whole")).toBe("5");
    expect(cleanNumber("1e3", "whole")).toBe("13");
    expect(cleanNumber("1,250", "whole")).toBe("1250");
    expect(cleanNumber("abc", "whole")).toBe("");
    // A pasted "12.00" is 12, never 1200.
    expect(cleanNumber("12.00", "whole")).toBe("12");
    expect(cleanNumber("٣٫٥", "whole")).toBe("3");
  });

  it("decimals: one point, at most the places asked for; a comma is never guessed at", () => {
    expect(cleanNumber("12.345", "decimal")).toBe("12.34");
    expect(cleanNumber("12.345", "decimal", 3)).toBe("12.345");
    expect(cleanNumber("12.", "decimal")).toBe("12.");
    expect(cleanNumber("1.2.", "decimal")).toBe("1.2");
    expect(cleanNumber("QAR 25.5", "decimal")).toBe("25.5");
    expect(cleanNumber("+-25e", "decimal")).toBe("25");
    // "12,5" could be 12.5 and "1,250" could be 1250: the comma stays for the page's own check.
    expect(cleanNumber("12,5", "decimal")).toBe("12,5");
    expect(cleanNumber("1,250", "decimal")).toBe("1,250");
    // With a point, the comma can only be a thousands comma.
    expect(cleanNumber("1,250.50", "decimal")).toBe("1250.50");
  });

  it("Arabic keyboards: Arabic-Indic and Persian digits, and the Arabic decimal point", () => {
    expect(latinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(latinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(cleanNumber("٢٥٫٥٠", "decimal")).toBe("25.50");
    expect(cleanNumber("١٬٢٥٠٫٥٠", "decimal")).toBe("1250.50");
    expect(cleanNumber("١٢،٥", "decimal")).toBe("12,5");
    expect(cleanNumber("١٢أ", "whole")).toBe("12");
  });

  it("phones: digits, +, spaces, - and brackets", () => {
    expect(cleanNumber("+974 5555-1234", "phone")).toBe("+974 5555-1234");
    expect(cleanNumber("(00974) ٥٥٥٥ 1234 ext", "phone")).toBe("(00974) 5555 1234 ");
    expect(cleanNumber("call me", "phone")).toBe(" ");
  });
});

function Controlled(props: {
  kind?: "whole" | "decimal" | "phone";
  decimals?: number;
  min?: number;
  max?: number;
  commas?: boolean;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form>
      <label>
        Amount
        <NumberInput
          kind={props.kind}
          decimals={props.decimals}
          min={props.min}
          max={props.max}
          commas={props.commas}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            props.onValue?.(event.target.value);
          }}
        />
      </label>
    </form>
  );
}

const field = () => screen.getByLabelText("Amount") as HTMLInputElement;

describe("the shared number field", () => {
  it("never takes letters: the page only ever sees the cleaned value", () => {
    const seen = vi.fn();
    render(
      <SettingsProviders>
        <Controlled onValue={seen} />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "12a" } });
    expect(field().value).toBe("12");
    expect(seen).toHaveBeenLastCalledWith("12");
    fireEvent.change(field(), { target: { value: "١٢٣" } });
    expect(field().value).toBe("123");
    expect(field()).toHaveAttribute("inputmode", "numeric");
    expect(field()).toHaveAttribute("type", "text");
  });

  it("refuses a typed letter before it lands, and lets a digit through", () => {
    render(
      <SettingsProviders>
        <Controlled kind="decimal" />
      </SettingsProviders>,
    );
    expect(fireEvent.keyPress(field(), { key: "e", code: "KeyE", charCode: 101, keyCode: 101, which: 101 })).toBe(false);
    expect(fireEvent.keyPress(field(), { key: "5", code: "Digit5", charCode: 53, keyCode: 53, which: 53 })).toBe(true);
    expect(fireEvent.keyPress(field(), { key: ".", code: "Period", charCode: 46, keyCode: 46, which: 46 })).toBe(true);
    expect(field()).toHaveAttribute("inputmode", "decimal");
  });

  it("decimals keep their places; phones are telephone fields", () => {
    render(
      <SettingsProviders>
        <Controlled kind="decimal" decimals={3} />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "4.5678" } });
    expect(field().value).toBe("4.567");
    cleanup();
    render(
      <SettingsProviders>
        <Controlled kind="phone" />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "+974 55x55" } });
    expect(field().value).toBe("+974 5555");
    expect(field()).toHaveAttribute("type", "tel");
  });

  it("a page that keeps a number (a price in dirhams) still lets staff type the point, the decimals, and clear the field", () => {
    function PriceInDirhams() {
      const [price, setPrice] = useState(4500);
      return (
        <>
          <label>
            Amount
            <NumberInput kind="decimal" value={price / 100} onChange={(event) => setPrice(Math.round(Number(event.target.value) * 100))} />
          </label>
          <output>{price}</output>
          <button type="button" onClick={() => setPrice(999)}>
            Reset
          </button>
        </>
      );
    }
    render(
      <SettingsProviders>
        <PriceInDirhams />
      </SettingsProviders>,
    );
    expect(field().value).toBe("45");
    // A comma means nothing to a page that keeps a number ("45,5" would be NaN): it is refused.
    expect(fireEvent.keyPress(field(), { key: ",", code: "Comma", charCode: 44, keyCode: 44, which: 44 })).toBe(false);
    fireEvent.change(field(), { target: { value: "45,5" } });
    expect(field().value).toBe("45");
    expect(screen.getByRole("status")).toHaveTextContent("4500");
    fireEvent.change(field(), { target: { value: "45." } });
    expect(field().value).toBe("45.");
    fireEvent.change(field(), { target: { value: "45.5" } });
    expect(field().value).toBe("45.5");
    expect(screen.getByRole("status")).toHaveTextContent("4550");
    fireEvent.change(field(), { target: { value: "" } });
    expect(field().value).toBe("");
    fireEvent.change(field(), { target: { value: "12x" } });
    expect(field().value).toBe("12");
    // A number the page sets itself (a reset, a loaded record) shows as it is.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(field().value).toBe("9.99");
  });

  it("a decimal field refuses a comma, as a number box did, unless the page reads one (the pet weights)", () => {
    const seen = vi.fn();
    render(
      <SettingsProviders>
        <Controlled kind="decimal" onValue={seen} />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "45" } });
    expect(fireEvent.keyPress(field(), { key: ",", code: "Comma", charCode: 44, keyCode: 44, which: 44 })).toBe(false);
    fireEvent.change(field(), { target: { value: "45,5" } });
    expect(field().value).toBe("45");
    expect(seen).toHaveBeenLastCalledWith("45");
    // With a point, the comma can only be a thousands comma: it goes, and the rest is kept.
    fireEvent.change(field(), { target: { value: "1,250.50" } });
    expect(field().value).toBe("1250.50");
    cleanup();
    render(
      <SettingsProviders>
        <Controlled kind="decimal" decimals={3} commas />
      </SettingsProviders>,
    );
    expect(fireEvent.keyPress(field(), { key: ",", code: "Comma", charCode: 44, keyCode: 44, which: 44 })).toBe(true);
    fireEvent.change(field(), { target: { value: "12,5" } });
    expect(field().value).toBe("12,5");
  });

  it("a field the page does not keep (read when the form is sent) is cleaned and checked as it is typed in", () => {
    render(
      <SettingsProviders>
        <form>
          <label>
            Amount
            <NumberInput name="amount" min={1} max={9} defaultValue="" />
          </label>
        </form>
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "0x" } });
    expect(field().value).toBe("0");
    expect(field().validity.valid).toBe(false);
    fireEvent.change(field(), { target: { value: "5" } });
    expect(field().validity.valid).toBe(true);
  });

  it("a refused comma in a field the page does not keep goes back to what was there", () => {
    render(
      <SettingsProviders>
        <form>
          <label>
            Amount
            <NumberInput kind="decimal" name="amount" defaultValue="" />
          </label>
        </form>
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "12.5" } });
    fireEvent.change(field(), { target: { value: "12,5" } });
    expect(field().value).toBe("12.5");
  });

  it("a number out of range stops the form, as a browser number field does, in the admin's language", () => {
    render(
      <SettingsProviders>
        <Controlled min={1} max={50} />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "0" } });
    expect(field().validity.valid).toBe(false);
    expect(field().validationMessage).toBe("Enter a number from 1 to 50.");
    fireEvent.change(field(), { target: { value: "51" } });
    expect(field().validity.valid).toBe(false);
    fireEvent.change(field(), { target: { value: "50" } });
    expect(field().validity.valid).toBe(true);
    cleanup();
    render(
      <SettingsProviders locale="ar">
        <Controlled min={1} />
      </SettingsProviders>,
    );
    fireEvent.change(field(), { target: { value: "0" } });
    expect(field().validationMessage).toBe("أدخل 1 أو أكثر.");
  });
});
