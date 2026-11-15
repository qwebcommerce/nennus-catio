import { z } from "zod";
import { HOUSE_MAX_LEAD_DAYS, localDateSchema } from "./delivery.js";
import { localisedTextSchema } from "./site-settings.js";

/**
 * Public catalogue contracts (branch #6). Prices are integer minor units (QAR dirhams). Admin-only
 * fields (low-stock thresholds, sort order, version) are not part of the public shape.
 */
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const categorySchema = z.object({
  slug: slugSchema,
  name: localisedTextSchema,
  sortOrder: z.number().int(),
});

export const petTypeSchema = z.object({
  slug: slugSchema,
  name: localisedTextSchema,
  sortOrder: z.number().int(),
});

export const productImageSchema = z.object({
  url: z.string().min(1).max(500),
  alt: localisedTextSchema,
});

/** A pack/size of a product (D103: packs carry a stated weight; no customer-chosen weights). */
export const publicVariantSchema = z.object({
  /** Stable public identifier within the product (seeded items keep the prototype id). */
  code: slugSchema,
  sku: z.string(),
  label: localisedTextSchema,
  weightGrams: z.number().int().positive().nullable(),
  price: z.number().int().nonnegative(),
  /**
   * The price after the best visible offer for everyone with no minimum spend (#11, 11b); null when
   * there is none. Only a display: checkout prices the cart again on the server.
   */
  salePrice: z.number().int().nonnegative().nullable(),
  stock: z.number().int().nonnegative(),
});

/**
 * A visible automatic offer on a product (#11, 11b; the shop shows it from 11e). Offers for registered
 * or new customers, limited per customer (D210 2A), with a minimum spend, buy-get offers and bundles are
 * labels, not sale prices.
 */
export const productOfferSchema = z.object({
  name: localisedTextSchema,
  offer: z.enum(["percent", "fixed", "buy_get", "bundle_price"]),
  /** Percent; dirhams off one item; or a bundle's set price. 0 for buy-get. */
  value: z.number().int().nonnegative(),
  buyGet: z
    .object({ buy: z.number().int().positive(), get: z.number().int().positive(), percent: z.number().int().min(1).max(100) })
    .nullable(),
  /** A bundle's packs; null for other offers. */
  bundle: z.array(z.object({ product: slugSchema, variant: slugSchema, quantity: z.number().int().positive() })).nullable(),
  eligibility: z.enum(["all", "registered", "new"]),
  /** Dirhams the items must reach first; 0 = none. */
  minSpend: z.number().int().nonnegative(),
  /** How often one customer may get it; 0 = no limit (D210 2A: then it is a label, for example "Once per customer"). */
  perCustomerLimit: z.number().int().nonnegative(),
  /** The last day (Qatar), inclusive; null = no end. */
  endsOn: localDateSchema.nullable(),
});

export const houseCollectionSchema = z.enum([
  "general",
  "indoor",
  "outdoor",
  "wall-decor",
  "rabbits",
  "sugar-glider",
  "tortoise",
  "chameleon",
  "lizard",
]);

export const petHouseDetailsSchema = z.object({
  collection: houseCollectionSchema,
  /** "inquiry" models show "price on request" and are discussed on WhatsApp (D68). */
  purchaseMode: z.enum(["fixed", "inquiry"]),
  availability: z.enum(["unconfirmed", "in-stock", "made-to-order"]),
  dimensions: z
    .object({
      height: z.number().int().positive(),
      width: z.number().int().positive(),
      depth: z.number().int().positive(),
    })
    .nullable(),
  features: z.array(z.object({ id: z.string(), en: z.string(), ar: z.string() })),
  /** "Ready in about min–max days" (#14): checkout's delivery times start max days ahead. */
  leadTime: z
    .object({
      minDays: z.number().int().nonnegative().max(HOUSE_MAX_LEAD_DAYS, `At most ${HOUSE_MAX_LEAD_DAYS} days.`),
      maxDays: z.number().int().nonnegative().max(HOUSE_MAX_LEAD_DAYS, `At most ${HOUSE_MAX_LEAD_DAYS} days.`),
    })
    .nullable(),
  /** Charged per house on top of the area's delivery fee (#14, D268). Unknown is null, which is not the same as free (0). */
  deliveryFee: z.number().int().nonnegative().max(1_000_000, "At most QAR 10,000.").nullable(),
  fulfilment: z.enum(["delivery", "both"]),
  provisional: z.boolean(),
  source: z.string().nullable(),
});

