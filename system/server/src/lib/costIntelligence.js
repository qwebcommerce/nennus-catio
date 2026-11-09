import { prisma } from "./prisma.js";
import { clampInt } from "./smartInventory.js";

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10) / 10;
}

function purchaseWhere({ orgId, branchId, since, supplierId, productId }) {
  const where = {
    branch: { organizationId: orgId },
    createdAt: { gte: since },
  };
  if (branchId) where.branchId = branchId;
  if (supplierId) where.supplierId = supplierId;
  if (productId) {
    where.items = { some: { productId } };
  }
  return where;
}

async function loadPurchaseLines({ orgId, branchId, lookbackDays = 90, supplierId = null, productId = null }) {
  const days = clampInt(lookbackDays, 7, 365, 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const purchases = await prisma.purchase.findMany({
    where: purchaseWhere({ orgId, branchId, since, supplierId, productId }),
    select: {
      id: true,
      supplierId: true,
      branchId: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      items: {
        where: productId ? { productId } : undefined,
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitCost: true,
          subtotal: true,
          product: {
            select: {
              id: true,
              name: true,
              nameEn: true,
              sku: true,
              barcode: true,
              cost: true,
              price: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });

  const lines = [];
  for (const p of purchases) {
    for (const it of p.items) {
      lines.push({
        purchaseId: p.id,
        purchaseItemId: it.id,
        supplierId: p.supplierId,
        supplierName: p.supplier?.name || null,
        branchId: p.branchId,
        receivedAt: p.createdAt,
        productId: it.productId,
        name: it.product?.name || "",
        nameEn: it.product?.nameEn || null,
        sku: it.product?.sku || null,
        barcode: it.product?.barcode || null,
        currentCost: it.product?.cost != null ? money(it.product.cost) : null,
        sellPrice: it.product?.price != null ? money(it.product.price) : null,
        quantity: Number(it.quantity) || 0,
        unitCost: money(it.unitCost),
        subtotal: money(it.subtotal),
      });
    }
  }
  return { since, lookbackDays: days, lines };
}

function marginPct(price, cost) {
  const p = money(price);
  const c = money(cost);
  if (p <= 0) return null;
  return pct(((p - c) / p) * 100);
}

function alertSeverity(risePct) {
  if (risePct >= 20) return "HIGH";
  if (risePct >= 10) return "MEDIUM";
  return "WATCH";
}

/**
 * Cost rise alerts: latest purchase unitCost vs avg of prior N buys for same product (+ optional same supplier).
 */
export async function buildCostAlerts({
  orgId,
  branchId = null,
  lookbackDays = 90,
  n = 5,
  risePct = 8,
  groupBySupplier = false,
}) {
  const priorN = clampInt(n, 1, 20, 5);
  const threshold = Math.max(1, Number(risePct) || 8);
  const { since, lookbackDays: days, lines } = await loadPurchaseLines({
    orgId,
    branchId,
    lookbackDays,
  });

  const buckets = new Map();
  for (const line of lines) {
    const key = groupBySupplier && line.supplierId
      ? `${line.productId}::${line.supplierId}`
      : line.productId;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(line);
  }

  const alerts = [];
  for (const [, rows] of buckets) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
    const latest = rows[rows.length - 1];
    const prior = rows.slice(0, -1).slice(-priorN);
    if (!prior.length) continue;
    const baseline = money(prior.reduce((s, r) => s + r.unitCost, 0) / prior.length);
    if (baseline <= 0) continue;
    const latestCost = latest.unitCost;
    const rise = pct(((latestCost - baseline) / baseline) * 100);
    if (rise < threshold) continue;

    const sellPrice = latest.sellPrice;
    alerts.push({
      productId: latest.productId,
      name: latest.name,
      nameEn: latest.nameEn,
      sku: latest.sku,
      supplierId: latest.supplierId,
      supplierName: latest.supplierName,
      latestUnitCost: latestCost,
      baselineUnitCost: baseline,
      baselineKind: "AVG_LAST_N",
      priorCount: prior.length,
      risePct: rise,
      riseAbs: money(latestCost - baseline),
      sellPrice,
      marginPctBefore: marginPct(sellPrice, baseline),
      marginPctAfter: marginPct(sellPrice, latestCost),
      severity: alertSeverity(rise),
      purchaseCount: rows.length,
      latestAt: latest.receivedAt,
    });
  }

  alerts.sort((a, b) => {
    if (b.risePct !== a.risePct) return b.risePct - a.risePct;
    return b.riseAbs - a.riseAbs;
  });

  return {
    since: since.toISOString(),
    lookbackDays: days,
    n: priorN,
    risePct: threshold,
    count: alerts.length,
    alerts,
  };
}

/**
 * Purchase cost history for one product (optionally filtered by supplier).
 */
export async function buildCostHistory({
  orgId,
  branchId = null,
  productId,
  supplierId = null,
  lookbackDays = 180,
  limit = 50,
}) {
  if (!productId) {
    return { productId: null, points: [], count: 0 };
  }
  const lim = clampInt(limit, 1, 200, 50);
  const { since, lookbackDays: days, lines } = await loadPurchaseLines({
    orgId,
    branchId,
    lookbackDays,
    supplierId,
    productId,
  });

  const points = lines
    .slice()
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .slice(0, lim)
    .map((l) => ({
      purchaseId: l.purchaseId,
      purchaseItemId: l.purchaseItemId,
      supplierId: l.supplierId,
      supplierName: l.supplierName,
      branchId: l.branchId,
      receivedAt: l.receivedAt,
      quantity: l.quantity,
      unitCost: l.unitCost,
      subtotal: l.subtotal,
    }));

  const first = lines[0];
  return {
    productId,
    name: first?.name || "",
    nameEn: first?.nameEn || null,
    sku: first?.sku || null,
    currentCost: first?.currentCost ?? null,
    sellPrice: first?.sellPrice ?? null,
    since: since.toISOString(),
    lookbackDays: days,
    count: points.length,
    points,
  };
}

/**
 * Supplier scorecards for the lookback window.
 */
export async function buildSupplierScorecards({
  orgId,
  branchId = null,
  lookbackDays = 90,
}) {
  const { since, lookbackDays: days, lines } = await loadPurchaseLines({
    orgId,
    branchId,
    lookbackDays,
  });

  const withSupplier = lines.filter((l) => l.supplierId);
  const productAvg = new Map(); // productId -> { sumCost*qty, qty }
  for (const l of withSupplier) {
    const cur = productAvg.get(l.productId) || { weighted: 0, qty: 0 };
    cur.weighted += l.unitCost * l.quantity;
    cur.qty += l.quantity;
    productAvg.set(l.productId, cur);
  }
  const orgAvgCost = new Map();
  for (const [pid, v] of productAvg) {
    orgAvgCost.set(pid, v.qty > 0 ? v.weighted / v.qty : 0);
  }

  const bySupplier = new Map();
  for (const l of withSupplier) {
    const cur = bySupplier.get(l.supplierId) || {
      supplierId: l.supplierId,
      name: l.supplierName || "—",
      purchaseIds: new Set(),
      lineCount: 0,
      totalQty: 0,
      totalSpend: 0,
      skus: new Set(),
      costIndexWeighted: 0,
      costIndexQty: 0,
    };
    cur.purchaseIds.add(l.purchaseId);
    cur.lineCount += 1;
    cur.totalQty += l.quantity;
    cur.totalSpend = money(cur.totalSpend + l.subtotal);
    cur.skus.add(l.productId);
    const avg = orgAvgCost.get(l.productId) || 0;
    if (avg > 0 && l.quantity > 0) {
      cur.costIndexWeighted += (l.unitCost / avg) * l.quantity;
      cur.costIndexQty += l.quantity;
    }
    bySupplier.set(l.supplierId, cur);
  }

  const weeks = Math.max(1, days / 7);
  const totalSpendAll = [...bySupplier.values()].reduce((s, x) => s + x.totalSpend, 0) || 1;

  const suppliers = [...bySupplier.values()].map((s) => {
    const purchaseCount = s.purchaseIds.size;
    const freq = purchaseCount / weeks;
    const volumeSharePct = pct((s.totalSpend / totalSpendAll) * 100);
    const avgUnitCostIndex =
      s.costIndexQty > 0 ? money(s.costIndexWeighted / s.costIndexQty) : 1;
    // Lower cost index is better; more frequency/volume is better reliability proxy
    const priceScore = Math.max(0, Math.min(100, Math.round(100 - (avgUnitCostIndex - 1) * 100)));
    const volumeScore = Math.min(100, Math.round(volumeSharePct * 2));
    const freqScore = Math.min(100, Math.round(freq * 25));
    const score = Math.round(priceScore * 0.5 + volumeScore * 0.25 + freqScore * 0.25);
    return {
      supplierId: s.supplierId,
      name: s.name,
      purchaseCount,
      lineCount: s.lineCount,
      totalQty: s.totalQty,
      totalSpend: money(s.totalSpend),
      distinctSkus: s.skus.size,
      avgUnitCostIndex,
      reliabilityProxy: {
        purchaseFrequencyPerWeek: money(freq),
        volumeSharePct,
        score,
      },
    };
  });

  suppliers.sort((a, b) => b.reliabilityProxy.score - a.reliabilityProxy.score);

  return {
    period: { from: since.toISOString(), to: new Date().toISOString() },
    lookbackDays: days,
    count: suppliers.length,
    suppliers,
  };
}

/**
 * Best (lowest cost) supplier per SKU in the window.
 */
export async function buildBestSuppliers({
  orgId,
  branchId = null,
  lookbackDays = 90,
  limit = 30,
  minPurchases = 1,
}) {
  const lim = clampInt(limit, 1, 100, 30);
  const minP = clampInt(minPurchases, 1, 10, 1);
  const { since, lookbackDays: days, lines } = await loadPurchaseLines({
    orgId,
    branchId,
    lookbackDays,
  });

  const withSupplier = lines.filter((l) => l.supplierId);
  // productId -> supplierId -> { qty, spend, count, name, lastCost, product meta }
  const map = new Map();
  for (const l of withSupplier) {
    if (!map.has(l.productId)) {
      map.set(l.productId, {
        meta: {
          productId: l.productId,
          name: l.name,
          nameEn: l.nameEn,
          sku: l.sku,
          sellPrice: l.sellPrice,
          currentCost: l.currentCost,
        },
        suppliers: new Map(),
      });
    }
    const bucket = map.get(l.productId);
    const s = bucket.suppliers.get(l.supplierId) || {
      supplierId: l.supplierId,
      supplierName: l.supplierName,
      qty: 0,
      spend: 0,
      count: 0,
      lastCost: l.unitCost,
      lastAt: l.receivedAt,
    };
    s.qty += l.quantity;
    s.spend += l.subtotal;
    s.count += 1;
    if (new Date(l.receivedAt) >= new Date(s.lastAt)) {
      s.lastCost = l.unitCost;
      s.lastAt = l.receivedAt;
    }
    bucket.suppliers.set(l.supplierId, s);
  }

  const items = [];
  for (const [, bucket] of map) {
    const ranked = [...bucket.suppliers.values()]
      .filter((s) => s.count >= minP)
      .map((s) => ({
        ...s,
        avgUnitCost: s.qty > 0 ? money(s.spend / s.qty) : s.lastCost,
      }))
      .sort((a, b) => a.avgUnitCost - b.avgUnitCost);
    if (ranked.length < 1) continue;
    const best = ranked[0];
    const alt = ranked[1] || null;
    const savingsPerUnit = alt ? money(alt.avgUnitCost - best.avgUnitCost) : 0;
    items.push({
      ...bucket.meta,
      bestSupplierId: best.supplierId,
      bestSupplierName: best.supplierName,
      bestUnitCost: best.avgUnitCost,
      bestPurchaseCount: best.count,
      altSupplierId: alt?.supplierId || null,
      altSupplierName: alt?.supplierName || null,
      altUnitCost: alt?.avgUnitCost ?? null,
      savingsPerUnit,
      supplierOptions: ranked.length,
      suggestedForReorder: ranked.length >= 2 && savingsPerUnit > 0,
    });
  }

  items.sort((a, b) => {
    if (Boolean(b.suggestedForReorder) !== Boolean(a.suggestedForReorder)) {
      return b.suggestedForReorder ? 1 : -1;
    }
    return (b.savingsPerUnit || 0) - (a.savingsPerUnit || 0);
  });

  return {
    since: since.toISOString(),
    lookbackDays: days,
    count: Math.min(lim, items.length),
    items: items.slice(0, lim),
  };
}

export async function buildCostOverview({
  orgId,
  branchId = null,
  lookbackDays = 90,
}) {
  const [alerts, scorecards, best] = await Promise.all([
    buildCostAlerts({ orgId, branchId, lookbackDays, n: 5, risePct: 8 }),
    buildSupplierScorecards({ orgId, branchId, lookbackDays }),
    buildBestSuppliers({ orgId, branchId, lookbackDays, limit: 50 }),
  ]);

  const multiSupplierSkus = best.items.filter((i) => i.supplierOptions >= 2).length;
  const estimatedSavings = money(
    best.items.reduce((s, i) => s + (i.suggestedForReorder ? i.savingsPerUnit : 0), 0),
  );

  return {
    lookbackDays: clampInt(lookbackDays, 7, 365, 90),
    alerts: {
      count: alerts.count,
      high: alerts.alerts.filter((a) => a.severity === "HIGH").length,
      top: alerts.alerts.slice(0, 5),
    },
    suppliers: {
      count: scorecards.count,
      top: scorecards.suppliers.slice(0, 5),
    },
    best: {
      count: best.count,
      multiSupplierSkus,
      estimatedUnitSavings: estimatedSavings,
      top: best.items.filter((i) => i.suggestedForReorder).slice(0, 5),
    },
  };
}
