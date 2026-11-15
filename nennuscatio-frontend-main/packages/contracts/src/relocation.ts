import { z } from "zod";
import { ACCOUNT_LIMITS } from "./account.js";
import { emailSchema, localeSchema } from "./auth.js";
import { slugSchema } from "./catalog.js";
import { localDateSchema } from "./delivery.js";
import { GROOMING_LIMITS } from "./grooming.js";
import { customerPaymentSchema, orderContactSchema } from "./orders.js";
import { adminOrderPaymentsSchema, paymentAttentionSchema } from "./payments.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Pet relocation requests (#15; plan BRANCH_15_RELOCATION, D279). A logged-in customer submits a request
 * with their pets, where from and where to, and when; uploads the documents the owner's list and staff
 * ask for; receives a quote; pays; and follows the progress. Money is integer minor units (QAR); ages
 * are months and weights grams; dates are Qatar local. A request keeps its own copy of the destination's
 * and the document types' names, so later edits never change what was asked.
 */

/** The quotation's flow, in order. */
export const RELOCATION_STATUSES = [
  "submitted",
  "documents_requested",
  "documents_received",
  "under_review",
  "quote_requested",
  "paid",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export const relocationStatusSchema = z.enum(RELOCATION_STATUSES);

/** For people: `RL-` + Qatar date (YYMMDD) + 6 characters without look-alikes; separate from orders' `NC-` and bookings' `GB-`. */
export const relocationReferenceSchema = z.string().regex(/^RL-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/);

export const RELOCATION_LIMITS = Object.freeze({
  /** Open = not completed or cancelled (plan section 4.1). */
  maxOpenPerCustomer: 3,
  maxPets: ACCOUNT_LIMITS.maxPets,
  /** Files per request, versions included (plan section 4.9). */
  maxFilesPerRequest: 20,
  maxFileBytes: 10 * 1024 * 1024,
  /** The quote: whole dirhams from QAR 1 to QAR 100,000 (plan section 5). */
  minQuoteMinor: 100,
  maxQuoteMinor: 10_000_000,
  /** How long files are kept after a request ends; the owner sets it (D279 answer 8). */
  minRetentionDays: 1,
  maxRetentionDays: 3650,
  defaultRetentionDays: 90,
  maxNoteChars: 1000,
  maxQuoteNoteChars: 500,
  maxUpdateChars: 500,
  maxInternalNoteChars: 1000,
  maxReasonChars: 300,
});

/** Not completed or cancelled. */
export function relocationIsOpen(status: RelocationStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}

/** The customer cancels until the quote is paid; after that only staff (D279 answer 11). */
export function customerCanCancelRelocation(status: RelocationStatus): boolean {
  return status === "submitted" || status === "documents_requested" || status === "documents_received" || status === "under_review" || status === "quote_requested";
}

/** Staff cancel any request that is not already over. */
export function staffCanCancelRelocation(status: RelocationStatus): boolean {
  return relocationIsOpen(status);
}

/**
 * The statuses in which the document facts move a request by themselves (plan section 4.2): a required
 * document missing or a new copy asked → Documents Requested; every requested file arrived → Documents
 * Received. From the quote on, documents are still accepted but the status stays.
 */
export const RELOCATION_DOCUMENT_PHASE: readonly RelocationStatus[] = ["submitted", "documents_requested", "documents_received", "under_review"];

/**
 * The steps staff press (15b), each with the statuses it may start from (plan section 4.2). "Issue quote"
 * is offered before the documents are in, so a request with nothing to ask for is never stuck; from
 * Documents Requested the screen asks first, naming what is still missing.
 */
export const RELOCATION_STEPS = {
  start_review: { to: "under_review", from: ["submitted", "documents_requested", "documents_received"] },
  issue_quote: { to: "quote_requested", from: ["submitted", "documents_requested", "documents_received", "under_review"] },
  start: { to: "in_progress", from: ["paid"] },
  complete: { to: "completed", from: ["in_progress"] },
} as const satisfies Record<string, { to: RelocationStatus; from: readonly RelocationStatus[] }>;
export const relocationStepSchema = z.enum(["start_review", "issue_quote", "start", "complete"]);

export function relocationStepAllowed(step: RelocationStep, status: RelocationStatus): boolean {
  return (RELOCATION_STEPS[step].from as readonly RelocationStatus[]).includes(status);
}

// --- The request ------------------------------------------------------------------------------------

/**
 * A pet in the request. Its name and weight are asked (unlike grooming bookings, D246): relocation
 * paperwork needs both (plan section 5); the weight may be left out when it is not known yet.
 */
export const relocationPetInputSchema = z.object({
  /** The customer's saved pet it is, if any (another customer's is refused); the request keeps its own copy. */
  savedPetId: z.uuid().nullable().default(null),
  name: z.string().trim().min(1).max(60),
  /** The shop's pet type (its slug), or none. */
  petType: slugSchema.nullable().default(null),
  breed: z.string().trim().max(60).default(""),
  ageMonths: z.number().int().min(0).max(GROOMING_LIMITS.maxAgeMonths),
  weightGrams: z.number().int().min(1).max(ACCOUNT_LIMITS.maxWeightGrams).nullable().default(null),
  microchip: z.string().trim().max(30).default(""),
  /** Health or handling notes. */
  notes: z.string().trim().max(500).default(""),
  /** Also save it to the account ("Save this pet"); ignored when it already is a saved pet. */
  saveToAccount: z.boolean().default(false),
});

export const relocationRequestInputSchema = z.object({
  /** One per submit attempt in the browser; a repeat returns the same request. */
  idempotencyKey: z.uuid(),
  locale: localeSchema,
  /** The email is the account's. */
  contact: orderContactSchema.omit({ email: true }),
  pets: z.array(relocationPetInputSchema).min(1).max(RELOCATION_LIMITS.maxPets),
  origin: z.object({ country: z.string().trim().min(1).max(80), city: z.string().trim().max(80).default("") }),
  /** One of the owner's destinations, or the text typed under "Other" (D279 answer 3): exactly one. */
  destination: z
    .object({ id: z.uuid().nullable().default(null), other: z.string().trim().max(80).default("") })
    .refine((value) => (value.id !== null) !== (value.other.length > 0), {
      message: "Choose a destination from the list, or type it under Other.",
      path: ["id"],
    }),
  /** Approximate; nothing is booked by it. */
  plannedDate: localDateSchema.nullable().default(null),
  note: z.string().trim().max(RELOCATION_LIMITS.maxNoteChars).default(""),
});

export const cancelRelocationRequestSchema = z.object({ reason: z.string().trim().max(RELOCATION_LIMITS.maxReasonChars).optional() });

// --- Documents --------------------------------------------------------------------------------------

/** missing (asked, nothing uploaded) → uploaded (waiting for review) → accepted | needs_new_copy (a reason; a new upload makes it uploaded again). */
export const relocationSlotStatusSchema = z.enum(["missing", "uploaded", "accepted", "needs_new_copy"]);

export const relocationFileSchema = z.object({
  id: z.uuid(),
  /** 1 for the first upload against this slot, 2 for the next copy, and so on. */
  version: z.number().int().positive(),
  contentType: z.enum(["image/webp", "application/pdf"]),
  bytes: z.number().int().positive(),
  /** The customer's file name, trimmed to its base name. */
  name: z.string(),
  uploadedAt: z.string(),
  /** Deleted after the retention period, or by staff (plan section 4.3): the row stays, the file is gone. */
  deletedAt: z.string().nullable(),
});

/** One document asked for: from the owner's list at submission, or by staff later. */
export const relocationDocumentSlotSchema = z.object({
  id: z.uuid(),
  /** The pet it is for, or null for a document of the whole request. */
  pet: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  name: localisedTextSchema,
  required: z.boolean(),
  status: relocationSlotStatusSchema,
  /** Why a new copy is needed (status needs_new_copy), in staff's words. */
  reviewReason: z.string().nullable(),
  /** What staff wrote when asking for it. */
  askedNote: z.string(),
  files: z.array(relocationFileSchema),
});

// --- The customer's view ----------------------------------------------------------------------------

export const relocationPetSchema = z.object({
  id: z.uuid(),
  /** The saved pet it was for; null for a pet typed in, or once that saved pet is deleted. */
  savedPetId: z.uuid().nullable(),
  name: z.string(),
  petType: localisedTextSchema.nullable(),
  breed: z.string(),
  ageMonths: z.number().int(),
  weightGrams: z.number().int().nullable(),
  microchip: z.string(),
  notes: z.string(),
});

export const relocationHistoryEntrySchema = z.object({
  from: relocationStatusSchema.nullable(),
  to: relocationStatusSchema,
  actor: z.enum(["customer", "staff", "system"]),
  reason: z.string().nullable(),
  at: z.string(),
});

/** A progress update written by staff for the customer (D279 answer 13). */
export const relocationUpdateSchema = z.object({ id: z.uuid(), text: z.string(), at: z.string() });

export const relocationQuoteSchema = z.object({
  /** What the customer pays, in minor units. */
  amount: z.number().int().positive(),
  /** What it covers. */
  note: z.string(),
  issuedAt: z.string(),
});

/** A payment staff recorded as made outside the website (D279 answer 10). */
export const relocationPaidOutsideSchema = z.object({
  method: z.enum(["bank_transfer", "cash", "other"]),
  amount: z.number().int().positive(),
  at: z.string(),
});

export const customerRelocationRequestSchema = z.object({
  reference: relocationReferenceSchema,
  status: relocationStatusSchema,
  placedAt: z.string(),
  contact: orderContactSchema,
  pets: z.array(relocationPetSchema),
  origin: z.object({ country: z.string(), city: z.string() }),
  destination: z.object({ name: localisedTextSchema, other: z.boolean() }),
  plannedDate: localDateSchema.nullable(),
  note: z.string(),
  documents: z.array(relocationDocumentSlotSchema),
  /** How many more files this request may take (plan section 4.9). */
  uploadsLeft: z.number().int().nonnegative(),
  quote: relocationQuoteSchema.nullable(),
  paidOutside: relocationPaidOutsideSchema.nullable(),
  /**
   * Paying the quote (15b): Pay now works while the quote waits for payment and a payment company is set
   * up; three attempts per quote. The same "needs attention" reasons as orders and bookings.
   */
  payment: customerPaymentSchema,
  /** Cancelled after payment, and not refunded in full yet: staff refund it. */
  refundNeeded: z.boolean(),
  updates: z.array(relocationUpdateSchema),
  history: z.array(relocationHistoryEntrySchema),
  canCancel: z.boolean(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
});

export const relocationRequestResponseSchema = z.object({ request: customerRelocationRequestSchema });

export const relocationRequestSummarySchema = customerRelocationRequestSchema.pick({ reference: true, status: true, placedAt: true, plannedDate: true }).extend({
  /** The pets' names. */
  pets: z.array(z.string()),
  destination: localisedTextSchema,
  /** The quote's amount once issued. */
  quote: z.number().int().positive().nullable(),
});

export const relocationRequestListSchema = z.object({ requests: z.array(relocationRequestSummarySchema) });

/** `GET /api/relocation/options`: what the form offers, public, active entries only. */
export const relocationOptionsSchema = z.object({
  destinations: z.array(z.object({ id: z.uuid(), name: localisedTextSchema, note: localisedTextSchema })),
  documentTypes: z.array(z.object({ id: z.uuid(), name: localisedTextSchema, required: z.boolean(), perPet: z.boolean() })),
});

// --- Staff (15b; plan sections 4.2-4.7) -----------------------------------------------------------

export const ADMIN_RELOCATION_PAGE_SIZES = [10, 25, 50] as const;
export const adminRelocationSortSchema = z.enum(["newest", "oldest", "updated", "planned"]);

/** Query-string filters (all optional). `status` is a comma-separated list; the dates are when it was placed. */
export const adminRelocationQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      const parsed = z.array(relocationStatusSchema).max(RELOCATION_STATUSES.length).safeParse(value.split(",").filter(Boolean));
      if (!parsed.success) {
        context.addIssue({ code: "custom", message: "Unknown relocation status." });
        return z.NEVER;
      }
      return parsed.data;
    }),
  /** "1": only requests with "Refund needed" or a payment that needs attention. */
  needsAction: z.literal("1").optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  sort: adminRelocationSortSchema.default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_RELOCATION_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 10, 25 or 50.")
    .default(25),
});

