import { Router } from "express";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import { sendError } from "../lib/apiError.js";
import { clampInt } from "../lib/smartInventory.js";
import { buildCustomerRfm, buildRfmOverview } from "../lib/customerRfm.js";
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
  requirePermission("customers"),
  async (req, res) => {
    try {
      const overview = await buildRfmOverview({
        orgId: req.user.organizationId,
        dormantDays: clampInt(req.query.dormantDays, 14, 365, 60),
      });
      res.json(overview);
    } catch (e) {
      handleErr(res, e, "تعذر تحميل ذكاء العملاء", "Could not load customer intelligence");
    }
  },
);

router.get(
  "/rfm",
  requireRole("ADMIN", "MANAGER"),
  requirePermission("customers"),
  async (req, res) => {
    try {
      const board = await buildCustomerRfm({
        orgId: req.user.organizationId,
        dormantDays: clampInt(req.query.dormantDays, 14, 365, 60),
        highValueMin:
          req.query.highValueMin != null && String(req.query.highValueMin).trim() !== ""
            ? Number(req.query.highValueMin)
            : null,
        lookbackDays: clampInt(req.query.lookbackDays, 30, 730, 365),
        limit: clampInt(req.query.limit, 20, 500, 200),
      });
      res.json(board);
    } catch (e) {
      handleErr(res, e, "تعذر بناء شرائح RFM", "Could not build RFM segments");
    }
  },
);

export default router;
