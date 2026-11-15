import { z } from "zod";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Delivery setup contracts (branch #7a, D117-D120). Times are Qatar local clock times ("HH:MM";
 * an end time may be "24:00"); dates are Qatar local dates ("YYYY-MM-DD"); money is integer minor
 * units (QAR dirhams). Weekdays are ISO: 1 = Monday … 7 = Sunday.
 */

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Not a real calendar date.");

export const clockTimeSchema = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use HH:MM (24-hour).");

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const weekdaySchema = z.number().int().min(1).max(7);
/** Deliveries per window. 0 keeps a window visible to staff but never bookable. */
export const capacitySchema = z.number().int().min(0).max(500);
/** QAR fee in minor units: 0 = free delivery; at most QAR 10,000. */
export const deliveryFeeSchema = z.number().int().min(0).max(1_000_000);
const versionSchema = z.number().int().positive();

const startBeforeEnd = (value: { start: string; end: string }) =>
  timeToMinutes(value.start) < timeToMinutes(value.end);
const endAfterStart = { path: ["end"], message: "The end time must be after the start time." };

// --- Public ------------------------------------------------------------------------------------

/**
 * An area customers can choose, under its city heading (D135). `fee` is what the customer pays:
 * the area's own fee, otherwise its city's fee. Areas come ordered by city, then by area.
 */
export const publicDeliveryAreaSchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  fee: z.number().int().nonnegative(),
  cityId: z.string(),
  city: localisedTextSchema,
});

export const deliveryOptionsResponseSchema = z.object({
  areas: z.array(publicDeliveryAreaSchema),
  pickup: z.object({ enabled: z.boolean(), instructions: localisedTextSchema }),
  leadTimeMinutes: z.number().int().nonnegative(),
  horizonDays: z.number().int().positive(),
});

/** A bookable window: open, in the future after the lead time, with seats left. */
export const publicDeliveryWindowSchema = z.object({
  id: z.string(),
  date: localDateSchema,
  start: clockTimeSchema,
  end: clockTimeSchema,
  startsAt: z.string(),
  seatsLeft: z.number().int().positive(),
});

export const deliveryWindowsResponseSchema = z.object({ windows: z.array(publicDeliveryWindowSchema) });

/**
 * The longest "ready in about … days" a Pet House may have (#14, D268). A cart with a house asks for
 * delivery times from that many days ahead, so they open that far beyond the usual horizon.
 */
export const HOUSE_MAX_LEAD_DAYS = 60;

/**
 * `GET /api/delivery/windows`: `leadDays` is the longest estimate of the cart's Pet Houses (the quote's
 * `houseLeadDays`; 0 without a house). The windows then start that many days after today (Qatar).
 */
export const deliveryWindowsQuerySchema = z.object({
  leadDays: z.coerce.number().int().min(0).max(HOUSE_MAX_LEAD_DAYS).default(0),
});

// --- Admin: cities and areas (D117, D135) -----------------------------------------------------

const areaNameSchema = z.object({
  en: z.string().trim().min(1).max(80),
  ar: z.string().trim().min(1).max(80),
});

/** A city heading: its fee applies to every area without its own fee; off = no deliveries there. */
export const adminDeliveryCitySchema = z.object({
  id: z.string(),
  name: localisedTextSchema,
  fee: z.number().int().nonnegative(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  areaCount: z.number().int().nonnegative(),
  version: versionSchema,
});

export const saveDeliveryCityRequestSchema = z.object({
  name: areaNameSchema,
  fee: deliveryFeeSchema,
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  /** Required when updating: the version the editor loaded. */
  version: versionSchema.optional(),
});

export const adminDeliveryAreaSchema = publicDeliveryAreaSchema.extend({
  /** The area's own fee, or null when it follows its city's fee. */
  ownFee: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  /** Created by the seed as an example; the owner replaces or edits it. */
  isSample: z.boolean(),
  version: versionSchema,
});

export const adminDeliveryAreaListResponseSchema = z.object({
  cities: z.array(adminDeliveryCitySchema),
  areas: z.array(adminDeliveryAreaSchema),
});

export const saveDeliveryAreaRequestSchema = z.object({
  name: areaNameSchema,
  cityId: z.uuid(),
  /** null = follow the city's fee (D135). */
  fee: deliveryFeeSchema.nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  /** Required when updating: the version the editor loaded. */
  version: versionSchema.optional(),
});

// --- Admin: weekly schedule --------------------------------------------------------------------

export const deliveryScheduleRuleSchema = z.object({
  id: z.string(),
  weekday: weekdaySchema,
  start: clockTimeSchema,
  end: clockTimeSchema,
  capacity: capacitySchema,
  active: z.boolean(),
  version: versionSchema,
});

export const deliveryScheduleResponseSchema = z.object({ rules: z.array(deliveryScheduleRuleSchema) });

export const saveScheduleRuleRequestSchema = z
  .object({
    weekday: weekdaySchema,
    start: clockTimeSchema,
    end: clockTimeSchema,
    capacity: capacitySchema,
    active: z.boolean(),
    version: versionSchema.optional(),
  })
  .refine(startBeforeEnd, endAfterStart);

// --- Admin: windows (the dated, bookable result of the schedule) ------------------------------

export const adminDeliveryWindowSchema = z.object({
  id: z.string(),
  date: localDateSchema,
  start: clockTimeSchema,
  end: clockTimeSchema,
  startsAt: z.string(),
  capacity: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  closed: z.boolean(),
  /** "schedule" = opened from the weekly schedule; "manual" = an extra window added by staff. */
  source: z.enum(["schedule", "manual"]),
  /** Staff changed this date by hand, so later schedule changes leave it alone. */
  overridden: z.boolean(),
  version: versionSchema,
});

export const adminDeliveryWindowListResponseSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  windows: z.array(adminDeliveryWindowSchema),
});

