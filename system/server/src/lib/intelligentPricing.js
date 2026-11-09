import { prisma } from "./prisma.js";
import { buildWasteBoard, clampInt } from "./smartInventory.js";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

/**
 * Floor price = cost * (1 + minMarginPct/100). Never suggest below floor.
 */
export function floorPrice(cost, minMarginPct = 5) {
  const c = Math.max(0, Number(cost) || 0);
  const m = Math.max(0, Number(minMarginPct) || 0);
  return money(c * (1 + m / 100));
}

/**
 * Suggest markdown % that clears stock but protects margin.
 */
export function suggestMarkdownPercent({
  daysUntilExpiry,
  price,
  cost,
  minMarginPct = 5,
}) {
  const p = Number(price) || 0;
  const c = Math.max(0, Number(cost) || 0);
  if (p <= 0) return { discountPercent: 0, suggestedPrice: p, floor: floorPrice(c, minMarginPct) };
  const floor = floorPrice(c, minMarginPct);
  const maxOff = Math.max(0, money(((p - floor) / p) * 100));
  const days = daysUntilExpiry == null ? 30 : Number(daysUntilExpiry);
  let target = 0;
  if (days < 0) target = Math.min(maxOff, 40);
  else if (days <= 3) target = Math.min(maxOff, 30);
  else if (days <= 7) target = Math.min(maxOff, 20);
  else if (days <= 14) target = Math.min(maxOff, 12);
  else target = Math.min(maxOff, 8);
  const discountPercent = pct(target);
  const suggestedPrice = money(Math.max(floor, p * (1 - discountPercent / 100)));
  return { discountPercent, suggestedPrice, floor, maxSafePercent: pct(maxOff) };
}

/**
 * What-if margin simulator for a single SKU.
 */
export function simulateMarginImpact({
  price,
  cost,
  discountPercent = 0,
  estimatedUnits = 0,
  elasticity = 1.2,
}) {
  const p = Math.max(0, Number(price) || 0);
  const c = Math.max(0, Number(cost) || 0);
  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const units = Math.max(0, Number(estimatedUnits) || 0);
  const e = Math.max(0, Number(elasticity) || 1.2);

  const newPrice = money(p * (1 - d / 100));
  const marginBefore = money(p - c);
  const marginAfter = money(newPrice - c);
  const marginPctBefore = p > 0 ? pct(((p - c) / p) * 100) : 0;
  const marginPctAfter = newPrice > 0 ? pct(((newPrice - c) / newPrice) * 100) : 0;

  // Simple constant-elasticity demand: qty' = qty * (1 + e * discountFraction)
  const unitsAfter = money(units * (1 + e * (d / 100)));
  const profitBefore = money(marginBefore * units);
  const profitAfter = money(marginAfter * unitsAfter);
  const revenueBefore = money(p * units);
  const revenueAfter = money(newPrice * unitsAfter);

  return {
    price: p,
    cost: c,
    discountPercent: pct(d),
    newPrice,
    estimatedUnits: units,
    estimatedUnitsAfter: unitsAfter,
    marginBefore,
    marginAfter,
    marginPctBefore,
    marginPctAfter,
    revenueBefore,
    revenueAfter,
    profitBefore,
    profitAfter,
    profitDelta: money(profitAfter - profitBefore),
    belowCost: newPrice < c,
  };
}

/**
 * Near-expiry markdown board (closes Waste Guard → promo loop).
 */
