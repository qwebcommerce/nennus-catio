import { Router } from "express";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { prisma } from "../lib/prisma.js";
import { httpError, sendError } from "../lib/apiError.js";
import {
  assessCheckoutRisk,
  assessRefundRisk,
  buildBarcodeSuggestions,
  buildCartUpsells,
} from "../lib/cashierCopilot.js";
import { clampInt } from "../lib/smartInventory.js";

const router = Router();
router.use(authMiddleware);

async function assertBranchAccess(req, branchId) {
  if (!branchId) throw httpError(400, "يجب اختيار الفرع", "Branch is required");
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    throw httpError(403, "لا يمكن الوصول لفرع آخر", "Cannot access another branch");
  }
  const branchOk = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!branchOk) throw httpError(400, "فرع غير صالح", "Invalid branch");
}

router.get(
  "/barcode-suggest",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("pos"),
  async (req, res) => {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const code = String(req.query.code || "").trim();
    if (!code) {
      return sendError(res, 400, "الرمز مطلوب", "Code is required");
    }
    const result = await buildBarcodeSuggestions({
      orgId: req.user.organizationId,
      branchId,
      code,
      limit: clampInt(req.query.limit, 1, 8, 5),
    });
    res.json({ branchId, ...result });
  },
);

router.post(
  "/upsell",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("pos"),
  async (req, res) => {
    const branchId = String(req.body?.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
    const result = await buildCartUpsells({
      orgId: req.user.organizationId,
      branchId,
      productIds,
      lookbackDays: clampInt(req.body?.lookbackDays, 14, 120, 45),
      limit: clampInt(req.body?.limit, 1, 12, 6),
    });
    res.json({ branchId, ...result });
  },
);

router.post(
  "/risk-check",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("pos"),
  async (req, res) => {
    const b = req.body || {};
    const result = assessCheckoutRisk({
      subtotal: Number(b.subtotal) || 0,
      discountAmount: Number(b.discountAmount) || 0,
      itemCount: Number(b.itemCount) || 0,
      hasDiscountReason: Boolean(String(b.discountReason || "").trim()),
    });
    res.json(result);
  },
);

router.post(
  "/refund-risk",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("refunds"),
  async (req, res) => {
    const b = req.body || {};
    const result = assessRefundRisk({
      totalAmount: Number(b.totalAmount) || 0,
      note: b.note,
    });
    res.json(result);
  },
);

export default router;
