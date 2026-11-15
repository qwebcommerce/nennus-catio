import { z } from "zod";
import { catalogImageUrlSchema, skuSchema } from "./catalog.js";
import { clockTimeSchema, localDateSchema, timeToMinutes, weekdaySchema } from "./delivery.js";
import { orderPromotionSchema } from "./promotions.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Grooming pet groups and packages (#9a, plan BRANCH_9_GROOMING_BOOKINGS, D159-D160). The owner
 * adds, edits, hides and deletes both; the quoted 4 groups × Basic/Full are the starting values.
 * Prices are integer minor units (QAR dirhams); ages are months and weights grams, as whole numbers.
 */
export const GROOMING_LIMITS = Object.freeze({
  minDurationMinutes: 15,
  maxDurationMinutes: 240,
  maxIncluded: 20,
  /** 50 years. */
  maxAgeMonths: 600,
  /** 200 kg. */
  maxWeightGrams: 200_000,
});

/** An optional range: either end may be empty (null), and an empty end is not checked (D159). */
export const groomingRangeSchema = z.object({
  min: z.number().int().nonnegative().nullable(),
  max: z.number().int().nonnegative().nullable(),
});

const includedSchema = z.object({ en: z.array(z.string()), ar: z.array(z.string()) });

export const publicGroomingPackageSchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  description: localisedTextSchema,
  /** What is included, one item per entry, in each language. */
  included: includedSchema,
  price: z.number().int().positive(),
  durationMinutes: z.number().int().min(GROOMING_LIMITS.minDurationMinutes).max(GROOMING_LIMITS.maxDurationMinutes),
  image: z.string().nullable(),
});

export const publicGroomingGroupSchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  /** "Who it is for". */
  audience: localisedTextSchema,
  ageMonths: groomingRangeSchema,
  weightGrams: groomingRangeSchema,
  packages: z.array(publicGroomingPackageSchema),
});

/** `GET /api/grooming/packages`: groups that are on and have a package that is on, in the owner's order. */
export const groomingPackagesResponseSchema = z.object({ groups: z.array(publicGroomingGroupSchema) });

// --- Admin (Grooming packages permission) ------------------------------------------------------------

const adminFields = {
  sortOrder: z.number().int(),
  active: z.boolean(),
  /** Starting values awaiting the owner (D160); cleared by the first save. */
  isSample: z.boolean(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
};

export const adminGroomingPackageSchema = publicGroomingPackageSchema.extend({
  groupId: z.uuid(),
  /** The service's item code in the POS (#16 part 2a, D285): sent with each booking so the POS can match it. Staff only. */
  code: z.string().nullable(),
  ...adminFields,
});

export const adminGroomingGroupSchema = publicGroomingGroupSchema
  .omit({ packages: true })
  .extend({ ...adminFields, packages: z.array(adminGroomingPackageSchema) });

/** `GET /api/admin/grooming/groups`: every group with every package, hidden ones included. */
export const adminGroomingGroupsResponseSchema = z.object({ groups: z.array(adminGroomingGroupSchema) });

const requiredText = (max: number) =>
  z.object({ en: z.string().trim().min(1).max(max), ar: z.string().trim().min(1).max(max) });
const optionalText = (max: number) => z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });

const rangeInput = (lowest: number, highest: number) =>
  z
    .object({
      min: z.number().int().min(lowest).max(highest).nullable(),
      max: z.number().int().min(lowest).max(highest).nullable(),
    })
    .refine((range) => range.min === null || range.max === null || range.min <= range.max, {
      path: ["max"],
      message: "The highest must not be lower than the lowest.",
    });

const sortOrderSchema = z.number().int().min(0).max(1000);

export const saveGroomingGroupRequestSchema = z.object({
  /** Required when updating: the version the editor started from. */
  version: z.number().int().positive().optional(),
  name: requiredText(80),
  audience: optionalText(300),
  ageMonths: rangeInput(0, GROOMING_LIMITS.maxAgeMonths),
  weightGrams: rangeInput(1, GROOMING_LIMITS.maxWeightGrams),
  sortOrder: sortOrderSchema,
  active: z.boolean(),
});

const includedList = z.array(z.string().trim().min(1).max(160)).max(GROOMING_LIMITS.maxIncluded);

export const saveGroomingPackageRequestSchema = z.object({
  /** Required when updating: the version the editor started from. */
  version: z.number().int().positive().optional(),
  /** The group it belongs to; changing it moves the package. */
  groupId: z.uuid(),
  name: requiredText(120),
  description: optionalText(2000),
  included: z.object({ en: includedList, ar: includedList }),
  /** Above 0: bookings are paid online in full, and a payment of 0 cannot exist. */
  price: z.number().int().positive().max(100_000_000),
  durationMinutes: z.number().int().min(GROOMING_LIMITS.minDurationMinutes).max(GROOMING_LIMITS.maxDurationMinutes),
  image: catalogImageUrlSchema.nullable(),
  /** The service's item code in the POS, written like a pack's SKU; null when it has none. */
  code: skuSchema.nullable(),
  sortOrder: sortOrderSchema,
  active: z.boolean(),
});

