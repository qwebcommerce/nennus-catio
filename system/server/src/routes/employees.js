import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg, orgId } from "../lib/orgScope.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

/** مستخدمون بلا ربط موظف — لربط الحساب ببطاقة موظف */
router.get("/user-candidates", async (req, res) => {
  const oid = orgId(req);
  const users = await prisma.user.findMany({
    where: { organizationId: oid, employee: null },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  res.json(users);
});

router.get("/", async (req, res) => {
  const oid = orgId(req);
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const list = await prisma.employee.findMany({
    where: {
      organizationId: oid,
      ...(status && ["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(status)
        ? { status }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
    take: 500,
  });
  res.json(list);
});

router.post("/", async (req, res) => {
  const oid = orgId(req);
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });

  let branchId = null;
  if (b.branchId != null && String(b.branchId).trim()) {
    const br = await findBranchInOrg(prisma, oid, String(b.branchId));
    if (!br) return res.status(400).json({ error: "فرع غير صالح" });
    branchId = br.id;
  }

  let userId = null;
  if (b.userId != null && String(b.userId).trim()) {
    const u = await prisma.user.findFirst({
      where: { id: String(b.userId), organizationId: oid },
    });
    if (!u) return res.status(400).json({ error: "مستخدم غير موجود" });
    const taken = await prisma.employee.findUnique({
      where: { userId: u.id },
    });
    if (taken) return res.status(400).json({ error: "هذا المستخدم مرتبط بموظف آخر" });
    userId = u.id;
  }

  const defaultBase =
    b.defaultBaseSalary != null && b.defaultBaseSalary !== ""
      ? Number(b.defaultBaseSalary)
      : null;
  if (defaultBase != null && (Number.isNaN(defaultBase) || defaultBase < 0)) {
    return res.status(400).json({ error: "راتب أساسي غير صالح" });
  }

  let status = "ACTIVE";
  if (
    b.status &&
    ["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(String(b.status).toUpperCase())
  ) {
    status = String(b.status).toUpperCase();
  }

  const row = await prisma.employee.create({
    data: {
      organizationId: oid,
      branchId,
      userId,
      name,
      nameEn: b.nameEn != null && String(b.nameEn).trim() ? String(b.nameEn).trim() : null,
      phone: b.phone != null && String(b.phone).trim() ? String(b.phone).trim() : null,
      email: b.email != null && String(b.email).trim() ? String(b.email).trim() : null,
      nationalId:
        b.nationalId != null && String(b.nationalId).trim()
          ? String(b.nationalId).trim()
          : null,
      jobTitle:
        b.jobTitle != null && String(b.jobTitle).trim() ? String(b.jobTitle).trim() : null,
      hireDate: b.hireDate ? new Date(String(b.hireDate)) : null,
      status,
      defaultBaseSalary:
        defaultBase != null ? new Prisma.Decimal(defaultBase.toFixed(2)) : null,
      notes: b.notes != null && String(b.notes).trim() ? String(b.notes).trim() : null,
    },
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const oid = orgId(req);
  const existing = await prisma.employee.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!existing) return res.status(404).json({ error: "غير موجود" });
  const b = req.body || {};
  const data = {};

  if (b.name != null) {
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    data.name = name;
  }
  if (b.nameEn !== undefined) {
    data.nameEn = b.nameEn != null && String(b.nameEn).trim() ? String(b.nameEn).trim() : null;
  }
  if (b.phone !== undefined) {
    data.phone = b.phone != null && String(b.phone).trim() ? String(b.phone).trim() : null;
  }
  if (b.email !== undefined) {
    data.email = b.email != null && String(b.email).trim() ? String(b.email).trim() : null;
  }
  if (b.nationalId !== undefined) {
    data.nationalId =
      b.nationalId != null && String(b.nationalId).trim()
        ? String(b.nationalId).trim()
        : null;
  }
  if (b.jobTitle !== undefined) {
    data.jobTitle =
      b.jobTitle != null && String(b.jobTitle).trim() ? String(b.jobTitle).trim() : null;
  }
  if (b.hireDate !== undefined) {
    data.hireDate = b.hireDate ? new Date(String(b.hireDate)) : null;
  }
  if (b.status != null) {
    const st = String(b.status).toUpperCase();
    if (!["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(st)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }
    data.status = st;
  }
  if (b.branchId !== undefined) {
    if (!b.branchId) data.branchId = null;
    else {
      const br = await findBranchInOrg(prisma, oid, String(b.branchId));
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
      data.branchId = br.id;
    }
  }
  if (b.userId !== undefined) {
    if (!b.userId) {
      data.userId = null;
    } else {
      const u = await prisma.user.findFirst({
        where: { id: String(b.userId), organizationId: oid },
      });
      if (!u) return res.status(400).json({ error: "مستخدم غير موجود" });
      const taken = await prisma.employee.findFirst({
        where: { userId: u.id, NOT: { id: existing.id } },
      });
      if (taken) return res.status(400).json({ error: "المستخدم مرتبط بموظف آخر" });
      data.userId = u.id;
    }
  }
  if (b.defaultBaseSalary !== undefined) {
    if (b.defaultBaseSalary == null || b.defaultBaseSalary === "") {
      data.defaultBaseSalary = null;
    } else {
      const n = Number(b.defaultBaseSalary);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: "راتب أساسي غير صالح" });
      data.defaultBaseSalary = new Prisma.Decimal(n.toFixed(2));
    }
  }
  if (b.notes !== undefined) {
    data.notes = b.notes != null && String(b.notes).trim() ? String(b.notes).trim() : null;
  }

  const row = await prisma.employee.update({
    where: { id: existing.id },
    data,
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const oid = orgId(req);
  const existing = await prisma.employee.findFirst({
    where: { id: req.params.id, organizationId: oid },
  });
  if (!existing) return res.status(404).end();
  await prisma.employee.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
