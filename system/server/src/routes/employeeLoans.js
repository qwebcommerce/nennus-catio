import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { orgId } from "../lib/orgScope.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

router.get("/", async (req, res) => {
  const oid = orgId(req);
  const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;

  const list = await prisma.employeeLoan.findMany({
    where: {
      organizationId: oid,
      ...(employeeId ? { employeeId } : {}),
      ...(status && ["OPEN", "SETTLED"].includes(status) ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      employee: { select: { id: true, name: true } },
      repayments: { select: { id: true, amount: true, createdAt: true, payrollLineId: true } },
    },
  });
  const mapped = list.map((row) => {
    const principal = Number(row.principal);
    const paid = Number(row.paidAmount);
    return {
      ...row,
      remaining: Math.round((principal - paid) * 100) / 100,
    };
  });
  res.json(mapped);
});

router.post("/", async (req, res) => {
  const oid = orgId(req);
  const b = req.body || {};
  const employeeId = b.employeeId != null ? String(b.employeeId).trim() : "";
  if (!employeeId) return res.status(400).json({ error: "معرّف الموظف مطلوب" });
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: oid },
  });
  if (!emp) return res.status(400).json({ error: "موظف غير موجود" });

  const principal = Number(b.principal);
  if (Number.isNaN(principal) || principal <= 0) {
    return res.status(400).json({ error: "مبلغ السلفة غير صالح" });
  }

  const row = await prisma.employeeLoan.create({
    data: {
      organizationId: oid,
      employeeId: emp.id,
      principal: new Prisma.Decimal(principal.toFixed(2)),
      paidAmount: new Prisma.Decimal(0),
      status: "OPEN",
      description:
        b.description != null && String(b.description).trim()
          ? String(b.description).trim()
          : null,
    },
    include: {
      employee: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({
    ...row,
    remaining: principal,
  });
});

export default router;
