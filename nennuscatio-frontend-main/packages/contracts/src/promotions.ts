import { z } from "zod";
import { catalogImageUrlSchema } from "./catalog.js";
import { localDateSchema } from "./delivery.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Promotions (#11; plan BRANCH_11_PROMOTIONS, D201-D203): automatic discounts, promo codes and
 * bundles, kept by staff with the Promotions permission. Money is in minor units (QAR dirhams) and
 * dates are inclusive Qatar calendar days. These shapes describe promotions, not prices: which
 * promotion gives what is decided only by the API's price calculator, at checkout.
 */
export const PROMOTION_LIMITS = Object.freeze({
  /** Fixed amounts, bundle prices and minimum spends: up to the catalogue's highest price (QAR 1,000,000). */
  maxAmount: 100_000_000,
  maxUses: 1_000_000,
  /** Products, categories or grooming packages one promotion can name. */
  maxTargets: 200,
  maxBundleItems: 10,
  /** A bundle's quantity of one pack, and a buy-get offer's counts. */
  maxQuantity: 99,
  maxNameLength: 120,
  maxDescriptionLength: 1000,
  /** Days ahead counted as "ending soon" on the Promotions page. */
  endingSoonDays: 7,
  /** The newest uses shown with a promotion (the totals count them all). */
  recentUses: 100,
});

/** discount: automatic; code: needs its promo code; bundle: automatic, a set price over chosen packs. */
export const promotionTypeSchema = z.enum(["discount", "code", "bundle"]);
/** buy_get: "buy N, get M at P% off" (100% = free). */
export const promotionOfferSchema = z.enum(["percent", "fixed", "bundle_price", "buy_get"]);
/**
 * What a promotion applies to (D202 question 1). all_grooming is every grooming package; grooming_packages
 * only the chosen ones, so a promotion whose packages are all deleted applies to nothing. bundle: its packs.
 */
export const promotionTargetKindSchema = z.enum([
  "all_products",
  "categories",
  "products",
  "order",
  "all_grooming",
  "grooming_packages",
  "bundle",
]);
/** all (guests too), registered (logged in, email confirmed) or new (no earlier paid order or booking). */
export const promotionEligibilitySchema = z.enum(["all", "registered", "new"]);
/** From the Qatar date: inactive (switched off), scheduled (not started), active, or ended. */
export const promotionStatusSchema = z.enum(["active", "scheduled", "ended", "inactive"]);
/** held: awaiting payment; used: paid; released: expired or cancelled before payment. */
export const promotionUseStatusSchema = z.enum(["held", "used", "released"]);

/** Target kinds that name their targets (ids). */
export const PROMOTION_TARGETS_WITH_IDS = ["categories", "products", "grooming_packages"] as const;

const textOf = (max: number) => z.object({ en: z.string().max(max), ar: z.string().max(max) });

/** A promo code as stored: upper-case letters, digits, "-" and "_", 3 to 32 characters. */
export const promotionCodeSchema = z.string().regex(/^[A-Z0-9_-]{3,32}$/);

export const promotionBuyGetSchema = z.object({
  buy: z.number().int().min(1).max(PROMOTION_LIMITS.maxQuantity),
  get: z.number().int().min(1).max(PROMOTION_LIMITS.maxQuantity),
  /** 100 = free. */
  percent: z.number().int().min(1).max(100),
});

