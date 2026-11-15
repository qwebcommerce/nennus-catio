// "Share my location" (D263-D264): the device's location only when asked; a point outside Qatar or rougher
// than 1 km is not kept; every problem says the address is enough; the point opens in Google Maps.
import type { AddressPin } from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareLocation } from "@/shared/ui/ShareLocation";
import { fakeGeolocation, noGeolocation } from "./helpers/geolocation";

afterEach(cleanup);

/** The control with its own state, as a form holds it; `seen` records every change it reports. */
function Form({ start = null, seen }: { start?: AddressPin | null; seen: (pin: AddressPin | null) => void }) {
  const [pin, setPin] = useState<AddressPin | null>(start);
  return (
    <ShareLocation
      value={pin}
      onChange={(next) => {
        seen(next);
        setPin(next);
      }}
      purpose="delivery"
    />
  );
}

function renderForm(start: AddressPin | null = null, locale: "en" | "ar" = "en") {
  const seen = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Qatar">
      <Form start={start} seen={seen} />
    </NextIntlClientProvider>,
  );
  return seen;
}

describe("Share my location", () => {
  it("asks the device only when pressed; keeps the point in Qatar, with its accuracy; shows it with Google Maps and Remove", () => {
    const asked = fakeGeolocation({ latitude: 25.28544712, longitude: 51.53104049, accuracy: 11.2 });
    const seen = renderForm();
    expect(asked).not.toHaveBeenCalled();
    expect(screen.getByText("Optional: it helps our driver find you.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(asked).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
    // Six decimals (about 10 cm) and whole metres, rounded up.
    expect(seen).toHaveBeenLastCalledWith({ lat: 25.285447, lng: 51.53104, accuracy: 12 });
    expect(screen.getByRole("status").textContent).toContain("Location shared (± 12 m)");
    const link = screen.getByRole("link", { name: "Check on Google Maps" });
    expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(seen).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Share my location" })).toBeTruthy();
  });

  it("a point outside Qatar, or rougher than 1 km, is not kept", () => {
    fakeGeolocation({ latitude: 21.4225, longitude: 39.8262, accuracy: 10 });
    const seen = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByRole("alert").textContent).toBe("This location is outside Qatar, so it was not added.");
    expect(seen).not.toHaveBeenCalled();
    cleanup();

    fakeGeolocation({ latitude: 25.3, longitude: 51.5, accuracy: 3500 });
    const rough = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Your device could only find you roughly (about 3.5 km), so it was not added. Try on your phone, outdoors. The address is enough.",
    );
    expect(rough).not.toHaveBeenCalled();
  });

  it("blocked, not found, or no location in the browser: says so, and that the address is enough", () => {
    fakeGeolocation({ code: 1 });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Location is blocked for this site; you can allow it in your browser's settings. The address is enough.",
    );
    cleanup();

    fakeGeolocation({ code: 3 });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByRole("alert").textContent).toBe("We could not find your location. Please try again. The address is enough.");
    cleanup();

    noGeolocation();
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByRole("alert").textContent).toBe("This browser cannot share a location. The address is enough.");
  });

  it("a point already shared (a saved address's) shows at once; in Arabic too", () => {
    renderForm({ lat: 25.3, lng: 51.5, accuracy: 20 }, "ar");
    expect(screen.getByRole("status").textContent).toContain("تمت مشاركة الموقع (± 20 م)");
    expect(screen.getByRole("link", { name: "تحقق على خرائط Google" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.300000,51.500000");
  });
});
