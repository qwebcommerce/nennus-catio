// 10a: My account's details (name and phone), saved addresses and saved pets: each change sent with its
// version, deletes ask first, the limits and the server's refusals in the customer's words. 10b: recent
// activity and each saved pet's bookings.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AccountArea, BookingSummary, PetType, SavedAddress, SavedPet } from "@nennus-catio/contracts";
import type { ZodType } from "zod";
import { gramsFromKg } from "@/features/account/components/PetForm";
import { AccountPage } from "@/features/account/pages/AccountPage";
import { SavedAddressesPage } from "@/features/account/pages/SavedAddressesPage";
import { SavedPetsPage } from "@/features/account/pages/SavedPetsPage";
import { ageFromBornMonth, monthsSinceBorn } from "@/shared/api/account";
import { type ApiClient, ApiError, type RequestOptions } from "@/shared/api/client";
import { safeCustomerNext } from "@/shared/lib/customer-login";
import { SettingsProviders } from "./helpers/settings";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

const AREA = "0199e000-0000-7000-8000-0000000000a1";
const HOME_ONLY = "0199e000-0000-7000-8000-0000000000a2";
const ADDRESS_A = "0199e000-0000-7000-8000-0000000000d1";
const ADDRESS_B = "0199e000-0000-7000-8000-0000000000d2";
const PET_A = "0199e000-0000-7000-8000-0000000000f1";

const me = { id: "c1", email: "me@example.invalid", emailVerified: true, name: "Mariam", phone: "+974 5555 1234" };
const areas: AccountArea[] = [
  { id: AREA, name: { en: "West Bay", ar: "الخليج الغربي" }, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" }, delivery: true, homeVisits: true },
  { id: HOME_ONLY, name: { en: "Lusail", ar: "لوسيل" }, cityId: "c-lusail", city: { en: "Lusail", ar: "لوسيل" }, delivery: false, homeVisits: true },
];
const petTypes: PetType[] = [
  { slug: "cats", name: { en: "Cats", ar: "قطط" }, sortOrder: 0 },
  { slug: "dogs", name: { en: "Dogs", ar: "كلاب" }, sortOrder: 1 },
];

function address(id: string, label: string, isDefault: boolean, overrides: Partial<SavedAddress> = {}): SavedAddress {
  return {
    id,
    label,
    area: { id: AREA, name: areas[0]?.name ?? { en: "", ar: "" }, cityId: "c-doha", city: { en: "Doha", ar: "الدوحة" } },
    address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: null },
    isDefault,
    delivery: true,
    homeVisits: true,
    version: 2,
    ...overrides,
  };
}

const luna: SavedPet = { id: PET_A, name: "Luna", petType: { slug: "cats", name: { en: "Cats", ar: "قطط" } }, breed: "Persian", bornMonth: "2023-05", weightGrams: 4200, notes: "Nervous of dryers", version: 3 };

type Handler = (body: unknown) => unknown;
interface Call {
  key: string;
  body: unknown;
}

function stubApi(routes: Record<string, Handler>): ApiClient & { calls: Call[] } {
  const calls: Call[] = [];
  const handle = async <T,>(key: string, body: unknown, schema: ZodType<T>): Promise<T> => {
    calls.push({ key, body });
    const route = routes[key];
    if (!route) throw new ApiError("NOT_FOUND", `No stub for ${key}`, 404);
    return schema.parse(await route(body));
  };
  return {
    calls,
    get: (path, schema, _options?: RequestOptions) => handle(`GET ${path}`, undefined, schema),
    post: (path, body, schema) => handle(`POST ${path}`, body, schema),
    put: (path, body, schema) => handle(`PUT ${path}`, body, schema),
    delete: (path, schema) => handle(`DELETE ${path}`, undefined, schema),
  };
}

const loggedOut: Handler = () => {
  throw new ApiError("UNAUTHENTICATED", "Please log in.", 401);
};

function renderWith(ui: ReactNode, api: ApiClient) {
  return render(<SettingsProviders api={api}>{ui}</SettingsProviders>);
}

const callsTo = (api: { calls: Call[] }, key: string) => api.calls.filter((call) => call.key === key);

