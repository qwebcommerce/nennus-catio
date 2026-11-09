import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { findOrganizationOwnerId, isOrganizationOwner } from "../lib/orgOwner.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

const userSelect = {
  id: true,
  email: true,
  name: true,
  nameEn: true,
  role: true,
  branchId: true,
  branch: { select: { name: true, nameEn: true } },
  createdAt: true,
};

router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const [users, ownerId] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    }),
    findOrganizationOwnerId(prisma, orgId),
  ]);
  const maxUsers = 10;
  res.json({
    users: users.map((u) => ({
      ...u,
      isOrgOwner: u.id === ownerId,
    })),
    maxUsers,
    userCount: users.length,
    ownerId,
  });
});

router.post("/", async (req, res) => {
  const { email, password, name, nameEn, role, branchId } = req.body || {};
  if (!email?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: "البريد والاسم وكلمة المرور مطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
  }
  if (!["ADMIN", "MANAGER", "CASHIER", "ASSOCIATE"].includes(String(role))) {
    return res.status(400).json({ error: "دور غير صالح" });
  }
  const roleStr = String(role);
  const resolvedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  if (roleStr !== "ADMIN" && !resolvedBranchId) {
    return res.status(400).json({ error: "يجب تعيين فرع للمستخدم" });
  }
  if (resolvedBranchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, resolvedBranchId);
    if (!b) return res.status(400).json({ error: "فرع غير صالح" });
  }

  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { id: true },
  });
  if (!org) return res.status(400).json({ error: "مؤسسة غير صالحة" });
  const maxUsers = 10;
  const userCount = await prisma.user.count({ where: { organizationId: req.user.organizationId } });
  if (userCount >= maxUsers) {
    return res.status(403).json({
      error: `تم بلوغ الحد الأقصى للمستخدمين (${maxUsers})`,
      code: "USER_LIMIT",
      maxUsers,
    });
  }

  try {
    const hash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        organizationId: req.user.organizationId,
        email: String(email).toLowerCase().trim(),
        passwordHash: hash,
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        role: roleStr,
        branchId: resolvedBranchId,
      },
      select: userSelect,
    });
    const ownerId = await findOrganizationOwnerId(prisma, req.user.organizationId);
    res.status(201).json({ ...user, isOrgOwner: user.id === ownerId });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "البريد مسجّل مسبقاً في هذه المؤسسة", code: "EMAIL_TAKEN" });
    }
    throw e;
  }
});

router.patch("/:id", async (req, res) => {
  const { name, nameEn, role, branchId, password } = req.body || {};
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "غير موجود" });

  if (await isOrganizationOwner(prisma, req.user.organizationId, target.id)) {
    return res.status(403).json({
      error: "لا يمكن تعديل حساب مالك المؤسسة (المشرف الأعلى)",
      code: "ORG_OWNER_LOCKED",
    });
  }

  if (branchId !== undefined && branchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, branchId);
    if (!b) return res.status(400).json({ error: "فرع غير صالح" });
  }
  const data = {};
  if (name != null) data.name = String(name).trim();
  if (nameEn !== undefined) data.nameEn = nameEn?.trim() || null;
  if (role && ["ADMIN", "MANAGER", "CASHIER", "ASSOCIATE"].includes(String(role))) {
    data.role = String(role);
  }
  if (branchId !== undefined) data.branchId = branchId || null;
  const nextRole = data.role || target.role;
  const nextBranch = branchId !== undefined ? branchId || null : target.branchId;
  if (nextRole !== "ADMIN" && !nextBranch) {
    return res.status(400).json({ error: "يجب تعيين فرع للمستخدم" });
  }
  if (password) {
    if (String(password).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
    }
    data.passwordHash = await bcrypt.hash(String(password), 10);
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data,
    select: userSelect,
  });
  res.json({ ...user, isOrgOwner: false });
});

router.delete("/:id", async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "غير موجود" });

  if (await isOrganizationOwner(prisma, req.user.organizationId, target.id)) {
    return res.status(403).json({
      error: "لا يمكن حذف حساب مالك المؤسسة (المشرف الأعلى)",
      code: "ORG_OWNER_LOCKED",
    });
  }
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" });
  }

  await prisma.user.delete({ where: { id: target.id } });
  res.status(204).send();
});

export default router;
