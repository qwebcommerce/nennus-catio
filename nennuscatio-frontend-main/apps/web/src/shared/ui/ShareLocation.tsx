"use client";

import { type AddressPin, MAX_PIN_ACCURACY_METRES, pinMapsUrl, QATAR_BOUNDS } from "@nennus-catio/contracts";
import { LocateFixed, MapPin } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useCopy } from "@/shared/lib/copy";

/** A shared point as its Google Maps link (D263), in a new tab: for staff, and on the customer's own pages. */
export function PinLink({ pin, children }: { pin: AddressPin; children: ReactNode }) {
  return (
    <a className="text-link pin-link" href={pinMapsUrl(pin)} target="_blank" rel="noopener noreferrer">
      <MapPin size={14} aria-hidden="true" />
      {children}
    </a>
  );
}

const inQatar = (lat: number, lng: number) =>
  lat >= QATAR_BOUNDS.south && lat <= QATAR_BOUNDS.north && lng >= QATAR_BOUNDS.west && lng <= QATAR_BOUNDS.east;
const sixPlaces = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * "Share my location" (D263-D264) for a delivery, a home visit or a saved address. The device's own
 * location is read only when the customer presses the button and allows it; nothing else is asked of
 * any map service. It is optional: the plate stays the address, and every problem says so. A point
 * outside Qatar, or rougher than 1 km, is not kept.
 */
export function ShareLocation({
  value,
  onChange,
  purpose,
}: {
  value: AddressPin | null;
  onChange: (pin: AddressPin | null) => void;
  purpose: "delivery" | "visit" | "saved";
}) {
  const c = useCopy();
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState("");
  const enough = c.text("The address is enough.", "العنوان يكفي.");
  const why =
    purpose === "delivery"
      ? c.text("Optional: it helps our driver find you.", "اختياري: يساعد سائقنا في الوصول إليك.")
      : purpose === "visit"
        ? c.text("Optional: it helps our team find you.", "اختياري: يساعد فريقنا في الوصول إليك.")
        : c.text("Optional: kept with this address for your orders and visits.", "اختياري: يُحفظ مع هذا العنوان لطلباتك وزياراتك.");

  function share() {
    setProblem("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setProblem(`${c.text("This browser cannot share a location.", "لا يستطيع هذا المتصفح مشاركة الموقع.")} ${enough}`);
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFinding(false);
        const { latitude, longitude, accuracy } = position.coords;
        if (!inQatar(latitude, longitude)) {
          setProblem(c.text("This location is outside Qatar, so it was not added.", "هذا الموقع خارج قطر، لذا لم يُضَف."));
          return;
        }
        const metres = Math.ceil(accuracy);
        if (metres > MAX_PIN_ACCURACY_METRES) {
          const km = Math.round(metres / 100) / 10;
          setProblem(
            `${c.text(
              `Your device could only find you roughly (about ${km} km), so it was not added. Try on your phone, outdoors.`,
              `لم يحدد جهازك موقعك إلا تقريبياً (نحو ${km} كم)، لذا لم يُضَف. جرّب من هاتفك في الخارج.`,
            )} ${enough}`,
          );
          return;
        }
        onChange({ lat: sixPlaces(latitude), lng: sixPlaces(longitude), accuracy: metres });
      },
      (error) => {
        setFinding(false);
        setProblem(
          `${
            error.code === error.PERMISSION_DENIED
              ? c.text("Location is blocked for this site; you can allow it in your browser's settings.", "الموقع محظور لهذا الموقع الإلكتروني؛ يمكنك السماح به من إعدادات المتصفح.")
              : c.text("We could not find your location. Please try again.", "تعذّر تحديد موقعك. حاول مرة أخرى.")
          } ${enough}`,
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="share-location">
      {value ? (
        <p className="share-location__done" role="status">
          <MapPin size={16} aria-hidden="true" />
          <span>{c.text(`Location shared (± ${value.accuracy} m)`, `تمت مشاركة الموقع (± ${value.accuracy} م)`)}</span>
          <a className="text-link" href={pinMapsUrl(value)} target="_blank" rel="noopener noreferrer">
            {c.text("Check on Google Maps", "تحقق على خرائط Google")}
          </a>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setProblem("");
              onChange(null);
            }}
          >
            {c.text("Remove", "إزالة")}
          </button>
        </p>
      ) : (
        <>
          <button type="button" className="button button--secondary" onClick={share} disabled={finding}>
            <LocateFixed size={16} aria-hidden="true" />
            {finding ? c.text("Finding your location…", "جارٍ تحديد موقعك…") : c.text("Share my location", "شارك موقعي")}
          </button>
          <p className="small muted">{why}</p>
        </>
      )}
      {problem && (
        <p className="small form-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