const count = z.number().int().nonnegative();
const staffName = z.string().nullable();

export const adminRelocationSummarySchema = z.object({
  reference: relocationReferenceSchema,
  status: relocationStatusSchema,
  placedAt: z.string(),
  updatedAt: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  /** The pets' names. */
  pets: z.array(z.string()),
  destination: localisedTextSchema,
  plannedDate: localDateSchema.nullable(),
  /** The quote's amount while one is issued. */
  quote: z.number().int().positive().nullable(),
  /** Documents with a file waiting for review. */
  documentsToReview: count,
  /** Asked-for documents with no file yet, or needing a new copy. */
  documentsMissing: count,
  /** Paid by bank transfer or cash, recorded by staff (D279 answer 10). */
  paidOutside: z.boolean(),
  refundNeeded: z.boolean(),
  /** A payment staff must handle (as orders and bookings); the payment panel says what to do. */
  attention: paymentAttentionSchema.nullable(),
});

export const adminRelocationListResponseSchema = z.object({
  requests: z.array(adminRelocationSummarySchema),
  total: count,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** Requests per status for the summary cards, with every filter except status applied. */
  counts: z.record(relocationStatusSchema, count),
});

export const adminRelocationFileSchema = relocationFileSchema.extend({
  deletedReason: z.enum(["retention", "staff"]).nullable(),
  deletedBy: staffName,
});

