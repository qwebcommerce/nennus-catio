import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthRangeFromQuery(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : startOfMonth();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  return { from, to };
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

  const todaySales = await prisma.sale.aggregate({
    where: { ...branchFilter, createdAt: { gte: startOfToday() } },
    _count: true,
    _sum: { total: true },
  });

  const monthSales = await prisma.sale.aggregate({
    where: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    _sum: { total: true },
  });

  const wholesaleMonth = await prisma.sale.aggregate({
    where: {
      ...branchFilter,
      channel: "WHOLESALE",
      createdAt: { gte: startOfMonth() },
    },
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

  const monthSalesRows = await prisma.sale.findMany({
    where: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    select: { total: true, taxAmount: true },
  });
  const revenueMonth = monthSalesRows.reduce(
    (s, r) => s + Number(r.total) - Number(r.taxAmount ?? 0),
    0
  );

  const itemsMonth = await prisma.saleItem.findMany({
    where: {
      sale: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    },
    include: { product: { select: { id: true, name: true, cost: true } } },
  });
  const costMonth = itemsMonth.reduce((acc, it) => {
    const unitCost = it.product?.cost != null ? Number(it.product.cost) : 0;
    return acc + unitCost * Number(it.quantity || 0);
  }, 0);

  res.json({
    salesTodayCount: todaySales._count,
    salesTodayTotal: todaySales._sum.total?.toString() ?? "0",
    salesMonthTotal: monthSales._sum.total?.toString() ?? "0",
    wholesaleMonthTotal: wholesaleMonth._sum.total?.toString() ?? "0",
    estimatedProfitMonth: (revenueMonth - costMonth).toFixed(2),
    lowStockAlerts: lowStockCount,
  });
});

router.get("/sales-by-product", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const from = req.query.from ? new Date(String(req.query.from)) : startOfMonth();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const bf = branchScope(req, branchId);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        ...bf,
        createdAt: { gte: from, lte: to },
      },
    },
    include: { product: { select: { name: true } } },
  });

  const map = new Map();
  for (const it of items) {
    const name = it.product?.name || "—";
    map.set(name, (map.get(name) || 0) + Number(it.subtotal));
  }
  const chart = [...map.entries()].map(([name, value]) => ({ name, value }));
  chart.sort((a, b) => b.value - a.value);
  res.json(chart.slice(0, 20));
});

router.get("/sales-by-branch", async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "للمدراء فقط" });
  }
  const from = req.query.from ? new Date(String(req.query.from)) : startOfMonth();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const sales = await prisma.sale.groupBy({
    by: ["branchId"],
    where: {
      createdAt: { gte: from, lte: to },
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
      value: Number(s._sum.total || 0),
    }))
  );
});

router.get("/monthly-profit", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const months = 6;
  const out = [];
  const now = new Date();
  const bf = branchScope(req, branchId);
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const salesInMonth = await prisma.sale.findMany({
      where: {
        ...bf,
        createdAt: { gte: start, lte: end },
      },
      select: { id: true, total: true, taxAmount: true },
    });
    let revenue = salesInMonth.reduce(
      (s, x) => s + Number(x.total) - Number(x.taxAmount ?? 0),
      0
    );
    const saleIds = salesInMonth.map((s) => s.id);
    const items = saleIds.length
      ? await prisma.saleItem.findMany({
          where: { saleId: { in: saleIds } },
          include: { product: true },
        })
      : [];
    let cost = 0;
    for (const it of items) {
      const c = it.product?.cost != null ? Number(it.product.cost) : 0;
      cost += c * it.quantity;
    }
    out.push({
      label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      profit: revenue - cost,
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
        createdAt: { gte: from, lte: to },
      },
    },
    include: { product: { select: { name: true, sku: true } } },
  });

  const map = new Map();
  for (const it of items) {
    const name = it.product?.name || "—";
    const prev = map.get(name) || { name, value: 0, quantity: 0 };
    prev.value += Number(it.subtotal);
    prev.quantity += it.quantity;
    map.set(name, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      value: Number(r.value.toFixed(2)),
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
      createdAt: { gte: from, lte: to },
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
      value: 0,
      orders: 0,
    };
    prev.value += Number(s.total);
    prev.orders += 1;
    map.set(cid, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      phone: r.phone,
      value: Number(r.value.toFixed(2)),
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
      startAt: { gte: from, lte: to },
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
    const prev = map.get(sid) || { name, count: 0, revenue: 0 };
    prev.count += 1;
    prev.revenue += Number(a.service?.price || 0);
    map.set(sid, prev);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      count: r.count,
      value: Number(r.revenue.toFixed(2)),
    }));
  res.json(rows);
});

/** Sales totals per employee (linked user) for the period; includes active employees with zero sales. */
router.get("/sales-by-employees-month", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const { from, to } = monthRangeFromQuery(req);
  const bf = branchScope(req, branchId);
  const orgId = req.user.organizationId;

  const sales = await prisma.sale.findMany({
    where: {
      ...bf,
      createdAt: { gte: from, lte: to },
    },
    select: { userId: true, total: true },
  });

  const byUser = new Map();
  for (const s of sales) {
    const uid = s.userId;
    const prev = byUser.get(uid) || { value: 0, orders: 0 };
    prev.value += Number(s.total);
    prev.orders += 1;
    byUser.set(uid, prev);
  }

  const empWhere = {
    organizationId: orgId,
    status: "ACTIVE",
  };
  if (branchId) empWhere.branchId = String(branchId);

  const employees = await prisma.employee.findMany({
    where: empWhere,
    include: { user: { select: { id: true, name: true, nameEn: true } } },
    orderBy: { name: "asc" },
  });

  const rows = [];
  const seenUserIds = new Set();

  for (const emp of employees) {
    const uid = emp.userId;
    const stats = uid ? byUser.get(uid) : null;
    if (uid) seenUserIds.add(uid);
    rows.push({
      name: emp.name,
      nameEn: emp.nameEn || emp.user?.nameEn || null,
      value: stats ? Number(stats.value.toFixed(2)) : 0,
      orders: stats?.orders ?? 0,
    });
  }

  const orphanUserIds = [...byUser.keys()].filter((uid) => !seenUserIds.has(uid));
  if (orphanUserIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: orphanUserIds }, organizationId: orgId },
      select: { id: true, name: true, nameEn: true },
    });
    for (const u of users) {
      const stats = byUser.get(u.id);
      rows.push({
        name: u.name,
        nameEn: u.nameEn,
        value: Number(stats.value.toFixed(2)),
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