/** What a Pet House model still needs before customers can order it online (#14, D268). */
export type HouseGap = "price" | "availability" | "leadTime" | "deliveryFee" | "checked";

/**
 * The one rule for "ready to order online" (#14, D268), shared by checkout, the house pages and the
 * admin's checklist; no gaps means ready. `prices` are the prices of the sizes customers can choose. A
 * hidden model, or one in a hidden category, is never ordered either: the caller checks that.
 */
export function houseGaps(house: PetHouseDetails, prices: readonly number[]): HouseGap[] {
  const gaps: HouseGap[] = [];
  if (house.purchaseMode !== "fixed" || prices.length === 0 || prices.some((price) => price <= 0)) gaps.push("price");
  if (house.availability === "unconfirmed") gaps.push("availability");
  if (house.leadTime === null) gaps.push("leadTime");
  if (house.deliveryFee === null) gaps.push("deliveryFee");
  if (house.provisional) gaps.push("checked");
  return gaps;
}

export const publicProductSchema = z.object({
  slug: slugSchema,
  category: slugSchema,
  brand: z.string().nullable(),
  featured: z.boolean(),
  bestSeller: z.boolean(),
  name: localisedTextSchema,
  description: localisedTextSchema,
  petTypes: z.array(slugSchema),
  images: z.array(productImageSchema),
  variants: z.array(publicVariantSchema),
  house: petHouseDetailsSchema.nullable(),
  /** The visible offers on this product today (11b), in the order they were created. */
  offers: z.array(productOfferSchema),
});

export const productListResponseSchema = z.object({ products: z.array(publicProductSchema) });
export const categoryListResponseSchema = z.object({ categories: z.array(categorySchema) });
export const petTypeListResponseSchema = z.object({ petTypes: z.array(petTypeSchema) });

// --- Admin catalogue (6b) ---------------------------------------------------------------------

/**
 * A pack the POS manages (#16 part 2b, D285): its stock, price, on/off and SKU follow the POS's item of
 * this code, and staff cannot change them; the owner's "Edit anyway" can, until the POS's next update.
 */
export const adminVariantPosSchema = z.object({
  code: z.string(),
  /** When the POS's data last applied to the pack; null if only linked so far. */
  appliedAt: z.string().nullable(),
  /** When the owner last changed the pack by hand since the POS's last update; null otherwise. */
  overriddenAt: z.string().nullable(),
  /** A price the POS sent that waits for staff (a drop to less than half), in minor units. */
  heldPrice: z.number().int().positive().nullable(),
});

export const adminVariantSchema = publicVariantSchema.omit({ salePrice: true }).extend({
  id: z.string(),
  lowStockThreshold: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
  /** Set when the POS manages this pack (part 2b); null for a pack of the website's own. */
  pos: adminVariantPosSchema.nullable(),
});

export const adminProductSchema = publicProductSchema.omit({ variants: true, offers: true }).extend({
  id: z.string(),
  active: z.boolean(),
  /** Imported prototype content not yet reviewed by staff (D107); cleared by the first save. */
  isSample: z.boolean(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  variants: z.array(adminVariantSchema),
});

export const adminProductListResponseSchema = z.object({ products: z.array(adminProductSchema) });

const requiredText = (max: number) =>
  z.object({ en: z.string().trim().min(1).max(max), ar: z.string().trim().min(1).max(max) });
const optionalText = (max: number) =>
  z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });

/** Prototype images, uploaded images and external https images only. */
export const catalogImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^(\/images\/[A-Za-z0-9._/-]+|\/api\/media\/[0-9a-f-]{36}\.webp|https:\/\/\S+)$/);

/**
 * A product code: a pack's SKU, which follows the point-of-sale system's item code (D274), and the same
 * item code on a grooming package (#16 part 2a, D285). Unique ignoring case for packs (the database).
 */
export const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const variantInputSchema = z.object({
  /** Present for an existing pack; omitted for a new one (the server assigns a code). */
  code: slugSchema.optional(),
  sku: skuSchema,
  label: requiredText(120),
  weightGrams: z.number().int().positive().max(1_000_000).nullable(),
  price: z.number().int().nonnegative().max(100_000_000),
  /** Only used for new packs; existing stock changes go through a stock adjustment with a reason. */
  stock: z.number().int().nonnegative().max(1_000_000),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000).nullable(),
  active: z.boolean(),
});

