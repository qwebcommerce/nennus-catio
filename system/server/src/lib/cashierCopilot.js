import { prisma } from "./prisma.js";
import { buildBundleSuggestions } from "./intelligentPricing.js";
import { suggestProductsForCode } from "./fuzzyMatch.js";
import { clampInt } from "./smartInventory.js";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * Checkout / till risk heuristics for cashier mistakes & abuse.
 */
export function assessCheckoutRisk({
  subtotal = 0,
  discountAmount = 0,
  itemCount = 0,
  hasDiscountReason = false,
  highDiscountPct = 20,
  criticalDiscountPct = 35,
  reasonRequiredPct = 20,
  reasonRequiredAmount = 50,
} = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const disc = Math.max(0, Number(discountAmount) || 0);
  const pct = sub > 0 ? money((disc / sub) * 100) : 0;
  const alerts = [];

  if (disc > 0 && pct >= criticalDiscountPct) {
    alerts.push({
      level: "CRITICAL",
      code: "DISCOUNT_CRITICAL",
      discountPercent: pct,
      discountAmount: money(disc),
    });
  } else if (disc > 0 && pct >= highDiscountPct) {
    alerts.push({
      level: "WARN",
      code: "DISCOUNT_HIGH",
      discountPercent: pct,
      discountAmount: money(disc),
    });
  }

  if (disc > sub + 0.009) {
    alerts.push({
      level: "CRITICAL",
      code: "DISCOUNT_OVER_SUBTOTAL",
      discountPercent: pct,
      discountAmount: money(disc),
    });
  }

  if (Number(itemCount) <= 0 && disc > 0) {
    alerts.push({
      level: "WARN",
      code: "DISCOUNT_EMPTY_CART",
      discountPercent: pct,
      discountAmount: money(disc),
    });
  }

  const requireDiscountReason =
    disc > 0 &&
    (pct >= reasonRequiredPct || disc >= reasonRequiredAmount) &&
    !hasDiscountReason;

  if (requireDiscountReason) {
    alerts.push({
      level: "BLOCK",
      code: "DISCOUNT_REASON_REQUIRED",
      discountPercent: pct,
      discountAmount: money(disc),
    });
  }

  return {
    discountPercent: pct,
    requireDiscountReason,
    canProceed: !requireDiscountReason && disc <= sub + 0.009,
    alerts,
  };
}

/**
 * Refund risk — high-value returns should carry a note.
 */
export function assessRefundRisk({
  totalAmount = 0,
  note = "",
  reasonRequiredAmount = 50,
} = {}) {
  const total = money(totalAmount);
  const hasNote = String(note || "").trim().length >= 3;
  const requireNote = total >= reasonRequiredAmount && !hasNote;
  const alerts = [];
  if (requireNote) {
    alerts.push({
      level: "BLOCK",
      code: "REFUND_NOTE_REQUIRED",
      totalAmount: total,
    });
  } else if (total >= reasonRequiredAmount * 2) {
    alerts.push({
      level: "WARN",
      code: "REFUND_HIGH_VALUE",
      totalAmount: total,
    });
  }
  return {
    canProceed: !requireNote,
    requireNote,
    totalAmount: total,
    alerts,
  };
}

/**
 * Barcode / code suggestions from live catalog for a branch.
 */
export async function buildBarcodeSuggestions({
  orgId,
  branchId,
  code,
  limit = 5,
}) {
  const q = String(code || "").trim();
  if (!q) return { code: q, suggestions: [] };

  const products = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      inventories: branchId ? { some: { branchId } } : undefined,
    },
    select: {
      id: true,
      name: true,
      nameEn: true,
      sku: true,
      barcode: true,
      price: true,
      wholesalePrice: true,
      cost: true,
      imageUrl: true,
      modifiers: true,
      inventories: branchId
        ? { where: { branchId }, select: { quantity: true, minStockLevel: true } }
        : { select: { quantity: true }, take: 5 },
    },
    take: 800,
  });

  const mapped = products.map((p) => ({
    ...p,
    stock:
      Array.isArray(p.inventories) && p.inventories[0]
        ? Number(p.inventories[0].quantity) || 0
        : null,
  }));

  const hits = suggestProductsForCode(q, mapped, { limit, minScore: 45 });
  return {
    code: q,
    suggestions: hits.map(({ product, score }) => ({
      productId: product.id,
      name: product.name,
      nameEn: product.nameEn,
      sku: product.sku,
      barcode: product.barcode,
      price: product.price != null ? Number(product.price) : null,
      wholesalePrice:
        product.wholesalePrice != null ? Number(product.wholesalePrice) : null,
      cost: product.cost != null ? Number(product.cost) : null,
      stock: product.stock,
      imageUrl: product.imageUrl,
      modifiers: product.modifiers,
      score,
    })),
  };
}