export const adminPromotionSchema = z.object({
  id: z.uuid(),
  name: textOf(PROMOTION_LIMITS.maxNameLength),
  description: textOf(PROMOTION_LIMITS.maxDescriptionLength),
  type: promotionTypeSchema,
  offer: promotionOfferSchema,
  /** Percent 1-100 (percent); dirhams (fixed; bundle_price: one set); 0 (buy_get). */
  value: z.number().int().nonnegative(),
  buyGet: promotionBuyGetSchema.nullable(),
  targetKind: promotionTargetKindSchema,
  /** The chosen categories, products or grooming packages, with their names; empty for other kinds. */
  targets: z.array(z.object({ id: z.uuid(), name: textOf(160) })),
  /** A bundle's packs. A deleted pack has no id, names or price, and the bundle then never applies. */
  bundleItems: z.array(
    z.object({
      variantId: z.uuid().nullable(),
      productName: textOf(160).nullable(),
      label: textOf(120).nullable(),
      price: z.number().int().nonnegative().nullable(),
      quantity: z.number().int().min(1).max(PROMOTION_LIMITS.maxQuantity),
    }),
  ),
  code: promotionCodeSchema.nullable(),
  /** 0 = none. */
  minSpend: z.number().int().nonnegative(),
  eligibility: promotionEligibilitySchema,
  /** 0 = no limit. */
  usageLimit: z.number().int().nonnegative(),
  perCustomerLimit: z.number().int().nonnegative(),
  /** Uses held (awaiting payment) or used (paid): what counts against the limits. */
  usesCount: z.number().int().nonnegative(),
  /** Paid uses, and the discount they gave in all. */
  usedCount: z.number().int().nonnegative(),
  discountGiven: z.number().int().nonnegative(),
  startsOn: localDateSchema,
  endsOn: localDateSchema.nullable(),
  enabled: z.boolean(),
  visible: z.boolean(),
  featured: z.boolean(),
  image: z.string().nullable(),
  status: promotionStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `GET /api/admin/promotions`: every promotion (the list stays small), newest first. */
export const adminPromotionsResponseSchema = z.object({
  /** The Qatar date the statuses were worked out for. */
  today: localDateSchema,
  promotions: z.array(adminPromotionSchema),
  counts: z.object({
    all: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    ended: z.number().int().nonnegative(),
    inactive: z.number().int().nonnegative(),
    /** Active and ending within the next 7 days (today included). */
    endingSoon: z.number().int().nonnegative(),
    /** Paid uses of orders and bookings placed this Qatar month. */
    usedThisMonth: z.number().int().nonnegative(),
  }),
});

export const adminPromotionUseSchema = z.object({
  id: z.uuid(),
  status: promotionUseStatusSchema,
  kind: z.enum(["order", "booking"]),
  /** The order's or booking's id and reference, for the link to it. */
  payableId: z.uuid(),
  reference: z.string(),
  discount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `GET /api/admin/promotions/:id`, and the answer to every change. */
export const adminPromotionDetailSchema = z.object({
  today: localDateSchema,
  promotion: adminPromotionSchema,
  /** The newest first, at most 100; usesTotal counts them all (released ones included). */
  uses: z.array(adminPromotionUseSchema),
  usesTotal: z.number().int().nonnegative(),
});

/**
 * `GET /api/admin/promotions/options` (Promotions View, 11d): what a promotion can be for, so staff with
 * Promotions rights choose without needing the Products or Grooming packages pages. Hidden ones are
 * included and marked, because a promotion may be prepared before an item goes on sale.
 */
export const promotionOptionsSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), name: localisedTextSchema, active: z.boolean() })),
  products: z.array(
    z.object({
      id: z.uuid(),
      name: localisedTextSchema,
      categoryId: z.uuid(),
      active: z.boolean(),
      packs: z.array(z.object({ id: z.uuid(), label: localisedTextSchema, price: z.number().int().nonnegative(), active: z.boolean() })),
    }),
  ),
  groomingPackages: z.array(
    z.object({ id: z.uuid(), group: localisedTextSchema, name: localisedTextSchema, price: z.number().int().nonnegative(), active: z.boolean() }),
  ),
});

const requiredText = (max: number) =>
  z.object({ en: z.string().trim().min(1).max(max), ar: z.string().trim().min(1).max(max) });
const optionalText = (max: number) => z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });
const countSchema = z.number().int().min(0).max(PROMOTION_LIMITS.maxUses);
const amountSchema = z.number().int().min(0).max(PROMOTION_LIMITS.maxAmount);

/** What staff type: not case-sensitive, so "welcome10" is saved as WELCOME10. */
export const promotionCodeInputSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, "Use 3 to 32 letters, digits, - or _.")
  .transform((code) => code.toUpperCase());

/**
 * `POST /api/admin/promotions` and `PUT /api/admin/promotions/:id` (Create/Edit). The combinations
 * follow D202: discounts are percent, fixed or buy-get (buy-get on shop items only); codes are
 * percent or fixed; a bundle is a set price over at least two items. A field that does not apply to
 * the chosen kind must be empty (0, null or []).
 */