export const adminRelocationSlotSchema = relocationDocumentSlotSchema.extend({
  files: z.array(adminRelocationFileSchema),
  /** The staff member who asked for it; null for one from the owner's list at submission. */
  askedBy: staffName,
  reviewedBy: staffName,
  reviewedAt: z.string().nullable(),
});

export const adminRelocationHistoryEntrySchema = relocationHistoryEntrySchema.extend({ staffName });

export const adminRelocationSchema = adminRelocationSummarySchema.extend({
  locale: localeSchema,
  contact: orderContactSchema,
  origin: z.object({ country: z.string(), city: z.string() }),
  /** The destination was typed under "Other". */
  destinationOther: z.boolean(),
  note: z.string(),
  petDetails: z.array(relocationPetSchema),
  documents: z.array(adminRelocationSlotSchema),
  uploadsLeft: count,
  quoteDetails: z.object({ amount: z.number().int().positive(), note: z.string(), issuedAt: z.string(), issuedBy: staffName }).nullable(),
  paidAt: z.string().nullable(),
  paidOutsideDetails: relocationPaidOutsideSchema
    .extend({ reference: z.string(), note: z.string(), by: staffName })
    .nullable(),
  /** A refund made outside the website, recorded by staff (15b). */
  refundedOutside: z
    .object({ amount: z.number().int().positive(), reference: z.string(), note: z.string(), at: z.string(), by: staffName })
    .nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.enum(["customer", "staff"]).nullable(),
  cancelReason: z.string().nullable(),
  /** When the retention job removed the files (plan section 4.3). */
  filesDeletedAt: z.string().nullable(),
  updates: z.array(relocationUpdateSchema.extend({ by: staffName })),
  /** Private to staff; their text never goes to the audit log (as D197). */
  notes: z.array(z.object({ id: z.uuid(), text: z.string(), at: z.string(), by: staffName })),
  history: z.array(adminRelocationHistoryEntrySchema),
  /** Echo this back with every change; a change made by someone else in between is refused. */
  version: z.number().int().positive(),
  /** What staff may do now (from the step rules above); the permissions decide the buttons. */
  actions: z.object({
    startReview: z.boolean(),
    issueQuote: z.boolean(),
    withdrawQuote: z.boolean(),
    start: z.boolean(),
    complete: z.boolean(),
    cancel: z.boolean(),
    /** Ask for, review or delete documents, write updates: while the request is not over. */
    documents: z.boolean(),
    recordPaidOutside: z.boolean(),
    recordRefundOutside: z.boolean(),
  }),
});