describe("My account: your details", () => {
  it("shows the saved name and phone, saves changes, and checks the phone before sending", async () => {
    const api = stubApi({
      "GET /auth/me": () => me,
      "PUT /account/profile": (body) => ({ ...me, ...(body as { name: string; phone: string }) }),
    });
    renderWith(<AccountPage />, api);
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.value).toBe("Mariam");
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("+974 5555 1234");
    expect(screen.getByRole("link", { name: "Saved addresses" })).toHaveAttribute("href", "/account/addresses");
    expect(screen.getByRole("link", { name: "Saved pets" })).toHaveAttribute("href", "/account/pets");
    expect(screen.queryByText(/coming next/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0919987622" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my details" }));
    expect(await screen.findByText(/Use a Qatari number/)).toBeTruthy();
    expect(callsTo(api, "PUT /account/profile")).toHaveLength(0);

    fireEvent.change(name, { target: { value: "Mariam Test" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my details" }));
    await waitFor(() => expect(callsTo(api, "PUT /account/profile")[0]?.body).toEqual({ name: "Mariam Test", phone: "" }));
    expect(await screen.findByText("Your details were saved.")).toBeTruthy();
  });
});

describe("Saved addresses", () => {
  it("lists the default first, adds one with its area under its city, and makes another the default", async () => {
    let list = [address(ADDRESS_A, "Home", true), address(ADDRESS_B, "Office", false)];
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /account/areas": () => ({ areas }),
      "GET /account/addresses": () => ({ addresses: list }),
      "POST /account/addresses": () => {
        list = [...list, address("0199e000-0000-7000-8000-0000000000d3", "Mum", false)];
        return { addresses: list };
      },
      [`POST /account/addresses/${ADDRESS_B}/default`]: () => {
        list = [address(ADDRESS_B, "Office", true), address(ADDRESS_A, "Home", false)];
        return { addresses: list };
      },
    });
    renderWith(<SavedAddressesPage />, api);
    const saved = await screen.findByRole("list", { name: "Saved addresses" });
    const items = within(saved).getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByText("Home")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("Default")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add an address" }));
    fireEvent.change(screen.getByLabelText("Name for this address (for example Home)"), { target: { value: "Mum" } });
    const area = screen.getByLabelText("Area");
    expect(within(area).getByRole("group", { name: "Lusail" })).toBeTruthy();
    expect(within(area).getByRole("option", { name: "Lusail · home visits only" })).toBeTruthy();
    fireEvent.change(area, { target: { value: AREA } });
    // A letter never lands in a number field (D230).
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "6x" } });
    expect(screen.getByLabelText("Zone")).toHaveValue("6");
    fireEvent.change(screen.getByLabelText("Street"), { target: { value: "850" } });
    fireEvent.change(screen.getByLabelText("Building"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "66" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(callsTo(api, "POST /account/addresses")).toHaveLength(1));
    expect(callsTo(api, "POST /account/addresses")[0]?.body).toEqual({
      label: "Mum",
      areaId: AREA,
      address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin: null },
      makeDefault: false,
    });
    expect(await screen.findByText("The address was saved.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Make Office the default" }));
    await waitFor(() => expect(callsTo(api, `POST /account/addresses/${ADDRESS_B}/default`)).toHaveLength(1));
  });

  it("edits with the version, deletes only after asking, and says when an area is no longer served", async () => {
    const pin = { lat: 25.285447, lng: 51.53104, accuracy: 15 };
    let list = [
      address(ADDRESS_A, "Home", true, { address: { zone: "66", street: "850", building: "12", floor: "", flat: "", landmark: "", note: "", pin } }),
      address(ADDRESS_B, "Old flat", false, { area: null, delivery: false, homeVisits: false }),
    ];
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /account/areas": () => ({ areas }),
      "GET /account/addresses": () => ({ addresses: list }),
      [`PUT /account/addresses/${ADDRESS_A}`]: () => ({ addresses: list }),
      [`DELETE /account/addresses/${ADDRESS_B}`]: () => {
        list = list.filter((row) => row.id !== ADDRESS_B);
        return { addresses: list };
      },
    });
    renderWith(<SavedAddressesPage />, api);
    expect(await screen.findByText("Area no longer served")).toBeTruthy();
    expect(screen.getByText("Choose another area before using this address.")).toBeTruthy();

    expect(screen.getByRole("link", { name: "Location saved · View on Google Maps" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.285447,51.531040");
    fireEvent.click(screen.getByRole("button", { name: "Edit the address Home" }));
    expect(screen.getByText("Location shared (± 15 m)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name for this address (for example Home)"), { target: { value: "Home 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(callsTo(api, `PUT /account/addresses/${ADDRESS_A}`)).toHaveLength(1));
    // The saved point stays unless it is removed (D263).
    expect(callsTo(api, `PUT /account/addresses/${ADDRESS_A}`)[0]?.body).toMatchObject({ label: "Home 2", version: 2, address: { pin } });

    fireEvent.click(await screen.findByRole("button", { name: "Delete the address Old flat" }));
    const dialog = await screen.findByRole("dialog", { name: 'Delete the address "Old flat"?' });
    expect(callsTo(api, `DELETE /account/addresses/${ADDRESS_B}`)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete address" }));
    await waitFor(() => expect(callsTo(api, `DELETE /account/addresses/${ADDRESS_B}`)).toHaveLength(1));
    expect(await screen.findByText("The address was deleted.")).toBeTruthy();
  });

  it("with 5 addresses, adding is switched off; logged out, it asks to log in", async () => {
    const full = Array.from({ length: 5 }, (_, index) => address(`0199e000-0000-7000-8000-00000000000${index}`, `A${index}`, index === 0));
    const api = stubApi({ "GET /auth/me": () => me, "GET /account/areas": () => ({ areas }), "GET /account/addresses": () => ({ addresses: full }) });
    renderWith(<SavedAddressesPage />, api);
    expect(await screen.findByRole("button", { name: "Add an address" })).toBeDisabled();
    expect(screen.getByText(/the most you can save/)).toBeTruthy();
    cleanup();

    renderWith(<SavedAddressesPage />, stubApi({ "GET /auth/me": loggedOut }));
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", `/account/login?next=${encodeURIComponent("/account/addresses")}`);
  });
});

describe("Saved pets", () => {
  it("adds a pet with its type, born month and weight in kg; edits send the version; deletes ask first", async () => {
    let list: SavedPet[] = [luna];
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /catalog/pet-types": () => ({ petTypes }),
      "GET /account/pets": () => ({ pets: list }),
      "POST /account/pets": (body) => {
        const input = body as SavedPet & { petType: string | null };
        list = [...list, { ...luna, id: "0199e000-0000-7000-8000-0000000000f2", name: input.name, petType: null, version: 1 }];
        return { pets: list };
      },
      [`PUT /account/pets/${PET_A}`]: () => ({ pets: list }),
      [`DELETE /account/pets/${PET_A}`]: () => {
        list = list.filter((pet) => pet.id !== PET_A);
        return { pets: list };
      },
    });
    renderWith(<SavedPetsPage />, api);
    expect(await screen.findByText("Luna")).toBeTruthy();
    expect(screen.getByText(/^Cats · Persian · .* · 4.2 kg$/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add a pet" }));
    fireEvent.change(screen.getByLabelText("Pet's name"), { target: { value: "Max" } });
    fireEvent.change(screen.getByLabelText("Pet type (optional)"), { target: { value: "dogs" } });
    fireEvent.change(screen.getByLabelText("Born (month and year, optional)"), { target: { value: "2022-01" } });
    fireEvent.change(screen.getByLabelText("Weight in kg (optional)"), { target: { value: "12,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pet" }));
    await waitFor(() => expect(callsTo(api, "POST /account/pets")).toHaveLength(1));
    expect(callsTo(api, "POST /account/pets")[0]?.body).toEqual({ name: "Max", petType: "dogs", breed: "", bornMonth: "2022-01", weightGrams: 12500, notes: "" });

    fireEvent.click(await screen.findByRole("button", { name: "Edit Luna" }));
    fireEvent.click(screen.getByRole("button", { name: "Save pet" }));
    await waitFor(() => expect(callsTo(api, `PUT /account/pets/${PET_A}`)[0]?.body).toMatchObject({ name: "Luna", petType: "cats", weightGrams: 4200, version: 3 }));

    fireEvent.click(await screen.findByRole("button", { name: "Delete Luna" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Luna from your saved pets?" });
    expect(callsTo(api, `DELETE /account/pets/${PET_A}`)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete pet" }));
    await waitFor(() => expect(callsTo(api, `DELETE /account/pets/${PET_A}`)).toHaveLength(1));
  });

  it("refuses a bad weight before sending, and shows the server's born-month and limit refusals in the customer's words", async () => {
    let next: "future" | "limit" = "future";
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /catalog/pet-types": () => ({ petTypes }),
      "GET /account/pets": () => ({ pets: [] }),
      "POST /account/pets": () => {
        if (next === "future") throw new ApiError("VALIDATION_FAILED", "x", 400, { fields: [{ path: "bornMonth", message: "The born month cannot be in the future." }] });
        throw new ApiError("LIMIT_REACHED", "You can save up to 10 pets.", 409);
      },
    });
    renderWith(<SavedPetsPage />, api);
    fireEvent.click(await screen.findByRole("button", { name: "Add a pet" }));
    fireEvent.change(screen.getByLabelText("Pet's name"), { target: { value: "Max" } });
    // Letters never land (D230); a weight over the limit is still refused before sending.
    fireEvent.change(screen.getByLabelText("Weight in kg (optional)"), { target: { value: "heavy" } });
    expect(screen.getByLabelText("Weight in kg (optional)")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Weight in kg (optional)"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pet" }));
    expect(await screen.findByText(/Enter the weight in kg/)).toBeTruthy();
    expect(callsTo(api, "POST /account/pets")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Weight in kg (optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Born (month and year, optional)"), { target: { value: "2099-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pet" }));
    expect(await screen.findByText("The born month cannot be in the future.")).toBeTruthy();

    next = "limit";
    fireEvent.click(screen.getByRole("button", { name: "Save pet" }));
    expect(await screen.findByText("You can save up to 10 pets. Delete one to add another.")).toBeTruthy();
  });
});

// --- 10b: recent activity, each pet's bookings ---------------------------------------------------

function bookingSummary(reference: string, placedAt: string, savedPetId: string | null): BookingSummary {
  return {
    reference,
    status: "confirmed",
    location: "shop",
    placedAt,
    appointment: { date: placedAt.slice(0, 10), start: "10:00", end: "10:45", startsAt: placedAt },
    discount: 0,
    total: 8000,
    package: { en: "Small pet · Basic", ar: "حيوان صغير · أساسي" },
    pet: { group: { en: "Small pet", ar: "حيوان صغير" }, breed: "Persian" },
    savedPetId,
  };
}

describe("My account: recent activity (10b)", () => {
  it("shows the latest 5 orders and grooming bookings together, newest first, with their links", async () => {
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /orders": () => ({
        orders: [
          { reference: "NC-261012-AAAAAA", status: "confirmed", fulfilment: "delivery", placedAt: "2026-10-12T09:00:00.000Z", discount: 0, total: 18500, hasHouse: false },
          { reference: "NC-261001-BBBBBB", status: "cancelled", fulfilment: "pickup", placedAt: "2026-10-01T09:00:00.000Z", discount: 0, total: 900, hasHouse: false },
        ],
      }),
      "GET /bookings": () => ({
        bookings: [
          bookingSummary("GB-261011-CCCCCC", "2026-10-11T09:00:00.000Z", PET_A),
          bookingSummary("GB-261005-DDDDDD", "2026-10-05T09:00:00.000Z", null),
          bookingSummary("GB-260930-EEEEEE", "2026-09-30T09:00:00.000Z", null),
          bookingSummary("GB-260920-FFFFFF", "2026-09-20T09:00:00.000Z", null),
        ],
      }),
    });
    renderWith(<AccountPage />, api);
    const recent = await screen.findByRole("list", { name: "Recent activity" });
    const links = within(recent).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/orders/NC-261012-AAAAAA",
      "/bookings/GB-261011-CCCCCC",
      "/bookings/GB-261005-DDDDDD",
      "/orders/NC-261001-BBBBBB",
      "/bookings/GB-260930-EEEEEE",
    ]);
    expect(within(links[0] as HTMLElement).getByText(/Order/)).toBeTruthy();
    expect(within(links[1] as HTMLElement).getByText(/Grooming/)).toBeTruthy();
    expect(within(links[3] as HTMLElement).getByText("Cancelled")).toBeTruthy();
  });

  it("says when there is nothing yet", async () => {
    const api = stubApi({ "GET /auth/me": () => me, "GET /orders": () => ({ orders: [] }), "GET /bookings": () => ({ bookings: [] }) });
    renderWith(<AccountPage />, api);
    expect(await screen.findByText("No orders or bookings yet.")).toBeTruthy();
  });
});

