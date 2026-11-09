import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission("receivables"));

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** قائمة عملاء مع رصيد الذمّة */
router.get("/", async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const debtsOnly =
      req.query.debtsOnly === "1" || String(req.query.debtsOnly).toLowerCase() === "true";
    const rows = await prisma.customer.findMany({
      where: {
        organizationId: orgId,
        ...(debtsOnly ? { accountBalance: { gt: 0 } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountBalance: true,
      },
      take: 500,
    });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : "فشل تحميل الحسابات" });
  }
});

/** All cash / payment transactions (sales + receivable collections) */
router.get("/transactions", async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const branchId =
      req.query.branchId != null && String(req.query.branchId).trim()
        ? String(req.query.branchId).trim()
        : null;
    if (branchId) {
      const br = await findBranchInOrg(prisma, orgId, branchId);
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
    }
    const limit = Math.min(300, Math.max(1, parseInt(String(req.query.limit || "150"), 10) || 150));

    // Sequential queries — parallel open of large sale scans stresses the pool.
    const sales = await prisma.sale.findMany({
      where: {
        branch: { organizationId: orgId },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        total: true,
        amountPaid: true,
        amountDue: true,
        paymentMethod: true,
        paymentSplits: true,
        invoiceNumber: true,
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, nameEn: true } },
      },
    });
    const collections = await prisma.customerAccountLedger.findMany({
      where: {
        organizationId: orgId,
        entryType: "PAYMENT",
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, nameEn: true } },
        createdBy: { select: { id: true, name: true } },
        sale: { select: { id: true, invoiceNumber: true } },
      },
    });

    const rows = [
      ...sales.map((s) => ({
        id: `sale:${s.id}`,
        kind: "SALE",
        createdAt: s.createdAt,
        amount: Number(s.amountPaid ?? s.total ?? 0),
        total: Number(s.total ?? 0),
        amountDue: Number(s.amountDue ?? 0),
        paymentMethod: s.paymentMethod,
        paymentSplits: s.paymentSplits,
        invoiceNumber: s.invoiceNumber || null,
        customer: s.customer,
        user: s.user,
        branch: s.branch,
        note: null,
      })),
      ...collections.map((c) => ({
        id: `collect:${c.id}`,
        kind: "COLLECTION",
        createdAt: c.createdAt,
        amount: Math.abs(Number(c.amount ?? 0)),
        total: Math.abs(Number(c.amount ?? 0)),
        amountDue: null,
        paymentMethod: c.paymentMethod || "CASH",
        paymentSplits: null,
        invoiceNumber: c.sale?.invoiceNumber || null,
        customer: c.customer,
        user: c.createdBy,
        branch: c.branch,
        note: c.note || null,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : "فشل تحميل المعاملات" });
  }
});

/** كشف حساب ذمّة */
router.get("/:customerId/ledger", async (req, res) => {
  const orgId = req.user.organizationId;
  const customerId = String(req.params.customerId || "").trim();
  if (!customerId) return res.status(400).json({ error: "معرّف غير صالح" });

  const c = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: orgId },
  });
  if (!c) return res.status(404).json({ error: "العميل غير موجود" });

  const entries = await prisma.customerAccountLedger.findMany({
    where: { organizationId: orgId, customerId },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      sale: { select: { id: true, total: true, createdAt: true, amountDue: true } },
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  res.json({ customer: c, entries });
});

/** تحصيل دفعة (يقلّل رصيد الذمّة) */
router.post(
  "/:customerId/payments",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const customerId = String(req.params.customerId || "").trim();
    const { amount, paymentMethod, branchId: bodyBranch, note } = req.body || {};
    const payAmt = roundMoney(Number(amount));
    if (!Number.isFinite(payAmt) || payAmt <= 0) {
      return res.status(400).json({ error: "مبلغ غير صالح" });
    }
    const pm = String(paymentMethod || "CASH").toUpperCase();
    if (!["CASH", "CARD", "ONLINE"].includes(pm)) {
      return res.status(400).json({ error: "طريقة دفع غير صالحة" });
    }
    const bid = bodyBranch || req.user.branchId;
    if (!bid) return res.status(400).json({ error: "يجب تحديد الفرع" });

    if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
      return res.status(403).json({ error: "لا يمكن التحصيل لفرع آخر" });
    }

    const branchOk = await findBranchInOrg(prisma, orgId, bid);
    if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

    if (pm === "CASH") {
      const openSession = await prisma.cashSession.findFirst({
        where: {
          branchId: bid,
          closedAt: null,
          branch: { organizationId: orgId },
        },
        select: { id: true },
      });
      if (!openSession) {
        return res.status(400).json({
          error: "لا توجد جلسة صندوق مفتوحة — افتح الصندوق لاستلام نقد التحصيل",
        });
      }
    }

    try {
      const out = await prisma.$transaction(async (tx) => {
        const cust = await tx.customer.findFirst({
          where: { id: customerId, organizationId: orgId },
        });
        if (!cust) throw new Error("العميل غير موجود");
        const bal = Number(cust.accountBalance || 0);
        if (bal <= 0) throw new Error("لا يوجد رصيد مستحق لهذا العميل");
        const apply = roundMoney(Math.min(payAmt, bal));
        const dec = new Prisma.Decimal(apply.toFixed(2));
        const neg = dec.neg();

        await tx.customerAccountLedger.create({
          data: {
            organizationId: orgId,
            customerId,
            branchId: bid,
            entryType: "PAYMENT",
            amount: neg,
            paymentMethod: pm,
            note: note != null && String(note).trim() ? String(note).trim().slice(0, 500) : null,
            createdByUserId: req.user.sub,
          },
        });

        const updated = await tx.customer.update({
          where: { id: customerId },
          data: { accountBalance: { decrement: dec } },
        });

        return { applied: apply, customer: updated };
      });

      await writeAudit({
        userId: req.user.sub,
        action: "CUSTOMER_AR_PAYMENT",
        entityType: "Customer",
        entityId: customerId,
        branchId: bid,
        summary: `تحصيل ذمّة ${out.applied}`,
        meta: { paymentMethod: pm },
      });

      res.json(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحصيل";
      res.status(400).json({ error: msg });
    }
  }
);

export default router;
