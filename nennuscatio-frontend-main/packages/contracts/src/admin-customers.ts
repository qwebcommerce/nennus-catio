import { z } from "zod";
import { savedAddressSchema, savedPetSchema } from "./account.js";
import { adminBookingSummarySchema } from "./admin-bookings.js";
import { adminOrderSummarySchema } from "./admin-orders.js";
import { petLabelSchema } from "./bookings.js";
import { localDateSchema } from "./delivery.js";
import { adminRelocationSummarySchema } from "./relocation.js";

/**
 * Staff customer records (10c; plan BRANCH_10 sections 3-6, D186). One record per email address, for
 * accounts and guests alike; its orders, bookings and relocation requests (#15) are the ones placed with that email. Staff read
 * records, add and delete notes, and apply tags from an owner-managed list; they never edit a
 * customer's own details and never delete a record (retention is A04, later).
 */

export const CRM_TAG_COLOURS = ["grey", "blue", "green", "amber", "red", "purple"] as const;
export const crmTagColourSchema = z.enum(CRM_TAG_COLOURS);

export const CRM_LIMITS = Object.freeze({
  /** Tags on one customer. */
  maxTagsPerCustomer: 20,
  /** Tags in the owner's list. */
  maxTags: 100,
  maxTagNameLength: 40,
  maxNoteLength: 1000,
  /** The newest orders, bookings and relocation requests shown on a record (the totals count them all). */
  recentActivity: 50,
});

/** Whether the email has an account, and whether its email is confirmed (only confirmed accounts log in). */
export const accountStatusSchema = z.enum(["none", "awaiting_confirmation", "confirmed"]);

// --- List ---------------------------------------------------------------------------------------

export const ADMIN_CUSTOMER_PAGE_SIZES = [10, 25, 50] as const;
export const adminCustomerSortSchema = z.enum(["activity", "name", "orders", "bookings", "spend"]);

/** Query-string filters (all optional). */
export const adminCustomerQuerySchema = z.object({
  /** A name, an email, or 4+ digits of a phone number. */
  q: z.string().trim().max(100).optional(),
  /** "account": an account exists for the email (confirmed or not); "guest": none. */
  kind: z.enum(["account", "guest"]).optional(),
  tag: z.uuid().optional(),
  /** Only customers with at least one order, or at least one booking. */
  has: z.enum(["orders", "bookings"]).optional(),
  /** Last activity between these Qatar dates (inclusive). */
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  sort: adminCustomerSortSchema.default("activity"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_CUSTOMER_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 10, 25 or 50.")
    .default(25),
});

const tagNameSchema = z.string().trim().min(1, "Please give a name.").max(CRM_LIMITS.maxTagNameLength);

export const crmTagSchema = z.object({
  id: z.uuid(),
  name: z.object({ en: z.string(), ar: z.string() }),
  colour: crmTagColourSchema,
});

export const adminCustomerSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  /** The latest name and phone: the account's profile first, otherwise the latest order's or booking's. */
  name: z.string().nullable(),
  phone: z.string().nullable(),
  account: accountStatusSchema,
  firstSeenAt: z.string(),
  lastActivityAt: z.string(),
  orders: z.number().int().nonnegative(),
  bookings: z.number().int().nonnegative(),
  /** Relocation requests placed with this email (#15 15d). */
  relocations: z.number().int().nonnegative(),
  /** Paid through the payment company (orders, bookings and relocation quotes), less the refunds started, in dirhams. */
  totalPaid: z.number().int().nonnegative(),
  tags: z.array(crmTagSchema),
});

export const adminCustomerListResponseSchema = z.object({
  customers: z.array(adminCustomerSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** The summary cards, with every filter applied except "account or guest". */
  counts: z.object({
    all: z.number().int().nonnegative(),
    accounts: z.number().int().nonnegative(),
    guests: z.number().int().nonnegative(),
    /** First seen this calendar month (Qatar time). */
    newThisMonth: z.number().int().nonnegative(),
  }),
});

// --- Detail -------------------------------------------------------------------------------------

export const adminCustomerTagSchema = crmTagSchema.extend({
  appliedAt: z.string(),
  /** The staff member who applied it; null if their account is gone. */
  appliedBy: z.string().nullable(),
});

export const adminCustomerNoteSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  staffName: z.string(),
  createdAt: z.string(),
});

/**
 * A pet seen in this customer's bookings (each booking keeps its own copy of the pet, D160). Since
 * the pet's name is no longer asked (D246), pets are grouped by group and breed (the breed ignoring
 * case and surrounding spaces), as staff see them. The group, breed and age are as given with the
 * latest booking.
 */