// --- Times and capacity (9b) -----------------------------------------------------------------------

/** "shop": in-store sections; "home": home visits by bus (D73, D112). */
export const groomingLocationSchema = z.enum(["shop", "home"]);

const versionSchema = z.number().int().positive();
/** Sections (shop) or buses (home) at one time. 0 keeps a time visible to staff but never bookable. */
export const groomingCapacitySchema = z.number().int().min(0).max(50);
/** QAR in minor units: the home visit fee; 0 = no fee; at most QAR 10,000. */
export const groomingFeeSchema = z.number().int().min(0).max(1_000_000);

export const groomingSettingsSchema = z.object({
  /** How long an unpaid booking holds its time (D147's 15 minutes by default). */
  holdMinutes: z.number().int().min(5).max(120),
  /** The earliest bookable time is at least this long after booking. */
  leadTimeMinutes: z.number().int().min(0).max(2880),
  /** How many days ahead times are open for booking. */
  horizonDays: z.number().int().min(1).max(60),
  /** Shop start times every this many minutes. */
  stepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  /** Added after each shop booking before its section is free again. */
  cleaningGapMinutes: z.number().int().min(0).max(120),
  /** Customers may cancel online until this many hours before the appointment (D158, question 5). */
  cancelHours: z.number().int().min(0).max(168),
  version: versionSchema,
});

/**
 * One line of the weekly schedule: the shop open from start to end with this many sections, or a
 * home visit starting at start with this many buses (no end).
 */
export const groomingScheduleRuleSchema = z.object({
  id: z.string(),
  location: groomingLocationSchema,
  weekday: weekdaySchema,
  start: clockTimeSchema,
  end: clockTimeSchema.nullable(),
  capacity: groomingCapacitySchema,
  active: z.boolean(),
  version: versionSchema,
});

export const groomingScheduleResponseSchema = z.object({ rules: z.array(groomingScheduleRuleSchema) });

export const saveGroomingRuleRequestSchema = z
  .object({
    location: groomingLocationSchema,
    weekday: weekdaySchema,
    start: clockTimeSchema,
    end: clockTimeSchema.nullable(),
    capacity: groomingCapacitySchema,
    active: z.boolean(),
    /** Required when updating: the version the editor loaded. */
    version: versionSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.start === "24:00") context.addIssue({ code: "custom", path: ["start"], message: "Choose a time before midnight." });
    if (value.location === "shop" && (value.end === null || timeToMinutes(value.end) <= timeToMinutes(value.start))) {
      context.addIssue({ code: "custom", path: ["end"], message: "The closing time must be after the opening time." });
    }
    if (value.location === "home" && value.end !== null) {
      context.addIssue({ code: "custom", path: ["end"], message: "A home visit time has no end." });
    }
  });

/** One dated time for staff: a shop step or a home visit time. */
export const adminGroomingSlotSchema = z.object({
  id: z.string(),
  location: groomingLocationSchema,
  date: localDateSchema,
  start: clockTimeSchema,
  /** The step's end at the shop; null for a home visit time. */
  end: clockTimeSchema.nullable(),
  startsAt: z.string(),
  capacity: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  closed: z.boolean(),
  /** Staff changed this time by hand, so later schedule changes leave it alone. */
  overridden: z.boolean(),
  version: versionSchema,
});

export const adminGroomingSlotListResponseSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  slots: z.array(adminGroomingSlotSchema),
});

/** Close, reopen or change the capacity of one time; never below its bookings. */
export const updateGroomingSlotRequestSchema = z.object({
  capacity: groomingCapacitySchema,
  closed: z.boolean(),
  version: versionSchema,
});

/** A whole date at once: close or reopen it, and optionally set every time's capacity (never below its bookings). */
export const updateGroomingDayRequestSchema = z.object({
  location: groomingLocationSchema,
  date: localDateSchema,
  closed: z.boolean(),
  capacity: groomingCapacitySchema.nullable(),
});

// --- Home visit fees (9b; per city with area exceptions, like delivery D135, but separate) ---------

export const adminGroomingCitySchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  fee: z.number().int().nonnegative(),
  /** Home grooming visits to this city; off = none of its areas. */
  enabled: z.boolean(),
  areaCount: z.number().int().nonnegative(),
  version: versionSchema,
});

export const adminGroomingAreaSchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  cityId: z.string(),
  city: localisedTextSchema,
  /** The area's own home visit fee, or null when it follows its city's. */
  ownFee: z.number().int().nonnegative().nullable(),
  /** What the customer pays: the area's own fee, otherwise its city's. */
  fee: z.number().int().nonnegative(),
  enabled: z.boolean(),
  /** Offered to customers: the area and its city are both on. */
  offered: z.boolean(),
  version: versionSchema,
});