export async function buildMarkdownSuggestions({
  orgId,
  branchId,
  withinDays = 14,
  minMarginPct = 5,
  /** Optional preloaded waste board to avoid a duplicate lot scan. */
  wasteBoard = null,
}) {
  const waste =
    wasteBoard && Array.isArray(wasteBoard.items)
      ? wasteBoard
      : await buildWasteBoard({ orgId, branchId, withinDays });
  const byProduct = new Map();

  for (const row of waste.items) {
    const prev = byProduct.get(row.productId);
    if (!prev) {
      byProduct.set(row.productId, { ...row });
      continue;
    }
    const mergedQty = (Number(prev.quantityOnHand) || 0) + (Number(row.quantityOnHand) || 0);
    const mergedValue = money((Number(prev.valueAtRisk) || 0) + (Number(row.valueAtRisk) || 0));
    if ((row.daysUntilExpiry ?? 999) < (prev.daysUntilExpiry ?? 999)) {
      byProduct.set(row.productId, {
        ...row,
        quantityOnHand: mergedQty,
        valueAtRisk: mergedValue,
      });
    } else {
      prev.quantityOnHand = mergedQty;
      prev.valueAtRisk = mergedValue;
    }
  }

  const productIds = [...byProduct.keys()];
  if (!productIds.length) {
    return { withinDays, minMarginPct, count: 0, items: [] };
  }

  const products = await prisma.product.findMany({
    where: { organizationId: orgId, id: { in: productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      nameEn: true,
      sku: true,
      barcode: true,
      price: true,
      cost: true,
    },
  });
  const pmap = new Map(products.map((p) => [p.id, p]));

  const items = [];
  for (const [productId, wasteRow] of byProduct) {
    const p = pmap.get(productId);
    if (!p) continue;
    const price = Number(p.price) || 0;
    const cost = p.cost != null ? Number(p.cost) : wasteRow.unitCost || 0;
    if (price <= 0) continue;
    const md = suggestMarkdownPercent({
      daysUntilExpiry: wasteRow.daysUntilExpiry,
      price,
      cost,
      minMarginPct,
    });
    if (md.discountPercent <= 0) continue;
    const marginAfter = money(md.suggestedPrice - cost);
    items.push({
      productId,
      name: p.name,
      nameEn: p.nameEn,
      sku: p.sku,
      barcode: p.barcode,
      currentPrice: money(price),
      cost: money(cost),
      quantityOnHand: wasteRow.quantityOnHand,
      daysUntilExpiry: wasteRow.daysUntilExpiry,
      expiryDate: wasteRow.expiryDate,
      severity: wasteRow.severity,
      severityScore: wasteRow.severityScore,
      discountPercent: md.discountPercent,
      suggestedPrice: md.suggestedPrice,
      floorPrice: md.floor,
      maxSafePercent: md.maxSafePercent,
      marginAfter,
      valueAtRisk: wasteRow.valueAtRisk,
      reason: `Near-expiry (${wasteRow.daysUntilExpiry}d) → ${md.discountPercent}% off`,
    });
  }

  items.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return b.discountPercent - a.discountPercent;
  });

  return {
    withinDays,
    minMarginPct,
    count: items.length,
    items,
  };
}

/**
 * Velocity / margin price recommendations (slow movers markdown, fat-margin nudge).
 */
export async function buildPriceRecommendations({
  orgId,
  branchId,
  lookbackDays = 30,
  minMarginPct = 5,
}) {
  const days = clampInt(lookbackDays, 7, 120, 30);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [inventoryRows, salesRows] = await Promise.all([
    prisma.inventory.findMany({
      where: {
        branchId,
        branch: { organizationId: orgId },
        product: { organizationId: orgId, isActive: true },
        quantity: { gt: 0 },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            sku: true,
            barcode: true,
            price: true,
            cost: true,
          },
        },
      },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          branch: { organizationId: orgId },
          createdAt: { gte: since },
        },
      },
      select: { productId: true, quantity: true },
    }),
  ]);

  const soldByProduct = new Map();
  for (const row of salesRows) {
    soldByProduct.set(
      row.productId,
      (soldByProduct.get(row.productId) ?? 0) + Number(row.quantity || 0),
    );
  }

  const items = [];
  for (const inv of inventoryRows) {
    const p = inv.product;
    if (!p) continue;
    const price = Number(p.price) || 0;
    const cost = p.cost != null ? Number(p.cost) : 0;
    if (price <= 0) continue;
    const qty = Number(inv.quantity) || 0;
    const sold = soldByProduct.get(p.id) ?? 0;
    const daily = sold / Math.max(1, days);
    const daysOfCover = daily > 0 ? Number((qty / daily).toFixed(1)) : 999;
    const marginPct = pct(((price - cost) / price) * 100);

    let action = null;
    let discountPercent = 0;
    let suggestedPrice = price;
    let reason = "";

    if (daysOfCover >= 45 && qty >= 5) {
      // Slow mover — gentle markdown, protect floor
      const md = suggestMarkdownPercent({
        daysUntilExpiry: 10,
        price,
        cost,
        minMarginPct,
      });
      discountPercent = Math.min(md.discountPercent, 15);
      suggestedPrice = money(Math.max(md.floor, price * (1 - discountPercent / 100)));
      action = "MARKDOWN";
      reason = `Slow mover (~${daysOfCover}d cover) → ${discountPercent}% off`;
    } else if (marginPct >= 55 && daily >= 0.2) {
      // High margin + selling — optional small raise (cap +8%)
      const raise = Math.min(8, Math.max(3, pct((marginPct - 40) / 4)));
      suggestedPrice = money(price * (1 + raise / 100));
      discountPercent = -raise;
      action = "RAISE";
      reason = `Strong margin (${marginPct}%) + demand → +${raise}% test`;
    } else if (marginPct < minMarginPct && cost > 0) {
      const floor = floorPrice(cost, minMarginPct);
      if (floor > price) {
        suggestedPrice = floor;
        discountPercent = pct(((price - floor) / price) * 100) * -1;
        action = "RAISE";
        reason = `Below target margin → lift to floor ${floor}`;
      }
    }

    if (!action) continue;
    items.push({
      productId: p.id,
      name: p.name,
      nameEn: p.nameEn,
      sku: p.sku,
      barcode: p.barcode,
      currentPrice: money(price),
      cost: money(cost),
      currentQty: qty,
      soldInLookback: sold,
      dailySales: Number(daily.toFixed(3)),
      daysOfCover,
      marginPct,
      action,
      discountPercent: pct(discountPercent),
      suggestedPrice,
      reason,
    });
  }

  items.sort((a, b) => {
    const rank = (x) => (x.action === "MARKDOWN" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return Math.abs(b.discountPercent) - Math.abs(a.discountPercent);
  });

  return { lookbackDays: days, minMarginPct, count: items.length, items };
}

