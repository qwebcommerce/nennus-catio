import { prisma } from "./prisma.js";
import {
  buildIntelligenceOverview,
  clampInt,
} from "./smartInventory.js";
import { buildMarkdownSuggestions } from "./intelligentPricing.js";
import { assessCheckoutRisk } from "./cashierCopilot.js";
import { runWithConcurrency } from "./asyncPool.js";

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar day start (server TZ), matching dashboard.js */
export function startOfLocalDay(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addLocalDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Resolve focus day for the brief. Default = yesterday (owners review prior close).
 * Accepts YYYY-MM-DD or ISO datetime.
 */
export function resolveBriefDate(raw) {
  if (raw) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map((n) => Number(n));
      return startOfLocalDay(new Date(y, m - 1, d));
    }
    return startOfLocalDay(s);
  }
  const today = startOfLocalDay(new Date());
  return addLocalDays(today, -1);
}

function deltaPct(current, prior) {
  const c = money(current);
  const p = money(prior);
  if (p === 0) {
    if (c === 0) return 0;
    return 100;
  }
  return money(((c - p) / p) * 100);
}

function branchSaleFilter(orgId, branchId) {
  if (branchId) {
    return { branchId, branch: { organizationId: orgId } };
  }
  return { branch: { organizationId: orgId } };
}

async function aggregateSalesWindow({ orgId, branchId, from, to }) {
  const where = {
    ...branchSaleFilter(orgId, branchId),
    createdAt: { gte: from, lt: to },
  };
  const agg = await prisma.sale.aggregate({
    where,
    _count: true,
    _sum: { total: true, discountAmount: true },
  });
  return {
    count: agg._count || 0,
    total: money(agg._sum?.total || 0),
    discountTotal: money(agg._sum?.discountAmount || 0),
  };
}