export const savePromotionRequestSchema = z
  .object({
    /** Required when updating: the version the editor started from. */
    version: z.number().int().positive().optional(),
    name: requiredText(PROMOTION_LIMITS.maxNameLength),
    description: optionalText(PROMOTION_LIMITS.maxDescriptionLength),
    type: promotionTypeSchema,
    offer: promotionOfferSchema,
    value: amountSchema,
    buyGet: promotionBuyGetSchema.nullable(),
    targetKind: promotionTargetKindSchema,
    targetIds: z.array(z.uuid()).max(PROMOTION_LIMITS.maxTargets),
    bundleItems: z
      .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(PROMOTION_LIMITS.maxQuantity) }))
      .max(PROMOTION_LIMITS.maxBundleItems),
    code: promotionCodeInputSchema.nullable(),
    minSpend: amountSchema,
    eligibility: promotionEligibilitySchema,
    usageLimit: countSchema,
    perCustomerLimit: countSchema,
    startsOn: localDateSchema,
    endsOn: localDateSchema.nullable(),
    enabled: z.boolean(),
    visible: z.boolean(),
    featured: z.boolean(),
    image: catalogImageUrlSchema.nullable(),
  })
  .superRefine((request, context) => {
    const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
    const { type, offer, targetKind } = request;

    if ((type === "bundle") !== (offer === "bundle_price")) problem("offer", "A bundle has a bundle price, and only a bundle has one.");
    if ((type === "bundle") !== (targetKind === "bundle")) problem("targetKind", "A bundle applies to its own packs.");
    if (type === "code" && offer === "buy_get") problem("offer", "A promo code takes a percentage or an amount off.");
    if (offer === "buy_get" && !["all_products", "categories", "products"].includes(targetKind)) {
      problem("targetKind", "A buy-get offer applies to shop items: all products, categories or chosen products.");
    }

    if (offer === "percent" && (request.value < 1 || request.value > 100)) problem("value", "Use a whole percentage from 1 to 100.");
    if ((offer === "fixed" || offer === "bundle_price") && request.value < 1) problem("value", "Enter an amount above 0.");
    if (offer === "buy_get" && request.value !== 0) problem("value", "A buy-get offer has no separate value.");
    if ((offer === "buy_get") !== (request.buyGet !== null)) problem("buyGet", "Only a buy-get offer has buy and get counts.");

    if ((type === "code") !== (request.code !== null)) problem("code", type === "code" ? "Enter the promo code." : "Only a promo code has a code.");

    const needsIds = (PROMOTION_TARGETS_WITH_IDS as readonly string[]).includes(targetKind);
    if (needsIds && request.targetIds.length === 0) problem("targetIds", "Choose at least one.");
    if (!needsIds && request.targetIds.length > 0) problem("targetIds", "This kind of promotion names no products, categories or packages.");
    if (new Set(request.targetIds).size !== request.targetIds.length) problem("targetIds", "Each one can be chosen once.");

    if (type === "bundle") {
      const items = request.bundleItems.reduce((sum, item) => sum + item.quantity, 0);
      if (items < 2) problem("bundleItems", "A bundle needs at least two items.");
    } else if (request.bundleItems.length > 0) {
      problem("bundleItems", "Only a bundle has packs.");
    }
    if (new Set(request.bundleItems.map((item) => item.variantId)).size !== request.bundleItems.length) {
      problem("bundleItems", "Each pack can be chosen once; raise its quantity instead.");
    }

    if (request.endsOn !== null && request.endsOn < request.startsOn) problem("endsOn", "The end date must not be before the start date.");
  });

/** `PUT /api/admin/promotions/:id/enabled` (Create/Edit): switch on or off; switching off asks first (D128). */
export const setPromotionEnabledRequestSchema = z.object({
  enabled: z.boolean(),
  version: z.number().int().positive(),
});

// --- At checkout (11b) -----------------------------------------------------------------------------

