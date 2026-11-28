import { Router } from "express";
import { d, fmt, riyals, toDirhams } from "../lib/money.js";
import { splitsToApi, toApi } from "../lib/moneyFields.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { writeAudit } from "../lib/auditLog.js";
import { FILE_SELECT, checkProof } from "../lib/businessFiles.js";
import { fail } from "../lib/bizError.js";
import { requireActiveStaff } from "../lib/staffPick.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("finance", "view"));

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
    res.json(toApi("Customer", rows));
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
        amount: riyals(s.amountPaid ?? s.total ?? 0),
        total: riyals(s.total ?? 0),
        amountDue: riyals(s.amountDue ?? 0),
        paymentMethod: s.paymentMethod,
        paymentSplits: splitsToApi(s.paymentSplits),
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
        amount: riyals(Math.abs(d(c.amount))),
        total: riyals(Math.abs(d(c.amount))),
        amountDue: null,
        paymentMethod: c.paymentMethod || "CASH",
        paymentSplits: null,
        invoiceNumber: c.sale?.invoiceNumber || null,
        customer: c.customer,
        user: c.createdBy,
        branch: c.branch,
        note: c.note || null,
        reference: c.reference || null,
        proofFileId: c.proofFileId || null,
        confirmStatus: c.confirmStatus,
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
      proofFile: { select: FILE_SELECT },
      collectedBy: { select: { id: true, name: true, nameEn: true } },
      confirmedBy: { select: { id: true, name: true, nameEn: true } },
      rejectedBy: { select: { id: true, name: true, nameEn: true } },
    },
  });
  res.json({ customer: toApi("Customer", c), entries: toApi("CustomerAccountLedger", entries) });
});

/** تحصيل دفعة (يقلّل رصيد الذمّة) */
router.post("/:customerId/payments", requireModule("finance", "create"),
  async (req, res) => {
    const orgId = req.user.organizationId;
    const customerId = String(req.params.customerId || "").trim();
    const { amount, paymentMethod, branchId: bodyBranch, note } = req.body || {};
    const payAmt = toDirhams(amount, { allowZero: false });
    if (payAmt == null) {
      return res.status(400).json({ error: "مبلغ غير صالح", errorAr: "مبلغ غير صالح", errorEn: "Enter a valid amount (at most 2 decimals)" });
    }
    const pm = String(paymentMethod || "CASH").toUpperCase();
    if (!["CASH", "CARD", "ONLINE", "BANK_TRANSFER"].includes(pm)) {
      return res.status(400).json({ error: "طريقة دفع غير صالحة" });
    }
    const bid = bodyBranch || req.user.branchId;
    if (!bid) return res.status(400).json({ error: "يجب تحديد الفرع" });

    if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
      return res.status(403).json({ error: "لا يمكن التحصيل لفرع آخر" });
    }

    const branchOk = await findBranchInOrg(prisma, orgId, bid);
    if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });
    let collector = null;
    try {
      collector = req.body?.collectedByUserId ? await requireActiveStaff(prisma, orgId, req.body.collectedByUserId) : null;
    } catch (e) {
      return res.status(400).json({ error: e.errorAr, errorAr: e.errorAr, errorEn: e.errorEn });
    }

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
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} AND "organizationId" = ${orgId} FOR UPDATE`;
        const cust = await tx.customer.findFirst({
          where: { id: customerId, organizationId: orgId },
        });
        if (!cust) throw new Error("العميل غير موجود");
        // Proof of payment: required for a bank transfer, optional otherwise (owner decision).
        const proofFileId = await checkProof(tx, { orgId, userId: req.user.sub, method: pm, proofFileId: req.body?.proofFileId });
        if (d(cust.accountBalance) <= 0) throw new Error("لا يوجد رصيد مستحق لهذا العميل");
        // fix-rd: collections awaiting the accountant's confirmation count against the balance
        // (the same debt is not collected twice); the balance itself drops on confirmation.
        const bal = d(cust.accountBalance) - d(cust.accountPending);
        if (bal <= 0) throw fail(400, "ACCOUNT_AWAITING_CONFIRMATION", "الرصيد كله محصّل وبانتظار تأكيد المحاسب", "The whole balance is already collected and waiting for the accountant's confirmation");
        const apply = Math.min(payAmt, bal);
        const neg = -apply;

        await tx.customerAccountLedger.create({
          data: {
            organizationId: orgId,
            customerId,
            branchId: bid,
            entryType: "PAYMENT",
            amount: neg,
            paymentMethod: pm,
            note: note != null && String(note).trim() ? String(note).trim().slice(0, 500) : null,
            reference: req.body?.reference != null && String(req.body.reference).trim() ? String(req.body.reference).trim().slice(0, 120) : null,
            proofFileId,
            createdByUserId: req.user.sub,
            collectedByUserId: collector?.id || req.user.sub,
            confirmStatus: "PENDING_CONFIRMATION",
          },
        });

        const updated = await tx.customer.update({
          where: { id: customerId },
          data: { accountPending: { increment: apply } },
        });

        return { applied: apply, customer: updated };
      });

      await writeAudit({
        userId: req.user.sub,
        action: "CUSTOMER_AR_PAYMENT",
        entityType: "Customer",
        entityId: customerId,
        branchId: bid,
        summary: `تحصيل ذمّة ${fmt(out.applied)}`,
        meta: { paymentMethod: pm, confirmStatus: "PENDING_CONFIRMATION" },
      });

      res.json({ applied: riyals(out.applied), confirmStatus: "PENDING_CONFIRMATION", customer: toApi("Customer", out.customer) });
    } catch (e) {
      if (e?.errorAr && e?.errorEn) {
        return res.status(e.status || 400).json({ error: e.errorAr, errorAr: e.errorAr, errorEn: e.errorEn, code: e.code });
      }
      const msg = e instanceof Error ? e.message : "فشل التحصيل";
      res.status(400).json({ error: msg });
    }
  }
);

export default router;
