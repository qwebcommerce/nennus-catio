import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NavigationDrawer } from "@/shared/ui/NavigationDrawer";

afterEach(cleanup);

function drawer(variant?: "public" | "admin", locale = "en") {
  render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Asia/Qatar"
      messages={{
        Common: {
          menu: "Open navigation",
          close: "Close navigation",
          navigation: "Main navigation",
        },
      }}
    >
      <NavigationDrawer title="Navigation" variant={variant}>
        {(close) => <button type="button" onClick={close}>Open record</button>}
      </NavigationDrawer>
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  return screen.getByRole("dialog");
}

describe("navigation drawer theme", () => {
  it("keeps the public drawer's default theme and supports closing", () => {
    expect(drawer().classList.contains("drawer-content--admin")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives the portalled admin drawer its own theme and RTL direction", () => {
    const panel = drawer("admin", "ar");
    expect(panel.classList.contains("drawer-content--admin")).toBe(true);
    expect(panel.getAttribute("dir")).toBe("rtl");
    fireEvent.click(screen.getByRole("button", { name: "Open record" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
