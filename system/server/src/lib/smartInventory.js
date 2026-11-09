import { prisma } from "./prisma.js";
import { calendarDaysUntilExpiryUTC } from "./productExpiry.js";

function toInt(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function clampInt(v, min, max, fallback) {
  const n = toInt(v, fallback);
  return Math.min(max, Math.max(min, n));
}

/**
 * Severity for reorder: CRITICAL (out), HIGH (deep below point), MEDIUM, LOW.
 */
export function reorderSeverity({ currentQty, reorderPoint, minStockLevel }) {
  const cur = Number(currentQty) || 0;
  const rp = Math.max(0, Number(reorderPoint) || 0);
  const min = Math.max(0, Number(minStockLevel) || 0);
  if (cur <= 0) return { level: "CRITICAL", score: 100 };
  if (rp <= 0 && min <= 0) return { level: "LOW", score: 10 };
  const gap = Math.max(0, rp - cur);
  const ratio = rp > 0 ? gap / rp : 1;
  const score = Math.min(99, Math.round(20 + ratio * 70 + (cur <= min ? 10 : 0)));
  if (cur <= Math.max(1, Math.floor(min / 2)) || ratio >= 0.75) {
    return { level: "HIGH", score };
  }
  if (cur <= rp) return { level: "MEDIUM", score: Math.min(score, 70) };
  return { level: "LOW", score: Math.min(score, 40) };
}

/**
 * Waste risk from days-to-expiry × on-hand value.
 */
export function wasteSeverity({ daysUntilExpiry, quantityOnHand, unitCost }) {
  const days = daysUntilExpiry == null ? 999 : Number(daysUntilExpiry);
  const qty = Math.max(0, Number(quantityOnHand) || 0);
  const cost = Math.max(0, Number(unitCost) || 0);
  const valueAtRisk = Number((qty * cost).toFixed(2));
  let level = "WATCH";
  let urgency = 10;
  if (days < 0) {
    level = "EXPIRED";
    urgency = 100;
  } else if (days <= 3) {
    level = "CRITICAL";
    urgency = 90 - days * 5;
  } else if (days <= 7) {
    level = "HIGH";
    urgency = 70 - (days - 3) * 4;
  } else if (days <= 14) {
    level = "MEDIUM";
    urgency = 45 - (days - 7);
  } else if (days <= 30) {
    level = "WATCH";
    urgency = 25;
  } else {
    level = "OK";
    urgency = 5;
  }
  const valueBoost = Math.min(25, Math.log10(Math.max(1, valueAtRisk) + 1) * 12);
  const score = Math.min(100, Math.round(urgency + valueBoost));
  return { level, score, valueAtRisk };
}

/**
 * Smart reorder board — sales velocity + min stock.
 */
export async function buildReorderRecommendations({
  orgId,
  branchId,
  lookbackDays = 30,
  targetStockDays = 21,
  minDailySales = 0.05,
}) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  // Sequential reads keep pool usage low under Supabase session limits.
  const inventoryRows = await prisma.inventory.findMany({
    where: {
      branchId,
      branch: { organizationId: orgId },
      product: { organizationId: orgId, isActive: true },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          sku: true,
          barcode: true,
          cost: true,
        },
      },
    },
  });
  const salesRows = await prisma.saleItem.findMany({
    where: {
      sale: {
        branchId,
        branch: { organizationId: orgId },
        createdAt: { gte: since },
      },
    },
    select: { productId: true, quantity: true },
  });

  const soldByProduct = new Map();
  for (const row of salesRows) {
    const prev = soldByProduct.get(row.productId) ?? 0;
    soldByProduct.set(row.productId, prev + Number(row.quantity || 0));
  }

  const out = [];
  for (const inv of inventoryRows) {
    const sold = soldByProduct.get(inv.productId) ?? 0;
    const dailySales = sold / Math.max(1, lookbackDays);
    const effectiveDailySales = Math.max(minDailySales, dailySales);
    const targetQty = Math.ceil(effectiveDailySales * targetStockDays);
    const reorderPoint = Math.max(
      Number(inv.minStockLevel || 0),
      Math.ceil(effectiveDailySales * 7),
    );
    const currentQty = Number(inv.quantity || 0);
    const needsReorder = currentQty <= reorderPoint;
    if (!needsReorder) continue;
    const suggestedQty = Math.max(1, targetQty - currentQty);
    const daysOfCover =
      effectiveDailySales > 0 ? Number((currentQty / effectiveDailySales).toFixed(1)) : null;
    const sev = reorderSeverity({
      currentQty,
      reorderPoint,
      minStockLevel: Number(inv.minStockLevel || 0),
    });
    out.push({
      productId: inv.productId,
      name: inv.product?.name ?? "",
      nameEn: inv.product?.nameEn ?? null,
      sku: inv.product?.sku ?? null,
      barcode: inv.product?.barcode ?? null,
      currentQty,
      minStockLevel: Number(inv.minStockLevel || 0),
      reorderPoint,
      soldInLookback: sold,
      dailySales: Number(dailySales.toFixed(3)),
      targetStockDays,
      suggestedQty,
      daysOfCover,
      severity: sev.level,
      severityScore: sev.score,
      defaultUnitCost:
        inv.product?.cost != null ? Number(inv.product.cost) : null,
    });
  }

  out.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Waste Guard board — FEFO lots + product-level expiry fallback.
 * @param {{ orgId: string, branchId: string, withinDays?: number }} opts
 */