/** A request's payments for the staff panel: the orders' and bookings' shape with its reference. */
export const adminRelocationPaymentsSchema = adminOrderPaymentsSchema.omit({ orderReference: true }).extend({ relocationReference: relocationReferenceSchema });

// --- Staff changes ---------------------------------------------------------------------------------

const version = z.number().int().positive();
const reason = z.string().trim().max(RELOCATION_LIMITS.maxReasonChars);
const reference = z.string().trim().min(1).max(100);

export const relocationVersionRequestSchema = z.object({ version });

export const staffCancelRelocationSchema = z.object({
  version,
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(RELOCATION_LIMITS.maxReasonChars),
});

/** Whole dirhams from QAR 1 to QAR 100,000 (plan section 5), in minor units. */
export const relocationQuoteAmountSchema = z
  .number()
  .int()
  .min(RELOCATION_LIMITS.minQuoteMinor, "The quote must be at least QAR 1.")
  .max(RELOCATION_LIMITS.maxQuoteMinor, "The quote can be at most QAR 100,000.")
  .refine((value) => value % 100 === 0, "Use whole dirhams for the quote.");

export const issueRelocationQuoteSchema = z.object({
  version,
  amount: relocationQuoteAmountSchema,
  /** What the quote covers, as the customer reads it. */
  note: z.string().trim().min(1, "Say what the quote covers.").max(RELOCATION_LIMITS.maxQuoteNoteChars),
});