/**
 * Simple co-purchase bundles from recent sales (buy X get 1 free style).
 */
export async function buildBundleSuggestions({
  orgId,
  branchId,
  lookbackDays = 45,
  limit = 20,
}) {
  const days = clampInt(lookbackDays, 14, 120, 45);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sales = await prisma.sale.findMany({
    where: {
      branchId,
      branch: { organizationId: orgId },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      items: { select: { productId: true, quantity: true } },
    },
    take: 800,
    orderBy: { createdAt: "desc" },
  });

  const pairCount = new Map();
  for (const sale of sales) {
    const ids = [
      ...new Set(
        (sale.items || [])
          .filter((i) => (i.quantity || 0) > 0)
          .map((i) => i.productId),
      ),
    ].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const topPairs = [...pairCount.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const productIds = new Set();
  for (const [key] of topPairs) {
    const [a, b] = key.split("|");
    productIds.add(a);
    productIds.add(b);
  }

  const products = productIds.size
    ? await prisma.product.findMany({
        where: { organizationId: orgId, id: { in: [...productIds] } },
        select: {
          id: true,
          name: true,
          nameEn: true,
          sku: true,
          price: true,
          cost: true,
        },
      })
    : [];
  const pmap = new Map(products.map((p) => [p.id, p]));

  const items = topPairs
    .map(([key, togetherCount]) => {
      const [aId, bId] = key.split("|");
      const a = pmap.get(aId);
      const b = pmap.get(bId);
      if (!a || !b) return null;
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      // Suggest buy 2 of cheaper / get cheaper free-ish: 15% off the pair basket
      const bundleDiscountPercent = 15;
      const pairPrice = money(priceA + priceB);
      const promoPairPrice = money(pairPrice * (1 - bundleDiscountPercent / 100));
      return {
        productId: a.id,
        pairedProductId: b.id,
        name: a.name,
        nameEn: a.nameEn,
        pairedName: b.name,
        pairedNameEn: b.nameEn,
        sku: a.sku,
        pairedSku: b.sku,
        price: money(priceA),
        pairedPrice: money(priceB),
        togetherCount,
        buyQty: 1,
        freeQty: 0,
        bundleDiscountPercent,
        pairPrice,
        promoPairPrice,
        reason: `Bought together ${togetherCount}× → ${bundleDiscountPercent}% pair promo`,
      };
    })
    .filter(Boolean);

  return { lookbackDays: days, count: items.length, items };
}

export async function buildPricingOverview({
  orgId,
  branchId,
  withinDays = 14,
  lookbackDays = 30,
}) {
  const [markdowns, recommendations, bundles, openDrafts] = await Promise.all([
    buildMarkdownSuggestions({ orgId, branchId, withinDays }),
    buildPriceRecommendations({ orgId, branchId, lookbackDays }),
    buildBundleSuggestions({ orgId, branchId, lookbackDays: 45, limit: 8 }),
    prisma.promoDraft.count({
      where: { organizationId: orgId, status: "OPEN" },
    }),
  ]);

  return {
    branchId,
    markdowns: {
      count: markdowns.count,
      top: markdowns.items.slice(0, 5),
    },
    recommendations: {
      count: recommendations.count,
      markdowns: recommendations.items.filter((i) => i.action === "MARKDOWN").length,
      raises: recommendations.items.filter((i) => i.action === "RAISE").length,
      top: recommendations.items.slice(0, 5),
    },
    bundles: {
      count: bundles.count,
      top: bundles.items.slice(0, 5),
    },
    openDrafts,
  };
}
