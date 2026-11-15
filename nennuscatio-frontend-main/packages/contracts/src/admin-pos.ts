import { z } from "zod";
import { emailSchema } from "./auth.js";
import { posScopeSchema } from "./pos.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Staff's side of the POS link (#16 part 2c; the part 2 plan's sections 3, 4 and 7; D285):
 * the POS items list in the Catalogue, the owner's Integrations page, and the bell's lines. Admin
 * shapes only: none of them is part of the machine API at `/api/pos/v1` or its OpenAPI document
 * (`pos.ts`).
 */

// --- The POS items list (section 3) -------------------------------------------------------------

/** A linked code the POS has not sent for longer than this missed a night's full list: "Not heard of for a day". */
export const POS_ITEM_SILENT_HOURS = 36;

export const ADMIN_POS_ITEM_PAGE_SIZES = [10, 25, 50] as const;

/**
 * The list's views: every code still on the list (all but those put aside), the codes no pack has yet,
 * the linked ones, those that need staff (a price waiting or refused, short, not heard of for a day),
 * and the codes put aside as not sold online.
 */
export const adminPosItemViewSchema = z.enum(["all", "new", "linked", "attention", "not_sold_online"]);

export const adminPosItemQuerySchema = z.object({
  /** Part of a code, or of the POS's name. */
  q: z.string().trim().max(100).optional(),
  view: adminPosItemViewSchema.default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_POS_ITEM_PAGE_SIZES as readonly number[]).includes(value), "Page size must be 10, 25 or 50.")
    .default(25),
});

/** New: no pack has the code yet. Linked: a pack follows it. Not sold online: staff put it aside. */
export const adminPosItemStatusSchema = z.enum(["new", "linked", "not_sold_online"]);

export const adminPosItemPackSchema = z.object({
  variantId: z.uuid(),
  productId: z.uuid(),
  productSlug: z.string(),
  productName: localisedTextSchema,
  /** The product's own switch on the website (its page), apart from the pack's on/off. */
  productActive: z.boolean(),
  label: localisedTextSchema,
  sku: z.string(),
  stock: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const adminPosItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  /** The POS's own name, in any language. */
  name: z.string(),
  /** As the POS last sent them: its count, its price in minor units, and whether it sells the item. */
  stock: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
  active: z.boolean(),
  countedAt: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  status: adminPosItemStatusSchema,
  /**
   * The code can be a website SKU (`skuSchema`), so a pack can follow it. One that cannot (a space,
   * say) is never linked and stays on the list as new (D287).
   */
  linkable: z.boolean(),
  /** A price the POS sent that waits for staff (a drop to less than half the pack's), or null. */
  heldPrice: z.number().int().positive().nullable(),
  /** The POS's price cannot be sold at: it is 0, or the one staff refused. The pack keeps its own. */
  priceRefused: z.boolean(),
  /** Units the website was short of at the last count: the store sold what online customers are paying for. */
  short: z.number().int().nonnegative(),
  /** A linked code not sent for longer than POS_ITEM_SILENT_HOURS. */
  silent: z.boolean(),
  /** When the owner changed the pack by hand ("Edit anyway") since the POS's last update. */
  overriddenAt: z.string().nullable(),
  /** The pack that follows the code, as the website sells it now; null until one does. */
  pack: adminPosItemPackSchema.nullable(),
});

const count = z.number().int().nonnegative();

export const adminPosItemListResponseSchema = z.object({
  items: z.array(adminPosItemSchema),
  total: count,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** How many codes each view holds, with the search applied. */
  counts: z.object({ all: count, new: count, linked: count, attention: count, notSoldOnline: count }),
});

/** "Link to a pack": the pack takes the code as its SKU and follows the POS from then on. */
export const posItemLinkRequestSchema = z.object({ variantId: z.uuid() });

/** "Not sold online" (true) puts a code aside; false brings it back to the list. */
export const posItemSoldOnlineRequestSchema = z.object({ notSoldOnline: z.boolean() });

// --- Alerts and the bell (section 7) ---------------------------------------------------------------

export const posAlertKindSchema = z.enum(["items_silent", "events_lag"]);

/** A key that has not collected an event for too long (an events_lag alert). */
export const adminPosLaggingKeySchema = z.object({
  name: z.string(),
  /** Events it may see that it has not collected yet. */
  waiting: count,
  /** When the oldest of them happened. */
  oldestAt: z.string(),
});

export const adminPosAlertSchema = z.object({
  kind: posAlertKindSchema,
  openedAt: z.string(),
  /** items_silent: when the last items message came. Null for the other kind. */
  lastItemsAt: z.string().nullable(),
  /** events_lag: the keys behind. Empty for the other kind. */
  keys: z.array(adminPosLaggingKeySchema),
});

/** The bell's POS lines for the owner and roles with Catalogue View. */
export const adminPosAttentionSchema = z.object({
  alerts: z.array(adminPosAlertSchema),
  /** Linked codes whose new price waits for staff on the POS items list. */
  pricesWaiting: count,
});

export const adminPosShortItemSchema = z.object({
  code: z.string(),
  sku: z.string(),
  productName: localisedTextSchema,
  label: localisedTextSchema,
  short: z.number().int().positive(),
});