/**
 * Staff: the windows between two dates (#14: a day further ahead, or a new time for a Pet House order).
 * Without dates, the booking horizon from today. The server limits how far ahead and how many days.
 */
export const adminDeliveryWindowQuerySchema = z
  .object({ from: localDateSchema.optional(), to: localDateSchema.optional() })
  .refine((value) => (value.from === undefined) === (value.to === undefined), { path: ["to"], message: "Give both dates, or neither." })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    path: ["to"],
    message: "The last date must not be before the first.",
  });

/** A date exception: close, reopen or change the capacity of one window. */
export const updateDeliveryWindowRequestSchema = z.object({
  capacity: capacitySchema,
  closed: z.boolean(),
  version: versionSchema,
});

/** An extra window on one date, outside the weekly schedule. */
export const createDeliveryWindowRequestSchema = z
  .object({ date: localDateSchema, start: clockTimeSchema, end: clockTimeSchema, capacity: capacitySchema })
  .refine(startBeforeEnd, endAfterStart);

// --- Admin: settings ---------------------------------------------------------------------------

export const deliverySettingsSchema = z.object({
  /** How long an unpaid order holds its stock and window. */
  holdMinutes: z.number().int().min(5).max(120),
  /** The earliest window must start at least this long after ordering. */
  leadTimeMinutes: z.number().int().min(0).max(2880),
  /** How many days ahead windows are open for booking. */
  horizonDays: z.number().int().min(1).max(60),
  pickupEnabled: z.boolean(),
  pickupInstructions: z.object({ en: z.string().trim().max(500), ar: z.string().trim().max(500) }),
  version: versionSchema,
});

export const updateDeliverySettingsRequestSchema = deliverySettingsSchema;

export type PublicDeliveryArea = z.infer<typeof publicDeliveryAreaSchema>;
export type DeliveryOptionsResponse = z.infer<typeof deliveryOptionsResponseSchema>;
export type PublicDeliveryWindow = z.infer<typeof publicDeliveryWindowSchema>;
export type DeliveryWindowsQuery = z.infer<typeof deliveryWindowsQuerySchema>;
export type AdminDeliveryWindowQuery = z.infer<typeof adminDeliveryWindowQuerySchema>;
export type AdminDeliveryArea = z.infer<typeof adminDeliveryAreaSchema>;
export type AdminDeliveryCity = z.infer<typeof adminDeliveryCitySchema>;
export type AdminDeliveryAreaListResponse = z.infer<typeof adminDeliveryAreaListResponseSchema>;
export type SaveDeliveryCityRequest = z.infer<typeof saveDeliveryCityRequestSchema>;
export type SaveDeliveryAreaRequest = z.infer<typeof saveDeliveryAreaRequestSchema>;
export type DeliveryScheduleRule = z.infer<typeof deliveryScheduleRuleSchema>;
export type SaveScheduleRuleRequest = z.infer<typeof saveScheduleRuleRequestSchema>;
export type AdminDeliveryWindow = z.infer<typeof adminDeliveryWindowSchema>;
export type UpdateDeliveryWindowRequest = z.infer<typeof updateDeliveryWindowRequestSchema>;
export type CreateDeliveryWindowRequest = z.infer<typeof createDeliveryWindowRequestSchema>;
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;
export type UpdateDeliverySettingsRequest = z.infer<typeof updateDeliverySettingsRequestSchema>;
