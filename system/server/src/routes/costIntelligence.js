import { Router } from "express";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { prisma } from "../lib/prisma.js";
import { httpError, sendError } from "../lib/apiError.js";
import { clampInt } from "../lib/smartInventory.js";
import {
  buildBestSuppliers,
  buildCostAlerts,
  buildCostHistory,
  buildCostOverview,
  buildSupplierScorecards,
} from "../lib/costIntelligence.js";

const router = Router();
router.use(authMiddleware);

async function assertBranchAccess(req, branchId) {
  if (!branchId) {
    throw httpError(400, "يجب اختيار الفرع", "Branch is required");
  }
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    throw httpError(403, "لا يمكن الوصول لفرع آخر", "Cannot access another branch");
  }
  const branchOk = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!branchOk) {
    throw httpError(400, "فرع غير صالح", "Invalid branch");
  }
}

function handleErr(res, e, ar, en) {
  if (e?.status) {
    return sendError(res, e.status, e.errorAr || e.message, e.errorEn || e.message);
  }
  console.error(e);
  return sendError(res, 500, ar, en);
}

router.get(
  "/overview",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("purchases"),
  async (req, res) => {
    try {
      const branchId = String(req.query.branchId || req.user.branchId || "");
      await assertBranchAccess(req, branchId);
      const overview = await buildCostOverview({
        orgId: req.user.organizationId,
        branchId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 365, 90),
      });
      res.json({ branchId, ...overview });
    } catch (e) {
      handleErr(res, e, "تعذر تحميل نظرة التكلفة", "Could not load cost overview");
    }
  },
);

router.get(
  "/alerts",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("purchases"),
  async (req, res) => {
    try {
      const branchId = String(req.query.branchId || req.user.branchId || "");
      await assertBranchAccess(req, branchId);
      const result = await buildCostAlerts({
        orgId: req.user.organizationId,
        branchId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 365, 90),
        n: clampInt(req.query.n, 1, 20, 5),
        risePct: Number(req.query.risePct) || 8,
        groupBySupplier:
          String(req.query.groupBySupplier || "") === "1" ||
          String(req.query.groupBySupplier || "").toLowerCase() === "true",
      });
      res.json({ branchId, ...result });
    } catch (e) {
      handleErr(res, e, "تعذر تحميل تنبيهات التكلفة", "Could not load cost alerts");
    }
  },
);

router.get(
  "/history",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("purchases"),
  async (req, res) => {
    try {
      const branchId = String(req.query.branchId || req.user.branchId || "");
      await assertBranchAccess(req, branchId);
      const productId = String(req.query.productId || "").trim();
      if (!productId) {
        return sendError(res, 400, "المنتج مطلوب", "Product is required");
      }
      const result = await buildCostHistory({
        orgId: req.user.organizationId,
        branchId,
        productId,
        supplierId: req.query.supplierId ? String(req.query.supplierId) : null,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 365, 180),
        limit: clampInt(req.query.limit, 1, 200, 50),
      });
      res.json({ branchId, ...result });
    } catch (e) {
      handleErr(res, e, "تعذر تحميل سجل التكلفة", "Could not load cost history");
    }
  },
);

router.get(
  "/scorecards",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("purchases"),
  async (req, res) => {
    try {
      const branchId = String(req.query.branchId || req.user.branchId || "");
      await assertBranchAccess(req, branchId);
      const result = await buildSupplierScorecards({
        orgId: req.user.organizationId,
        branchId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 365, 90),
      });
      res.json({ branchId, ...result });
    } catch (e) {
      handleErr(res, e, "تعذر تحميل بطاقات الموردين", "Could not load supplier scorecards");
    }
  },
);

router.get(
  "/best-suppliers",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("purchases"),
  async (req, res) => {
    try {
      const branchId = String(req.query.branchId || req.user.branchId || "");
      await assertBranchAccess(req, branchId);
      const result = await buildBestSuppliers({
        orgId: req.user.organizationId,
        branchId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 365, 90),
        limit: clampInt(req.query.limit, 1, 100, 30),
        minPurchases: clampInt(req.query.minPurchases, 1, 10, 1),
      });
      res.json({ branchId, ...result });
    } catch (e) {
      handleErr(res, e, "تعذر تحميل أفضل الموردين", "Could not load best suppliers");
    }
  },
);

export default router;
