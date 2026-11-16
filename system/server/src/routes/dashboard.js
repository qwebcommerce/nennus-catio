import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { dec, money, sumDec } from "../lib/money.js";
import { qatarDayStart, qatarDayKey, qatarMonthStart, qatarRange, qatarToday } from "../lib/qatarTime.js";
import { COUNTED_SALE } from "../lib/financeData.js";

const router = Router();
router.use(authMiddleware);

/** Today and this month are Qatar calendar days. */
function startOfToday() {
  return qatarToday().start;
}

function startOfMonth() {
  return qatarMonthStart();
}

/** ?from=&to= as inclusive Qatar days; `to` is returned exclusive. */
function monthRangeFromQuery(req) {
  return qatarRange(req.query) || { from: startOfMonth(), to: qatarToday().end };
}

/** فلتر فرع ضمن المؤسسة */
function branchScope(req, branchId) {
  const orgId = req.user.organizationId;
  if (branchId) {
    return {
      branchId: String(branchId),
      branch: { organizationId: orgId },
    };
  }
  return { branch: { organizationId: orgId } };
}

router.get("/summary", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const branchFilter = branchScope(req, branchId);

  const today = qatarToday();
  const todaySales = await prisma.sale.aggregate({
    where: { ...branchFilter, ...COUNTED_SALE, createdAt: { gte: today.start, lt: today.end } },
    _count: true,
    _sum: { total: true },
  });

  const monthSales = await prisma.sale.aggregate({
    where: { ...branchFilter, ...COUNTED_SALE, createdAt: { gte: startOfMonth() } },
    _sum: { total: true },
  });

  const lowStock = await prisma.inventory.findMany({
    where: branchId
      ? {
          branchId: String(branchId),
          branch: { organizationId: req.user.organizationId },
          product: { organizationId: req.user.organizationId },
        }
      : {
          branch: { organizationId: req.user.organizationId },
          product: { organizationId: req.user.organizationId },
        },
    include: { product: true, branch: true },
  });
  const lowStockCount = lowStock.filter((r) => r.quantity <= r.minStockLevel).length;
  const variantRows = await prisma.variantStock.findMany({
    where: branchId
      ? { branchId: String(branchId), branch: { organizationId: req.user.organizationId } }
      : { branch: { organizationId: req.user.organizationId } },
    select: { quantity: true, minStockLevel: true },
  });
  const variantLow = variantRows.filter((row) => row.quantity <= row.minStockLevel).length;
  const channelSales = await prisma.sale.groupBy({
    by: ["orderChannel"],
    where: {
      ...branchFilter,
      ...COUNTED_SALE,
      createdAt: { gte: today.start, lt: today.end },
    },
    _sum: { total: true },
    _count: true,
  });
  const waitingOrders = await prisma.sale.count({
    where: {
      ...branchFilter,
      orderChannel: "WEBSITE",
      webStatus: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] },
    },
  });
  const todayGrooming = await prisma.appointment.count({
    where: {
      organizationId: req.user.organizationId,
      ...(branchId ? { branchId: String(branchId) } : {}),
      // Only today's (Qatar) bookings, not every future one.
      startAt: { gte: today.start, lt: today.end },
      status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] },
    },
  });

  const monthSalesRows = await prisma.sale.findMany({
    where: { ...branchFilter, ...COUNTED_SALE, createdAt: { gte: startOfMonth() } },
    select: { total: true, taxAmount: true },
  });
  const revenueMonth = sumDec(monthSalesRows, (r) => r.total).minus(sumDec(monthSalesRows, (r) => r.taxAmount));

  const itemsMonth = await prisma.saleItem.findMany({
    where: {
      sale: { ...branchFilter, ...COUNTED_SALE, createdAt: { gte: startOfMonth() } },
    },
    select: { quantity: true, costAmount: true, product: { select: { cost: true } } },
  });
  // Cost recorded at sale time (location unit cost); product cost only when none was recorded.
  const costMonth = itemsMonth.reduce(
    (acc, it) => acc.plus(it.costAmount != null ? dec(it.costAmount) : dec(it.product?.cost).mul(it.quantity || 0)),
    dec(0),
  );

  res.json({
    salesTodayCount: todaySales._count,
    salesTodayTotal: money(todaySales._sum.total).toFixed(2),
    salesMonthTotal: money(monthSales._sum.total).toFixed(2),
    estimatedProfitMonth: money(revenueMonth.minus(costMonth)).toFixed(2),
    lowStockAlerts: lowStockCount + variantLow,
    channelsToday: Object.fromEntries(channelSales.map((row) => [row.orderChannel, { total: money(row._sum.total), count: row._count }])),
    waitingOrders,
    todayGrooming,
  });
});

router.get("/sales-by-product", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const bf = branchScope(req, branchId);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        ...bf,
        ...COUNTED_SALE,
        createdAt: { gte: from, lt: to },
      },
    },
    include: { product: { select: { name: true } } },
  });

  const map = new Map();
  for (const it of items) {
    const name = it.product?.name || "—";
    map.set(name, (map.get(name) || dec(0)).plus(dec(it.subtotal)));
  }
  const chart = [...map.entries()].map(([name, value]) => ({ name, value: money(value) }));
  chart.sort((a, b) => b.value - a.value);
  res.json(chart.slice(0, 20));
});

router.get("/sales-by-branch", async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "للمدراء فقط" });
  }
  const { from, to } = monthRangeFromQuery(req);

  const sales = await prisma.sale.groupBy({
    by: ["branchId"],
    where: {
      ...COUNTED_SALE,
      createdAt: { gte: from, lt: to },
      branch: { organizationId: req.user.organizationId },
    },
    _sum: { total: true },
  });
  const branches = await prisma.branch.findMany({
    where: {
      id: { in: sales.map((s) => s.branchId) },
      organizationId: req.user.organizationId,
    },
  });
  const nameById = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  res.json(
    sales.map((s) => ({
      name: nameById[s.branchId] || s.branchId,
      value: money(s._sum.total),
    }))
  );
});

