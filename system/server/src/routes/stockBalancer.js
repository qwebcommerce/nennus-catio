import { Router } from "express";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { sendError } from "../lib/apiError.js";
import { clampInt } from "../lib/smartInventory.js";
import {
  buildBalanceSuggestions,
  buildBalancerOverview,
  executeBalanceTransfers,
} from "../lib/stockBalancer.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const router = Router();
router.use(authMiddleware);

function handleErr(res, e, ar, en) {
  if (e?.status) {
    return sendError(res, e.status, e.errorAr || e.message, e.errorEn || e.message);
  }
  if (isDbUnavailableError(e)) {
    return sendError(res, 503, dbUnavailableMessage, dbUnavailableMessageEn, {
      code: "DB_UNAVAILABLE",
    });
  }
  console.error(e);
  return sendError(res, 500, ar, en);
}

router.get(
  "/overview",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("transfer"),
  async (req, res) => {
    try {
      const overview = await buildBalancerOverview({
        orgId: req.user.organizationId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 120, 30),
      });
      res.json(overview);
    } catch (e) {
      handleErr(res, e, "تعذر تحميل موازن المخزون", "Could not load stock balancer");
    }
  },
);

router.get(
  "/suggestions",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("transfer"),
  async (req, res) => {
    try {
      const board = await buildBalanceSuggestions({
        orgId: req.user.organizationId,
        lookbackDays: clampInt(req.query.lookbackDays, 7, 120, 30),
        targetStockDays: clampInt(req.query.targetStockDays, 7, 90, 21),
        surplusBufferDays: clampInt(req.query.surplusBufferDays, 3, 60, 14),
        limit: clampInt(req.query.limit, 1, 200, 80),
      });
      res.json(board);
    } catch (e) {
      handleErr(res, e, "تعذر تحميل اقتراحات التحويل", "Could not load balance suggestions");
    }
  },
);

router.post(
  "/execute",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("transfer"),
  async (req, res) => {
    try {
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      const result = await executeBalanceTransfers({
        orgId: req.user.organizationId,
        userId: req.user.sub,
        lines,
      });
      res.json(result);
    } catch (e) {
      handleErr(res, e, "تعذر تنفيذ التحويلات", "Could not execute transfers");
    }
  },
);

export default router;
