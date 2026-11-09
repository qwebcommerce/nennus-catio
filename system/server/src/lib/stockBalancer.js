import { prisma } from "./prisma.js";
import { clampInt, reorderSeverity } from "./smartInventory.js";
import { executeInventoryTransfer } from "./inventoryTransfer.js";

/**
 * Suggest internal transfers: surplus branch → deficit branch for the same SKU.
 * Avoids buying new stock when another branch has excess.
 */
export async function buildBalanceSuggestions({
  orgId,
  lookbackDays = 30,
  targetStockDays = 21,
  minDailySales = 0.05,
  surplusBufferDays = 14,
  limit = 80,
}) {
  const days = clampInt(lookbackDays, 7, 120, 30);
  const targetDays = clampInt(targetStockDays, 7, 90, 21);
  const bufferDays = clampInt(surplusBufferDays, 3, 60, 14);
  const lim = clampInt(limit, 1, 200, 80);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Sequential to avoid opening 3 pool connections at once under session limits.
  const inventoryRows = await prisma.inventory.findMany({
    where: {
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
      branch: { select: { id: true, name: true } },
    },
  });
  const salesRows = await prisma.saleItem.findMany({
    where: {
      sale: {
        branch: { organizationId: orgId },
        createdAt: { gte: since },
      },
    },
    select: {
      productId: true,
      quantity: true,
      sale: { select: { branchId: true } },
    },
  });
  const branches = await prisma.branch.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
  });

  if (branches.length < 2) {
    return {
      lookbackDays: days,
      targetStockDays: targetDays,
      branchCount: branches.length,
      count: 0,
      suggestions: [],
      estimatedAvoidedPurchases: 0,
    };
  }

  const sold = new Map(); // `${branchId}:${productId}` -> qty
  for (const row of salesRows) {
    const key = `${row.sale.branchId}:${row.productId}`;
    sold.set(key, (sold.get(key) || 0) + Number(row.quantity || 0));
  }

  // productId -> [{ branchId, name, qty, reorderPoint, surplus, deficit, ...}]
  const byProduct = new Map();
  for (const inv of inventoryRows) {
    const productId = inv.productId;
    const branchId = inv.branchId;
    const currentQty = Number(inv.quantity) || 0;
    const minStock = Number(inv.minStockLevel) || 0;
    const soldQty = sold.get(`${branchId}:${productId}`) || 0;
    const dailySales = soldQty / Math.max(1, days);
    const effectiveDaily = Math.max(minDailySales, dailySales);
    const reorderPoint = Math.max(minStock, Math.ceil(effectiveDaily * 7));
    const targetQty = Math.ceil(effectiveDaily * targetDays);
    // Keep at least reorder point (or min stock) at source; anything above is movable surplus.
    const keepAtSource = Math.max(reorderPoint, minStock, 1);
    const surplusQty = Math.max(0, currentQty - keepAtSource);
    const needTo = Math.max(reorderPoint, Math.min(targetQty, reorderPoint + Math.max(3, Math.ceil(effectiveDaily * 7))));
    const deficitGap = Math.max(0, needTo - currentQty);
    const sev = reorderSeverity({
      currentQty,
      reorderPoint,
      minStockLevel: minStock,
    });

    if (!byProduct.has(productId)) {
      byProduct.set(productId, {
        product: inv.product,
        cost: inv.product?.cost != null ? Number(inv.product.cost) : 0,
        rows: [],
      });
    }
    byProduct.get(productId).rows.push({
      branchId,
      branchName: inv.branch?.name || "—",
      currentQty,
      minStockLevel: minStock,
      reorderPoint,
      targetQty,
      dailySales: Number(dailySales.toFixed(3)),
      deficitGap,
      surplusQty,
      severity: sev.level,
      severityScore: sev.score,
    });
  }

  const suggestions = [];
  for (const [productId, bucket] of byProduct) {
    const deficits = bucket.rows
      .filter((r) => r.deficitGap > 0)
      .sort((a, b) => b.severityScore - a.severityScore || b.deficitGap - a.deficitGap);
    const surpluses = bucket.rows
      .filter((r) => r.surplusQty > 0)
      .sort((a, b) => b.surplusQty - a.surplusQty);

    const pushSug = (sur, def, qty, reason) => {
      if (qty <= 0) return;
      const unitCost = bucket.cost || 0;
      suggestions.push({
        id: `${productId}:${sur.branchId}->${def.branchId}:${reason}`,
        productId,
        name: bucket.product?.name || "",
        nameEn: bucket.product?.nameEn || null,
        sku: bucket.product?.sku || null,
        barcode: bucket.product?.barcode || null,
        fromBranchId: sur.branchId,
        fromBranchName: sur.branchName,
        toBranchId: def.branchId,
        toBranchName: def.branchName,
        fromQty: sur.currentQty,
        toQty: def.currentQty,
        suggestedQty: qty,
        deficitGap: def.deficitGap,
        surplusQty: sur.surplusQty,
        severity: def.severity === "LOW" && reason === "REBALANCE" ? "MEDIUM" : def.severity,
        severityScore: def.severityScore,
        unitCost,
        avoidedPurchaseValue: Number((qty * unitCost).toFixed(2)),
        reason,
      });
    };

    if (deficits.length && surpluses.length) {
      const surplusLeft = new Map(surpluses.map((s) => [s.branchId, s.surplusQty]));
      for (const def of deficits) {
        let need = def.deficitGap;
        for (const sur of surpluses) {
          if (sur.branchId === def.branchId) continue;
          const avail = surplusLeft.get(sur.branchId) || 0;
          if (avail <= 0) continue;
          const qty = Math.min(need, avail);
          if (qty <= 0) continue;
          surplusLeft.set(sur.branchId, avail - qty);
          need -= qty;
          pushSug(sur, def, qty, "COVER_DEFICIT");
          if (need <= 0) break;
        }
      }
    }

    // Relative rebalance: rich branch >> poor branch even if poor is not yet below reorder.
    if (bucket.rows.length >= 2) {
      const ranked = [...bucket.rows].sort((a, b) => b.currentQty - a.currentQty);
      const rich = ranked[0];
      const poor = ranked[ranked.length - 1];
      if (
        rich.branchId !== poor.branchId &&
        rich.surplusQty > 0 &&
        rich.currentQty >= poor.currentQty * 2 &&
        rich.currentQty - poor.currentQty >= 6
      ) {
        const already = suggestions.some(
          (s) =>
            s.productId === productId &&
            s.fromBranchId === rich.branchId &&
            s.toBranchId === poor.branchId,
        );
        if (!already) {
          const qty = Math.min(
            rich.surplusQty,
            Math.floor((rich.currentQty - poor.currentQty) / 2),
          );
          pushSug(rich, poor, qty, "REBALANCE");
        }
      }
    }
  }

  suggestions.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return b.avoidedPurchaseValue - a.avoidedPurchaseValue;
  });

  const top = suggestions.slice(0, lim);
  return {
    lookbackDays: days,
    targetStockDays: targetDays,
    surplusBufferDays: bufferDays,
    branchCount: branches.length,
    count: top.length,
    estimatedAvoidedPurchases: Number(
      top.reduce((s, r) => s + (r.avoidedPurchaseValue || 0), 0).toFixed(2),
    ),
    suggestions: top,
  };
}

