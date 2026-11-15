// 15d: the staff Relocation page in API mode: the cards, search, filters and links; the detail panel's
// steps and cancel (each asking first, D128, and sending the version); the documents (accept, a new
// copy, ask, delete, open), the quote (issue, withdraw), payments and money outside the website (Refund
// only); updates and notes; the history; the owner's settings; and what each permission shows.
import {
  type AdminRelocation,
  type AdminRelocationPayments,
  type AdminRelocationSlot,
  type AdminRelocationSummary,
  normalisePermissions,
  type PermissionMap,
  type RelocationSettings,
  type RelocationStatus,
  type StaffProfile,
} from "@nennus-catio/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRelocationPage } from "@/features/admin/relocation/pages/AdminRelocationPage";
import { StaffIdentityProvider } from "@/layouts/global/GlobalProviders";
import { AdminAccessProvider } from "@/shared/access/AdminAccess";
import { type ApiClient, ApiError } from "@/shared/api/client";
import { SettingsProviders } from "./helpers/settings";

let linked = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => linked }));
vi.mock("@/shared/ui/FeatureFoundation", () => ({ FeatureFoundation: () => <p>restricted</p> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
beforeEach(() => {
  linked = new URLSearchParams();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ALL = { view: true, edit: true, delete: true, export: true, refund: true };
const OPERATIONS = { view: true, edit: true, delete: false, export: false, refund: false };
const VIEW = { view: true, edit: false, delete: false, export: false, refund: false };

const REF = "RL-261020-ABCDEF";
const uuid = (n: number) => `0199d000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const PET = uuid(1);
const SLOT_PASSPORT = uuid(2);
const SLOT_ID = uuid(3);
const FILE = uuid(4);
const TYPE_PASSPORT = uuid(5);
const TYPE_ID = uuid(6);
const DESTINATION = uuid(7);
const UPDATE = uuid(8);
const NOTE = uuid(9);

function slot(id: string, overrides: Partial<AdminRelocationSlot> = {}): AdminRelocationSlot {
  return {
    id,
    pet: { id: PET, name: "Milo" },
    name: { en: "Pet passport", ar: "جواز سفر الحيوان" },
    required: true,
    status: "missing",
    reviewReason: null,
    askedNote: "",
    files: [],
    askedBy: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

const passportFile = {
  id: FILE,
  version: 1,
  contentType: "application/pdf" as const,
  bytes: 245_760,
  name: "milo-passport.pdf",
  uploadedAt: "2026-10-21T08:00:00.000Z",
  deletedAt: null,
  deletedReason: null,
  deletedBy: null,
};

function request(status: RelocationStatus = "documents_received", overrides: Partial<AdminRelocation> = {}): AdminRelocation {
  return {
    reference: REF,
    status,
    placedAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-21T08:00:00.000Z",
    contactName: "Mariam Test",
    contactPhone: "+974 3333 7777",
    pets: ["Milo"],
    destination: { en: "Philippines", ar: "الفلبين" },
    plannedDate: "2026-12-15",
    quote: null,
    documentsToReview: 1,
    documentsMissing: 1,
    paidOutside: false,
    refundNeeded: false,
    attention: null,
    locale: "en",
    contact: { name: "Mariam Test", email: "mariam@example.invalid", phone: "+974 3333 7777" },
    origin: { country: "Qatar", city: "Doha" },
    destinationOther: false,
    note: "Two cats in one crate",
    petDetails: [
      { id: PET, savedPetId: null, name: "Milo", petType: { en: "Cats", ar: "قطط" }, breed: "Persian", ageMonths: 27, weightGrams: 4500, microchip: "985112003456789", notes: "Shy" },
    ],
    documents: [
      slot(SLOT_PASSPORT, { status: "uploaded", files: [passportFile] }),
      slot(SLOT_ID, { pet: null, name: { en: "Owner's ID", ar: "هوية المالك" }, status: "missing" }),
    ],
    uploadsLeft: 19,
    quoteDetails: null,
    paidAt: null,
    paidOutsideDetails: null,
    refundedOutside: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    filesDeletedAt: null,
    updates: [{ id: UPDATE, text: "We booked the vet check.", at: "2026-10-21T09:00:00.000Z", by: "Sara" }],
    notes: [{ id: NOTE, text: "Customer prefers WhatsApp", at: "2026-10-21T10:00:00.000Z", by: "Sara" }],
    history: [
      { from: null, to: "submitted", actor: "customer", staffName: null, reason: null, at: "2026-10-20T08:00:00.000Z" },
      { from: "submitted", to: "documents_received", actor: "system", staffName: null, reason: null, at: "2026-10-21T08:00:00.000Z" },
    ],
    version: 4,
    actions: {
      startReview: true,
      issueQuote: true,
      withdrawQuote: false,
      start: false,
      complete: false,
      cancel: true,
      documents: true,
      recordPaidOutside: false,
      recordRefundOutside: false,
    },
    ...overrides,
  };
}

const quoted = (overrides: Partial<AdminRelocation> = {}) =>
  request("quote_requested", {
    quote: 125_000,
    quoteDetails: { amount: 125_000, note: "Flight and crate", issuedAt: "2026-10-22T08:00:00.000Z", issuedBy: "Sara" },
    actions: { ...request().actions, startReview: false, issueQuote: false, withdrawQuote: true, recordPaidOutside: true },
    ...overrides,
  });

const summaryOf = (row: AdminRelocation): AdminRelocationSummary => ({
  reference: row.reference,
  status: row.status,
  placedAt: row.placedAt,
  updatedAt: row.updatedAt,
  contactName: row.contactName,
  contactPhone: row.contactPhone,
  pets: row.pets,
  destination: row.destination,
  plannedDate: row.plannedDate,
  quote: row.quote,
  documentsToReview: row.documentsToReview,
  documentsMissing: row.documentsMissing,
  paidOutside: row.paidOutside,
  refundNeeded: row.refundNeeded,
  attention: row.attention,
});

const counts = { submitted: 3, documents_requested: 1, documents_received: 2, under_review: 1, quote_requested: 1, paid: 1, in_progress: 4, completed: 0, cancelled: 0 };

function payments(reference: string): AdminRelocationPayments {
  return {
    relocationReference: reference,
    attention: null,
    refundNeeded: false,
    attempts: [],
    refunds: [],
    actions: { refundable: [], closableMismatches: [], canConfirmLate: false, refundsBy: "api" },
  };
}

function settings(overrides: Partial<RelocationSettings> = {}): RelocationSettings {
  return {
    retentionDays: 90,
    alertEmail: null,
    version: 2,
    documentTypes: [
      { id: TYPE_PASSPORT, name: { en: "Pet passport", ar: "جواز سفر الحيوان" }, required: true, perPet: true, isActive: true, isSample: true, sortOrder: 0, used: 3, version: 1 },
      { id: TYPE_ID, name: { en: "Owner's ID", ar: "هوية المالك" }, required: true, perPet: false, isActive: true, isSample: false, sortOrder: 1, used: 0, version: 1 },
    ],
    destinations: [{ id: DESTINATION, name: { en: "Philippines", ar: "الفلبين" }, note: { en: "", ar: "" }, isActive: true, isSample: true, sortOrder: 0, used: 1, version: 1 }],
    ...overrides,
  };
}

type Sent = { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown };

/**
 * The staff API: the list, the request, its payments and the settings; changes answer with `answer`, and
 * a request it answers with is what the next read of that request returns, as on the server.
 */
function stubApi(initial: AdminRelocation[], answer: (sent: Sent) => unknown = () => initial[0]) {
  const gets: string[] = [];
  const sent: Sent[] = [];
  let rows = [...initial];
  const respond = <T,>(schema: { parse: (value: unknown) => T }, value: unknown) => {
    const parsed = schema.parse(value);
    const changed = parsed as unknown as Partial<AdminRelocation>;
    if (changed && typeof changed === "object" && typeof changed.reference === "string" && typeof changed.version === "number" && "actions" in changed) {
      rows = rows.map((row) => (row.reference === changed.reference ? (parsed as unknown as AdminRelocation) : row));
    }
    return parsed as never;
  };
  const api: ApiClient = {
    get: async (path, schema) => {
      gets.push(path);
      if (path.startsWith("/admin/relocation?")) return respond(schema, { requests: rows.map(summaryOf), total: rows.length, page: 1, pageSize: 25, counts });
      if (path === "/admin/relocation/settings") return respond(schema, settings());
      if (path.startsWith("/admin/relocation/") && path.endsWith("/payments")) return respond(schema, payments(decodeURIComponent(path.split("/").at(-2) ?? "")));
      const found = rows.find((row) => path === `/admin/relocation/${row.reference}`);
      if (!found) throw new ApiError("NOT_FOUND", path, 404);
      return respond(schema, found);
    },
    post: async (path, body, schema) => {
      sent.push({ method: "POST", path, body });
      return respond(schema, answer({ method: "POST", path, body }));
    },
    put: async (path, body, schema) => {
      sent.push({ method: "PUT", path, body });
      return respond(schema, answer({ method: "PUT", path, body }));
    },
    delete: async (path, schema) => {
      sent.push({ method: "DELETE", path });
      return respond(schema, answer({ method: "DELETE", path }));
    },
  };
  return { api, gets, sent };
}

function staff(permissions: PermissionMap): StaffProfile {
  return { id: "s1", email: "staff@example.invalid", displayName: "Sara", isOwner: false, mustChangePassword: false, roleName: "Movers", permissions };
}

function renderPage(api: ApiClient, relocation = OPERATIONS, others: Partial<PermissionMap> = {}) {
  return render(
    <SettingsProviders api={api}>
      <StaffIdentityProvider demoRole="core">
        <AdminAccessProvider staff={staff(normalisePermissions({ relocation, ...others }))}>
          <AdminRelocationPage />
        </AdminAccessProvider>
      </StaffIdentityProvider>
    </SettingsProviders>,
  );
}

async function openRequest(reference = REF) {
  fireEvent.click(await screen.findByRole("button", { name: `View relocation request ${reference}` }));
  const panel = await screen.findByRole("complementary", { name: `Relocation ${reference}` });
  await within(panel).findByRole("tab", { name: "Request" });
  return panel;
}

const dialog = () => within(screen.getByRole("dialog"));
/** Lets any request a click started go out, so "nothing was sent yet" is checked after it could have been. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("the staff Relocation page", () => {
  it("shows the cards and requests, searches and filters, and opens a link's status", async () => {
    linked = new URLSearchParams({ status: "submitted" });
    const { api, gets } = stubApi([request()]);
    renderPage(api);
    expect(await screen.findByText(REF)).toBeTruthy();
    // The cards: each step waiting for the team, from the counts.
    const cards = [...document.querySelectorAll(".relocation-metrics .admin-metric")].map((card) => card.textContent);
    expect(cards).toEqual(["New3", "Documents to review2", "Quote to issue1", "Paid, waiting to start1", "In progress4"]);
    // The bell's and the Dashboard's links open the list on that status.
    expect(gets.find((path) => path.startsWith("/admin/relocation?"))).toContain("status=submitted");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("submitted");

    fireEvent.change(screen.getByLabelText("Search by request, name, email, phone or pet"), { target: { value: "Milo" } });
    await waitFor(() => expect(gets.some((path) => path.includes("q=Milo"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    await waitFor(() => expect(gets.at(-1)).toContain("status=submitted%2Cdocuments_requested%2Cdocuments_received%2Cunder_review%2Cquote_requested%2Cpaid%2Cin_progress"));
    // With Edit but not Export: Settings, and no downloads.
    expect(screen.queryByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("each step asks first and sends the request's version; a view-only role sees no steps", async () => {
    const { api, sent } = stubApi([request()], () => request("under_review", { version: 5, actions: { ...request().actions, startReview: false } }));
    renderPage(api);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("button", { name: "Start review" }));
    expect(dialog().getByText(`Move relocation request ${REF} to Under review?`)).toBeTruthy();
    await settle();
    expect(sent).toHaveLength(0);
    fireEvent.click(dialog().getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(sent).toEqual([{ method: "POST", path: `/admin/relocation/${REF}/start-review`, body: { version: 4 } }]));
    expect(await within(panel).findByText(`Request ${REF} is now Under review.`)).toBeTruthy();
    cleanup();

    renderPage(stubApi([request()]).api, VIEW);
    const read = await openRequest();
    expect(within(read).queryByRole("button", { name: "Start review" })).toBeNull();
    expect(within(read).queryByRole("button", { name: "Issue quote" })).toBeNull();
    expect(within(read).queryByRole("button", { name: "Cancel request" })).toBeNull();
  });

  it("issues a quote in whole dirhams, naming the documents still missing", async () => {
    const { api, sent } = stubApi([request("documents_requested")], () => quoted({ version: 5 }));
    renderPage(api);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("button", { name: "Issue quote" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Still missing: Owner's ID\. You can still send the quote\./);
    fireEvent.change(dialog().getByLabelText("Amount in QAR (whole dirhams)"), { target: { value: "1250" } });
    fireEvent.click(dialog().getByRole("button", { name: "Send quote" }));
    expect(await dialog().findByText("Say what the quote covers.")).toBeTruthy();
    fireEvent.change(dialog().getByLabelText("What it covers (the customer reads this)"), { target: { value: "Flight and crate" } });
    fireEvent.click(dialog().getByRole("button", { name: "Send quote" }));
    await waitFor(() =>
      expect(sent[0]).toEqual({ method: "POST", path: `/admin/relocation/${REF}/issue-quote`, body: { version: 4, amount: 125_000, note: "Flight and crate" } }),
    );
    expect(await within(panel).findByText(/The quote of QAR\s?1,250\.00 is sent/)).toBeTruthy();
  });

  it("cancels only with a reason, after saying what happens", async () => {
    const { api, sent } = stubApi([request()], () => request("cancelled", { version: 5, actions: { ...request().actions, cancel: false } }));
    renderPage(api);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel request" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("The customer gets a cancellation email with this reason.");
    fireEvent.click(dialog().getByRole("button", { name: "Cancel request" }));
    expect(await dialog().findByText("Please give a reason (at least 3 characters).")).toBeTruthy();
    expect(sent).toHaveLength(0);
    fireEvent.change(dialog().getByLabelText("Reason (the customer sees it)"), { target: { value: "Customer moved plans" } });
    fireEvent.click(dialog().getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(sent[0]?.body).toEqual({ version: 4, reason: "Customer moved plans" }));
  });

  it("documents: accept, ask for a new copy with a reason, ask for another, delete only with Delete, open as a download", async () => {
    const { api, sent } = stubApi([request()], () => request());
    renderPage(api, ALL);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("tab", { name: /^Documents/ }));
    const file = within(panel).getByRole("link", { name: "milo-passport.pdf" });
    expect(file).toHaveAttribute("href", `/api/admin/relocation/${REF}/files/${FILE}`);

    fireEvent.click(within(panel).getByRole("button", { name: "Accept Pet passport · Milo" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "POST", path: `/admin/relocation/${REF}/documents/${SLOT_PASSPORT}/review`, body: { version: 4, outcome: "accept" } }));

    fireEvent.click(within(panel).getByRole("button", { name: "Ask for a new copy of Pet passport · Milo" }));
    fireEvent.click(dialog().getByRole("button", { name: "Ask for a new copy" }));
    expect(await dialog().findByText(/at least 3 characters/)).toBeTruthy();
    fireEvent.change(dialog().getByLabelText("Why a new copy is needed"), { target: { value: "The photo page is cut off" } });
    fireEvent.click(dialog().getByRole("button", { name: "Ask for a new copy" }));
    await waitFor(() => expect(sent.at(-1)?.body).toEqual({ version: 4, outcome: "new_copy", reason: "The photo page is cut off" }));

    fireEvent.click(await within(panel).findByRole("button", { name: "Ask for a document" }));
    fireEvent.change(dialog().getByLabelText("Document"), { target: { value: "other" } });
    fireEvent.change(dialog().getByLabelText("Name in English"), { target: { value: "Import permit" } });
    fireEvent.change(dialog().getByLabelText("Name in Arabic"), { target: { value: "تصريح الاستيراد" } });
    fireEvent.change(dialog().getByLabelText("For"), { target: { value: PET } });
    fireEvent.click(dialog().getByRole("button", { name: "Ask for it" }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "POST",
        path: `/admin/relocation/${REF}/documents`,
        body: { version: 4, petId: PET, typeId: null, name: { en: "Import permit", ar: "تصريح الاستيراد" }, note: "" },
      }),
    );

    const before = sent.length;
    fireEvent.click(within(panel).getByRole("button", { name: "Delete the file milo-passport.pdf" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/cannot be brought back/);
    await settle();
    expect(sent).toHaveLength(before);
    fireEvent.click(dialog().getByRole("button", { name: "Delete file" }));
    await waitFor(() => expect(sent.slice(before)).toEqual([{ method: "DELETE", path: `/admin/relocation/${REF}/files/${FILE}` }]));
    cleanup();

    renderPage(stubApi([request()]).api, OPERATIONS);
    const noDelete = await openRequest();
    fireEvent.click(within(noDelete).getByRole("tab", { name: /^Documents/ }));
    expect(within(noDelete).queryByRole("button", { name: /^Delete the file/ })).toBeNull();
  });

  it("the quote tab: withdraw asks first; paying or refunding outside the website only with Refund", async () => {
    // Every change answers with the quote still waiting (version 5), so each next change sends 5.
    const { api, sent, gets } = stubApi([quoted()], () => quoted({ version: 5 }));
    renderPage(api, ALL);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("tab", { name: "Quote" }));
    expect(within(panel).getByText("Flight and crate")).toBeTruthy();
    expect(await within(panel).findByText("No payment attempts yet.")).toBeTruthy();
    expect(gets).toContain(`/admin/relocation/${REF}/payments`);

    fireEvent.click(within(panel).getByRole("button", { name: "Withdraw quote" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/payment page open, the quote cannot be withdrawn until it closes/);
    fireEvent.click(dialog().getByRole("button", { name: "Withdraw quote" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "POST", path: `/admin/relocation/${REF}/withdraw-quote`, body: { version: 4 } }));

    fireEvent.click(within(panel).getByRole("button", { name: "Record a payment made outside the website" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/never counted as online sales/);
    fireEvent.click(dialog().getByRole("button", { name: "Record payment" }));
    expect(await dialog().findByText("Enter the transfer's or receipt's reference.")).toBeTruthy();
    fireEvent.change(dialog().getByLabelText("How it was paid"), { target: { value: "cash" } });
    fireEvent.change(dialog().getByLabelText("Reference (transfer or receipt)"), { target: { value: "RCPT-7" } });
    fireEvent.click(dialog().getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "POST", path: `/admin/relocation/${REF}/paid-outside`, body: { version: 5, method: "cash", reference: "RCPT-7", note: "" } }));
    cleanup();

    renderPage(stubApi([quoted()]).api, OPERATIONS);
    const noRefund = await openRequest();
    fireEvent.click(within(noRefund).getByRole("tab", { name: "Quote" }));
    expect(within(noRefund).queryByRole("button", { name: "Record a payment made outside the website" })).toBeNull();
    expect(within(noRefund).getByRole("button", { name: "Withdraw quote" })).toBeTruthy();
  });

  it("updates and notes are added and deleted (asking first); the history names who did what", async () => {
    const { api, sent } = stubApi([request()], () => request());
    renderPage(api, ALL);
    const panel = await openRequest();
    fireEvent.click(within(panel).getByRole("tab", { name: "Progress" }));
    expect(within(panel).getByText("We booked the vet check.")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("New update"), { target: { value: "Flight booked for Monday." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Send update" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "POST", path: `/admin/relocation/${REF}/updates`, body: { text: "Flight booked for Monday." } }));
    fireEvent.click(within(panel).getByRole("button", { name: /^Delete the entry of/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/disappears from the customer's request page/);
    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "DELETE", path: `/admin/relocation/${REF}/updates/${UPDATE}` }));

    fireEvent.click(within(panel).getByRole("tab", { name: "Notes" }));
    expect(within(panel).getByText("For staff only: the customer never sees notes.")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("New note"), { target: { value: "Call after 4 pm" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "POST", path: `/admin/relocation/${REF}/notes`, body: { text: "Call after 4 pm" } }));

    fireEvent.click(within(panel).getByRole("tab", { name: "History" }));
    expect(within(panel).getByText("Submitted → Documents received")).toBeTruthy();
    expect(within(panel).getByText(/Automatic/)).toBeTruthy();
  });

  it("the owner's settings: retention and alert email, a new document type, and a used one switched off after asking", async () => {
    const { api, sent } = stubApi([request()], (change) => {
      if (change.method === "DELETE") return settings({ documentTypes: settings().documentTypes.map((type) => (type.id === TYPE_PASSPORT ? { ...type, isActive: false } : type)) });
      return settings({ version: 3 });
    });
    renderPage(api, ALL);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await dialog().findByText("Pet passport")).toBeTruthy();
    expect(dialog().getAllByText("Sample")).toHaveLength(2);
    fireEvent.change(dialog().getByLabelText("Days to keep files after a request ends"), { target: { value: "120" } });
    fireEvent.change(dialog().getByLabelText(/Alert email/), { target: { value: "owner@example.invalid" } });
    fireEvent.click(dialog().getAllByRole("button", { name: "Save" })[0] as HTMLElement);
    await waitFor(() => expect(sent.at(-1)).toEqual({ method: "PUT", path: "/admin/relocation/settings", body: { version: 2, retentionDays: 120, alertEmail: "owner@example.invalid" } }));

    fireEvent.click(dialog().getByRole("button", { name: "Add a document type" }));
    const form = within(dialog().getByRole("form", { name: "New document type" }));
    fireEvent.change(form.getByLabelText("Name in English"), { target: { value: "Import permit" } });
    fireEvent.change(form.getByLabelText("Name in Arabic"), { target: { value: "تصريح الاستيراد" } });
    fireEvent.click(form.getByLabelText("One per pet"));
    fireEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "POST",
        path: "/admin/relocation/settings/document-types",
        body: { name: { en: "Import permit", ar: "تصريح الاستيراد" }, required: true, perPet: false, isActive: true, sortOrder: 0 },
      }),
    );

    const before = sent.length;
    fireEvent.click(dialog().getByRole("button", { name: "Delete Pet passport" }));
    const question = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    expect(question).toHaveTextContent(/asked on 3 requests, so it is switched off instead/);
    await settle();
    expect(sent).toHaveLength(before);
    fireEvent.click(within(question).getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(sent.slice(before)).toEqual([{ method: "DELETE", path: `/admin/relocation/settings/document-types/${TYPE_PASSPORT}` }]));
  });

  it("without Relocation view the page is not shown", async () => {
    render(
      <SettingsProviders api={stubApi([request()]).api}>
        <StaffIdentityProvider demoRole="core">
          <AdminAccessProvider staff={staff(normalisePermissions({ bookings: VIEW }))}>
            <AdminRelocationPage />
          </AdminAccessProvider>
        </StaffIdentityProvider>
      </SettingsProviders>,
    );
    expect(await screen.findByText("restricted")).toBeTruthy();
  });
});