export const saveProductRequestSchema = z
  .object({
    /** Required when updating: the version the editor started from. */
    version: z.number().int().positive().optional(),
    category: slugSchema,
    petTypes: z.array(slugSchema).min(1).max(12),
    brand: z
      .string()
      .trim()
      .max(80)
      .transform((value) => value.replace(/\s+/g, " ") || null)
      .nullable(),
    name: requiredText(160),
    description: optionalText(4000),
    active: z.boolean(),
    featured: z.boolean(),
    bestSeller: z.boolean(),
    images: z
      .array(z.object({ url: catalogImageUrlSchema, alt: optionalText(200) }))
      .min(1)
      .max(9),
    variants: z.array(variantInputSchema).min(1).max(20),
    house: petHouseDetailsSchema.nullable(),
  })
  .superRefine((value, context) => {
    const isHouse = value.category === "pet-houses";
    if (isHouse !== (value.house !== null)) {
      context.addIssue({
        code: "custom",
        path: ["house"],
        message: "Pet House details are required for the Pet Houses category, and only there.",
      });
    }
    if (value.house?.leadTime && value.house.leadTime.maxDays < value.house.leadTime.minDays) {
      context.addIssue({ code: "custom", path: ["house", "leadTime"], message: "The longest time must not be shorter than the shortest." });
    }
    const inquiry = value.house?.purchaseMode === "inquiry";
    const skus = new Set<string>();
    const codes = new Set<string>();
    value.variants.forEach((variant, index) => {
      const sku = variant.sku.toUpperCase();
      if (skus.has(sku)) {
        context.addIssue({ code: "custom", path: ["variants", index, "sku"], message: "Each pack needs its own SKU." });
      }
      skus.add(sku);
      if (variant.code) {
        if (codes.has(variant.code)) {
          context.addIssue({ code: "custom", path: ["variants", index, "code"], message: "Duplicate pack." });
        }
        codes.add(variant.code);
      }
      if (!inquiry && variant.price <= 0) {
        context.addIssue({ code: "custom", path: ["variants", index, "price"], message: "Price must be more than 0." });
      }
    });
  });

export const stockAdjustmentRequestSchema = z.object({
  /** Units added (positive) or removed (negative). */
  change: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, "Enter how many units to add or remove."),
  reason: z.string().trim().min(3).max(200),
});

/**
 * The owner's "Edit anyway" on a pack the POS manages (#16 part 2b, D285 answers 2 and 5): one change,
 * with a reason, that the POS's next update of the pack replaces. The owner only; never a staff role.
 */
export const variantOverrideRequestSchema = z.object({
  stock: z.number().int().nonnegative().max(1_000_000),
  /** Above 0: a pack the POS manages is sold at a fixed price. */
  price: z.number().int().positive().max(100_000_000),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(200),
});

export const adminCategorySchema = categorySchema.extend({
  id: z.string(),
  active: z.boolean(),
  productCount: z.number().int().nonnegative(),
  /** The Pet Houses category drives the house fields and cannot be removed. */
  isHouseCategory: z.boolean(),
});

export const adminCategoryListResponseSchema = z.object({ categories: z.array(adminCategorySchema) });

export const saveCategoryRequestSchema = z.object({
  name: requiredText(80),
  sortOrder: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

export const mediaUploadResponseSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type AdminVariant = z.infer<typeof adminVariantSchema>;
export type AdminProduct = z.infer<typeof adminProductSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type SaveProductRequest = z.infer<typeof saveProductRequestSchema>;
export type StockAdjustmentRequest = z.infer<typeof stockAdjustmentRequestSchema>;
export type VariantOverrideRequest = z.infer<typeof variantOverrideRequestSchema>;
export type AdminVariantPos = z.infer<typeof adminVariantPosSchema>;
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type SaveCategoryRequest = z.infer<typeof saveCategoryRequestSchema>;

export type Category = z.infer<typeof categorySchema>;
export type PetType = z.infer<typeof petTypeSchema>;
export type PublicVariant = z.infer<typeof publicVariantSchema>;
export type ProductOffer = z.infer<typeof productOfferSchema>;
export type PetHouseDetails = z.infer<typeof petHouseDetailsSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
