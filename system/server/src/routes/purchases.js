import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import {
  buildReorderRecommendations,
  clampInt,
} from "../lib/smartInventory.js";
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

router.get(
  "/reorder-recommendations",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    if (!branchId) return res.status(400).json({ error: "يجب اختيار الفرع" });
    if (
      req.user.role !== "ADMIN" &&
      req.user.branchId &&
      req.user.branchId !== branchId
    ) {
      return res.status(403).json({ error: "لا يمكن الوصول لفرع آخر" });
    }
    const orgId = req.user.organizationId;
    const branchOk = await findBranchInOrg(prisma, orgId, branchId);
    if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

    const lookbackDays = clampInt(req.query.lookbackDays, 7, 120, 30);
    const targetStockDays = clampInt(req.query.targetStockDays, 7, 90, 21);
    const minDailySales = Math.max(
      0,
      Number.parseFloat(String(req.query.minDailySales ?? "0.05")) || 0.05,
    );

    const recommendations = await buildReorderRecommendations({
      orgId,
      branchId,
      lookbackDays,
      targetStockDays,
      minDailySales,
    });

    res.json({
      branchId,
      lookbackDays,
      targetStockDays,
      minDailySales,
      count: recommendations.length,
      recommendations,
    });
  },
);

router.post(
  "/reorder-recommendations/receive",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    const branchId = String(req.body?.branchId || req.user.branchId || "");
    if (!branchId) return res.status(400).json({ error: "يجب اختيار الفرع" });
    if (
      req.user.role !== "ADMIN" &&
      req.user.branchId &&
      req.user.branchId !== branchId
    ) {
      return res.status(403).json({ error: "لا يمكن الاستلام لفرع آخر" });
    }
    const orgId = req.user.organizationId;
    const branchOk = await findBranchInOrg(prisma, orgId, branchId);
    if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

    const linesRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalized = linesRaw
      .map((l) => ({
        productId: String(l?.productId || ""),
        quantity: Math.max(1, Math.floor(Number(l?.quantity) || 0)),
        unitCost:
          l?.unitCost != null && l?.unitCost !== ""
            ? Number(l.unitCost)
            : null,
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0);

    if (!normalized.length) {
      return res.status(400).json({ error: "لا توجد بنود صالحة للاستلام" });
    }

    const products = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        id: { in: normalized.map((l) => l.productId) },
      },
      select: { id: true, cost: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const items = [];
    for (const l of normalized) {
      const p = byId.get(l.productId);
      if (!p) return res.status(400).json({ error: `منتج غير موجود: ${l.productId}` });
      const unitCost =
        l.unitCost != null && Number.isFinite(l.unitCost)
          ? l.unitCost
          : p.cost != null
            ? Number(p.cost)
            : 0;
      items.push({
        productId: l.productId,
        quantity: l.quantity,
        unitCost,
      });
    }

    return receivePurchase(req, res, {
      branchId,
      supplierId: req.body?.supplierId,
      note: req.body?.note || "استلام إعادة طلب تلقائي",
      items,
      updateProductCost: Boolean(req.body?.updateProductCost ?? true),
    });
  },
);

router.post(
  "/receive",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("purchases"),
  async (req, res) => {
    return receivePurchase(req, res, req.body);
  },
);

export default router;
