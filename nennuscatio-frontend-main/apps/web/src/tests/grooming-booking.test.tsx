// 9e: booking grooming on /grooming against the API (real dates and times, the pet's age checked against
// the pet group, Book and pay straight to the payment page), the booking page and My bookings; 10b: the
// profile, saved pets and saved addresses when booking. D246: the pet's age, breed and notes only.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  BookingQuoteRequest,
  BookingRequest,
  CustomerBooking,
  GroomingAvailabilityResponse,
  PublicGroomingArea,
  PublicGroomingGroup,
  SavedAddress,
  SavedPet,
} from "@nennus-catio/contracts";
import type { ZodType } from "zod";
import { MyBookingsPage } from "@/features/account/pages/MyBookingsPage";
import { GroomingBookingPage } from "@/features/grooming/pages/GroomingBookingPage";
import { ReferenceGroomingPage } from "@/features/grooming/pages/ReferenceGroomingPage";
import { type ApiClient, ApiError, type RequestOptions } from "@/shared/api/client";
import { paymentNavigation } from "@/shared/api/payments";
import { safeCustomerNext } from "@/shared/lib/customer-login";
import { formatMoney } from "@/shared/lib/format";
import { fakeGeolocation } from "./helpers/geolocation";
import { SettingsProviders } from "./helpers/settings";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/grooming",
  useRouter: () => ({ push, replace: push }),
}));

