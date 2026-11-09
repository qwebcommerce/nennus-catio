import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { cashPortionFromSale } from "../lib/saleCash.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * لقطات تقديرية لحساب الزكاة (تجارة): مخزون بالتكلفة، ذمم، سلف للمحل، نقد في جلسات صندوق مفتوحة.
 * ليس حكماً شرعياً — للمساعدة فقط.
 */
router.get("/snapshot", async (req, res) => {
  const orgId = req.user.organizationId;
  const qBranch = req.query.branchId != null && String(req.query.branchId).trim()
    ? String(req.query.branchId).trim()
    : null;

  let branchFilter = null;
  if (req.user.role !== "ADMIN" && req.user.branchId) {
    branchFilter = req.user.branchId;
  } else if (qBranch) {
    const ok = await findBranchInOrg(prisma, orgId, qBranch);
    if (!ok) return res.status(400).json({ error: "فرع غير صالح" });
    branchFilter = qBranch;
  }

  try {
    const invWhere = branchFilter
      ? {
          branchId: branchFilter,
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        }
      : {
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        };

    const invRows = await prisma.inventory.findMany({
      where: invWhere,
      include: {
        product: { select: { id: true, name: true, sku: true, cost: true, price: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    let stockValueAtCost = 0;
    let linesWithoutCost = 0;
    for (const row of invRows) {
      const cost = row.product.cost != null ? Number(row.product.cost) : null;
      if (cost == null || Number.isNaN(cost)) {
        linesWithoutCost += 1;
        continue;
      }
      stockValueAtCost += row.quantity * cost;
    }

    const loanRows = await prisma.employeeLoan.findMany({
      where: {
        organizationId: orgId,
        status: "OPEN",
        ...(branchFilter ? { employee: { branchId: branchFilter } } : {}),
      },
      select: { principal: true, paidAmount: true },
    });
    let employeeLoansOutstanding = 0;
    for (const l of loanRows) {
      const p = Number(l.principal ?? 0);
      const paid = Number(l.paidAmount ?? 0);
      employeeLoansOutstanding += Math.max(0, p - paid);
    }
    employeeLoansOutstanding = round2(employeeLoansOutstanding);

    // Receivables are org-scoped (customers are not branch-owned).
    const recAgg = await prisma.customer.aggregate({
      where: { organizationId: orgId },
      _sum: { accountBalance: true },
    });
    const receivables = round2(Number(recAgg._sum.accountBalance ?? 0));

    const sessionWhere = {
      closedAt: null,
      branch: { organizationId: orgId },
      ...(branchFilter ? { branchId: branchFilter } : {}),
    };

    const sessions = await prisma.cashSession.findMany({
      where: sessionWhere,
      include: {
        branch: { select: { id: true, name: true } },
        sales: {
          select: {
            total: true,
            paymentMethod: true,
            paymentSplits: true,
            amountPaid: true,
          },
        },
      },
    });

    let cashInOpenSessions = 0;
    const sessionBreakdown = [];
    for (const ses of sessions) {
      let cashNum = Number(ses.openingFloat ?? 0);
      for (const s of ses.sales) {
        cashNum += cashPortionFromSale(s);
      }
      cashNum = round2(cashNum);
      cashInOpenSessions += cashNum;
      sessionBreakdown.push({
        sessionId: ses.id,
        branchId: ses.branchId,
        branchName: ses.branch?.name ?? null,
        openingFloat: Number(ses.openingFloat ?? 0),
        cashPortionFromSales: round2(cashNum - Number(ses.openingFloat ?? 0)),
        estimatedCash: cashNum,
      });
    }
    cashInOpenSessions = round2(cashInOpenSessions);

    const suggestedBase = round2(
      stockValueAtCost + receivables + employeeLoansOutstanding + cashInOpenSessions
    );

    res.json({
      scope: branchFilter ? "branch" : "organization",
      branchId: branchFilter,
      stockValueAtCost: round2(stockValueAtCost),
      inventoryLinesWithoutCost: linesWithoutCost,
      receivables,
      receivablesScope: "organization",
      employeeLoansOutstanding,
      employeeLoansScope: branchFilter ? "branch" : "organization",
      cashInOpenSessions,
      openCashSessionsCount: sessions.length,
      sessionBreakdown,
      suggestedBase,
      disclaimer:
        "تقدير مساعد من بيانات النظام فقط. أدخل النصاب والخصومات والمراجعة الشرعية يدوياً.",
    });
  } catch (e) {
    console.error("[zakat/snapshot]", e);
    res.status(500).json({ error: "تعذر حساب اللقطة" });
  }
});

export default router;
