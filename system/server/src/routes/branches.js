import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(branches);
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const { name, nameEn, address } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Branch name is required", code: "BRANCH_NAME_REQUIRED" });

  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { maxBranches: true, plan: true },
  });
  const maxBranches = org?.maxBranches ?? 3;
  const count = await prisma.branch.count({
    where: { organizationId: req.user.organizationId },
  });
  if (count >= maxBranches) {
    return res.status(403).json({
      error: `Branch limit reached (${count}/${maxBranches}). Upgrade the plan to add more branches.`,
      code: "BRANCH_LIMIT",
      maxBranches,
      branchCount: count,
      plan: org?.plan || "FREE",
    });
  }

  const b = await prisma.branch.create({
    data: {
      organizationId: req.user.organizationId,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      address: address?.trim() || null,
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_CREATE",
    entityType: "Branch",
    entityId: b.id,
    branchId: b.id,
    summary: `Created branch "${b.name}"`,
    meta: { name: b.name, plan: org?.plan, maxBranches },
  });
  res.status(201).json(b);
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const { name, nameEn, address, supabaseId } = req.body || {};
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });
  const data = {
    ...(name != null && { name: String(name).trim() }),
    ...(nameEn !== undefined && { nameEn: nameEn?.trim() || null }),
    ...(address !== undefined && { address: address?.trim() || null }),
  };
  if (supabaseId !== undefined) {
    const s = supabaseId != null && String(supabaseId).trim() ? String(supabaseId).trim() : null;
    data.supabaseId = s;
  }
  const b = await prisma.branch.update({
    where: { id: existing.id },
    data,
  });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_UPDATE",
    entityType: "Branch",
    entityId: b.id,
    branchId: b.id,
    summary: `Updated branch "${b.name}"`,
    meta: { changes: Object.keys(data) },
  });
  res.json(b);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const orgId = req.user.organizationId;
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!existing) return res.status(404).json({ error: "Branch not found", code: "NOT_FOUND" });

  const branchCount = await prisma.branch.count({ where: { organizationId: orgId } });
  if (branchCount <= 1) {
    return res.status(400).json({
      error: "Cannot delete the only branch in the organization",
      code: "LAST_BRANCH",
    });
  }

  const [sales, users, cashSessions, refunds, purchases] = await Promise.all([
    prisma.sale.count({ where: { branchId: existing.id } }),
    prisma.user.count({ where: { branchId: existing.id } }),
    prisma.cashSession.count({ where: { branchId: existing.id } }),
    prisma.refund.count({ where: { branchId: existing.id } }),
    prisma.purchase.count({ where: { branchId: existing.id } }),
  ]);

  const blockers = [];
  if (sales) blockers.push(`${sales} sale(s)`);
  if (users) blockers.push(`${users} linked user(s)`);
  if (cashSessions) blockers.push(`${cashSessions} cash session(s)`);
  if (refunds) blockers.push(`${refunds} refund(s)`);
  if (purchases) blockers.push(`${purchases} purchase(s)`);

  if (blockers.length) {
    return res.status(400).json({
      error: `Cannot delete branch while related data exists: ${blockers.join(", ")}. Move users or choose a branch with no transactions.`,
      code: "BRANCH_HAS_DATA",
      blockers: { sales, users, cashSessions, refunds, purchases },
    });
  }

  await prisma.branch.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "BRANCH_DELETE",
    entityType: "Branch",
    entityId: existing.id,
    summary: `Deleted branch "${existing.name}"`,
    meta: { name: existing.name },
  });
  res.status(204).send();
});

export default router;