describe("Saved pets: each pet's bookings (10b)", () => {
  it("lists the bookings made for each saved pet, newest first, and says when there are none", async () => {
    const milo: SavedPet = { ...luna, id: "0199e000-0000-7000-8000-0000000000f2", name: "Milo" };
    const api = stubApi({
      "GET /auth/me": () => me,
      "GET /account/pets": () => ({ pets: [luna, milo] }),
      "GET /catalog/pet-types": () => ({ petTypes }),
      "GET /bookings": () => ({
        bookings: [
          bookingSummary("GB-261011-CCCCCC", "2026-10-11T09:00:00.000Z", PET_A),
          bookingSummary("GB-261005-DDDDDD", "2026-10-05T09:00:00.000Z", null),
          bookingSummary("GB-260930-EEEEEE", "2026-09-30T09:00:00.000Z", PET_A),
        ],
      }),
    });
    renderWith(<SavedPetsPage />, api);
    const lunas = await screen.findByRole("list", { name: "Luna's bookings" });
    expect(within(lunas).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/bookings/GB-261011-CCCCCC",
      "/bookings/GB-260930-EEEEEE",
    ]);
    expect(screen.queryByRole("list", { name: "Milo's bookings" })).toBeNull();
    expect(screen.getByText("No grooming booked yet.")).toBeTruthy();
  });
});

