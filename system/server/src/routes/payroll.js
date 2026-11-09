import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { orgId } from "../lib/orgScope.js";
import { writeAudit } from "../lib/auditLog.js";
import {
  applyLoanDeductionForLine,
  computeNet,
  openLoanBalance,
  roundMoney,
} from "../lib/payrollHelpers.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

function periodInclude() {
  return {
    lines: {
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { employee: { name: "asc" } },
    },
  };
}

router.get("/periods", async (req, res) => {
  const oid = orgId(req);
  const list = await prisma.payrollPeriod.findMany({
    where: { organizationId: oid },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 120,
    include: { _count: { select: { lines: true } } },
  });
  res.json(list);
});

router.post("/periods", async (req, res) => {
  const oid = orgId(req);
  const year = Math.floor(Number(req.body?.year));
  const month = Math.floor(Number(req.body?.month));
  if (!year || month < 1 || month > 12) {
    return res.status(400).json({ error: "سنة أو شهر غير صالح" });
  }
  const existing = await prisma.payrollPeriod.findUnique({
    where: {
      organizationId_year_month: { organizationId: oid, year, month },
    },
  });
  if (existing) {
    return res.status(400).json({ error: "هذه الفترة موجودة بالفعل" });
  }
  const row = await prisma.payrollPeriod.create({
    data: {
      organizationId: oid,
      year,
      month,
    },
  });
  res.status(201).json(row);
});

router.get("/periods/:id", async (req, res) => {
  const oid = orgId(req);
  const row = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
    include: periodInclude(),
  });
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.delete("/periods/:id", async (req, res) => {
  const oid = orgId(req);
  const row = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!row) return res.status(404).end();
  if (row.status !== "DRAFT") {
    return res.status(400).json({ error: "يمكن حذف الفترات في حالة مسودة فقط" });
  }
  await prisma.payrollPeriod.delete({ where: { id: row.id } });
  res.status(204).end();
});

router.patch("/periods/:id", async (req, res) => {
  const oid = orgId(req);
  const row = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!row) return res.status(404).json({ error: "غير موجود" });
  if (row.status !== "DRAFT") {
    return res.status(400).json({ error: "تعديل الملاحظات متاح للمسودة فقط هنا" });
  }
  const notes = req.body?.notes;
  const updated = await prisma.payrollPeriod.update({
    where: { id: row.id },
    data: {
      notes:
        notes != null && String(notes).trim() ? String(notes).trim() : null,
    },
  });
  res.json(updated);
});

router.post("/periods/:id/generate-lines", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
    include: { lines: { select: { employeeId: true } } },
  });
  if (!period) return res.status(404).json({ error: "غير موجود" });
  if (period.status !== "DRAFT") {
    return res.status(400).json({ error: "المسودة فقط" });
  }
  const have = new Set(period.lines.map((l) => l.employeeId));
  const employees = await prisma.employee.findMany({
    where: {
      organizationId: oid,
      status: "ACTIVE",
      defaultBaseSalary: { not: null },
    },
  });
  let created = 0;
  for (const emp of employees) {
    if (have.has(emp.id)) continue;
    const base = Number(emp.defaultBaseSalary);
    if (Number.isNaN(base) || base < 0) continue;
    const net = computeNet(base, 0, 0, 0);
    await prisma.payrollLine.create({
      data: {
        payrollPeriodId: period.id,
        employeeId: emp.id,
        baseAmount: new Prisma.Decimal(base.toFixed(2)),
        allowancesTotal: new Prisma.Decimal(0),
        deductionsTotal: new Prisma.Decimal(0),
        loanDeduction: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(net.toFixed(2)),
      },
    });
    created += 1;
  }
  const full = await prisma.payrollPeriod.findFirst({
    where: { id: period.id },
    include: periodInclude(),
  });
  res.json({ created, period: full });
});

router.post("/periods/:id/lines", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!period) return res.status(404).json({ error: "غير موجود" });
  if (period.status !== "DRAFT") {
    return res.status(400).json({ error: "المسودة فقط" });
  }
  const b = req.body || {};
  const employeeId = b.employeeId != null ? String(b.employeeId).trim() : "";
  if (!employeeId) return res.status(400).json({ error: "معرّف الموظف مطلوب" });
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: oid },
  });
  if (!emp) return res.status(400).json({ error: "موظف غير موجود" });

  const base = Number(b.baseAmount ?? 0);
  const allow = Number(b.allowancesTotal ?? 0);
  const ded = Number(b.deductionsTotal ?? 0);
  const loan = Number(b.loanDeduction ?? 0);
  if ([base, allow, ded, loan].some((x) => Number.isNaN(x) || x < 0)) {
    return res.status(400).json({ error: "مبالغ غير صالحة" });
  }
  const net = computeNet(base, allow, ded, loan);

  try {
    const line = await prisma.payrollLine.create({
      data: {
        payrollPeriodId: period.id,
        employeeId: emp.id,
        baseAmount: new Prisma.Decimal(base.toFixed(2)),
        allowancesTotal: new Prisma.Decimal(allow.toFixed(2)),
        deductionsTotal: new Prisma.Decimal(ded.toFixed(2)),
        loanDeduction: new Prisma.Decimal(loan.toFixed(2)),
        netAmount: new Prisma.Decimal(net.toFixed(2)),
        notes: b.notes != null && String(b.notes).trim() ? String(b.notes).trim() : null,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            branch: { select: { name: true } },
          },
        },
      },
    });
    res.status(201).json(line);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "الموظف مسجّل بالفعل في هذه الفترة" });
    }
    throw e;
  }
});

