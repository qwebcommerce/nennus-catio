import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { executeReceivePurchase } from "../lib/purchaseReceive.js";

const router = Router();
router.use(authMiddleware);

async function receivePurchase(req, res, payload) {
  try {
    const { purchase } = await executeReceivePurchase({
      orgId: req.user.organizationId,
      userId: req.user.sub,
      userRole: req.user.role,
      userBranchId: req.user.branchId,
      branchId: payload?.branchId,
      supplierId: payload?.supplierId,
      note: payload?.note,
      items: payload?.items,
      updateProductCost: payload?.updateProductCost,
    });
    return res.status(201).json(purchase);
  } catch (e) {
    const status = e?.status || 400;
    const msg = e instanceof Error ? e.message : "فشل الاستلام";
    return res.status(status).json({ error: msg });
  }
}

router.get("/", async (req, res) => {
  const { branchId, limit = "50" } = req.query;
  const where = { branch: { organizationId: req.user.organizationId } };
  const bid = branchId || (req.user.role === "ADMIN" ? undefined : req.user.branchId);
  if (bid) where.branchId = String(bid);
  const rows = await prisma.purchase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      branch: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
  });
  res.json(rows);
});

router.post(
  "/receive",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    return receivePurchase(req, res, req.body);
  },
);

export default router;