export const adminGroomingAreaListResponseSchema = z.object({
  cities: z.array(adminGroomingCitySchema),
  areas: z.array(adminGroomingAreaSchema),
});

export const saveGroomingCityFeeRequestSchema = z.object({ fee: groomingFeeSchema, enabled: z.boolean(), version: versionSchema });
export const saveGroomingAreaFeeRequestSchema = z.object({
  /** null = follow the city's fee. */
  fee: groomingFeeSchema.nullable(),
  enabled: z.boolean(),
  version: versionSchema,
});

// --- Public: areas and availability -------------------------------------------------------------------

/** An area customers can choose for a home visit, under its city heading, with its visit fee. */
export const publicGroomingAreaSchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  cityId: z.string(),
  city: localisedTextSchema,
  fee: z.number().int().nonnegative(),
});

export const groomingAreasResponseSchema = z.object({ areas: z.array(publicGroomingAreaSchema) });

/** `GET /api/grooming/availability?package=&location=&area=&from=&to=` (area only for home visits). */
export const groomingAvailabilityQuerySchema = z
  .object({
    package: z.uuid(),
    location: groomingLocationSchema,
    area: z.uuid().optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.location === "home" && !value.area) context.addIssue({ code: "custom", path: ["area"], message: "Choose your area." });
    if (value.location === "shop" && value.area) context.addIssue({ code: "custom", path: ["area"], message: "Only home visits have an area." });
  });

/** A start time where the whole package fits (shop) or a home visit time with a bus free. */
export const groomingAvailableTimeSchema = z.object({
  start: clockTimeSchema,
  /** When the package ends at the shop; null for a home visit. */
  end: clockTimeSchema.nullable(),
  startsAt: z.string(),
  seatsLeft: z.number().int().positive(),
});

export const groomingAvailabilityResponseSchema = z.object({
  location: groomingLocationSchema,
  packageId: z.uuid(),
  durationMinutes: z.number().int().positive(),
  price: z.number().int().positive(),
  /** The home visit fee for the area; 0 at the shop. */
  fee: z.number().int().nonnegative(),
  /**
   * What automatic offers take off the package (11c), for the customer asking: a logged-in customer's
   * account, otherwise a guest who counts as new. A promo code is priced by the booking quote.
   */
  discount: z.number().int().nonnegative(),
  /** Price + fee − discount: the booking's `expectedTotal` when no code is entered. */
  total: z.number().int().positive(),
  /** The offers that take something off, largest first. */
  promotions: z.array(orderPromotionSchema),
  from: localDateSchema,
  to: localDateSchema,
  days: z.array(z.object({ date: localDateSchema, times: z.array(groomingAvailableTimeSchema) })),
});

export type GroomingRange = z.infer<typeof groomingRangeSchema>;
export type PublicGroomingPackage = z.infer<typeof publicGroomingPackageSchema>;
export type PublicGroomingGroup = z.infer<typeof publicGroomingGroupSchema>;
export type AdminGroomingPackage = z.infer<typeof adminGroomingPackageSchema>;
export type AdminGroomingGroup = z.infer<typeof adminGroomingGroupSchema>;
export type SaveGroomingGroupRequest = z.infer<typeof saveGroomingGroupRequestSchema>;
export type SaveGroomingPackageRequest = z.infer<typeof saveGroomingPackageRequestSchema>;
export type GroomingLocation = z.infer<typeof groomingLocationSchema>;
export type GroomingSettings = z.infer<typeof groomingSettingsSchema>;
export type GroomingScheduleRule = z.infer<typeof groomingScheduleRuleSchema>;
export type SaveGroomingRuleRequest = z.infer<typeof saveGroomingRuleRequestSchema>;
export type AdminGroomingSlot = z.infer<typeof adminGroomingSlotSchema>;
export type UpdateGroomingSlotRequest = z.infer<typeof updateGroomingSlotRequestSchema>;
export type UpdateGroomingDayRequest = z.infer<typeof updateGroomingDayRequestSchema>;
export type AdminGroomingCity = z.infer<typeof adminGroomingCitySchema>;
export type AdminGroomingArea = z.infer<typeof adminGroomingAreaSchema>;
export type AdminGroomingAreaListResponse = z.infer<typeof adminGroomingAreaListResponseSchema>;
export type SaveGroomingCityFeeRequest = z.infer<typeof saveGroomingCityFeeRequestSchema>;
export type SaveGroomingAreaFeeRequest = z.infer<typeof saveGroomingAreaFeeRequestSchema>;
export type PublicGroomingArea = z.infer<typeof publicGroomingAreaSchema>;
export type GroomingAvailabilityQuery = z.infer<typeof groomingAvailabilityQuerySchema>;
export type GroomingAvailabilityResponse = z.infer<typeof groomingAvailabilityResponseSchema>;