/**
 * A promo code's answer (D202 questions 2-3): "applied", or why it gives nothing. When several reasons
 * fit, the first in this order wins, as the price calculator checks them.
 */
export const promoCodeStatusSchema = z.enum([
  "applied",
  "unknown",
  "switched_off",
  "not_started",
  "ended",
  "not_eligible",
  "used_up",
  "used_up_for_you",
  "min_spend",
  "no_matching_items",
]);

/** What a customer types in the promo code box: any text (one in another format is simply unknown); empty is none. */
export const promoCodeEntrySchema = z.string().trim().max(64);

/** A promotion an order or booking got, from its own copy (D203): later edits never change it. */
export const orderPromotionSchema = z.object({
  name: localisedTextSchema,
  code: z.string().nullable(),
  /** What it took off the items, after the QAR 1 floor. */
  discount: z.number().int().nonnegative(),
});

// --- The home page (11e) ---------------------------------------------------------------------------

/** How many featured offers the home page shows (D203: there is no limit on how many are marked). */
export const FEATURED_OFFERS_SHOWN = 3;

/**
 * A featured offer on the home page strip (11e): a promotion marked "Feature on homepage" that runs
 * today, is switched on, is not used up and, unless it is a code, is visible on the store.
 */
export const featuredOfferSchema = z.object({
  name: localisedTextSchema,
  description: localisedTextSchema,
  offer: promotionOfferSchema,
  /** As a product offer's: percent, dirhams off one item, or a bundle's set price; 0 for buy-get. */
  value: z.number().int().nonnegative(),
  buyGet: promotionBuyGetSchema.nullable(),
  /** Where it applies, for the strip's link: the shop (products, the order, a bundle) or grooming. */
  scope: z.enum(["shop", "grooming"]),
  /** The code to type at checkout or when booking: a featured code is meant to be shown. Null for automatic offers. */
  code: promotionCodeSchema.nullable(),
  eligibility: promotionEligibilitySchema,
  minSpend: z.number().int().nonnegative(),
  perCustomerLimit: z.number().int().nonnegative(),
  /** The last day (Qatar), inclusive; null = no end. */
  endsOn: localDateSchema.nullable(),
  image: catalogImageUrlSchema.nullable(),
});

/** `GET /api/promotions/featured`: up to 3, ending soonest first (no end last), then newest. */
export const featuredOffersResponseSchema = z.object({ offers: z.array(featuredOfferSchema).max(FEATURED_OFFERS_SHOWN) });

/** Staff also see which promotion it was and whether its use counts (held or used) or was given back. */
export const adminOrderPromotionSchema = orderPromotionSchema.extend({
  promotionId: z.uuid(),
  status: promotionUseStatusSchema,
});

export type PromotionType = z.infer<typeof promotionTypeSchema>;
export type PromotionOffer = z.infer<typeof promotionOfferSchema>;
export type PromotionTargetKind = z.infer<typeof promotionTargetKindSchema>;
export type PromotionEligibility = z.infer<typeof promotionEligibilitySchema>;
export type PromotionStatus = z.infer<typeof promotionStatusSchema>;
export type PromotionUseStatus = z.infer<typeof promotionUseStatusSchema>;
export type AdminPromotion = z.infer<typeof adminPromotionSchema>;
export type AdminPromotionsResponse = z.infer<typeof adminPromotionsResponseSchema>;
export type AdminPromotionUse = z.infer<typeof adminPromotionUseSchema>;
export type AdminPromotionDetail = z.infer<typeof adminPromotionDetailSchema>;
export type PromotionOptions = z.infer<typeof promotionOptionsSchema>;
export type SavePromotionRequest = z.infer<typeof savePromotionRequestSchema>;
export type SetPromotionEnabledRequest = z.infer<typeof setPromotionEnabledRequestSchema>;
export type PromoCodeStatus = z.infer<typeof promoCodeStatusSchema>;
export type OrderPromotion = z.infer<typeof orderPromotionSchema>;
export type AdminOrderPromotion = z.infer<typeof adminOrderPromotionSchema>;
export type FeaturedOffer = z.infer<typeof featuredOfferSchema>;
export type FeaturedOffersResponse = z.infer<typeof featuredOffersResponseSchema>;
