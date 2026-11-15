import { z } from "zod";
import { slugSchema } from "./catalog.js";
import { contactPhoneSchema, qatarAddressSchema } from "./orders.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * The customer's own account data (#10a; plan BRANCH_10 section 4, D186): the profile, saved
 * addresses and saved pets. Every endpoint is `/api/account/*` with the customer's session; another
 * customer's item is "not found". Weights are grams; a born month is "YYYY-MM".
 */
export const ACCOUNT_LIMITS = Object.freeze({
  maxAddresses: 5,
  maxPets: 10,
  /** A born month at most this many years back (the grooming limit, GROOMING_LIMITS.maxAgeMonths). */
  oldestPetYears: 50,
  maxWeightGrams: 200_000,
});

// --- Profile ----------------------------------------------------------------------------------------

/** `PUT /api/account/profile`: an empty name or phone clears it. */
export const profileUpdateSchema = z.object({
  name: z.string().trim().max(100),
  phone: z.union([z.literal(""), contactPhoneSchema]),
});

// --- Areas ------------------------------------------------------------------------------------------

/** An area an address can be saved in: offered for delivery, home visits or both (D135, 9b). */
export const accountAreaSchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  cityId: z.string(),
  city: localisedTextSchema,
  delivery: z.boolean(),
  homeVisits: z.boolean(),
});

export const accountAreasResponseSchema = z.object({ areas: z.array(accountAreaSchema) });

// --- Saved addresses --------------------------------------------------------------------------------

export const savedAddressInputSchema = z.object({
  label: z.string().trim().min(1).max(30),
  areaId: z.uuid(),
  address: qatarAddressSchema,
  /** The first address is always the default. */
  makeDefault: z.boolean().default(false),
});

export const savedAddressUpdateSchema = savedAddressInputSchema.extend({ version: z.number().int().positive() });

export const savedAddressSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  /** Null once the area was removed: the address must get another area before it can be used. */
  area: accountAreaSchema.omit({ delivery: true, homeVisits: true }).nullable(),
  address: qatarAddressSchema,
  isDefault: z.boolean(),
  /** Whether the area is offered now (an area can be switched off after the address was saved). */
  delivery: z.boolean(),
  homeVisits: z.boolean(),
  version: z.number().int().positive(),
});

export const savedAddressListSchema = z.object({ addresses: z.array(savedAddressSchema) });

// --- Saved pets -------------------------------------------------------------------------------------

/** "2024-05": a year and a month (the server checks it is not in the future nor too far back). */
export const bornMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the year and month (YYYY-MM).");

export const savedPetInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** The shop's pet type (its slug), or none. */
  petType: slugSchema.nullable(),
  breed: z.string().trim().max(60).default(""),
  bornMonth: bornMonthSchema.nullable(),
  weightGrams: z.number().int().min(1).max(ACCOUNT_LIMITS.maxWeightGrams).nullable(),
  /** Health or handling notes. */
  notes: z.string().trim().max(500).default(""),
});

export const savedPetUpdateSchema = savedPetInputSchema.extend({ version: z.number().int().positive() });

export const savedPetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  petType: z.object({ slug: z.string(), name: localisedTextSchema }).nullable(),
  breed: z.string(),
  bornMonth: bornMonthSchema.nullable(),
  weightGrams: z.number().int().nullable(),
  notes: z.string(),
  version: z.number().int().positive(),
});

export const savedPetListSchema = z.object({ pets: z.array(savedPetSchema) });

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type AccountArea = z.infer<typeof accountAreaSchema>;
export type SavedAddressInput = z.infer<typeof savedAddressInputSchema>;
export type SavedAddressUpdate = z.infer<typeof savedAddressUpdateSchema>;
export type SavedAddress = z.infer<typeof savedAddressSchema>;
export type SavedPetInput = z.infer<typeof savedPetInputSchema>;
export type SavedPetUpdate = z.infer<typeof savedPetUpdateSchema>;
export type SavedPet = z.infer<typeof savedPetSchema>;