export async function buildWasteBoard({ orgId, branchId, withinDays = 30 }) {
  const horizon = clampInt(withinDays, 1, 120, 30);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() + horizon);

  const lots = await prisma.inventoryLot.findMany({
    where: {
      organizationId: orgId,
      branchId,
      quantityOnHand: { gt: 0 },
      expiryDate: { not: null, lte: end },
    },
    include: {
      product: {
        select: { id: true, name: true, nameEn: true, sku: true, barcode: true, cost: true },
      },
      branch: { select: { id: true, name: true } },
    },
    orderBy: [{ expiryDate: "asc" }],
    take: 500,
  });

  const fromLots = lots.map((lot) => {
    const days = calendarDaysUntilExpiryUTC(lot.expiryDate);
    const unitCost =
      lot.unitCost != null
        ? Number(lot.unitCost)
        : lot.product?.cost != null
          ? Number(lot.product.cost)
          : 0;
    const sev = wasteSeverity({
      daysUntilExpiry: days,
      quantityOnHand: lot.quantityOnHand,
      unitCost,
    });
    return {
      kind: "LOT",
      lotId: lot.id,
      productId: lot.productId,
      name: lot.product?.name ?? "",
      nameEn: lot.product?.nameEn ?? null,
      sku: lot.product?.sku ?? null,
      barcode: lot.product?.barcode ?? null,
      quantityOnHand: lot.quantityOnHand,
      expiryDate: lot.expiryDate,
      daysUntilExpiry: days,
      unitCost,
      valueAtRisk: sev.valueAtRisk,
      severity: sev.level,
      severityScore: sev.score,
      actionHint:
        days < 0
          ? "WRITE_OFF"
          : days <= 7
            ? "PROMOTE_OR_DISCOUNT"
            : "MONITOR_FEFO",
    };
  });

  // Product-level expiry when no lot rows cover the stock (legacy / retail without lots)
  const products = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      expiryDate: { not: null, lte: end },
    },
    select: {
      id: true,
      name: true,
      nameEn: true,
      sku: true,
      barcode: true,
      cost: true,
      expiryDate: true,
      inventories: {
        where: { branchId, quantity: { gt: 0 } },
        select: { quantity: true },
      },
    },
    take: 300,
  });

  const lotProductIds = new Set(fromLots.map((r) => r.productId));
  const fromProducts = [];
  for (const p of products) {
    if (lotProductIds.has(p.id)) continue;
    const qty = p.inventories.reduce((s, i) => s + Number(i.quantity || 0), 0);
    if (qty <= 0) continue;
    const days = calendarDaysUntilExpiryUTC(p.expiryDate);
    const unitCost = p.cost != null ? Number(p.cost) : 0;
    const sev = wasteSeverity({
      daysUntilExpiry: days,
      quantityOnHand: qty,
      unitCost,
    });
    fromProducts.push({
      kind: "PRODUCT",
      lotId: null,
      productId: p.id,
      name: p.name ?? "",
      nameEn: p.nameEn ?? null,
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      quantityOnHand: qty,
      expiryDate: p.expiryDate,
      daysUntilExpiry: days,
      unitCost,
      valueAtRisk: sev.valueAtRisk,
      severity: sev.level,
      severityScore: sev.score,
      actionHint:
        days < 0
          ? "WRITE_OFF"
          : days <= 7
            ? "PROMOTE_OR_DISCOUNT"
            : "MONITOR_FEFO",
    });
  }

  const rows = [...fromLots, ...fromProducts].filter((r) => r.severity !== "OK");
  rows.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    if (a.daysUntilExpiry !== b.daysUntilExpiry) {
      return (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999);
    }
    return b.valueAtRisk - a.valueAtRisk;
  });

  const totals = {
    count: rows.length,
    critical: rows.filter((r) => r.severity === "EXPIRED" || r.severity === "CRITICAL")
      .length,
    valueAtRisk: Number(
      rows.reduce((s, r) => s + (Number(r.valueAtRisk) || 0), 0).toFixed(2),
    ),
  };

  return { withinDays: horizon, totals, items: rows };
}

export async function buildIntelligenceOverview({
  orgId,
  branchId,
  lookbackDays = 30,
  targetStockDays = 21,
  wasteWithinDays = 30,
}) {
  // Serialize heavy scans — parallel fan-out exhausts Supabase session pool.
  const reorder = await buildReorderRecommendations({
    orgId,
    branchId,
    lookbackDays,
    targetStockDays,
    minDailySales: 0.05,
  });
  const waste = await buildWasteBoard({ orgId, branchId, withinDays: wasteWithinDays });
  const openDrafts = await prisma.purchaseDraft.count({
    where: { organizationId: orgId, branchId, status: "OPEN" },
  });

  return {
    branchId,
    reorder: {
      count: reorder.length,
      critical: reorder.filter((r) => r.severity === "CRITICAL").length,
      high: reorder.filter((r) => r.severity === "HIGH").length,
      top: reorder.slice(0, 5),
    },
    waste: {
      count: waste.totals.count,
      critical: waste.totals.critical,
      valueAtRisk: waste.totals.valueAtRisk,
      top: waste.items.slice(0, 5),
    },
    openDrafts,
    /** @internal Full waste board for server-side reuse (not for API clients). */
    _wasteBoard: waste,
  };
}
