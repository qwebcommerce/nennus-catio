// 15c: the customer's relocation pages over the 15a-15b API: the public page's button, the four-step form
// (saved pets, "Save this pet", the journey, documents now or later), the request page (Pay now, the
// payment check, documents and uploads, cancel, Arabic), My relocation requests and the login return.
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  CustomerRelocationRequest,
  PublicSiteSettings,
  RelocationDocumentSlot,
  RelocationOptions,
  RelocationRequestInput,
  RelocationRequestSummary,
  SavedPet,
} from "@nennus-catio/contracts";
import type { ZodType } from "zod";
import { AccountPage } from "@/features/account/pages/AccountPage";
import { MyRelocationPage } from "@/features/account/pages/MyRelocationPage";
import { formDocuments, matchChosenFiles } from "@/features/relocation/lib/documents";
import { RelocationPage } from "@/features/relocation/pages/RelocationPage";
import { RelocationRequestDetailPage } from "@/features/relocation/pages/RelocationRequestDetailPage";
import { RelocationRequestPage } from "@/features/relocation/pages/RelocationRequestPage";
import { monthsSinceBorn } from "@/shared/api/account";
import { type ApiClient, ApiError, type RequestOptions } from "@/shared/api/client";
import { paymentNavigation } from "@/shared/api/payments";
import { safeCustomerNext } from "@/shared/lib/customer-login";
import { SettingsProviders, stubSettings } from "./helpers/settings";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/relocation",
  useRouter: () => ({ push, replace: push }),
}));