/** The bell's line for roles with Orders View: packs the store sold that online customers are paying for. */
export const adminPosShortSchema = z.object({ items: z.array(adminPosShortItemSchema) });

// --- The Integrations page (section 4): owner only -------------------------------------------------

export const adminPosKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(posScopeSchema),
  createdAt: z.string(),
  /** "owner": made on the Integrations page; "command": by the server command (pnpm pos-key:create). */
  createdBy: z.enum(["owner", "command"]),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  /** The key sees events numbered above this: the last that existed when it was made. */
  fromEventId: count,
  /** For a key that may read orders and is not revoked: how far behind its collection is. */
  collection: z
    .object({
      /** Its last collection, and the `after` it asked from; null if it never collected. */
      lastAt: z.string().nullable(),
      after: count.nullable(),
      waiting: count,
      oldestWaitingAt: z.string().nullable(),
    })
    .nullable(),
  /** Its last items message (an empty one counts). */
  lastItemsAt: z.string().nullable(),
});

export const adminPosMessageSchema = z.object({
  receivedAt: z.string(),
  countedAt: z.string(),
  keyName: z.string(),
  items: count,
  applied: count,
  priceHeld: count,
  priceRefused: count,
  new: count,
  stale: count,
  short: count,
});

export const POS_ALERT_MINUTES = { min: 5, max: 1440 } as const;

export const adminPosSettingsSchema = z.object({
  itemsSilenceMinutes: z.number().int(),
  eventsLagMinutes: z.number().int(),
  /** Where the alerts go; null means the owner's login email (`ownerEmail`). */
  alertEmail: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  version: z.number().int().positive(),
});

export const adminPosIntegrationSchema = z.object({
  keys: z.array(adminPosKeySchema),
  /** The newest event's number (0 when there is none). */
  lastEventId: count,
  lastMessage: adminPosMessageSchema.nullable(),
  settings: adminPosSettingsSchema,
  /** The open alerts. */
  alerts: z.array(adminPosAlertSchema),
  /** The POS items list in figures. */
  items: z.object({ total: count, linked: count, new: count, attention: count }),
});

const scopesSchema = z
  .array(posScopeSchema)
  .min(1, "Choose at least one right.")
  .max(2)
  .refine((scopes) => new Set(scopes).size === scopes.length, "Each right once.");

export const createPosKeyRequestSchema = z.object({
  name: z.string().trim().min(1, "Please give a name.").max(60),
  scopes: scopesSchema,
});

/** The new key and, once only, its secret: never stored or shown again. */
export const createPosKeyResponseSchema = z.object({ key: adminPosKeySchema, secret: z.string() });

export const setPosKeyScopesRequestSchema = z.object({ scopes: scopesSchema });

export const savePosSettingsRequestSchema = z.object({
  version: z.number().int().positive(),
  itemsSilenceMinutes: z.number().int().min(POS_ALERT_MINUTES.min).max(POS_ALERT_MINUTES.max),
  eventsLagMinutes: z.number().int().min(POS_ALERT_MINUTES.min).max(POS_ALERT_MINUTES.max),
  /** Empty: the owner's login email. */
  alertEmail: z
    .union([z.literal(""), emailSchema])
    .nullable()
    .transform((value) => (value === "" || value === null ? null : value)),
});

export type AdminPosItemView = z.infer<typeof adminPosItemViewSchema>;
export type AdminPosItemQuery = z.infer<typeof adminPosItemQuerySchema>;
export type AdminPosItemStatus = z.infer<typeof adminPosItemStatusSchema>;
export type AdminPosItemPack = z.infer<typeof adminPosItemPackSchema>;
export type AdminPosItem = z.infer<typeof adminPosItemSchema>;
export type AdminPosItemListResponse = z.infer<typeof adminPosItemListResponseSchema>;
export type PosItemLinkRequest = z.infer<typeof posItemLinkRequestSchema>;
export type PosItemSoldOnlineRequest = z.infer<typeof posItemSoldOnlineRequestSchema>;
export type PosAlertKind = z.infer<typeof posAlertKindSchema>;
export type AdminPosLaggingKey = z.infer<typeof adminPosLaggingKeySchema>;
export type AdminPosAlert = z.infer<typeof adminPosAlertSchema>;
export type AdminPosAttention = z.infer<typeof adminPosAttentionSchema>;
export type AdminPosShortItem = z.infer<typeof adminPosShortItemSchema>;
export type AdminPosShort = z.infer<typeof adminPosShortSchema>;
export type AdminPosKey = z.infer<typeof adminPosKeySchema>;
export type AdminPosMessage = z.infer<typeof adminPosMessageSchema>;
export type AdminPosSettings = z.infer<typeof adminPosSettingsSchema>;
export type AdminPosIntegration = z.infer<typeof adminPosIntegrationSchema>;
export type CreatePosKeyRequest = z.infer<typeof createPosKeyRequestSchema>;
export type CreatePosKeyResponse = z.infer<typeof createPosKeyResponseSchema>;
export type SetPosKeyScopesRequest = z.infer<typeof setPosKeyScopesRequestSchema>;
export type SavePosSettingsRequest = z.infer<typeof savePosSettingsRequestSchema>;