export const withdrawRelocationQuoteSchema = z.object({ version, reason: reason.optional() });

export const reviewRelocationDocumentSchema = z
  .object({ version, outcome: z.enum(["accept", "new_copy"]), reason: reason.optional() })
  .superRefine((value, context) => {
    if (value.outcome === "new_copy" && (value.reason ?? "").length < 3) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Tell the customer why a new copy is needed (at least 3 characters)." });
    }
  });

/** A type from the owner's list or a one-off name, for one pet or the whole request. */
export const askRelocationDocumentSchema = z
  .object({
    version,
    petId: z.uuid().nullable(),
    typeId: z.uuid().nullable(),
    name: z.object({ en: z.string().trim().min(1).max(80), ar: z.string().trim().min(1).max(80) }).nullable(),
    note: reason.default(""),
  })
  .refine((value) => (value.typeId === null) !== (value.name === null), {
    message: "Choose a document from the list, or type its name.",
    path: ["typeId"],
  });

export const relocationUpdateInputSchema = z.object({ text: z.string().trim().min(1).max(RELOCATION_LIMITS.maxUpdateChars) });
export const relocationNoteInputSchema = z.object({ text: z.string().trim().min(1).max(RELOCATION_LIMITS.maxInternalNoteChars) });

/** The quote paid by bank transfer, cash or another way outside the website (D279 answer 10): the quote's amount. */
export const recordRelocationPaidOutsideSchema = z.object({
  version,
  method: relocationPaidOutsideSchema.shape.method,
  reference,
  note: reason.default(""),
});

export const recordRelocationRefundOutsideSchema = z.object({
  version,
  amount: z.number().int().positive(),
  reference,
  note: reason.default(""),
});

// --- The owner's settings (15b API; screens in 15d) --------------------------------------------------

export const relocationDocumentTypeSchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  required: z.boolean(),
  perPet: z.boolean(),
  isActive: z.boolean(),
  /** A starting value from the seed, until the owner saves it. */
  isSample: z.boolean(),
  sortOrder: z.number().int(),
  /** Requests that asked for it: such a type is switched off instead of deleted. */
  used: count,
  version,
});

export const relocationDestinationSchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  note: localisedTextSchema,
  isActive: z.boolean(),
  isSample: z.boolean(),
  sortOrder: z.number().int(),
  used: count,
  version,
});

export const relocationSettingsSchema = z.object({
  retentionDays: z.number().int(),
  /** Where the staff alerts go (D279 answer 14); null means none. */
  alertEmail: z.string().nullable(),
  version,
  documentTypes: z.array(relocationDocumentTypeSchema),
  destinations: z.array(relocationDestinationSchema),
});