export async function buildBalancerOverview({ orgId, lookbackDays = 30 }) {
  const board = await buildBalanceSuggestions({ orgId, lookbackDays, limit: 100 });
  const critical = board.suggestions.filter((s) => s.severity === "CRITICAL").length;
  const high = board.suggestions.filter((s) => s.severity === "HIGH").length;
  return {
    lookbackDays: board.lookbackDays,
    branchCount: board.branchCount,
    count: board.count,
    critical,
    high,
    estimatedAvoidedPurchases: board.estimatedAvoidedPurchases,
    top: board.suggestions.slice(0, 5),
  };
}

/**
 * Group selected suggestion lines by from→to and execute transfers.
 */
export async function executeBalanceTransfers({ orgId, userId, lines }) {
  if (!Array.isArray(lines) || !lines.length) {
    const err = new Error("No lines");
    err.status = 400;
    err.errorAr = "اختر بنوداً للتحويل";
    err.errorEn = "Select transfer lines";
    throw err;
  }

  const groups = new Map();
  for (const line of lines) {
    const fromBranchId = String(line.fromBranchId || "");
    const toBranchId = String(line.toBranchId || "");
    const productId = String(line.productId || "");
    const quantity = Math.max(1, Math.floor(Number(line.quantity || line.suggestedQty) || 0));
    if (!fromBranchId || !toBranchId || !productId || fromBranchId === toBranchId) continue;
    const key = `${fromBranchId}=>${toBranchId}`;
    if (!groups.has(key)) {
      groups.set(key, { fromBranchId, toBranchId, items: [] });
    }
    groups.get(key).items.push({ productId, quantity });
  }

  if (!groups.size) {
    const err = new Error("No valid lines");
    err.status = 400;
    err.errorAr = "بنود التحويل غير صالحة";
    err.errorEn = "Invalid transfer lines";
    throw err;
  }

  const results = [];
  for (const g of groups.values()) {
    const r = await executeInventoryTransfer({
      orgId,
      userId,
      fromBranchId: g.fromBranchId,
      toBranchId: g.toBranchId,
      items: g.items,
    });
    results.push(r);
  }
  return {
    ok: true,
    transferCount: results.length,
    results,
  };
}