describe("helpers", () => {
  it("kg to grams, the age from a born month, and the pages a login can return to", () => {
    expect([gramsFromKg(""), gramsFromKg("4"), gramsFromKg("4.25"), gramsFromKg("4,5"), gramsFromKg("0"), gramsFromKg("201"), gramsFromKg("abc")]).toEqual([
      null,
      4000,
      4250,
      4500,
      undefined,
      undefined,
      undefined,
    ]);
    const text = (en: string) => en;
    const today = new Date("2026-10-12T12:00:00Z");
    expect(ageFromBornMonth("2024-07", text, today)).toBe("2 years 3 months");
    expect(ageFromBornMonth("2026-10", text, today)).toBe("0 months");
    expect(ageFromBornMonth("2025-10", text, today)).toBe("1 year");
    expect(ageFromBornMonth(null, text, today)).toBeNull();
    expect(safeCustomerNext("/account/addresses")).toBe("/account/addresses");
    expect(safeCustomerNext("/account/pets")).toBe("/account/pets");
  });

  it("a saved pet's age in months from its born month, by Qatar's month (10b; it fills the booking's age, D246)", () => {
    const at = new Date("2026-10-12T12:00:00+03:00");
    expect(monthsSinceBorn("2024-07", at)).toBe(27);
    expect(monthsSinceBorn("2026-10", at)).toBe(0);
    expect(monthsSinceBorn("2025-03", new Date("2026-01-15T12:00:00+03:00"))).toBe(10);
    expect(monthsSinceBorn("2026-11", at)).toBeNull();
    expect(monthsSinceBorn(null, at)).toBeNull();
    // 31 December 22:00 UTC is already 1 January in Doha.
    expect(monthsSinceBorn("2027-01", new Date("2026-12-31T22:00:00Z"))).toBe(0);
  });
});