router.get("/monthly-profit", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const months = 6;
  const out = [];
  const bf = branchScope(req, branchId);
  const [year, month] = qatarDayKey().split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const startDate = new Date(Date.UTC(year, month - 1 - i, 1));
    const endDate = new Date(Date.UTC(year, month - i, 1));
    const start = qatarDayStart(startDate.toISOString().slice(0, 10));
    const end = qatarDayStart(endDate.toISOString().slice(0, 10));
    const salesInMonth = await prisma.sale.findMany({
      where: {
        ...bf,
        ...COUNTED_SALE,
        createdAt: { gte: start, lt: end },
      },
      select: { id: true, total: true, taxAmount: true, items: { select: { quantity: true, costAmount: true, product: { select: { cost: true } } } } },
    });
    const revenue = sumDec(salesInMonth, (x) => x.total).minus(sumDec(salesInMonth, (x) => x.taxAmount));
    let cost = dec(0);
    for (const sale of salesInMonth) {
      for (const it of sale.items) {
        cost = cost.plus(it.costAmount != null ? dec(it.costAmount) : dec(it.product?.cost).mul(it.quantity || 0));
      }
    }
    out.push({
      label: startDate.toISOString().slice(0, 7),
      profit: money(revenue.minus(cost)),
    });
  }
  res.json(out);
});

/** Top 10 products by sales value in the selected period (default: current month). */
router.get("/top-products-month", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const bf = branchScope(req, branchId);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        ...bf,
        ...COUNTED_SALE,
        createdAt: { gte: from, lt: to },
      },
    },
    include: { product: { select: { name: true, sku: true } } },
  });

  const map = new Map();
  for (const it of items) {
    const name = it.product?.name || "—";
    const prev = map.get(name) || { name, value: dec(0), quantity: 0 };
    prev.value = prev.value.plus(dec(it.subtotal));
    prev.quantity += it.quantity;
    map.set(name, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.value.comparedTo(a.value))
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      value: money(r.value),
      quantity: r.quantity,
    }));
  res.json(rows);
});

/** Top 10 customers by purchase total in the selected period. */
router.get("/top-customers-month", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const bf = branchScope(req, branchId);

  const sales = await prisma.sale.findMany({
    where: {
      ...bf,
      customerId: { not: null },
      ...COUNTED_SALE,
      createdAt: { gte: from, lt: to },
    },
    include: { customer: { select: { name: true, phone: true } } },
  });

  const map = new Map();
  for (const s of sales) {
    const cid = s.customerId;
    const label = s.customer?.name || cid;
    const prev = map.get(cid) || {
      name: label,
      phone: s.customer?.phone || null,
      value: dec(0),
      orders: 0,
    };
    prev.value = prev.value.plus(dec(s.total));
    prev.orders += 1;
    map.set(cid, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.value.comparedTo(a.value))
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      phone: r.phone,
      value: money(r.value),
      orders: r.orders,
    }));
  res.json(rows);
});

function appointmentScope(req, branchId) {
  const orgId = req.user.organizationId;
  const bid = branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  if (bid) return { organizationId: orgId, branchId: String(bid) };
  return { organizationId: orgId };
}

/** Top 10 grooming services by appointments in the period. */
router.get("/top-services-month", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const apptFilter = appointmentScope(req, branchId);

  const appointments = await prisma.appointment.findMany({
    where: {
      ...apptFilter,
      startAt: { gte: from, lt: to },
      status: { in: ["DONE", "CHECKED_IN", "CONFIRMED", "BOOKED"] },
      serviceId: { not: null },
    },
    include: {
      service: { select: { name: true, price: true } },
    },
  });

  const map = new Map();
  for (const a of appointments) {
    const sid = a.serviceId;
    const name = a.service?.name || "—";
    const prev = map.get(sid) || { name, count: 0, revenue: dec(0) };
    prev.count += 1;
    prev.revenue = prev.revenue.plus(dec(a.amount ?? a.service?.price));
    map.set(sid, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.count - a.count || b.revenue.comparedTo(a.revenue))
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      count: r.count,
      value: money(r.revenue),
    }));
  res.json(rows);
});

/** Sales totals per staff user for the period. */
router.get("/sales-by-employees-month", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const bf = branchScope(req, branchId);
  const orgId = req.user.organizationId;

  const sales = await prisma.sale.findMany({
    where: {
      ...bf,
      ...COUNTED_SALE,
      createdAt: { gte: from, lt: to },
    },
    select: { userId: true, total: true },
  });

  const byUser = new Map();
  for (const s of sales) {
    const uid = s.userId;
    const prev = byUser.get(uid) || { value: dec(0), orders: 0 };
    prev.value = prev.value.plus(dec(s.total));
    prev.orders += 1;
    byUser.set(uid, prev);
  }

  const rows = [];
  const userIds = [...byUser.keys()];
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, organizationId: orgId },
      select: { id: true, name: true, nameEn: true },
    });
    for (const u of users) {
      const stats = byUser.get(u.id);
      rows.push({
        name: u.name,
        nameEn: u.nameEn,
        value: money(stats.value),
        orders: stats.orders,
      });
    }
  }

  const sorted = rows
    .sort((a, b) => b.value - a.value || b.orders - a.orders || a.name.localeCompare(b.name))
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      nameEn: r.nameEn,
      value: r.value,
      orders: r.orders,
    }));

  res.json(sorted);
});

export default router;