export const updateRelocationSettingsSchema = z.object({
  version,
  retentionDays: z.number().int().min(RELOCATION_LIMITS.minRetentionDays).max(RELOCATION_LIMITS.maxRetentionDays),
  alertEmail: z
    .union([z.literal(""), emailSchema])
    .nullable()
    .transform((value) => (value === "" || value === null ? null : value)),
});

const listName = z.object({ en: z.string().trim().min(1).max(80), ar: z.string().trim().min(1).max(80) });

export const saveRelocationDocumentTypeSchema = z.object({
  name: listName,
  required: z.boolean(),
  perPet: z.boolean(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const updateRelocationDocumentTypeSchema = saveRelocationDocumentTypeSchema.extend({ version });

export const saveRelocationDestinationSchema = z.object({
  name: listName,
  note: z.object({ en: z.string().trim().max(300), ar: z.string().trim().max(300) }).default({ en: "", ar: "" }),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const updateRelocationDestinationSchema = saveRelocationDestinationSchema.extend({ version });

export type AdminRelocationQuery = z.infer<typeof adminRelocationQuerySchema>;
export type AdminRelocationSort = z.infer<typeof adminRelocationSortSchema>;
export type AdminRelocationSummary = z.infer<typeof adminRelocationSummarySchema>;
export type AdminRelocationListResponse = z.infer<typeof adminRelocationListResponseSchema>;
export type AdminRelocationSlot = z.infer<typeof adminRelocationSlotSchema>;
export type AdminRelocation = z.infer<typeof adminRelocationSchema>;
export type AdminRelocationPayments = z.infer<typeof adminRelocationPaymentsSchema>;
export type StaffCancelRelocation = z.infer<typeof staffCancelRelocationSchema>;
export type IssueRelocationQuote = z.infer<typeof issueRelocationQuoteSchema>;
export type WithdrawRelocationQuote = z.infer<typeof withdrawRelocationQuoteSchema>;
export type ReviewRelocationDocument = z.infer<typeof reviewRelocationDocumentSchema>;
export type AskRelocationDocument = z.infer<typeof askRelocationDocumentSchema>;
export type RecordRelocationPaidOutside = z.infer<typeof recordRelocationPaidOutsideSchema>;
export type RecordRelocationRefundOutside = z.infer<typeof recordRelocationRefundOutsideSchema>;
export type RelocationDocumentType = z.infer<typeof relocationDocumentTypeSchema>;
export type RelocationDestination = z.infer<typeof relocationDestinationSchema>;
export type RelocationSettings = z.infer<typeof relocationSettingsSchema>;
export type UpdateRelocationSettings = z.infer<typeof updateRelocationSettingsSchema>;
export type SaveRelocationDocumentType = z.infer<typeof saveRelocationDocumentTypeSchema>;
export type UpdateRelocationDocumentType = z.infer<typeof updateRelocationDocumentTypeSchema>;
export type SaveRelocationDestination = z.infer<typeof saveRelocationDestinationSchema>;
export type UpdateRelocationDestination = z.infer<typeof updateRelocationDestinationSchema>;
export type RelocationStatus = z.infer<typeof relocationStatusSchema>;
export type RelocationStep = z.infer<typeof relocationStepSchema>;
export type RelocationPetInput = z.infer<typeof relocationPetInputSchema>;
export type RelocationRequestInput = z.infer<typeof relocationRequestInputSchema>;
export type CancelRelocationRequest = z.infer<typeof cancelRelocationRequestSchema>;
export type RelocationSlotStatus = z.infer<typeof relocationSlotStatusSchema>;
export type RelocationFile = z.infer<typeof relocationFileSchema>;
export type RelocationDocumentSlot = z.infer<typeof relocationDocumentSlotSchema>;
export type RelocationPet = z.infer<typeof relocationPetSchema>;
export type RelocationHistoryEntry = z.infer<typeof relocationHistoryEntrySchema>;
export type RelocationUpdate = z.infer<typeof relocationUpdateSchema>;
export type CustomerRelocationRequest = z.infer<typeof customerRelocationRequestSchema>;
export type RelocationRequestResponse = z.infer<typeof relocationRequestResponseSchema>;
export type RelocationRequestSummary = z.infer<typeof relocationRequestSummarySchema>;
export type RelocationOptions = z.infer<typeof relocationOptionsSchema>;
