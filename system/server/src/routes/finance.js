import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

function range(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

function counted(sale) {
  if (sale.invoiceStatus === "CANCELLED" || sale.webStatus === "CANCELLED" || sale.webStatus === "PENDING_PAYMENT") return false;
  return true;
}

router.get("/summary", async (req, res) => {
  const dates = range(req);
  if (!dates) return res.status(400).json({ error: "Invalid dates" });
  const orgId = req.user.organizationId;
  const channel = ["IN_STORE", "VAN", "WEBSITE"].includes(String(req.query.channel || "")) ? String(req.query.channel) : "";
  const sales = await prisma.sale.findMany({
    where: {
      branch: { organizationId: orgId },
      createdAt: { gte: dates.from, lte: dates.to },
      ...(channel ? { orderChannel: channel } : {}),
      ...(req.query.branchId ? { branchId: String(req.query.branchId) } : {}),
    },
    include: { items: true, refunds: { include: { items: true } }, branch: { select: { kind: true } } },
  });
  const live = sales.filter(counted);
  const byChannel = { IN_STORE: empty(), VAN: empty(), WEBSITE: empty() };
  for (const sale of live) {
    const key = byChannel[sale.orderChannel] ? sale.orderChannel : "IN_STORE";
    const revenue = Number(sale.total);
    const returnedCost = sale.refunds.reduce((sum, refund) => sum + refund.items.reduce((lineSum, item) => lineSum + Number(item.costAmount || 0), 0), 0);
    const cogs = sale.items.reduce((sum, item) => sum + Number(item.costAmount || 0), 0) - returnedCost;
    const refunded = sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0);
    byChannel[key].revenue += revenue;
    byChannel[key].cogs += cogs;
    byChannel[key].refunds += refunded;
    byChannel[key].orders += 1;
  }
  const expenses = await prisma.expense.aggregate({
    where: { organizationId: orgId, expenseDate: { gte: dates.from, lte: dates.to } },
    _sum: { amount: true },
  });
  const supplierPayments = await prisma.supplierPayment.aggregate({
    where: { bill: { organizationId: orgId }, paidAt: { gte: dates.from, lte: dates.to } },
    _sum: { amount: true },
  });
  const relocation = await prisma.relocationRequest.aggregate({
    where: { organizationId: orgId, paidAt: { gte: dates.from, lte: dates.to }, status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] } },
    _sum: { quoteAmount: true },
  });
  const [inventory, variants] = await Promise.all([
    prisma.inventory.findMany({
      where: { branch: { organizationId: orgId }, ...(req.query.branchId ? { branchId: String(req.query.branchId) } : {}) },
      include: { product: { select: { sellBy: true } } },
    }),
    prisma.variantStock.findMany({
      where: { branch: { organizationId: orgId }, ...(req.query.branchId ? { branchId: String(req.query.branchId) } : {}) },
      include: { variant: { include: { product: { select: { sellBy: true } } } } },
    }),
  ]);
  const stockValue = inventory.reduce((sum, row) => {
    const qty = row.product?.sellBy === "WEIGHT" ? Number(row.quantity) / 1000 : Number(row.quantity);
    return sum + qty * Number(row.unitCost || 0);
  }, 0) + variants.reduce((sum, row) => {
    const qty = row.variant?.product?.sellBy === "WEIGHT" ? Number(row.quantity) / 1000 : Number(row.quantity);
    return sum + qty * Number(row.unitCost || 0);
  }, 0);
  const channels = Object.fromEntries(Object.entries(byChannel).map(([key, row]) => [key, {
    ...row,
    grossProfit: row.revenue - row.refunds - row.cogs,
  }]));
  const revenue = Object.values(channels).reduce((sum, row) => sum + row.revenue, 0);
  const refunds = Object.values(channels).reduce((sum, row) => sum + row.refunds, 0);
  const cogs = Object.values(channels).reduce((sum, row) => sum + row.cogs, 0);
  const expenseTotal = Number(expenses._sum.amount || 0);
  res.json({
    from: dates.from,
    to: dates.to,
    channels,
    revenue,
    refunds,
    cogs,
    grossProfit: revenue - refunds - cogs,
    expenses: expenseTotal,
    supplierPayments: Number(supplierPayments._sum.amount || 0),
    relocationPaid: Number(relocation._sum.quoteAmount || 0),
    netProfit: revenue - refunds - cogs - expenseTotal,
    stockValue,
    moneyIn: revenue + Number(relocation._sum.quoteAmount || 0),
    moneyOut: refunds + expenseTotal + Number(supplierPayments._sum.amount || 0),
  });
});

function empty() {
  return { revenue: 0, cogs: 0, refunds: 0, orders: 0 };
}

export default router;