router.patch("/periods/:id/lines/:lineId", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!period) return res.status(404).json({ error: "غير موجود" });
  if (period.status !== "DRAFT") {
    return res.status(400).json({ error: "تعديل الأسطر في المسودة فقط" });
  }
  const line = await prisma.payrollLine.findFirst({
    where: {
      id: req.params.lineId,
      payrollPeriodId: period.id,
    },
  });
  if (!line) return res.status(404).json({ error: "سطر غير موجود" });

  const b = req.body || {};
  const base = b.baseAmount != null ? Number(b.baseAmount) : Number(line.baseAmount);
  const allow =
    b.allowancesTotal != null ? Number(b.allowancesTotal) : Number(line.allowancesTotal);
  const ded =
    b.deductionsTotal != null ? Number(b.deductionsTotal) : Number(line.deductionsTotal);
  const loan = b.loanDeduction != null ? Number(b.loanDeduction) : Number(line.loanDeduction);
  if ([base, allow, ded, loan].some((x) => Number.isNaN(x) || x < 0)) {
    return res.status(400).json({ error: "مبالغ غير صالحة" });
  }
  if (loan > 0) {
    const openBal = await openLoanBalance(prisma, oid, line.employeeId);
    if (loan > openBal + 0.02) {
      return res.status(400).json({
        error: `خصم السلف يتجاوز الرصيد المفتوح (${openBal.toFixed(2)})`,
      });
    }
  }
  const net = computeNet(base, allow, ded, loan);

  const updated = await prisma.payrollLine.update({
    where: { id: line.id },
    data: {
      baseAmount: new Prisma.Decimal(base.toFixed(2)),
      allowancesTotal: new Prisma.Decimal(allow.toFixed(2)),
      deductionsTotal: new Prisma.Decimal(ded.toFixed(2)),
      loanDeduction: new Prisma.Decimal(loan.toFixed(2)),
      netAmount: new Prisma.Decimal(net.toFixed(2)),
      notes:
        b.notes !== undefined
          ? b.notes != null && String(b.notes).trim()
            ? String(b.notes).trim()
            : null
          : undefined,
    },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          branch: { select: { name: true } },
        },
      },
    },
  });
  res.json(updated);
});

router.delete("/periods/:id/lines/:lineId", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!period) return res.status(404).end();
  if (period.status !== "DRAFT") return res.status(400).json({ error: "المسودة فقط" });
  const line = await prisma.payrollLine.findFirst({
    where: { id: req.params.lineId, payrollPeriodId: period.id },
  });
  if (!line) return res.status(404).end();
  await prisma.payrollLine.delete({ where: { id: line.id } });
  res.status(204).end();
});

router.post("/periods/:id/approve", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
    include: { _count: { select: { lines: true } } },
  });
  if (!period) return res.status(404).json({ error: "غير موجود" });
  if (period.status !== "DRAFT") {
    return res.status(400).json({ error: "الفترة ليست مسودة" });
  }
  if (period._count.lines === 0) {
    return res.status(400).json({ error: "أضف أسطراً قبل الاعتماد" });
  }
  const updated = await prisma.payrollPeriod.update({
    where: { id: period.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: req.user.sub,
    },
    include: periodInclude(),
  });
  await writeAudit({
    userId: req.user.sub,
    action: "PAYROLL_APPROVE",
    entityType: "PayrollPeriod",
    entityId: period.id,
    summary: `اعتماد راتب ${period.year}-${period.month}`,
    meta: { year: period.year, month: period.month },
  });
  res.json(updated);
});

router.post("/periods/:id/mark-paid", async (req, res) => {
  const oid = orgId(req);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: req.params.id, organizationId: oid },
    include: { lines: true },
  });
  if (!period) return res.status(404).json({ error: "غير موجود" });
  if (period.status !== "APPROVED") {
    return res.status(400).json({ error: "اعتماد الفترة مطلوب قبل التسديد" });
  }

  try {
    for (const line of period.lines) {
      const want = roundMoney(Number(line.loanDeduction));
      if (want <= 0) continue;
      const openBal = await openLoanBalance(prisma, oid, line.employeeId);
      if (want > openBal + 0.02) {
        return res.status(400).json({
          error: `خصم السلف يتجاوز الرصيد المفتوح للموظف (سطر ${line.id.slice(-6)} · متاح ${openBal.toFixed(2)})`,
        });
      }
    }

    const payrollTotal = roundMoney(
      period.lines.reduce((sum, line) => sum + Number(line.netAmount || 0), 0),
    );

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.payrollPeriod.findFirst({
        where: { id: period.id },
        include: { lines: true },
      });
      for (const line of fresh.lines) {
        if (Number(line.loanDeduction) > 0) {
          await applyLoanDeductionForLine(tx, oid, line);
        }
      }
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
        },
      });

      // Post payroll into expenses so reports/accounting rebuild pick it up.
      if (payrollTotal > 0) {
        const monthLabel = `${period.year}-${String(period.month).padStart(2, "0")}`;
        await tx.expense.create({
          data: {
            organizationId: oid,
            category: "PAYROLL",
            amount: new Prisma.Decimal(payrollTotal.toFixed(2)),
            description: `Payroll ${monthLabel}`,
            expenseDate: new Date(period.year, period.month - 1, 28, 12, 0, 0),
            createdByUserId: req.user.sub,
          },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل تسديد الرواتب";
    return res.status(400).json({ error: msg });
  }

  const out = await prisma.payrollPeriod.findFirst({
    where: { id: period.id },
    include: periodInclude(),
  });
  await writeAudit({
    userId: req.user.sub,
    action: "PAYROLL_PAID",
    entityType: "PayrollPeriod",
    entityId: period.id,
    summary: `تسديد رواتب ${period.year}-${period.month}`,
    meta: { year: period.year, month: period.month },
  });
  res.json(out);
});

export default router;