beforeEach(() => {
  push.mockReset();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// --- Fixtures -------------------------------------------------------------------------------------

const REF = "RL-261023-4F7KQ2";
const DEST = "0199d000-0000-7000-8000-0000000000d1";
const PASSPORT = "0199d000-0000-7000-8000-0000000000e1";
const OWNER_ID = "0199d000-0000-7000-8000-0000000000e2";
const SAVED_MILO = "0199d000-0000-7000-8000-0000000000f1";
const PET_1 = "0199d000-0000-7000-8000-000000000101";
const PET_2 = "0199d000-0000-7000-8000-000000000102";
const SLOT_PASS_1 = "0199d000-0000-7000-8000-000000000201";
const SLOT_PASS_2 = "0199d000-0000-7000-8000-000000000202";
const SLOT_ID = "0199d000-0000-7000-8000-000000000203";
const FILE_1 = "0199d000-0000-7000-8000-000000000301";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const options: RelocationOptions = {
  destinations: [{ id: DEST, name: { en: "Philippines", ar: "الفلبين" }, note: { en: "Manila only", ar: "مانيلا فقط" } }],
  documentTypes: [
    { id: PASSPORT, name: { en: "Pet passport", ar: "جواز سفر الحيوان" }, required: true, perPet: true },
    { id: OWNER_ID, name: { en: "Owner's ID", ar: "هوية المالك" }, required: false, perPet: false },
  ],
};
const petTypes = [
  { slug: "cats", name: { en: "Cats", ar: "قطط" }, sortOrder: 1 },
  { slug: "dogs", name: { en: "Dogs", ar: "كلاب" }, sortOrder: 2 },
];
const MILO_BORN = "2024-07";
const savedMilo: SavedPet = {
  id: SAVED_MILO,
  name: "Milo",
  petType: { slug: "cats", name: { en: "Cats", ar: "قطط" } },
  breed: "Persian",
  bornMonth: MILO_BORN,
  weightGrams: 4500,
  notes: "Shy",
  version: 1,
};

function slot(id: string, overrides: Partial<RelocationDocumentSlot> = {}): RelocationDocumentSlot {
  return {
    id,
    pet: { id: PET_1, name: "Milo" },
    name: { en: "Pet passport", ar: "جواز سفر الحيوان" },
    required: true,
    status: "missing",
    reviewReason: null,
    askedNote: "",
    files: [],
    ...overrides,
  };
}

const uploadedFile = {
  id: FILE_1,
  version: 1,
  contentType: "application/pdf" as const,
  bytes: 245_760,
  name: "milo-passport.pdf",
  uploadedAt: "2026-10-23T10:15:00.000Z",
  deletedAt: null,
};

function relocation(overrides: Partial<CustomerRelocationRequest> = {}): CustomerRelocationRequest {
  return {
    reference: REF,
    status: "documents_requested",
    placedAt: "2026-10-23T09:00:00.000Z",
    contact: { name: "Sara", email: "sara@example.invalid", phone: "+97455551234" },
    pets: [
      { id: PET_1, savedPetId: SAVED_MILO, name: "Milo", petType: { en: "Cats", ar: "قطط" }, breed: "Persian", ageMonths: 27, weightGrams: 4500, microchip: "985112003456789", notes: "Shy" },
    ],
    origin: { country: "Qatar", city: "Doha" },
    destination: { name: { en: "Philippines", ar: "الفلبين" }, other: false },
    plannedDate: "2030-01-15",
    note: "",
    documents: [slot(SLOT_PASS_1)],
    uploadsLeft: 20,
    quote: null,
    paidOutside: null,
    payment: { canPay: false, latest: null, attemptsLeft: 3, attention: null },
    refundNeeded: false,
    updates: [],
    history: [
      { from: null, to: "submitted", actor: "customer", reason: null, at: "2026-10-23T09:00:00.000Z" },
      { from: "submitted", to: "documents_requested", actor: "system", reason: null, at: "2026-10-23T09:00:00.000Z" },
    ],
    canCancel: true,
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  };
}

const quoted = (overrides: Partial<CustomerRelocationRequest> = {}) =>
  relocation({
    status: "quote_requested",
    documents: [slot(SLOT_PASS_1, { status: "accepted", files: [uploadedFile] })],
    quote: { amount: 125_000, note: "Flight, crate and health certificate.", issuedAt: "2026-10-24T11:30:00.000Z" },
    payment: { canPay: true, latest: null, attemptsLeft: 3, attention: null },
    ...overrides,
  });

// --- API stub ------------------------------------------------------------------------------------

type Handler = (body: unknown, options?: RequestOptions) => unknown;
interface Call {
  key: string;
  body: unknown;
}

function stubApi(routes: Record<string, Handler>): ApiClient & { calls: Call[] } {
  const calls: Call[] = [];
  const handle = async <T,>(key: string, body: unknown, schema: ZodType<T>, options?: RequestOptions): Promise<T> => {
    calls.push({ key, body });
    const route = routes[key];
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
const loggedIn: Handler = () => ({ id: "c1", email: "sara@example.invalid", emailVerified: true, name: "Sara", phone: "+97455551234" });

function formRoutes(extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /auth/me": loggedIn,
    "GET /relocation/options": () => options,
    "GET /relocation/requests": () => ({ requests: [] }),
    "GET /account/pets": () => ({ pets: [savedMilo] }),
    "GET /catalog/pet-types": () => ({ petTypes }),
    ...extra,
  };
}

function renderWith(ui: ReactNode, api: ApiClient, extra: { locale?: "en" | "ar"; settings?: PublicSiteSettings } = {}) {
  const settings = extra.settings ?? stubSettings();
  return render(
    <SettingsProviders api={api} locale={extra.locale ?? "en"} getPublicSettings={async () => settings}>
      {ui}
    </SettingsProviders>,
  );
}

const callsTo = (api: { calls: Call[] }, key: string) => api.calls.filter((call) => call.key === key);

/**
 * A stubbed browser fetch for uploads: each answer in turn, as JSON. `stored` is what the server keeps
 * once that answer is given, so the page's next read of the request sees it.
 */
function stubUploads(...answers: { status: number; body: unknown; stored?: () => void }[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const answer = answers.shift() ?? { status: 500, body: null };
    answer.stored?.();
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const pdf = (name: string) => new File(["%PDF-1.4\n%%EOF"], name, { type: "application/pdf" });

// --- The public page and the login return ----------------------------------------------------------

describe("the relocation page and the way in", () => {
  it("keeps WhatsApp and adds Start a relocation request, promising no price or route (D35, D279 answer 15)", async () => {
    renderWith(<RelocationPage />, stubApi({}), { settings: stubSettings({ socialLinks: { whatsapp: "https://wa.me/97455551234" } }) });
    const starts = await screen.findAllByRole("link", { name: /Start a (relocation )?request/ });
    expect(starts.map((link) => link.getAttribute("href"))).toEqual(["/relocation/request", "/relocation/request"]);
    expect((await screen.findByRole("link", { name: /Ask on WhatsApp/ })).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/97455551234/);
    expect(screen.getByText(/does not offer an instant price, booking or guaranteed route/)).toBeTruthy();
  });

  it("asks a visitor to log in and come back to the form; the login return accepts only the relocation pages", async () => {
    const api = stubApi({ "GET /auth/me": guestSession });
    renderWith(<RelocationRequestPage />, api);
    const login = await screen.findByRole("link", { name: "Log in" });
    expect(login.getAttribute("href")).toBe("/account/login?next=%2Frelocation%2Frequest");
    expect(screen.queryByRole("heading", { name: "Your pets" })).toBeNull();
    expect(callsTo(api, "GET /relocation/options")).toHaveLength(0);

    expect(safeCustomerNext("/relocation/request")).toBe("/relocation/request");
    expect(safeCustomerNext("/account/relocation")).toBe("/account/relocation");
    expect(safeCustomerNext(`/relocation/requests/${REF}`)).toBe(`/relocation/requests/${REF}`);
    expect(safeCustomerNext("/relocation/requests/RL-261023-ILOU00")).toBe("/account");
    expect(safeCustomerNext("/relocation/requests/../admin")).toBe("/account");
    expect(safeCustomerNext("https://example.invalid/relocation/request")).toBe("/account");
  });

  it("My account links to My relocation requests", async () => {
    renderWith(<AccountPage />, stubApi({ "GET /auth/me": loggedIn, "GET /orders": () => ({ orders: [] }), "GET /bookings": () => ({ bookings: [] }) }));
    expect((await screen.findByRole("link", { name: "My relocation requests" })).getAttribute("href")).toBe("/account/relocation");
  });
});

// --- The form ------------------------------------------------------------------------------------

describe("the relocation form", () => {
  it("sends a saved pet and a new one, the journey and a document chosen now; the file goes up once the request exists", async () => {
    const created = relocation({
      status: "documents_requested",
      pets: [
        { id: PET_1, savedPetId: SAVED_MILO, name: "Milo", petType: { en: "Cats", ar: "قطط" }, breed: "Persian", ageMonths: 27, weightGrams: 4500, microchip: "985112003456789", notes: "Shy" },
        { id: PET_2, savedPetId: null, name: "Luna", petType: null, breed: "", ageMonths: 12, weightGrams: null, microchip: "", notes: "" },
      ],
      documents: [
        slot(SLOT_PASS_1),
        slot(SLOT_PASS_2, { pet: { id: PET_2, name: "Luna" } }),
        slot(SLOT_ID, { pet: null, name: { en: "Owner's ID", ar: "هوية المالك" }, required: false }),
      ],
    });
    const api = stubApi(formRoutes({ "POST /relocation/requests": () => ({ request: created }) }));
    renderWith(<RelocationRequestPage />, api);

    // 1. The pets: Milo from the saved pets fills its fields; Luna is new and saved to the account.
    expect(await screen.findByRole("heading", { name: "Start a relocation request" })).toBeTruthy();
    const first = within(await screen.findByRole("group", { name: "Pet 1" }));
    fireEvent.change(await first.findByLabelText("Which pet?"), { target: { value: SAVED_MILO } });
    expect((first.getByLabelText("Pet's name") as HTMLInputElement).value).toBe("Milo");
    expect((first.getByLabelText("Breed (optional)") as HTMLInputElement).value).toBe("Persian");
    expect((first.getByLabelText("Weight in kg (optional)") as HTMLInputElement).value).toBe("4.5");
    // A saved pet is not saved again.
    expect(first.queryByLabelText("Save this pet to my account")).toBeNull();
    fireEvent.change(first.getByLabelText("Microchip number (optional)"), { target: { value: "985112003456789" } });
    fireEvent.click(screen.getByRole("button", { name: /Add another pet/ }));
    const second = within(screen.getByRole("group", { name: "Pet 2" }));
    // Milo is already in the request, so only "A new pet" is left to choose.
    expect(second.queryByLabelText("Which pet?")).toBeNull();
    fireEvent.change(second.getByLabelText("Pet's name"), { target: { value: "Luna" } });
    fireEvent.change(second.getByLabelText("Years"), { target: { value: "1" } });
    fireEvent.change(second.getByLabelText("Months"), { target: { value: "0" } });
    fireEvent.click(second.getByLabelText("Save this pet to my account"));
    fireEvent.click(screen.getByRole("button", { name: /Continue to the journey/ }));

    // 2. The journey: Qatar is filled in; one of the owner's destinations.
    expect((await screen.findByLabelText("Country") as HTMLInputElement).value).toBe("Qatar");
    fireEvent.change(screen.getByLabelText("City (optional)"), { target: { value: "Doha" } });
    fireEvent.click(screen.getByRole("radio", { name: /Philippines/ }));
    expect(screen.getByText("Manila only")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Planned date (approximate, optional)"), { target: { value: "2030-01-15" } });
    fireEvent.change(screen.getByLabelText("Anything we should know? (optional)"), { target: { value: "Two cats in one crate" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the documents/ }));

    // 3. The documents: per pet and for the whole request; a wrong kind of file is refused at once.
    // Each box is told apart by its spoken name: the document and its pet.
    const milosPassport = await screen.findByLabelText("Upload now: Pet passport for Milo");
    expect(screen.getByLabelText("Upload now: Pet passport for Luna")).toBeTruthy();
    expect(screen.getByText("For Milo")).toBeTruthy();
    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(screen.getByText("For the whole request")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Upload now: Owner's ID"), {
      target: { files: [new File(["x"], "id.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })] },
    });
    expect(screen.getByRole("alert").textContent).toBe("Please choose a PDF, JPG or PNG file.");
    fireEvent.change(milosPassport, { target: { files: [pdf("milo-passport.pdf")] } });
    expect(screen.getByText("milo-passport.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue to check and send/ }));

    // 4. Check and send: the summary, and the contact details from the profile.
    expect(await screen.findByText("1 file will be uploaded once the request is sent.")).toBeTruthy();
    expect(screen.getByText(/From Doha, Qatar · To Philippines/)).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Sara");
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("+97455551234");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/relocation/requests/${REF}`));
    const sent = callsTo(api, "POST /relocation/requests")[0]?.body as RelocationRequestInput;
    const milo = monthsSinceBorn(MILO_BORN) ?? 0;
    expect(sent.idempotencyKey).toMatch(UUID);
    expect(sent).toMatchObject({
      locale: "en",
      contact: { name: "Sara", phone: "+97455551234" },
      origin: { country: "Qatar", city: "Doha" },
      destination: { id: DEST, other: "" },
      plannedDate: "2030-01-15",
      note: "Two cats in one crate",
    });
    expect(sent.pets).toEqual([
      { savedPetId: SAVED_MILO, name: "Milo", petType: "cats", breed: "Persian", ageMonths: milo, weightGrams: 4500, microchip: "985112003456789", notes: "Shy", saveToAccount: false },
      { savedPetId: null, name: "Luna", petType: null, breed: "", ageMonths: 12, weightGrams: null, microchip: "", notes: "", saveToAccount: true },
    ]);

    // The request page sends the file chosen in the form against Milo's passport, then shows it.
    cleanup();
    let stored = created;
    const withFile = { ...created, documents: [slot(SLOT_PASS_1, { status: "uploaded", files: [uploadedFile] }), ...created.documents.slice(1)] };
    const fetchMock = stubUploads({ status: 201, body: { request: withFile }, stored: () => (stored = withFile) });
    renderWith(<RelocationRequestDetailPage reference={REF} />, stubApi({ [`GET /relocation/requests/${REF}`]: () => stored }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/relocation/requests/${REF}/documents/${SLOT_PASS_1}`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-Nennus-Request": "1" });
    expect(((init.body as FormData).get("file") as File).name).toBe("milo-passport.pdf");
    expect(await screen.findByRole("link", { name: "milo-passport.pdf" })).toBeTruthy();
  });

  it("checks each step before going on, and shows the server's field problems at their step", async () => {
    const api = stubApi(
      formRoutes({
        "POST /relocation/requests": () => {
          throw new ApiError("VALIDATION_FAILED", "Invalid.", 400, {
            fields: [{ path: "destination.id", message: "Choose a destination from the list, or type it under Other." }],
          });
        },
      }),
    );
    renderWith(<RelocationRequestPage />, api);
    fireEvent.click(await screen.findByRole("button", { name: /Continue to the journey/ }));
    expect(screen.getByText("Please enter your pet's name.")).toBeTruthy();
    expect(screen.getByText("Please enter your pet's age.")).toBeTruthy();
    expect(screen.queryByLabelText("Country")).toBeNull();

    const pet = within(screen.getByRole("group", { name: "Pet 1" }));
    fireEvent.change(pet.getByLabelText("Pet's name"), { target: { value: "Luna" } });
    fireEvent.change(pet.getByLabelText("Years"), { target: { value: "1" } });
    fireEvent.change(pet.getByLabelText("Weight in kg (optional)"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the journey/ }));
    expect(screen.getByText("Enter the weight in kg, for example 4.5 (up to 200).")).toBeTruthy();
    fireEvent.change(pet.getByLabelText("Weight in kg (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the journey/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Continue to the documents/ }));
    expect(screen.getByText("Choose where your pet is going, or type it under Other.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Other/ }));
    fireEvent.change(screen.getByLabelText("Planned date (approximate, optional)"), { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the documents/ }));
    expect(screen.getByText("Type the destination.")).toBeTruthy();
    expect(screen.getByText("Choose today or a later date.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kenya" } });
    fireEvent.change(screen.getByLabelText("Planned date (approximate, optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the documents/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Continue to check and send/ }));
    expect(await screen.findByText("None chosen now: you can upload them later from your request page.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    // The server's refusal opens the journey step and says what to do there.
    expect(await screen.findByText("Choose where your pet is going, or type it under Other.")).toBeTruthy();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(callsTo(api, "POST /relocation/requests")[0]?.body).toMatchObject({ destination: { id: null, other: "Kenya" }, plannedDate: null });
  });

  it("sends the same request again with the same key after a lost answer", async () => {
    let attempts = 0;
    const api = stubApi(
      formRoutes({
        "GET /account/pets": () => ({ pets: [] }),
        "POST /relocation/requests": () => {
          attempts += 1;
          if (attempts === 1) throw new ApiError("NETWORK", "The server could not be reached.");
          return { request: relocation() };
        },
      }),
    );
    renderWith(<RelocationRequestPage />, api);
    const pet = within(await screen.findByRole("group", { name: "Pet 1" }));
    fireEvent.change(pet.getByLabelText("Pet's name"), { target: { value: "Luna" } });
    fireEvent.change(pet.getByLabelText("Months"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to the journey/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Philippines/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to the documents/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue to check and send/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByText("The server could not be reached. Please try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/relocation/requests/${REF}`));
    const [one, two] = callsTo(api, "POST /relocation/requests").map((call) => call.body as RelocationRequestInput);
    expect(one?.idempotencyKey).toBe(two?.idempotencyKey);
    expect(one?.pets[0]).toMatchObject({ name: "Luna", ageMonths: 8 });
  });

  it("says so instead of showing the form when 3 requests are open", async () => {
    const open = (reference: string, status: RelocationRequestSummary["status"]): RelocationRequestSummary => ({
      reference,
      status,
      placedAt: "2026-10-20T09:00:00.000Z",
      plannedDate: null,
      pets: ["Milo"],
      destination: { en: "Philippines", ar: "الفلبين" },
      quote: null,
    });
    renderWith(
      <RelocationRequestPage />,
      stubApi(
        formRoutes({
          "GET /relocation/requests": () => ({
            requests: [open("RL-261020-AAAAAA", "submitted"), open("RL-261020-BBBBBB", "under_review"), open("RL-261020-CCCCCC", "paid"), open("RL-261020-DDDDDD", "completed")],
          }),
        }),
      ),
    );
    expect(await screen.findByText(/You already have 3 open relocation requests/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "My relocation requests" }).getAttribute("href")).toBe("/account/relocation");
    expect(screen.queryByRole("group", { name: "Pet 1" })).toBeNull();
  });
});

// --- The request page ------------------------------------------------------------------------------

describe("the relocation request page", () => {
  it("shows the quote and Pay now, which goes to the payment page", async () => {
    const go = vi.spyOn(paymentNavigation, "go").mockImplementation(() => undefined);
    const api = stubApi({
      [`GET /relocation/requests/${REF}`]: () => quoted(),
      [`POST /relocation/requests/${REF}/pay`]: () => ({
        payment: { reference: `${REF}-P1`, status: "pending", checkoutUrl: "https://pay.example.invalid/p/1" },
        holdExpiresAt: null,
      }),
    });
    renderWith(<RelocationRequestDetailPage reference={REF} />, api);
    expect(await screen.findByRole("heading", { name: "Your quote is ready" })).toBeTruthy();
    expect(screen.getByText("Quote awaiting payment")).toBeTruthy();
    expect(screen.getByText("Flight, crate and health certificate.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Pay QAR\s?1,250\.00 now$/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("https://pay.example.invalid/p/1"));
    expect(callsTo(api, `POST /relocation/requests/${REF}/pay`)).toHaveLength(1);
  });

  it("back from the payment page, checks the payment until it is confirmed", async () => {
    window.history.replaceState(null, "", `/relocation/requests/${REF}?payment=${REF}-P1`);
    let reads = 0;
    const api = stubApi({
      [`GET /relocation/requests/${REF}`]: () => {
        reads += 1;
        return reads === 1
          ? quoted({ payment: { canPay: true, latest: { reference: `${REF}-P1`, status: "pending" }, attemptsLeft: 2, attention: null } })
          : quoted({
              status: "paid",
              canCancel: false,
              payment: { canPay: false, latest: { reference: `${REF}-P1`, status: "succeeded" }, attemptsLeft: 2, attention: null },
            });
      },
    });
    renderWith(<RelocationRequestDetailPage reference={REF} />, api);
    expect(await screen.findByRole("heading", { name: "Checking your payment" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
    expect(await screen.findByRole("heading", { name: "Thank you, your payment is received" }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText("Paid online.")).toBeTruthy();
    // The amount reads as paid, no longer "To pay".
    expect(screen.queryByText("To pay")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.getByText("This request is paid, so only our team can cancel it. Please contact us.")).toBeTruthy();
  });

  it("says a payment did not go through only for an attempt of this quote, and when the attempts are used up", async () => {
    const failed = { reference: `${REF}-P1`, status: "failed" as const };
    const first = renderWith(
      <RelocationRequestDetailPage reference={REF} />,
      // A withdrawn quote's failed attempt: this quote has all three attempts left.
      stubApi({ [`GET /relocation/requests/${REF}`]: () => quoted({ payment: { canPay: true, latest: failed, attemptsLeft: 3, attention: null } }) }),
    );
    expect(await screen.findByRole("button", { name: /^Pay QAR\s?1,250\.00 now$/ })).toBeTruthy();
    expect(screen.queryByText(/did not go through/)).toBeNull();
    first.unmount();

    const second = renderWith(
      <RelocationRequestDetailPage reference={REF} />,
      stubApi({ [`GET /relocation/requests/${REF}`]: () => quoted({ payment: { canPay: true, latest: failed, attemptsLeft: 2, attention: null } }) }),
    );
    expect(await screen.findByText("Your payment did not go through. You can try again (2 attempts left).")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay again" })).toBeTruthy();
    second.unmount();

    renderWith(
      <RelocationRequestDetailPage reference={REF} />,
      stubApi({ [`GET /relocation/requests/${REF}`]: () => quoted({ payment: { canPay: false, latest: failed, attemptsLeft: 0, attention: null } }) }),
    );
    expect(await screen.findByText("This quote has reached the limit of 3 payment attempts. Please contact us.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });

  it("cancels only after asking, with an optional reason", async () => {
    const api = stubApi({
      [`GET /relocation/requests/${REF}`]: () => relocation(),
      [`POST /relocation/requests/${REF}/cancel`]: () =>
        relocation({
          status: "cancelled",
          canCancel: false,
          cancelledAt: "2026-10-23T12:00:00.000Z",
          cancelReason: "Plans changed",
        }),
    });
    renderWith(<RelocationRequestDetailPage reference={REF} />, api);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    expect(screen.getByText("Cancel this request?")).toBeTruthy();
    expect(callsTo(api, `POST /relocation/requests/${REF}/cancel`)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Why are you cancelling? (optional)"), { target: { value: "Plans changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel the request" }));
    expect(await screen.findByRole("heading", { name: "This request is cancelled" })).toBeTruthy();
    expect(callsTo(api, `POST /relocation/requests/${REF}/cancel`)[0]?.body).toEqual({ reason: "Plans changed" });
    expect(screen.getByText("Reason: Plans changed")).toBeTruthy();
    // A cancelled request takes no more files.
    expect(screen.queryByLabelText(/^Upload/)).toBeNull();
  });

  it("uploads a document, refuses a wrong file before sending, and words the server's refusal", async () => {
    let stored = relocation();
    const received = relocation({ status: "documents_received", documents: [slot(SLOT_PASS_1, { status: "uploaded", files: [uploadedFile] })] });
    const fetchMock = stubUploads(
      {
        status: 400,
        body: {
          code: "VALIDATION_FAILED",
          message: "This PDF contains scripts or attachments, which we cannot accept. Please export it as a plain PDF.",
          fields: [{ path: "file", message: "This PDF contains scripts or attachments, which we cannot accept. Please export it as a plain PDF." }],
        },
      },
      { status: 201, body: { request: received }, stored: () => (stored = received) },
    );
    renderWith(<RelocationRequestDetailPage reference={REF} />, stubApi({ [`GET /relocation/requests/${REF}`]: () => stored }));
    expect(await screen.findByRole("heading", { name: "We need some documents" })).toBeTruthy();
    const input = screen.getByLabelText("Upload a file: Pet passport for Milo");
    const big = pdf("huge.pdf");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText("Files must be 10 MB or smaller.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [pdf("scripted.pdf")] } });
    expect(
      await screen.findByText(/scripted\.pdf was not uploaded: This PDF contains scripts or attachments, which we cannot accept\. Please export it as a plain PDF\./),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Upload a file: Pet passport for Milo"), { target: { files: [pdf("milo-passport.pdf")] } });
    expect(await screen.findByText("Waiting for review")).toBeTruthy();
    const link = screen.getByRole("link", { name: "milo-passport.pdf" });
    expect(link.getAttribute("href")).toBe(`/api/relocation/requests/${REF}/documents/${FILE_1}/file`);
    expect(screen.getByRole("heading", { name: "We have your documents" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for a new copy with the team's reason, and takes no new file for an accepted document", async () => {
    renderWith(
      <RelocationRequestDetailPage reference={REF} />,
      stubApi({
        [`GET /relocation/requests/${REF}`]: () =>
          relocation({
            documents: [
              slot(SLOT_PASS_1, { status: "needs_new_copy", reviewReason: "The photo page is cut off.", files: [uploadedFile] }),
              slot(SLOT_ID, { pet: null, name: { en: "Owner's ID", ar: "هوية المالك" }, status: "accepted", files: [{ ...uploadedFile, id: SLOT_PASS_2, name: "id.webp" }] }),
            ],
            updates: [{ id: PET_2, text: "We booked the vet check.", at: "2026-10-24T08:00:00.000Z" }],
          }),
      }),
    );
    expect(await screen.findByText("Please upload a new copy. The photo page is cut off.")).toBeTruthy();
    expect(screen.getByLabelText("Upload a new copy: Pet passport for Milo")).toBeTruthy();
    expect(screen.queryByLabelText(/Owner's ID/)).toBeNull();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("We booked the vet check.")).toBeTruthy();
  });

  it("asks a logged-out visitor to log in and come back; another customer's request is not found", async () => {
    const first = renderWith(<RelocationRequestDetailPage reference={REF} />, stubApi({ [`GET /relocation/requests/${REF}`]: guestSession }));
    expect((await screen.findByRole("link", { name: "Log in" })).getAttribute("href")).toBe(`/account/login?next=${encodeURIComponent(`/relocation/requests/${REF}`)}`);
    first.unmount();
    renderWith(<RelocationRequestDetailPage reference={REF} />, stubApi({}));
    expect(await screen.findByText(/We could not find this relocation request/)).toBeTruthy();
  });

  it("reads in Arabic, with 12-hour times", async () => {
    renderWith(<RelocationRequestDetailPage reference={REF} />, stubApi({ [`GET /relocation/requests/${REF}`]: () => quoted() }), { locale: "ar" });
    expect(await screen.findByRole("heading", { name: "عرض السعر جاهز" })).toBeTruthy();
    expect(screen.getByText("عرض السعر بانتظار الدفع")).toBeTruthy();
    expect(screen.getByText("جواز سفر الحيوان")).toBeTruthy();
    expect(screen.getByText("مقبول")).toBeTruthy();
    // Sent at 11:30 UTC, 02:30 PM in Qatar.
    expect(screen.getByText(/أُرسل في .*٠٢:٣٠ م/)).toBeTruthy();
  });
});

// --- My relocation requests and the file matching ------------------------------------------------------

describe("My relocation requests", () => {
  it("lists the account's requests with the status and the quote", async () => {
    const summary = (overrides: Partial<RelocationRequestSummary>): RelocationRequestSummary => ({
      reference: REF,
      status: "quote_requested",
      placedAt: "2026-10-23T09:00:00.000Z",
      plannedDate: null,
      pets: ["Milo", "Luna"],
      destination: { en: "Philippines", ar: "الفلبين" },
      quote: 125_000,
      ...overrides,
    });
    renderWith(
      <MyRelocationPage />,
      stubApi({
        "GET /auth/me": loggedIn,
        "GET /relocation/requests": () => ({ requests: [summary({}), summary({ reference: "RL-261020-AAAAAA", status: "submitted", quote: null })] }),
      }),
    );
    const row = (await screen.findByText(REF)).closest("a") as HTMLAnchorElement;
    expect(row.getAttribute("href")).toBe(`/relocation/requests/${REF}`);
    expect(within(row).getByText("Quote awaiting payment")).toBeTruthy();
    expect(within(row).getByText(/QAR\s?1,250\.00/)).toBeTruthy();
    expect(within(row).getByText(/Milo, Luna · to Philippines/)).toBeTruthy();
    const other = screen.getByText("RL-261020-AAAAAA").closest("a") as HTMLAnchorElement;
    expect(within(other).getByText("Quote to come")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a relocation request" }).getAttribute("href")).toBe("/relocation/request");
  });

  it("asks a logged-out visitor to log in first", async () => {
    renderWith(<MyRelocationPage />, stubApi({ "GET /auth/me": guestSession }));
    expect((await screen.findByRole("link", { name: "Log in" })).getAttribute("href")).toBe("/account/login?next=%2Faccount%2Frelocation");
  });
});

describe("matching the form's files to the new request's documents", () => {
  it("matches by the type's names and the pet's place, and counts a file whose document is gone", () => {
    const documents = formDocuments(options.documentTypes, ["a", "b"]);
    expect(documents.map((document) => document.key)).toEqual([`${PASSPORT}:a`, `${PASSPORT}:b`, `${OWNER_ID}:request`]);
    const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
    const request = {
      pets: relocation({
        pets: [
          { id: PET_1, savedPetId: null, name: "Milo", petType: null, breed: "", ageMonths: 1, weightGrams: null, microchip: "", notes: "" },
          { id: PET_2, savedPetId: null, name: "Milo", petType: null, breed: "", ageMonths: 1, weightGrams: null, microchip: "", notes: "" },
        ],
      }).pets,
      // The owner renamed the ID type meanwhile; two pets share a name, so the place decides.
      documents: [slot(SLOT_PASS_1), slot(SLOT_PASS_2, { pet: { id: PET_2, name: "Milo" } }), slot(SLOT_ID, { pet: null, name: { en: "Passport of the owner", ar: "جواز المالك" } })],
    };
    const [first, second, third] = documents as [(typeof documents)[number], (typeof documents)[number], (typeof documents)[number]];
    const matched = matchChosenFiles(request, [
      { document: second, file: file("b.pdf") },
      { document: first, file: file("a.pdf") },
      { document: third, file: file("id.pdf") },
    ]);
    expect(matched.files.map((entry) => [entry.slotId, entry.file.name])).toEqual([
      [SLOT_PASS_2, "b.pdf"],
      [SLOT_PASS_1, "a.pdf"],
    ]);
    expect(matched.unmatched).toBe(1);
  });
});