/**
 * Upsell tips for current cart lines (co-purchase pairs).
 */
export async function buildCartUpsells({
  orgId,
  branchId,
  productIds = [],
  lookbackDays = 45,
  limit = 6,
}) {
  const cartIds = [
    ...new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!cartIds.length) {
    return { lookbackDays, count: 0, tips: [] };
  }

  const bundles = await buildBundleSuggestions({
    orgId,
    branchId,
    lookbackDays: clampInt(lookbackDays, 14, 120, 45),
    limit: 40,
  });

  const cartSet = new Set(cartIds);
  const tips = [];
  for (const row of bundles.items || []) {
    const aIn = cartSet.has(row.productId);
    const bIn = cartSet.has(row.pairedProductId);
    if (aIn === bIn) continue; // both in or both out — no tip
    const suggestId = aIn ? row.pairedProductId : row.productId;
    const anchorId = aIn ? row.productId : row.pairedProductId;
    const suggestName = aIn ? row.pairedName : row.name;
    const suggestNameEn = aIn ? row.pairedNameEn : row.nameEn;
    const suggestPrice = aIn ? row.pairedPrice : row.price;
    const anchorName = aIn ? row.name : row.pairedName;
    tips.push({
      productId: suggestId,
      name: suggestName,
      nameEn: suggestNameEn,
      price: suggestPrice,
      sku: aIn ? row.pairedSku : row.sku,
      anchorProductId: anchorId,
      anchorName,
      togetherCount: row.togetherCount,
      reason: row.reason,
    });
    if (tips.length >= limit) break;
  }

  // Enrich with stock / full product card fields for one-tap add
  if (tips.length) {
    const products = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        id: { in: tips.map((t) => t.productId) },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        sku: true,
        barcode: true,
        price: true,
        wholesalePrice: true,
        cost: true,
        imageUrl: true,
        modifiers: true,
        inventories: {
          where: { branchId },
          select: { quantity: true, minStockLevel: true },
        },
      },
    });
    const pmap = new Map(products.map((p) => [p.id, p]));
    for (const tip of tips) {
      const p = pmap.get(tip.productId);
      if (!p) {
        tip.unavailable = true;
        continue;
      }
      tip.name = p.name;
      tip.nameEn = p.nameEn;
      tip.sku = p.sku;
      tip.barcode = p.barcode;
      tip.price = p.price != null ? Number(p.price) : tip.price;
      tip.wholesalePrice =
        p.wholesalePrice != null ? Number(p.wholesalePrice) : null;
      tip.cost = p.cost != null ? Number(p.cost) : null;
      tip.imageUrl = p.imageUrl;
      tip.modifiers = p.modifiers;
      tip.stock = p.inventories?.[0] ? Number(p.inventories[0].quantity) || 0 : 0;
      tip.product = {
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        sku: p.sku,
        barcode: p.barcode,
        price: tip.price,
        wholesalePrice: tip.wholesalePrice,
        cost: tip.cost,
        imageUrl: p.imageUrl,
        modifiers: p.modifiers,
        stock: tip.stock,
        isActive: true,
      };
    }
  }

  return {
    lookbackDays: clampInt(lookbackDays, 14, 120, 45),
    count: tips.filter((t) => !t.unavailable).length,
    tips: tips.filter((t) => !t.unavailable),
  };
}