export const petSeenSchema = z.object({
  pet: petLabelSchema,
  ageMonths: z.number().int().nonnegative(),
  /** The latest appointment's start. */
  lastAppointmentAt: z.string(),
  bookings: z.number().int().positive(),
  /** The saved pet of the latest booking that had one (10b), if any. */
  savedPetId: z.uuid().nullable(),
});

export const adminCustomerSchema = adminCustomerSummarySchema.extend({
  tags: z.array(adminCustomerTagSchema),
  /** The account behind this email, if any. */
  accountDetails: z
    .object({
      registeredAt: z.string(),
      confirmedAt: z.string().nullable(),
      lastLoginAt: z.string().nullable(),
      /** The customer's own profile (10a); either may be empty. */
      profile: z.object({ name: z.string().nullable(), phone: z.string().nullable() }),
    })
    .nullable(),
  /** An account's saved addresses and pets (Customers → View sees them; never in the CSV). */
  savedAddresses: z.array(savedAddressSchema),
  savedPets: z.array(savedPetSchema),
  petsSeen: z.array(petSeenSchema),
  /** The newest orders and bookings (up to CRM_LIMITS.recentActivity each), as the Orders and Bookings pages show them. */
  recentOrders: z.array(adminOrderSummarySchema),
  recentBookings: z.array(adminBookingSummarySchema),
  /** The newest relocation requests (up to CRM_LIMITS.recentActivity), as the Relocation page shows them (15d). */
  recentRelocations: z.array(adminRelocationSummarySchema),
  notes: z.array(adminCustomerNoteSchema),
  /** Echo this back when changing the customer's tags; a change made by someone else in between is refused. */
  version: z.number().int().positive(),
});

// --- Changes ------------------------------------------------------------------------------------

export const addCustomerNoteRequestSchema = z.object({
  text: z.string().trim().min(1, "Please write the note.").max(CRM_LIMITS.maxNoteLength),
});

/** Replaces the customer's tags with exactly these. */
export const setCustomerTagsRequestSchema = z.object({
  version: z.number().int().positive(),
  tagIds: z
    .array(z.uuid())
    .max(CRM_LIMITS.maxTagsPerCustomer)
    .refine((ids) => new Set(ids).size === ids.length, "Each tag only once."),
});

export const customerTagsResponseSchema = z.object({
  tags: z.array(adminCustomerTagSchema),
  version: z.number().int().positive(),
});

// --- The owner's tag list -----------------------------------------------------------------------

export const saveCrmTagRequestSchema = z.object({
  name: z.object({ en: tagNameSchema, ar: tagNameSchema }),
  colour: crmTagColourSchema,
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateCrmTagRequestSchema = saveCrmTagRequestSchema.extend({ version: z.number().int().positive() });

export const adminCrmTagSchema = crmTagSchema.extend({
  sortOrder: z.number().int().nonnegative(),
  /** How many customers have it. */
  customers: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const adminCrmTagListResponseSchema = z.object({ tags: z.array(adminCrmTagSchema) });

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type CrmTagColour = z.infer<typeof crmTagColourSchema>;
export type AdminCustomerQuery = z.infer<typeof adminCustomerQuerySchema>;
export type AdminCustomerSort = z.infer<typeof adminCustomerSortSchema>;
export type CrmTag = z.infer<typeof crmTagSchema>;
export type AdminCustomerSummary = z.infer<typeof adminCustomerSummarySchema>;
export type AdminCustomerListResponse = z.infer<typeof adminCustomerListResponseSchema>;
export type AdminCustomerTag = z.infer<typeof adminCustomerTagSchema>;
export type AdminCustomerNote = z.infer<typeof adminCustomerNoteSchema>;
export type PetSeen = z.infer<typeof petSeenSchema>;
export type AdminCustomer = z.infer<typeof adminCustomerSchema>;
export type AddCustomerNoteRequest = z.infer<typeof addCustomerNoteRequestSchema>;
export type SetCustomerTagsRequest = z.infer<typeof setCustomerTagsRequestSchema>;
export type CustomerTagsResponse = z.infer<typeof customerTagsResponseSchema>;
export type SaveCrmTagRequest = z.infer<typeof saveCrmTagRequestSchema>;
export type UpdateCrmTagRequest = z.infer<typeof updateCrmTagRequestSchema>;
export type AdminCrmTag = z.infer<typeof adminCrmTagSchema>;
export type AdminCrmTagListResponse = z.infer<typeof adminCrmTagListResponseSchema>;
