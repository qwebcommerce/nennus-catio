import { prisma } from "./prisma.js";
import { clampInt } from "./smartInventory.js";

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function daysBetween(a, b) {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function quintileScore(sortedAsc, value, higherIsBetter) {
  if (!sortedAsc.length) return 3;
  const n = sortedAsc.length;
  let idx = sortedAsc.findIndex((v) => v >= value);
  if (idx < 0) idx = n - 1;
  const rank = (idx + 1) / n; // 0..1
  let score = Math.min(5, Math.max(1, Math.ceil(rank * 5)));
  if (!higherIsBetter) score = 6 - score;
  return score;
}

function segmentFromRfm({ r, f, m, dormantDays, daysSince }) {
  if (daysSince == null || daysSince >= dormantDays) return "DORMANT";
  if (r >= 4 && f >= 4 && m >= 4) return "CHAMPIONS";
  if (r >= 3 && f >= 3 && m >= 3) return "LOYAL";
  if (r <= 2 && (f >= 3 || m >= 3)) return "AT_RISK";
  if (m >= 4 && r >= 3) return "HIGH_VALUE";
  if (r >= 4 && f <= 2) return "NEW_PROMISING";
  return "NEEDS_ATTENTION";
}

/**
 * RFM + dormant / high-value lists for grocery & retail owners.
 */
export async function buildCustomerRfm({
  orgId,
  dormantDays = 60,
  highValueMin = null,
  lookbackDays = 365,
  limit = 200,
}) {
  const dormant = clampInt(dormantDays, 14, 365, 60);
  const lookback = clampInt(lookbackDays, 30, 730, 365);
  const lim = clampInt(limit, 20, 500, 200);
  const since = new Date();
  since.setDate(since.getDate() - lookback);
  const now = new Date();

  // Cap customer pull; RFM boards only need a bounded set for scoring lists.
  const customers = await prisma.customer.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      lifetimeSpend: true,
      loyaltyPoints: true,
      createdAt: true,
    },
    orderBy: { lifetimeSpend: "desc" },
    take: 5000,
  });

  // Aggregate in DB instead of loading every sale row into memory.
  const salesAgg = await prisma.sale.groupBy({
    by: ["customerId"],
    where: {
      customerId: { not: null },
      branch: { organizationId: orgId },
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { total: true },
    _max: { createdAt: true },
  });

  const byCustomer = new Map();
  for (const s of salesAgg) {
    const id = s.customerId;
    if (!id) continue;
    byCustomer.set(id, {
      frequency: Number(s._count?._all || 0),
      monetary: money(s._sum?.total || 0),
      lastPurchaseAt: s._max?.createdAt || null,
    });
  }

  const recencyDaysList = [];
  const freqList = [];
  const monList = [];

  const rows = customers.map((c) => {
    const agg = byCustomer.get(c.id) || {
      frequency: 0,
      monetary: money(c.lifetimeSpend || 0),
      lastPurchaseAt: null,
    };
    const monetary = agg.frequency > 0 ? agg.monetary : money(c.lifetimeSpend || 0);
    const daysSince =
      agg.lastPurchaseAt != null ? daysBetween(agg.lastPurchaseAt, now) : null;
    if (daysSince != null) recencyDaysList.push(daysSince);
    freqList.push(agg.frequency);
    monList.push(monetary);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone || null,
      email: c.email || null,
      loyaltyPoints: c.loyaltyPoints || 0,
      lastPurchaseAt: agg.lastPurchaseAt,
      daysSinceLastPurchase: daysSince,
      frequency: agg.frequency,
      monetary,
      lifetimeSpend: money(c.lifetimeSpend || 0),
      createdAt: c.createdAt,
    };
  });

  const recSorted = [...recencyDaysList].sort((a, b) => a - b);
  const freqSorted = [...freqList].sort((a, b) => a - b);
  const monSorted = [...monList].sort((a, b) => a - b);

  const hvThreshold =
    highValueMin != null && Number(highValueMin) > 0
      ? Number(highValueMin)
      : monSorted.length
        ? monSorted[Math.floor(monSorted.length * 0.8)] || 0
        : 0;

  const scored = rows.map((r) => {
    const R =
      r.daysSinceLastPurchase == null
        ? 1
        : quintileScore(recSorted, r.daysSinceLastPurchase, false);
    const F = quintileScore(freqSorted, r.frequency, true);
    const M = quintileScore(monSorted, r.monetary, true);
    const segment = segmentFromRfm({
      r: R,
      f: F,
      m: M,
      dormantDays: dormant,
      daysSince: r.daysSinceLastPurchase,
    });
    return {
      ...r,
      r: R,
      f: F,
      m: M,
      rfm: `${R}${F}${M}`,
      segment,
      isHighValue: r.monetary >= hvThreshold && hvThreshold > 0,
      isDormant: r.daysSinceLastPurchase == null || r.daysSinceLastPurchase >= dormant,
    };
  });

  scored.sort((a, b) => {
    if (b.monetary !== a.monetary) return b.monetary - a.monetary;
    return (a.daysSinceLastPurchase ?? 9999) - (b.daysSinceLastPurchase ?? 9999);
  });

  const segmentCounts = {};
  for (const r of scored) {
    segmentCounts[r.segment] = (segmentCounts[r.segment] || 0) + 1;
  }

  const dormantList = scored
    .filter((r) => r.isDormant)
    .sort((a, b) => (b.daysSinceLastPurchase ?? 0) - (a.daysSinceLastPurchase ?? 0))
    .slice(0, lim);

  const highValue = scored
    .filter((r) => r.isHighValue)
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, lim);

  const atRisk = scored.filter((r) => r.segment === "AT_RISK").slice(0, lim);
  const champions = scored.filter((r) => r.segment === "CHAMPIONS").slice(0, lim);

  const shareLines = (list) =>
    list
      .filter((c) => c.phone)
      .slice(0, 100)
      .map((c) => `${c.phone}\t${c.name}\t${c.segment}\t${c.monetary}`);

  return {
    lookbackDays: lookback,
    dormantDays: dormant,
    highValueMin: money(hvThreshold),
    customerCount: scored.length,
    withPurchases: scored.filter((r) => r.frequency > 0).length,
    segmentCounts,
    dormant: dormantList,
    highValue,
    atRisk,
    champions,
    customers: scored.slice(0, lim),
    shareText: {
      dormantAr: shareLines(dormantList).join("\n"),
      dormantEn: shareLines(dormantList).join("\n"),
      highValueAr: shareLines(highValue).join("\n"),
      highValueEn: shareLines(highValue).join("\n"),
    },
  };
}

export async function buildRfmOverview({ orgId, dormantDays = 60 }) {
  const board = await buildCustomerRfm({ orgId, dormantDays, limit: 50 });
  return {
    customerCount: board.customerCount,
    withPurchases: board.withPurchases,
    dormantCount: board.dormant.length,
    highValueCount: board.highValue.length,
    atRiskCount: board.atRisk.length,
    championsCount: board.champions.length,
    segmentCounts: board.segmentCounts,
    topDormant: board.dormant.slice(0, 5),
    topHighValue: board.highValue.slice(0, 5),
  };
}