async function aggregateRefundsWindow({ orgId, branchId, from, to }) {
  const where = {
    ...branchSaleFilter(orgId, branchId),
    createdAt: { gte: from, lt: to },
  };
  const agg = await prisma.refund.aggregate({
    where,
    _count: true,
    _sum: { total: true },
  });
  const rows = await prisma.refund.findMany({
    where,
    select: {
      id: true,
      total: true,
      note: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { total: "desc" },
    take: 25,
  });

  const byCashier = new Map();
  for (const r of rows) {
    const id = r.user?.id || "unknown";
    const cur = byCashier.get(id) || {
      userId: id,
      name: r.user?.name || "—",
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total = money(cur.total + Number(r.total || 0));
    byCashier.set(id, cur);
  }

  return {
    count: agg._count || 0,
    total: money(agg._sum?.total || 0),
    top: [...byCashier.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    rows: rows.slice(0, 8).map((r) => ({
      id: r.id,
      total: money(r.total),
      note: r.note || null,
      cashier: r.user?.name || "—",
      createdAt: r.createdAt,
      highValue: money(r.total) >= 50,
      missingNote: money(r.total) >= 50 && String(r.note || "").trim().length < 3,
    })),
  };
}

/**
 * Scan focus-day sales for high discounts / missing reasons (orderNote).
 */
async function buildCashierAnomalies({ orgId, branchId, from, to }) {
  const sales = await prisma.sale.findMany({
    where: {
      ...branchSaleFilter(orgId, branchId),
      createdAt: { gte: from, lt: to },
      discountAmount: { gt: 0 },
    },
    select: {
      id: true,
      total: true,
      discountAmount: true,
      orderNote: true,
      invoiceNumber: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
      items: { select: { id: true } },
    },
    orderBy: { discountAmount: "desc" },
    take: 80,
  });

  const alerts = [];
  for (const s of sales) {
    const subtotal = money(Number(s.total || 0) + Number(s.discountAmount || 0));
    const disc = money(s.discountAmount);
    const hasReason = /خصم|discount/i.test(String(s.orderNote || ""));
    const risk = assessCheckoutRisk({
      subtotal,
      discountAmount: disc,
      itemCount: s.items.length,
      hasDiscountReason: hasReason,
    });
    const meaningful = risk.alerts.filter(
      (a) => a.code === "DISCOUNT_CRITICAL" || a.code === "DISCOUNT_HIGH" || a.code === "DISCOUNT_REASON_REQUIRED",
    );
    if (!meaningful.length && !risk.requireDiscountReason) continue;
    const level = meaningful.some((a) => a.level === "CRITICAL" || a.level === "BLOCK")
      ? "HIGH"
      : "WARN";
    alerts.push({
      kind: "DISCOUNT",
      level,
      saleId: s.id,
      invoiceNumber: s.invoiceNumber,
      cashier: s.user?.name || "—",
      userId: s.user?.id || null,
      discountAmount: disc,
      discountPercent: risk.discountPercent,
      missingReason: risk.requireDiscountReason || !hasReason,
      createdAt: s.createdAt,
    });
  }

  alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === "HIGH" ? -1 : 1;
    return b.discountAmount - a.discountAmount;
  });

  return {
    anomalyCount: alerts.length,
    alerts: alerts.slice(0, 12),
  };
}

async function buildBranchComparison({ orgId, from, to }) {
  const sales = await prisma.sale.findMany({
    where: {
      branch: { organizationId: orgId },
      createdAt: { gte: from, lt: to },
    },
    select: {
      branchId: true,
      total: true,
      branch: { select: { id: true, name: true } },
    },
  });
  const refunds = await prisma.refund.findMany({
    where: {
      branch: { organizationId: orgId },
      createdAt: { gte: from, lt: to },
    },
    select: { branchId: true, total: true },
  });

  const map = new Map();
  for (const s of sales) {
    const cur = map.get(s.branchId) || {
      branchId: s.branchId,
      name: s.branch?.name || "—",
      salesCount: 0,
      salesTotal: 0,
      refundCount: 0,
      refundTotal: 0,
    };
    cur.salesCount += 1;
    cur.salesTotal = money(cur.salesTotal + Number(s.total || 0));
    map.set(s.branchId, cur);
  }
  for (const r of refunds) {
    const cur = map.get(r.branchId) || {
      branchId: r.branchId,
      name: "—",
      salesCount: 0,
      salesTotal: 0,
      refundCount: 0,
      refundTotal: 0,
    };
    cur.refundCount += 1;
    cur.refundTotal = money(cur.refundTotal + Number(r.total || 0));
    map.set(r.branchId, cur);
  }

  return [...map.values()].sort((a, b) => b.salesTotal - a.salesTotal);
}

function buildHeadline({ dateLabel, sales, stock, waste, refunds, cashier }) {
  const partsAr = [];
  const partsEn = [];
  const d = sales.deltaPct;
  if (d > 3) {
    partsAr.push(`المبيعات ↑${Math.abs(d)}٪`);
    partsEn.push(`sales ↑${Math.abs(d)}%`);
  } else if (d < -3) {
    partsAr.push(`المبيعات ↓${Math.abs(d)}٪`);
    partsEn.push(`sales ↓${Math.abs(d)}%`);
  } else {
    partsAr.push("المبيعات مستقرة تقريباً");
    partsEn.push("sales roughly flat");
  }
  if (stock.reorderCritical > 0) {
    partsAr.push(`${stock.reorderCritical} أصناف حرجة لإعادة الطلب`);
    partsEn.push(`${stock.reorderCritical} critical restock SKUs`);
  } else if (stock.lowCount > 0) {
    partsAr.push(`${stock.lowCount} أصناف تحتاج إعادة طلب`);
    partsEn.push(`${stock.lowCount} restock needs`);
  }
  if (waste.count > 0) {
    partsAr.push(`${waste.count} أصناف قرب انتهاء الصلاحية`);
    partsEn.push(`${waste.count} SKUs at expiry risk`);
  }
  if (refunds.count > 0) {
    partsAr.push(`${refunds.count} مرتجعات`);
    partsEn.push(`${refunds.count} refunds`);
  }
  if (cashier.anomalyCount > 0) {
    partsAr.push(`${cashier.anomalyCount} خصومات غير اعتيادية`);
    partsEn.push(`${cashier.anomalyCount} unusual discounts`);
  }

  const ar = `${dateLabel}: ${partsAr.join(" · ")}.`;
  const en = `${dateLabel}: ${partsEn.join(" · ")}.`;
  return { ar, en };
}

/**
 * Owner Command Center — daily AI-style brief (deterministic rules + Module 1–3 signals).
 */
export async function buildDailyBrief({
  orgId,
  branchId = null,
  date = null,
  includeBranches = false,
  lookbackDays = 30,
  targetStockDays = 21,
  wasteWithinDays = 14,
}) {
  const focusStart = resolveBriefDate(date);
  const focusEnd = addLocalDays(focusStart, 1);
  const priorStart = addLocalDays(focusStart, -1);
  const priorEnd = focusStart;
  const weekAgoStart = addLocalDays(focusStart, -7);
  const weekAgoEnd = addLocalDays(weekAgoStart, 1);
  const dateLabel = dayKey(focusStart);

  // Cap concurrency — large Promise.all fan-outs exhaust Supabase session pools.
  const [
    salesFocus,
    salesPrior,
    salesWeek,
    refunds,
    refundsPrior,
    cashier,
  ] = await runWithConcurrency(
    [
      () =>
        aggregateSalesWindow({
          orgId,
          branchId,
          from: focusStart,
          to: focusEnd,
        }),
      () =>
        aggregateSalesWindow({
          orgId,
          branchId,
          from: priorStart,
          to: priorEnd,
        }),
      () =>
        aggregateSalesWindow({
          orgId,
          branchId,
          from: weekAgoStart,
          to: weekAgoEnd,
        }),
      () =>
        aggregateRefundsWindow({
          orgId,
          branchId,
          from: focusStart,
          to: focusEnd,
        }),
      () =>
        aggregateRefundsWindow({
          orgId,
          branchId,
          from: priorStart,
          to: priorEnd,
        }),
      () =>
        buildCashierAnomalies({
          orgId,
          branchId,
          from: focusStart,
          to: focusEnd,
        }),
    ],
    2,
  );

  const wasteWithin = clampInt(wasteWithinDays, 1, 120, 14);
  const stockOv = branchId
    ? await buildIntelligenceOverview({
        orgId,
        branchId,
        lookbackDays: clampInt(lookbackDays, 7, 120, 30),
        targetStockDays: clampInt(targetStockDays, 7, 90, 21),
        wasteWithinDays: wasteWithin,
      })
    : null;

  const markdowns =
    branchId && stockOv
      ? (
          await buildMarkdownSuggestions({
            orgId,
            branchId,
            withinDays: wasteWithin,
            wasteBoard: stockOv._wasteBoard,
          })
        ).items.slice(0, 5)
      : [];

  const branches = includeBranches
    ? await buildBranchComparison({ orgId, from: focusStart, to: focusEnd })
    : [];

  const salesDelta = deltaPct(salesFocus.total, salesPrior.total);
  const salesWeekDelta = deltaPct(salesFocus.total, salesWeek.total);
  const refundDelta = deltaPct(refunds.total, refundsPrior.total);

  const stock = stockOv
    ? {
        lowCount: stockOv.reorder.count,
        reorderCritical: stockOv.reorder.critical,
        reorderHigh: stockOv.reorder.high,
        top: stockOv.reorder.top.map((r) => ({
          productId: r.productId,
          name: r.name,
          nameEn: r.nameEn,
          sku: r.sku,
          currentQty: r.currentQty,
          suggestedQty: r.suggestedQty,
          severity: r.severity,
        })),
      }
    : { lowCount: 0, reorderCritical: 0, reorderHigh: 0, top: [] };

  const waste = stockOv
    ? {
        count: stockOv.waste.count,
        critical: stockOv.waste.critical,
        valueAtRisk: money(stockOv.waste.valueAtRisk),
        top: (stockOv.waste.top || []).map((w) => ({
          productId: w.productId,
          name: w.name,
          nameEn: w.nameEn,
          daysUntilExpiry: w.daysUntilExpiry,
          quantityOnHand: w.quantityOnHand,
          severity: w.severity,
          valueAtRisk: money(w.valueAtRisk),
        })),
      }
    : { count: 0, critical: 0, valueAtRisk: 0, top: [] };

  const anomalies = [];
  if (salesDelta <= -15) {
    anomalies.push({
      code: "SALES_DROP",
      level: salesDelta <= -30 ? "HIGH" : "WARN",
      deltaPct: salesDelta,
    });
  }
  if (salesWeekDelta <= -20 && salesFocus.count > 0) {
    anomalies.push({
      code: "SALES_VS_WEEK",
      level: "WARN",
      deltaPct: salesWeekDelta,
    });
  }
  if (refunds.count >= 3 && (refundDelta >= 50 || refunds.total >= salesFocus.total * 0.15)) {
    anomalies.push({
      code: "REFUND_SPIKE",
      level: "HIGH",
      deltaPct: refundDelta,
      refundCount: refunds.count,
    });
  }
  if (cashier.anomalyCount >= 3) {
    anomalies.push({
      code: "CASHIER_DISCOUNTS",
      level: "WARN",
      anomalyCount: cashier.anomalyCount,
    });
  }
  if (stock.reorderCritical >= 3) {
    anomalies.push({
      code: "STOCKOUT_RISK",
      level: "HIGH",
      count: stock.reorderCritical,
    });
  }
  if (waste.critical >= 2 || waste.valueAtRisk >= 200) {
    anomalies.push({
      code: "WASTE_RISK",
      level: "WARN",
      count: waste.count,
      valueAtRisk: waste.valueAtRisk,
    });
  }

  const headline = buildHeadline({
    dateLabel,
    sales: { deltaPct: salesDelta },
    stock,
    waste,
    refunds,
    cashier,
  });

  const actions = [];
  if (stock.lowCount > 0) {
    actions.push({
      id: "stock-brain",
      path: "/stock-brain",
      labelKey: "commandCenter.actionStock",
      count: stock.lowCount,
    });
  }
  if (waste.count > 0) {
    actions.push({
      id: "waste",
      path: "/stock-brain",
      labelKey: "commandCenter.actionWaste",
      count: waste.count,
    });
  }
  if (markdowns.length > 0) {
    actions.push({
      id: "pricing",
      path: "/pricing-brain",
      labelKey: "commandCenter.actionPricing",
      count: markdowns.length,
    });
  }
  if (refunds.count > 0 || cashier.anomalyCount > 0) {
    actions.push({
      id: "sales",
      path: "/sales",
      labelKey: "commandCenter.actionSales",
      count: refunds.count + cashier.anomalyCount,
    });
  }
  actions.push({
    id: "alerts",
    path: "/alerts",
    labelKey: "commandCenter.actionAlerts",
    count: null,
  });

  const shareText = {
    ar: [
      `📋 موجز المالك — ${dateLabel}`,
      headline.ar,
      `المبيعات: ${salesFocus.total} (${salesFocus.count} فاتورة) مقابل ${salesPrior.total} أمس السابق (${salesDelta >= 0 ? "+" : ""}${salesDelta}٪)`,
      stock.lowCount ? `إعادة طلب: ${stock.lowCount} (حرج: ${stock.reorderCritical})` : null,
      waste.count ? `هدر/صلاحية: ${waste.count} · قيمة معرضة ${waste.valueAtRisk}` : null,
      refunds.count ? `مرتجعات: ${refunds.count} · ${refunds.total}` : null,
      cashier.anomalyCount ? `خصومات غير اعتيادية: ${cashier.anomalyCount}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    en: [
      `📋 Owner brief — ${dateLabel}`,
      headline.en,
      `Sales: ${salesFocus.total} (${salesFocus.count} tickets) vs prior day ${salesPrior.total} (${salesDelta >= 0 ? "+" : ""}${salesDelta}%)`,
      stock.lowCount ? `Restock: ${stock.lowCount} (critical: ${stock.reorderCritical})` : null,
      waste.count ? `Expiry risk: ${waste.count} · value at risk ${waste.valueAtRisk}` : null,
      refunds.count ? `Refunds: ${refunds.count} · ${refunds.total}` : null,
      cashier.anomalyCount ? `Unusual discounts: ${cashier.anomalyCount}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  return {
    date: dateLabel,
    branchId: branchId || null,
    generatedAt: new Date().toISOString(),
    headline,
    sales: {
      focus: salesFocus,
      priorDay: salesPrior,
      sameWeekdayLastWeek: salesWeek,
      deltaPct: salesDelta,
      weekDeltaPct: salesWeekDelta,
    },
    stock,
    waste,
    pricing: {
      markdownCount: markdowns.length,
      top: markdowns.map((m) => ({
        productId: m.productId,
        name: m.name,
        nameEn: m.nameEn,
        suggestedDiscountPct: m.discountPercent,
        suggestedPrice: m.suggestedPrice,
        daysUntilExpiry: m.daysUntilExpiry,
      })),
    },
    refunds: {
      count: refunds.count,
      total: refunds.total,
      priorTotal: refundsPrior.total,
      deltaPct: refundDelta,
      topCashiers: refunds.top,
      items: refunds.rows,
    },
    cashier,
    anomalies,
    branches,
    actions,
    shareText,
  };
}

/** Lightweight teaser for dashboard strip */
export async function buildBriefTeaser({ orgId, branchId }) {
  const brief = await buildDailyBrief({
    orgId,
    branchId,
    includeBranches: false,
    wasteWithinDays: 14,
  });
  return {
    date: brief.date,
    headline: brief.headline,
    salesDeltaPct: brief.sales.deltaPct,
    salesTotal: brief.sales.focus.total,
    reorderCritical: brief.stock.reorderCritical,
    wasteCount: brief.waste.count,
    anomalyCount: brief.anomalies.length + brief.cashier.anomalyCount,
    refundCount: brief.refunds.count,
  };
}