beforeEach(() => {
  push.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- Fixtures -------------------------------------------------------------------------------------

const SMALL = "0199d000-0000-7000-8000-000000000001";
const CATS = "0199d000-0000-7000-8000-000000000002";
const BASIC = "0199d000-0000-7000-8000-0000000000b1";
const CAT_BASIC = "0199d000-0000-7000-8000-0000000000c1";
const AREA = "0199d000-0000-7000-8000-0000000000a1";
const REFERENCE = "GB-261012-4F7KQ2";
const GUEST_KEY = "b".repeat(43);

const groups: PublicGroomingGroup[] = [
  {
    id: SMALL,
    name: { en: "Small pet", ar: "حيوان صغير" },
    audience: { en: "Rabbits and guinea pigs", ar: "الأرانب" },
    ageMonths: { min: null, max: null },
    weightGrams: { min: null, max: 5000 },
    packages: [
      {
        id: BASIC,
        name: { en: "Basic", ar: "أساسي" },
        description: { en: "A bath.", ar: "استحمام." },
        included: { en: ["Bath & blow dry"], ar: ["استحمام وتجفيف"] },
        price: 8000,
        durationMinutes: 45,
        image: null,
      },
    ],
  },
  {
    id: CATS,
    name: { en: "Adult cat", ar: "قطة بالغة" },
    audience: { en: "Cats over a year", ar: "قطط" },
    ageMonths: { min: 12, max: null },
    weightGrams: { min: null, max: 12000 },
    packages: [
      {
        id: CAT_BASIC,
        name: { en: "Cat basic", ar: "أساسي للقطط" },
        description: { en: "", ar: "" },
        included: { en: ["Brushing"], ar: ["تمشيط"] },
        price: 12000,
        durationMinutes: 60,
        image: null,
      },
    ],
  },
];
const areas: PublicGroomingArea[] = [
  { id: AREA, name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" }, fee: 2000 },
];

function availability(location: "shop" | "home", packageId = BASIC): GroomingAvailabilityResponse {
  const fee = location === "home" ? 2000 : 0;
  const price = packageId === BASIC ? 8000 : 12000;
  return {
    location,
    packageId,
    durationMinutes: packageId === BASIC ? 45 : 60,
    price,
    fee,
    discount: 0,
    total: price + fee,
    promotions: [],
    from: "2026-10-12",
    to: "2026-10-25",
    days: [
      {
        date: "2026-10-12",
        times: [
          { start: "10:00", end: location === "shop" ? "10:45" : null, startsAt: "2026-10-12T07:00:00.000Z", seatsLeft: 2 },
          { start: "10:30", end: location === "shop" ? "11:15" : null, startsAt: "2026-10-12T07:30:00.000Z", seatsLeft: 1 },
        ],
      },
      {
        date: "2026-10-13",
        times: [{ start: "15:00", end: location === "shop" ? "15:45" : null, startsAt: "2026-10-13T12:00:00.000Z", seatsLeft: 3 }],
      },
    ],
  };
}

function booking(overrides: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    reference: REFERENCE,
    status: "awaiting_payment",
    location: "shop",
    placedAt: new Date().toISOString(),
    holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    contact: { name: "Sara", email: "sara@example.invalid", phone: "+974 5555 1234" },
    pet: { ageMonths: 24, breed: "", notes: "" },
    package: {
      group: { en: "Small pet", ar: "حيوان صغير" },
      name: { en: "Basic", ar: "أساسي" },
      included: { en: ["Bath & blow dry"], ar: ["استحمام وتجفيف"] },
      durationMinutes: 45,
    },
    appointment: { date: "2026-10-13", start: "15:00", end: "15:45", startsAt: "2026-10-13T12:00:00.000Z" },
    home: null,
    price: 8000,
    visitFee: 0,
    discount: 0,
    total: 8000,
    promotions: [],
    canCancel: true,
    cancelDeadline: "2026-10-12T12:00:00.000Z",
    refundNeeded: false,
    cancelledAt: null,
    payment: { canPay: true, latest: null, attemptsLeft: 3, attention: null },
    ...overrides,
  };
}

// --- API stub ------------------------------------------------------------------------------------

type Handler = (body: unknown, options?: RequestOptions) => unknown;
interface Call {
  key: string;
  body: unknown;
  options?: RequestOptions;
}

function stubApi(routes: Record<string, Handler>): ApiClient & { calls: Call[] } {
  const calls: Call[] = [];
  const handle = async <T,>(key: string, body: unknown, schema: ZodType<T>, options?: RequestOptions): Promise<T> => {
    calls.push({ key, body, options });
    const route = routes[key] ?? routes[key.split("?")[0] ?? key];
    if (!route) throw new ApiError("NOT_FOUND", `No stub for ${key}`, 404);
    return schema.parse(await route(body, options));
  };
  return {
    calls,
    get: (path, schema, options) => handle(`GET ${path}`, undefined, schema, options),
    post: (path, body, schema, options) => handle(`POST ${path}`, body, schema, options),
    put: (path, body, schema) => handle(`PUT ${path}`, body, schema),
    delete: (path, schema) => handle(`DELETE ${path}`, undefined, schema),
  };
}

const guestSession: Handler = () => {
  throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
};
const loggedIn: Handler = () => ({ id: "c1", email: "me@example.invalid", emailVerified: true });

function bookingRoutes(extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /grooming/packages": () => ({ groups }),
    "GET /grooming/areas": () => ({ areas }),
    "GET /grooming/availability": () => availability("shop"),
    "GET /auth/me": guestSession,
    ...extra,
  };
}

function renderWith(ui: ReactNode, api: ApiClient) {
  return render(<SettingsProviders api={api}>{ui}</SettingsProviders>);
}

const callsTo = (api: { calls: Call[] }, key: string) => api.calls.filter((call) => call.key === key);
const availabilityCalls = (api: { calls: Call[] }) => api.calls.filter((call) => call.key.startsWith("GET /grooming/availability"));

/** Shop, Small pet, Basic, Mon 12 Oct 10:00, then on to the details. */
async function chooseShopTime() {
  fireEvent.click(await screen.findByRole("button", { name: /Continue to pet/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Small pet" }));
  fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
  fireEvent.click(await screen.findByRole("button", { name: /^Basic/ }));
  fireEvent.click(screen.getByRole("button", { name: /Choose a date/ }));
  await chooseTime("Monday, 12 October 2026", "10:00 AM");
}

/** In the date and time step (D249): a day of the week strip, one of its times, then Continue. */
async function chooseTime(day: string, time: string) {
  fireEvent.click(await screen.findByRole("button", { name: day }));
  fireEvent.click(await screen.findByRole("button", { name: time }));
  fireEvent.click(screen.getByRole("button", { name: /Continue to your details/ }));
}

/** The pet's age (no name or weight, D246) and the customer's details. */
function fillDetails(pet: { years?: string; months?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Years"), { target: { value: pet.years ?? "2" } });
  fireEvent.change(screen.getByLabelText("Months"), { target: { value: pet.months ?? "0" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sara" } });
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  if (!email.readOnly) fireEvent.change(email, { target: { value: "sara@example.invalid" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+974 5555 1234" } });
}

// --- /grooming: booking --------------------------------------------------------------------------

describe("booking on /grooming", () => {
  it("offers real, clickable dates and times, then books and goes straight to the payment page", async () => {
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "POST /bookings": () => ({ booking: booking({ appointment: { date: "2026-10-12", start: "10:00", end: "10:45", startsAt: "2026-10-12T07:00:00.000Z" } }), guestKey: GUEST_KEY }),
        [`POST /guest-bookings/${REFERENCE}/pay`]: () => ({
          payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();

    // The dates and times come from the API for the chosen package at the shop.
    const asked = availabilityCalls(api).at(-1);
    expect(asked?.key).toBe(`GET /grooming/availability?package=${BASIC}&location=shop`);
    expect(screen.queryByRole("link", { name: /See available times/ })).toBeNull();
    expect(screen.queryByText(/are a preview/)).toBeNull();

    // The pet is asked its age under one heading, an optional breed and health or handling notes;
    // no name or weight (D246).
    expect(screen.getByRole("group", { name: "Age" })).toBeTruthy();
    expect(screen.queryByLabelText("Pet's name")).toBeNull();
    expect(screen.queryByLabelText(/Weight/)).toBeNull();
    fillDetails({ years: "2", months: "3" });
    fireEvent.change(screen.getByLabelText("Breed (optional)"), { target: { value: "Persian" } });
    fireEvent.change(screen.getByLabelText("Health or handling notes (optional)"), { target: { value: "Shy with dryers" } });
    const submit = screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ });
    fireEvent.click(submit);

    await waitFor(() => expect(go).toHaveBeenCalledWith("https://pay.example.invalid/p/1"));
    const sent = callsTo(api, "POST /bookings")[0]?.body as BookingRequest;
    expect(sent).toMatchObject({
      locale: "en",
      contact: { name: "Sara", email: "sara@example.invalid", phone: "+974 5555 1234" },
      packageId: BASIC,
      location: "shop",
      date: "2026-10-12",
      start: "10:00",
      home: null,
      expectedTotal: 8000,
    });
    expect(sent.pet).toEqual({ ageMonths: 27, breed: "Persian", notes: "Shy with dryers" });
    // The guest key goes with Pay now, and is kept for the way back from the payment page.
    const pay = callsTo(api, `POST /guest-bookings/${REFERENCE}/pay`)[0];
    expect(pay?.options?.headers).toEqual({ "X-Booking-Key": GUEST_KEY });
    expect(window.sessionStorage.getItem(`nc-booking-key:${REFERENCE}`)).toBe(GUEST_KEY);
    expect(push).not.toHaveBeenCalled();
  });

  it("the date and time step: a week at a time, the day's times in 12-hour form, and the chosen appointment (D249)", async () => {
    const api = stubApi(bookingRoutes());
    renderWith(<ReferenceGroomingPage />, api);
    fireEvent.click(await screen.findByRole("button", { name: /Continue to pet/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Small pet" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Basic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose a date/ }));

    // The range's first week, opened on its first free day; a day without free times cannot be chosen.
    expect(await screen.findByText("12 Oct – 18 Oct 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Monday, 12 October 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wednesday, 14 October 2026, no free times" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10:00 AM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue to your details/ })).toBeDisabled();

    // A chosen time stays on the step, with the whole appointment underneath.
    fireEvent.click(screen.getByRole("button", { name: "10:30 AM" }));
    const summary = screen.getByRole("status", { name: "Selected appointment" });
    expect(summary).toHaveTextContent("Mon, 12 October 2026 • 10:30 AM – 11:15 AM");
    expect(screen.queryByRole("button", { name: /Book and pay/ })).toBeNull();

    // Opening another day lets the time go.
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, 13 October 2026" }));
    expect(screen.getByRole("button", { name: "03:00 PM" })).toBeTruthy();
    expect(summary).toHaveTextContent("Choose a date and a time.");
    expect(screen.getByRole("button", { name: /Continue to your details/ })).toBeDisabled();

    // The next week has nothing free, and the range ends there.
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("19 Oct – 25 Oct 2026")).toBeTruthy();
    expect(screen.getByText("No free times this week. Try another week.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByRole("button", { name: "Monday, 12 October 2026" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "10:30 AM" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to your details/ }));
    expect(await screen.findByLabelText("Years")).toBeTruthy();
    // The closed step keeps the choice in its heading.
    expect(screen.getByRole("button", { name: /Mon 12 Oct · 10:30 AM/ })).toBeTruthy();
    expect(callsTo(api, "POST /bookings")).toHaveLength(0);
  });

  it("home visits: the area under its city with its visit fee, the address, and the fee in the total", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "GET /grooming/availability": () => availability("home"),
        "POST /bookings": () => ({ booking: booking({ location: "home", visitFee: 2000, total: 10000 }), guestKey: GUEST_KEY }),
        [`POST /guest-bookings/${REFERENCE}/pay`]: () => ({
          payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "/en/payments/fake/fake_1" },
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    fireEvent.click(await screen.findByRole("button", { name: /Home Grooming/ }));
    // No area yet: the next step stays shut.
    fireEvent.click(screen.getByRole("button", { name: /Continue to pet/ }));
    expect(await screen.findByText("Choose your area to continue.")).toBeTruthy();
    const area = screen.getByLabelText("Your area");
    expect(within(area).getByRole("group", { name: "Doha" })).toBeTruthy();
    expect(within(area).getByRole("option", { name: /West Bay · visit fee QAR\s?20\.00/ })).toBeTruthy();
    fireEvent.change(area, { target: { value: AREA } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to pet/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Small pet" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Basic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose a date/ }));
    // A home visit time is the arrival time.
    fireEvent.click(await screen.findByRole("button", { name: "Monday, 12 October 2026" }));
    fireEvent.click(await screen.findByRole("button", { name: "10:30 AM" }));
    expect(screen.getByRole("status", { name: "Selected appointment" })).toHaveTextContent("Mon, 12 October 2026 • 10:30 AM (arrival)");
    fireEvent.click(screen.getByRole("button", { name: /Continue to your details/ }));
    expect(availabilityCalls(api).at(-1)?.key).toBe(`GET /grooming/availability?package=${BASIC}&location=home&area=${AREA}`);

    fillDetails();
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "66" } });
    fireEvent.change(screen.getByLabelText("Street"), { target: { value: "850" } });
    fireEvent.change(screen.getByLabelText("Building"), { target: { value: "12" } });
    // The visit's own point (D263).
    fakeGeolocation({ latitude: 25.285447, longitude: 51.53104, accuracy: 20 });
    expect(screen.getByText("Optional: it helps our team find you.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share my location" }));
    expect(screen.getByText("Location shared (± 20 m)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?100\.00$/ }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(1));
    const sent = callsTo(api, "POST /bookings")[0]?.body as BookingRequest;
    expect(sent.home).toEqual({
      areaId: AREA,
      address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: { lat: 25.285447, lng: 51.53104, accuracy: 20 } },
    });
    expect(sent).toMatchObject({ location: "home", start: "10:30", expectedTotal: 10000 });
  });

  it("checks the pet's age against the group, names a group that fits, and sends nothing (D159, D246)", async () => {
    // Here the small-pet group is for pets up to 11 months; its stored weight limit is no longer checked.
    const young = groups.map((group) => (group.id === SMALL ? { ...group, ageMonths: { min: null, max: 11 } } : group));
    const api = stubApi(bookingRoutes({ "GET /grooming/packages": () => ({ groups: young }) }));
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    fillDetails({ years: "2" });
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    expect(await screen.findByText("This group is for pets up to 11 months old. For your pet, choose “Adult cat”.")).toBeTruthy();
    expect(screen.getByLabelText("Years")).toHaveAttribute("aria-invalid", "true");
    expect(callsTo(api, "POST /bookings")).toHaveLength(0);

    // A missing age is named too, before anything is sent.
    fireEvent.change(screen.getByLabelText("Years"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    expect(await screen.findByText("Please enter your pet's age.")).toBeTruthy();
    expect(callsTo(api, "POST /bookings")).toHaveLength(0);
  });

  it("a time taken meanwhile: says so, reads the times again and asks for another", async () => {
    let refused = 0;
    const api = stubApi(
      bookingRoutes({
        "POST /bookings": () => {
          refused += 1;
          throw new ApiError("SLOT_UNAVAILABLE", "This time is no longer available. Please choose another.", 409);
        },
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    fillDetails();
    const before = availabilityCalls(api).length;
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    expect(await screen.findByText("That time has just been taken. Please choose another time.")).toBeTruthy();
    expect(refused).toBe(1);
    await waitFor(() => expect(availabilityCalls(api).length).toBeGreaterThan(before));
    // Back on the times, nothing chosen.
    expect(await screen.findByRole("button", { name: "10:00 AM", pressed: false })).toBeTruthy();
    expect(screen.getByText("Choose a date and a time.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Book and pay/ })).toBeNull();
  });

  it("when the payment page cannot be opened, the booking page takes over with Pay now", async () => {
    const api = stubApi(
      bookingRoutes({
        "POST /bookings": () => ({ booking: booking(), guestKey: GUEST_KEY }),
        [`POST /guest-bookings/${REFERENCE}/pay`]: () => {
          throw new ApiError("PAYMENT_START_FAILED", "Could not start.", 502);
        },
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/bookings/${REFERENCE}#k=${GUEST_KEY}`));
  });

  it("logged-in customers book with their account email, and their booking opens without a key", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "GET /auth/me": loggedIn,
        "POST /bookings": () => ({ booking: booking(), guestKey: null }),
        [`POST /bookings/${REFERENCE}/pay`]: () => ({
          payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    expect(await screen.findByDisplayValue("me@example.invalid")).toHaveAttribute("readonly");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    await waitFor(() => expect(callsTo(api, `POST /bookings/${REFERENCE}/pay`)).toHaveLength(1));
    expect((callsTo(api, "POST /bookings")[0]?.body as BookingRequest | undefined)?.contact.email).toBe("me@example.invalid");
    expect(callsTo(api, `POST /bookings/${REFERENCE}/pay`)[0]?.options?.headers).toBeUndefined();
  });

  it("says so when there are no free times, and when home visits are not offered anywhere", async () => {
    const api = stubApi(
      bookingRoutes({
        "GET /grooming/areas": () => ({ areas: [] }),
        "GET /grooming/availability": () => ({ ...availability("shop"), days: [] }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    expect(await screen.findByText("Home visits are not available at the moment.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Home Grooming/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Continue to pet/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Small pet" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Basic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose a date/ }));
    expect(await screen.findByText(/No free times in the next days/)).toBeTruthy();
  });
});

// --- /bookings/<reference> --------------------------------------------------------------------------

// --- 10b: saved pets and addresses ---------------------------------------------------------------

const SAVED_PET = "0199d000-0000-7000-8000-0000000000e1";
const SAVED_HOME = "0199d000-0000-7000-8000-0000000000d1";
const member = { id: "c1", email: "me@example.invalid", emailVerified: true, name: "Mariam", phone: "+974 5555 9876" };

/** "YYYY-MM", `months` before this month in Qatar. */
function monthsAgo(months: number): string {
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit" }).format(new Date());
  const total = Number(now.slice(0, 4)) * 12 + Number(now.slice(5, 7)) - 1 - months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const luna: SavedPet = { id: SAVED_PET, name: "Luna", petType: null, breed: "Persian", bornMonth: monthsAgo(27), weightGrams: 4200, notes: "Shy with dryers", version: 2 };
const payRoute = {
  [`POST /bookings/${REFERENCE}/pay`]: () => ({
    payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
    holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  }),
};

describe("saved pets and addresses on /grooming (10b)", () => {
  it("a saved pet fills its age (from its born month), breed and notes, and the booking carries its id", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "GET /auth/me": () => member,
        "GET /account/pets": () => ({ pets: [luna] }),
        "GET /account/addresses": () => ({ addresses: [] }),
        "POST /bookings": () => ({ booking: booking(), guestKey: null }),
        ...payRoute,
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    expect(await screen.findByLabelText("Name")).toHaveValue("Mariam");
    expect(screen.getByLabelText("Phone")).toHaveValue("+974 5555 9876");
    fireEvent.change(screen.getByLabelText("Which pet?"), { target: { value: SAVED_PET } });
    expect(screen.getByLabelText("Years")).toHaveValue("2");
    expect(screen.getByLabelText("Months")).toHaveValue("3");
    expect(screen.getByLabelText("Breed (optional)")).toHaveValue("Persian");
    expect(screen.getByLabelText("Health or handling notes (optional)")).toHaveValue("Shy with dryers");

    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(1));
    expect(callsTo(api, "POST /bookings")[0]?.body).toMatchObject({
      contact: { name: "Mariam", email: "me@example.invalid", phone: "+974 5555 9876" },
      pet: { ageMonths: 27, breed: "Persian", notes: "Shy with dryers" },
      savedPetId: SAVED_PET,
    });
    expect(callsTo(api, "POST /account/pets")).toHaveLength(0);
  });

  it("a pet typed here is not saved: no save offer, and the booking carries no saved pet (D246)", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "GET /auth/me": () => member,
        "GET /account/pets": () => ({ pets: [luna] }),
        "GET /account/addresses": () => ({ addresses: [] }),
        "POST /bookings": () => ({ booking: booking(), guestKey: null }),
        ...payRoute,
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    // The saved pets have loaded; with "A new pet" chosen, nothing offers to save it.
    expect(await screen.findByLabelText("Which pet?")).toHaveValue("");
    expect(screen.queryByRole("checkbox", { name: /Save this pet/ })).toBeNull();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?80\.00$/ }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(1));
    expect((callsTo(api, "POST /bookings")[0]?.body as BookingRequest | undefined)?.savedPetId).toBeNull();
    expect(callsTo(api, "POST /account/pets")).toHaveLength(0);
  });

  it("home visits start at the default saved address: its area, and the address the booking uses", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const home: SavedAddress = {
      id: SAVED_HOME,
      label: "Home",
      area: { id: AREA, name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } },
      address: { zone: "61", street: "300", building: "7", floor: "2", flat: "", landmark: "", note: "Blue door", pin: null },
      isDefault: true,
      delivery: true,
      homeVisits: true,
      version: 1,
    };
    const api = stubApi(
      bookingRoutes({
        "GET /auth/me": () => member,
        "GET /account/pets": () => ({ pets: [] }),
        "GET /account/addresses": () => ({ addresses: [home] }),
        "GET /grooming/availability": () => availability("home"),
        "POST /bookings": () => ({ booking: booking({ location: "home", visitFee: 2000, total: 10000 }), guestKey: null }),
        ...payRoute,
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    fireEvent.click(await screen.findByRole("button", { name: /Home Grooming/ }));
    const visit = await screen.findByRole("group", { name: "Where we visit" });
    await waitFor(() => expect(within(visit).getByRole("radio", { name: /^Home/ })).toBeChecked());
    expect(screen.queryByLabelText("Your area")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Continue to pet/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Small pet" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to package/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Basic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose a date/ }));
    await chooseTime("Monday, 12 October 2026", "10:30 AM");
    expect(availabilityCalls(api).at(-1)?.key).toBe(`GET /grooming/availability?package=${BASIC}&location=home&area=${AREA}`);

    // The last step shows the saved address instead of its fields.
    expect(await screen.findByRole("button", { name: "Change the address" })).toBeTruthy();
    expect(screen.queryByLabelText("Zone")).toBeNull();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /^Book and pay QAR\s?100\.00$/ }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(1));
    expect((callsTo(api, "POST /bookings")[0]?.body as BookingRequest | undefined)?.home).toEqual({ areaId: AREA, address: home.address });
    expect(callsTo(api, "POST /account/pets")).toHaveLength(0);
    expect(callsTo(api, "POST /account/addresses")).toHaveLength(0);
  });
});

describe("the booking page", () => {
  it("guest link: shows the appointment, counts down and offers Pay now with the key", async () => {
    window.location.hash = `#k=${GUEST_KEY}`;
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi({
      [`GET /guest-bookings/${REFERENCE}`]: () => booking({ pet: { ageMonths: 27, breed: "Persian", notes: "Shy with dryers" } }),
      [`POST /guest-bookings/${REFERENCE}/pay`]: () => ({
        payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
        holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("heading", { name: "Your booking is waiting for payment" })).toBeTruthy();
    expect(screen.getByText(/Please pay within 15 minutes/)).toBeTruthy();
    expect(screen.getByText(/Small pet · Basic/)).toBeTruthy();
    // Customers read 12-hour times (D249).
    expect(screen.getByText(/03:00 PM – 03:45 PM/)).toBeTruthy();
    // The pet as asked (D246): its age and breed, and the health or handling notes.
    expect(screen.getByText("2 years 3 months · Persian")).toBeTruthy();
    expect(screen.getByText("Shy with dryers")).toBeTruthy();
    expect(callsTo(api, `GET /guest-bookings/${REFERENCE}`)[0]?.options?.headers).toEqual({ "X-Booking-Key": GUEST_KEY });
    fireEvent.click(screen.getByRole("button", { name: /^Pay QAR\s?80\.00 now$/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("https://pay.example.invalid/p/1"));
  });

  it("back from the payment page: checks the payment until the booking is confirmed", async () => {
    window.history.replaceState(null, "", `/en/bookings/${REFERENCE}?payment=${REFERENCE}-P1`);
    window.sessionStorage.setItem(`nc-booking-key:${REFERENCE}`, GUEST_KEY);
    let reads = 0;
    const api = stubApi({
      [`GET /guest-bookings/${REFERENCE}`]: () => {
        reads += 1;
        return reads === 1
          ? booking({ payment: { canPay: true, latest: { reference: `${REFERENCE}-P1`, status: "pending" }, attemptsLeft: 2, attention: null } })
          : booking({
              status: "confirmed",
              holdExpiresAt: null,
              payment: { canPay: false, latest: { reference: `${REFERENCE}-P1`, status: "succeeded" }, attemptsLeft: 2, attention: null },
            });
      },
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("heading", { name: "Checking your payment" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Thank you, your booking is confirmed" }, { timeout: 4000 })).toBeTruthy();
  });

  it("cancel asks first; a paid booking says the payment is refunded", async () => {
    const paid = booking({
      status: "confirmed",
      holdExpiresAt: null,
      payment: { canPay: false, latest: { reference: `${REFERENCE}-P1`, status: "succeeded" }, attemptsLeft: 2, attention: null },
    });
    const api = stubApi({
      "GET /auth/me": loggedIn,
      [`GET /bookings/${REFERENCE}`]: () => paid,
      [`POST /bookings/${REFERENCE}/cancel`]: () => ({ ...paid, status: "cancelled", canCancel: false, refundNeeded: true, cancelledAt: new Date().toISOString() }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    // The online deadline in the customer's 12-hour form (D249): 12:00 UTC is 3 PM in Doha.
    expect(await screen.findByText("You can cancel online until Mon 12 Oct, 03:00 PM (Qatar time).")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(screen.getByText(/Cancel this booking\? We will refund your payment\./)).toBeTruthy();
    expect(callsTo(api, `POST /bookings/${REFERENCE}/cancel`)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel the booking" }));
    expect(await screen.findByRole("heading", { name: "This booking is cancelled" })).toBeTruthy();
    expect(screen.getByText("We will refund your payment and let you know when it is done.")).toBeTruthy();
  });

  it("after the online deadline, a paid booking cannot be cancelled here and says to contact the shop", async () => {
    const api = stubApi({
      "GET /auth/me": loggedIn,
      [`GET /bookings/${REFERENCE}`]: () =>
        booking({ status: "confirmed", holdExpiresAt: null, canCancel: false, payment: { canPay: false, latest: { reference: `${REFERENCE}-P1`, status: "succeeded" }, attemptsLeft: 2, attention: null } }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/too close to cancel online\. Please contact us/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("a late payment whose time was taken says what happens next", async () => {
    const api = stubApi({
      "GET /auth/me": loggedIn,
      [`GET /bookings/${REFERENCE}`]: () =>
        booking({
          status: "expired",
          holdExpiresAt: null,
          canCancel: false,
          payment: { canPay: false, latest: { reference: `${REFERENCE}-P1`, status: "succeeded" }, attemptsLeft: 2, attention: "paid_after_expiry" },
        }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("heading", { name: "We received your payment" })).toBeTruthy();
    expect(screen.getByText(/the appointment time was no longer free\. We will contact you to arrange another time or refund you\./)).toBeTruthy();
  });

  it("without a key or a login: asks to log in, or to open the email link", async () => {
    const api = stubApi({
      [`GET /bookings/${REFERENCE}`]: () => {
        throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
      },
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      `/account/login?next=${encodeURIComponent(`/bookings/${REFERENCE}`)}`,
    );
  });
});

// --- My bookings ------------------------------------------------------------------------------------

describe("My bookings", () => {
  it("lists the account's bookings with their appointment, status and total", async () => {
    const api = stubApi({
      "GET /auth/me": loggedIn,
      "GET /bookings": () => ({
        bookings: [
          {
            reference: REFERENCE,
            status: "confirmed",
            location: "shop",
            placedAt: "2026-10-11T10:00:00.000Z",
            appointment: { date: "2026-10-13", start: "15:00", end: "15:45", startsAt: "2026-10-13T12:00:00.000Z" },
            discount: 1000,
            total: 8000,
            package: { en: "Basic", ar: "أساسي" },
            pet: { group: { en: "Small pet", ar: "حيوان صغير" }, breed: "Persian" },
            savedPetId: null,
          },
        ],
      }),
    });
    renderWith(<MyBookingsPage />, api);
    const row = await screen.findByRole("link", { name: new RegExp(REFERENCE) });
    expect(row).toHaveAttribute("href", `/bookings/${REFERENCE}`);
    expect(within(row).getByText("Confirmed")).toBeTruthy();
    expect(within(row).getByText(/Basic · Persian/)).toBeTruthy();
    // Customers read 12-hour times (D249).
    expect(within(row).getByText("03:00 PM")).toBeTruthy();
    // What offers saved (11e).
    expect(within(row).getByText(`Saved ${formatMoney(1000, "en")}`.replace(/\s/g, " "))).toBeTruthy();
  });

  it("guests are asked to log in", async () => {
    const api = stubApi({ "GET /auth/me": guestSession });
    renderWith(<MyBookingsPage />, api);
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", `/account/login?next=${encodeURIComponent("/account/bookings")}`);
  });

  it("after logging in, customers can come back to My bookings, a booking or the grooming page, and nowhere else", () => {
    expect(safeCustomerNext("/account/bookings")).toBe("/account/bookings");
    expect(safeCustomerNext(`/bookings/${REFERENCE}`)).toBe(`/bookings/${REFERENCE}`);
    expect(safeCustomerNext("/grooming")).toBe("/grooming");
    expect(safeCustomerNext("/bookings/../admin")).toBe("/account");
    expect(safeCustomerNext("https://example.invalid/bookings/x")).toBe("/account");
  });
});

// --- 11e: offers and promo codes when booking ------------------------------------------------------

const money = (minor: number) => formatMoney(minor, "en").replace(/\s/g, " ");
const off = (minor: number) => `− ${money(minor)}`;
/** The button names the total; its money keeps a non-breaking space. */
const bookAndPay = (minor: number) => new RegExp(`^Book and pay QAR\\s?${(minor / 100).toFixed(2)}$`);

/** The free times with an automatic offer for the customer asking (11c). */
function welcomeTimes(): GroomingAvailabilityResponse {
  return { ...availability("shop"), discount: 1000, total: 7000, promotions: [{ name: { en: "Welcome", ar: "ترحيب" }, code: null, discount: 1000 }] };
}

describe("offers when booking (11e)", () => {
  it("the free times' offer shows as a discount line; a code is priced by the booking quote and sent with the booking", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi(
      bookingRoutes({
        "GET /grooming/availability": () => welcomeTimes(),
        "POST /bookings/quote": (body) => {
          const request = body as BookingQuoteRequest;
          return request.code === "GROOM5"
            ? {
                price: 8000,
                visitFee: 0,
                discount: 1500,
                total: 6500,
                promotions: [{ name: { en: "Groom five", ar: "خمسة" }, code: "GROOM5", discount: 1500 }],
                code: { status: "applied", message: "The code is applied." },
              }
            : {
                price: 8000,
                visitFee: 0,
                discount: 1000,
                total: 7000,
                promotions: [{ name: { en: "Welcome", ar: "ترحيب" }, code: null, discount: 1000 }],
                code: { status: "no_matching_items", message: "This code does not apply to this grooming package, or the package already has an offer." },
              };
        },
        "POST /bookings": () => ({ booking: booking(), guestKey: GUEST_KEY }),
        [`POST /guest-bookings/${REFERENCE}/pay`]: () => ({
          payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(screen.getByText(off(1000))).toBeTruthy();
    expect(screen.getByRole("button", { name: bookAndPay(7000) })).toBeTruthy();
    // Without a code, nothing asks the booking quote: the free times carry the price.
    expect(callsTo(api, "POST /bookings/quote")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "OTHER" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("This code does not apply to this grooming package, or the package already has an offer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove the promo code OTHER" }));

    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "groom5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("The code is applied.")).toBeTruthy();
    expect(screen.getByText(/^Groom five ·/)).toBeTruthy();
    expect(screen.getByText(off(1500))).toBeTruthy();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: bookAndPay(6500) }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(1));
    expect(callsTo(api, "POST /bookings")[0]?.body).toMatchObject({ code: "GROOM5", expectedTotal: 6500 });
    expect(callsTo(api, "POST /bookings/quote").at(-1)?.body).toEqual({ packageId: BASIC, location: "shop", home: null, code: "GROOM5" });
  });

  it("a code that gives nothing is not sent: the customer removes it first", async () => {
    const api = stubApi(
      bookingRoutes({
        "POST /bookings/quote": () => ({
          price: 8000,
          visitFee: 0,
          discount: 0,
          total: 8000,
          promotions: [],
          code: { status: "min_spend", message: "This code is for grooming packages of at least QAR 100.00." },
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "BIG" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("This code is for grooming packages of at least QAR 100.00.")).toBeTruthy();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: bookAndPay(8000) }));
    expect(await screen.findByText(/Remove it to book without it/)).toBeTruthy();
    expect(callsTo(api, "POST /bookings")).toHaveLength(0);
  });

  it("price changed: shows the server's total for this booking and confirms it by booking again", async () => {
    vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    let tries = 0;
    const api = stubApi(
      bookingRoutes({
        // A guest counts as new in the free times; the booking knows this email has paid before.
        "GET /grooming/availability": () => welcomeTimes(),
        "POST /bookings": () => {
          tries += 1;
          if (tries === 1) {
            throw new ApiError("PRICE_CHANGED", "The total has changed.", 409, {
              bookingQuote: { price: 8000, visitFee: 0, discount: 0, total: 8000, promotions: [], code: null },
            });
          }
          return { booking: booking(), guestKey: GUEST_KEY };
        },
        [`POST /guest-bookings/${REFERENCE}/pay`]: () => ({
          payment: { reference: `${REFERENCE}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      }),
    );
    renderWith(<ReferenceGroomingPage />, api);
    await chooseShopTime();
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: bookAndPay(7000) }));
    expect(await screen.findByText(/The total for your booking has changed/)).toBeTruthy();
    expect(screen.queryByText(off(1000))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: bookAndPay(8000) }));
    await waitFor(() => expect(callsTo(api, "POST /bookings")).toHaveLength(2));
    expect(callsTo(api, "POST /bookings").map((call) => (call.body as BookingRequest).expectedTotal)).toEqual([7000, 8000]);
    expect(callsTo(api, "POST /bookings/quote")).toHaveLength(0);
  });

  it("a home visit's page shows the point the customer shared (D263)", async () => {
    const api = stubApi({
      "GET /auth/me": loggedIn,
      [`GET /bookings/${REFERENCE}`]: () =>
        booking({
          status: "confirmed",
          location: "home",
          home: {
            area: { en: "West Bay", ar: "الخليج الغربي" },
            address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: { lat: 25.285447, lng: 51.53104, accuracy: 15 } },
          },
          payment: { canPay: false, latest: null, attemptsLeft: 3, attention: null },
        }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByRole("link", { name: "Location shared · View on Google Maps" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
  });

  it("the booking page shows its promotions as discount lines", async () => {
    const api = stubApi({
      "GET /auth/me": loggedIn,
      [`GET /bookings/${REFERENCE}`]: () =>
        booking({
          status: "confirmed",
          discount: 1500,
          total: 6500,
          promotions: [{ name: { en: "Groom five", ar: "خمسة" }, code: "GROOM5", discount: 1500 }],
          payment: { canPay: false, latest: null, attemptsLeft: 3, attention: null },
        }),
    });
    renderWith(<GroomingBookingPage reference={REFERENCE} />, api);
    expect(await screen.findByText(/^Groom five ·/)).toBeTruthy();
    expect(screen.getByText(off(1500))).toBeTruthy();
    expect(screen.getByText(money(6500))).toBeTruthy();
  });
});
